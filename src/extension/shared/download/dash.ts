/**
 * dash.ts — pure MPEG-DASH capture engine. Parallels hls.ts: no network,
 * DOM-mutation, or crypto of its own (beyond DOMParser for the MPD); fetchText /
 * fetchBytes are injected so it runs in the offscreen document, in jsdom tests,
 * and in Node validation.
 *
 * It turns a clear (non-DRM, non-live) `.mpd` into one MP4: parse the MPD, expand
 * the chosen video + audio Representations' SegmentTemplate, fetch each track's
 * init + media segments, and muxTracks them together. DASH is always demuxed, so
 * it always muxes (an audio-less MPD yields a video-only MP4).
 *
 * POLICY: encrypted (ContentProtection / CENC / Widevine / PlayReady) and live
 * (MPD@type="dynamic") manifests are REFUSED. Only SegmentTemplate (duration and
 * SegmentTimeline) is supported; SegmentList / SegmentBase-only is not.
 */

/** ISO-8601 media duration (`PT1H2M3.5S`) → seconds. 0 for anything unparseable.
 *  Only the `PT…` (hours/minutes/seconds) form is handled — the only form MPD
 *  `mediaPresentationDuration` uses for VOD. */
export function parseIso8601Duration(text: string): number {
  const m = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec((text || '').trim());
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  const h = m[1] ? parseFloat(m[1]) : 0;
  const min = m[2] ? parseFloat(m[2]) : 0;
  const s = m[3] ? parseFloat(m[3]) : 0;
  return h * 3600 + min * 60 + s;
}

/** DASH `$…$` template substitution: `$RepresentationID$`, `$Number$` (with an
 *  optional zero-pad width, e.g. `$Number%05d$`), `$Time$`, `$Bandwidth$`; `$$` is
 *  a literal `$`. */
export function substituteTemplate(
  tpl: string,
  vars: { RepresentationID?: string; Number?: number; Time?: number; Bandwidth?: number },
): string {
  return tpl
    .replace(/\$(RepresentationID|Number|Time|Bandwidth)(?:%0(\d+)d)?\$/g, (_m, name: string, width?: string) => {
      const v = (vars as Record<string, string | number | undefined>)[name];
      if (v === undefined) return '';
      const s = String(v);
      return width ? s.padStart(Number(width), '0') : s;
    })
    .replace(/\$\$/g, '$');
}

export type DashErrorCode =
  | 'no-representations' // no usable video Representation
  | 'live' // MPD@type="dynamic"
  | 'drm' // a <ContentProtection> element is present
  | 'unsupported' // SegmentList / SegmentBase-only, or an undecodable mux
  | 'empty' // nothing downloaded
  | 'too-large' // assembled bytes exceeded opts.maxBytes
  | 'fetch-failed'; // a segment could not be fetched

export class DashError extends Error {
  code: DashErrorCode;
  constructor(code: DashErrorCode, message: string) {
    super(message);
    this.name = 'DashError';
    this.code = code;
  }
}

export interface DashSegmentTemplate {
  initialization?: string;
  media?: string;
  startNumber: number;
  timescale: number;
  duration?: number;
  timeline?: { t?: number; d: number; r: number }[];
}

export interface DashRepresentation {
  id: string;
  bandwidth: number;
  contentType: 'video' | 'audio';
  codecs?: string;
  width?: number;
  height?: number;
  template: DashSegmentTemplate;
  baseUrl: string; // absolute, resolved for this representation
}

export interface DashManifest {
  isLive: boolean;
  hasDrm: boolean;
  video: DashRepresentation[];
  audio: DashRepresentation[];
  durationSec: number;
}

// ---- MPD parsing (namespace-safe: traverse by localName) ------------------

/** Direct-child elements of `el` whose localName matches `name`. */
function kids(el: Element, name: string): Element[] {
  const out: Element[] = [];
  for (const c of Array.from(el.children)) if (c.localName === name) out.push(c);
  return out;
}

