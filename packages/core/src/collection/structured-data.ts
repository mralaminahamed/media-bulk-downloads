/**
 * Media declared in the page's structured data — schema.org JSON-LD
 * (`<script type="application/ld+json">`) and microdata (`itemprop`).
 *
 * `ImageObject.contentUrl` / `VideoObject.contentUrl` are, by definition, the
 * URL of the FILE. Publishers emit them for search engines, so a news, recipe,
 * listing or video page routinely ships the full-resolution original here while
 * the DOM carries only a resized `<img>`. Reading it costs no request.
 *
 * The payload is page-authored and therefore UNTRUSTED: it is parsed
 * defensively (never throws), only http(s) URLs are accepted, and the walk is
 * bounded in depth, nodes and output so a hostile or merely enormous blob can't
 * hang collection.
 */

export interface StructuredMedia {
  url: string;
  kind: 'image' | 'video';
  /** VideoObject.thumbnailUrl — the poster for the grid tile. */
  poster?: string;
  width?: number;
  height?: number;
}

const MAX_DEPTH = 12;
const MAX_NODES = 5000;
const MAX_ITEMS = 200;

/** Node properties whose value is a picture of the node itself. */
const IMAGE_KEYS: ReadonlySet<string> = new Set(['image', 'primaryImageOfPage', 'logo', 'photo']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** http(s) only — JSON-LD is page-controlled, and these URLs reach an <img src>
 *  and eventually chrome.downloads. */
function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).href === '' ? null : s;
  } catch {
    return null;
  }
}

/** schema.org allows a bare number, a numeric string, or a QuantitativeValue. */
function dimension(v: unknown): number | undefined {
  const raw = isRecord(v) ? v.value : v;
  const n = typeof raw === 'string' ? Number(raw.replace(/px$/i, '')) : raw;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The last path segment of an `@type`, which may be a bare name, a full IRI, or
 *  an array of either. */
function typeNames(v: unknown): string[] {
  const one = (t: unknown): string => (typeof t === 'string' ? t.split(/[/#]/).pop() ?? '' : '');
  return (Array.isArray(v) ? v : [v]).map(one).filter(Boolean);
}

function isVideoType(v: unknown): boolean {
  return typeNames(v).some((t) => /^(?:VideoObject|Clip|Movie|Episode)$/i.test(t));
}

/** Collect from one JSON-LD graph. `out` is shared so the caller can dedupe and
 *  cap across every script block on the page. */
function walk(
  node: unknown,
  depth: number,
  seen: Set<string>,
  out: StructuredMedia[],
  budget: { nodes: number },
): void {
  if (depth > MAX_DEPTH || out.length >= MAX_ITEMS || budget.nodes <= 0) return;
  budget.nodes--;

  if (Array.isArray(node)) {
    for (const child of node) walk(child, depth + 1, seen, out, budget);
    return;
  }
  if (!isRecord(node)) return;

  const push = (url: string | null, kind: 'image' | 'video', extra?: Partial<StructuredMedia>): void => {
    if (!url || seen.has(url) || out.length >= MAX_ITEMS) return;
    seen.add(url);
    out.push({ url, kind, ...extra });
  };

  const video = isVideoType(node['@type']);
  // contentUrl IS the file. `url` is often the landing page, so it counts only
  // on a media node; `embedUrl` is a player page and is left to the iframe
  // resolvers.
  const media = safeUrl(node.contentUrl) ?? (isMediaNode(node) ? safeUrl(node.url) : null);

  if (media) {
    const extra: Partial<StructuredMedia> = {};
    const poster = safeUrl(node.thumbnailUrl) ?? safeUrl(firstOf(node.thumbnail));
    if (video && poster) extra.poster = poster;
    const w = dimension(node.width);
    const h = dimension(node.height);
    if (w !== undefined) extra.width = w;
    if (h !== undefined) extra.height = h;
    push(media, video ? 'video' : 'image', extra);
  }

  // `image` on ANY node (Article, Product, Recipe, Person…) is a picture of it,
  // given as a URL string, an ImageObject, or an array mixing both.
  for (const key of IMAGE_KEYS) {
    const v = node[key];
    if (v === undefined) continue;
    for (const entry of Array.isArray(v) ? v : [v]) {
      if (typeof entry === 'string') push(safeUrl(entry), 'image');
      else walk(entry, depth + 1, seen, out, budget);
    }
  }

  for (const [key, v] of Object.entries(node)) {
    if (IMAGE_KEYS.has(key)) continue;
    if (Array.isArray(v) || isRecord(v)) walk(v, depth + 1, seen, out, budget);
  }
}

const firstOf = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

/** Whether this node's `url` names a media file rather than a landing page. */
function isMediaNode(node: Record<string, unknown>): boolean {
  return typeNames(node['@type']).some((t) => /^(?:ImageObject|VideoObject|AudioObject|MediaObject|Clip)$/i.test(t));
}

const MICRODATA_SEL = '[itemprop="contentUrl"], [itemprop="thumbnailUrl"], [itemprop="image"]';

function fromMicrodata(doc: Document, seen: Set<string>, out: StructuredMedia[]): void {
  let els: NodeListOf<Element>;
  try {
    els = doc.querySelectorAll(MICRODATA_SEL);
  } catch {
    return;
  }
  for (const el of els) {
    if (out.length >= MAX_ITEMS) return;
    const raw =
      el.getAttribute('href') ?? el.getAttribute('src') ?? el.getAttribute('content');
    const url = safeUrl(raw);
    if (!url || seen.has(url)) continue;
    const scope = el.closest('[itemtype]')?.getAttribute('itemtype') ?? '';
    seen.add(url);
    out.push({ url, kind: /VideoObject|Clip|Movie/i.test(scope) ? 'video' : 'image' });
  }
}

/** Every media URL the page declares in structured data, in document order. */
export function structuredDataMedia(doc: Document): StructuredMedia[] {
  const out: StructuredMedia[] = [];
  const seen = new Set<string>();
  const budget = { nodes: MAX_NODES };

  let scripts: NodeListOf<Element>;
  try {
    scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  } catch {
    scripts = [] as unknown as NodeListOf<Element>;
  }
  for (const s of scripts) {
    if (out.length >= MAX_ITEMS) break;
    const text = s.textContent;
    if (!text || text.length > 2_000_000) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    walk(parsed, 0, seen, out, budget);
  }

  fromMicrodata(doc, seen, out);
  return out;
}