/** Resolve a child <BaseURL>'s text against `base`, or return `base` unchanged. */
function resolveBase(base: string, el: Element): string {
  const b = kids(el, 'BaseURL')[0]?.textContent?.trim();
  if (!b) return base;
  try {
    return new URL(b, base).href;
  } catch {
    return base;
  }
}

function classify(mime: string, contentType: string): 'video' | 'audio' | null {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('video/') || contentType === 'video') return 'video';
  if (m.startsWith('audio/') || contentType === 'audio') return 'audio';
  return null;
}

function parseSegmentTemplate(el: Element | undefined): DashSegmentTemplate {
  if (!el) return { startNumber: 1, timescale: 1 };
  const timelineEl = kids(el, 'SegmentTimeline')[0];
  let timeline: { t?: number; d: number; r: number }[] | undefined;
  if (timelineEl) {
    timeline = kids(timelineEl, 'S').map((s) => ({
      t: s.getAttribute('t') != null ? Number(s.getAttribute('t')) : undefined,
      d: Number(s.getAttribute('d')) || 0,
      r: Number(s.getAttribute('r')) || 0,
    }));
  }
  const num = (a: string) => (el.getAttribute(a) != null ? Number(el.getAttribute(a)) : undefined);
  return {
    initialization: el.getAttribute('initialization') || undefined,
    media: el.getAttribute('media') || undefined,
    startNumber: num('startNumber') || 1,
    timescale: num('timescale') || 1,
    duration: num('duration'),
    timeline,
  };
}

/** Parse an MPD (DOMParser) into its clear video/audio representations + flags. */
export function parseMpd(xml: string, baseUrl: string): DashManifest {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const mpd = doc.documentElement;
  if (!mpd || mpd.localName !== 'MPD') throw new DashError('unsupported', 'Not an MPD document.');

  const isLive = (mpd.getAttribute('type') || 'static') === 'dynamic';
  const hasDrm = Array.from(doc.getElementsByTagName('*')).some((e) => e.localName === 'ContentProtection');
  let durationSec = parseIso8601Duration(mpd.getAttribute('mediaPresentationDuration') || '');

  const period = kids(mpd, 'Period')[0];
  if (!period) return { isLive, hasDrm, video: [], audio: [], durationSec };
  if (!durationSec) durationSec = parseIso8601Duration(period.getAttribute('duration') || '');

  const mpdBase = resolveBase(baseUrl, mpd);
  const periodBase = resolveBase(mpdBase, period);

  const video: DashRepresentation[] = [];
  const audio: DashRepresentation[] = [];
  for (const aset of kids(period, 'AdaptationSet')) {
    const asetBase = resolveBase(periodBase, aset);
    const asetMime = aset.getAttribute('mimeType') || '';
    const asetContentType = aset.getAttribute('contentType') || '';
    const asetTmpl = kids(aset, 'SegmentTemplate')[0];
    for (const rep of kids(aset, 'Representation')) {
      const kind = classify(rep.getAttribute('mimeType') || asetMime, asetContentType);
      if (!kind) continue;
      const template = parseSegmentTemplate(kids(rep, 'SegmentTemplate')[0] ?? asetTmpl);
      (kind === 'video' ? video : audio).push({
        id: rep.getAttribute('id') || '',
        bandwidth: Number(rep.getAttribute('bandwidth')) || 0,
        contentType: kind,
        codecs: rep.getAttribute('codecs') || aset.getAttribute('codecs') || undefined,
        width: rep.getAttribute('width') != null ? Number(rep.getAttribute('width')) : undefined,
        height: rep.getAttribute('height') != null ? Number(rep.getAttribute('height')) : undefined,
        template,
        baseUrl: resolveBase(asetBase, rep),
      });
    }
  }
  return { isLive, hasDrm, video, audio, durationSec };
}
