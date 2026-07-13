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

import { muxTracks, muxAudioOnly } from '@mbd/core/download/stream/mux';
import { assertSafeCaptureUrl } from '@mbd/core/download/stream/ssrf-guard';

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
  | 'audio-unavailable' // audio-only asked, but the manifest has no audio Representation
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
    // `?? 1` not `|| 1`: startNumber="0" is legitimate (segments start at 0), so a
    // present 0 must survive; only an absent attribute defaults to 1.
    startNumber: num('startNumber') ?? 1,
    // timescale is a divisor, so 0 is invalid — coercing an absent-or-zero value
    // to 1 is intentional (avoids a divide-by-zero downstream).
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

  // Single-period capture: only the first Period is captured — later periods
  // (ad breaks, chaptered content) are NOT concatenated. Documented limitation.
  const periods = kids(mpd, 'Period');
  const period = periods[0];
  if (!period) return { isLive, hasDrm, video: [], audio: [], durationSec };
  const periodDuration = parseIso8601Duration(period.getAttribute('duration') || '');
  // When the manifest has multiple periods, `mediaPresentationDuration` spans ALL
  // of them, so applying it to Period 0's SegmentTemplate would over-count its
  // segments. Prefer Period 0's own duration (its `duration` attr, else the gap
  // to Period 1's `start`) in that case; single-period keeps the presentation one.
  if (periods.length > 1) {
    const nextStart = parseIso8601Duration(periods[1].getAttribute('start') || '');
    const thisStart = parseIso8601Duration(period.getAttribute('start') || '');
    durationSec = periodDuration || (nextStart ? nextStart - thisStart : durationSec);
  } else if (!durationSec) {
    durationSec = periodDuration;
  }

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

// ---- segment expansion ----------------------------------------------------

/** Expand a representation's SegmentTemplate into absolute init + media URLs. */
export function expandSegments(rep: DashRepresentation, durationSec: number): { initUri: string; segmentUris: string[] } {
  const t = rep.template;
  const baseVars = { RepresentationID: rep.id, Bandwidth: rep.bandwidth };
  const initUri = t.initialization ? new URL(substituteTemplate(t.initialization, baseVars), rep.baseUrl).href : '';
  if (!t.media) {
    throw new DashError('unsupported', 'SegmentTemplate has no media template (SegmentList / SegmentBase not supported).');
  }

  const uris: string[] = [];
  const push = (num: number, time: number): void => {
    uris.push(new URL(substituteTemplate(t.media!, { ...baseVars, Number: num, Time: time }), rep.baseUrl).href);
  };

  if (t.timeline && t.timeline.length) {
    let number = t.startNumber;
    let time = t.timeline[0].t ?? 0;
    for (const s of t.timeline) {
      if (s.t !== undefined) time = s.t;
      // r < 0 means "repeat to the end of the period" — fill from the total duration.
      const repeats =
        s.r >= 0 ? s.r : s.d > 0 ? Math.max(0, Math.ceil((durationSec * t.timescale - time) / s.d) - 1) : 0;
      for (let i = 0; i <= repeats; i++) {
        push(number, time);
        number += 1;
        time += s.d;
      }
    }
  } else if (t.duration) {
    const count = Math.max(0, Math.ceil((durationSec * t.timescale) / t.duration));
    // $Time$ is the 0-based media-time offset (i·duration); $Number$ counts from startNumber.
    for (let i = 0; i < count; i++) push(t.startNumber + i, i * t.duration);
  } else {
    throw new DashError('unsupported', 'SegmentTemplate has neither a duration nor a SegmentTimeline.');
  }
  return { initUri, segmentUris: uris };
}

// ---- selection + guards ---------------------------------------------------

export interface DashCaptureOptions {
  /** 'highest' (default) or 'lowest' bandwidth, or a target height (e.g. 720). */
  quality?: 'highest' | 'lowest' | number;
  maxBytes?: number;
  /** Extract just the audio Representation as `.m4a` (#204), no re-encode. DASH is
   *  always demuxed, so the audio track is directly emittable when present. */
  audioOnly?: boolean;
}

/** Picks the representation matching the quality preference (mirrors hls.ts). */
export function selectRepresentation(
  reps: DashRepresentation[],
  quality: DashCaptureOptions['quality'] = 'highest',
): DashRepresentation | undefined {
  if (!reps.length) return undefined;
  const byBw = [...reps].sort((a, b) => a.bandwidth - b.bandwidth);
  if (quality === 'lowest') return byBw[0];
  if (typeof quality === 'number') {
    const withH = reps.filter((r) => r.height);
    if (withH.length) {
      return withH.sort(
        (a, b) => Math.abs(a.height! - quality) - Math.abs(b.height! - quality) || b.bandwidth - a.bandwidth,
      )[0];
    }
  }
  return byBw[byBw.length - 1];
}

/** Refuses live / DRM / video-less manifests before any bytes are fetched. */
export function assertDownloadable(m: DashManifest): void {
  if (m.isLive) throw new DashError('live', 'This is a live (dynamic) stream — there is no single file to save.');
  if (m.hasDrm) throw new DashError('drm', 'This stream is DRM-protected and cannot be captured.');
  if (!m.video.length) throw new DashError('no-representations', 'The manifest has no video representation.');
}

// ---- orchestration --------------------------------------------------------

export interface DashDeps {
  fetchText: (url: string) => Promise<string>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
  /** Bounded parallel segment fetches (default 6). */
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface DashCaptureResult {
  bytes: Uint8Array;
  ext: 'mp4' | 'm4a';
  mime: string;
  video?: DashRepresentation;
  muxedAudio?: boolean;
  segmentCount: number;
  durationSec: number;
}

interface DashBudget {
  used: number;
  max?: number;
}

/** Fetch one track's init + media segments (bounded concurrency, shared budget). */
async function fetchDashTrack(
  seg: { initUri: string; segmentUris: string[] },
  deps: DashDeps,
  onSegment: () => void,
  budget: DashBudget,
): Promise<{ init?: Uint8Array; segments: Uint8Array[] }> {
  const total = seg.segmentUris.length;
  const parts: Uint8Array[] = new Array(total);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < total) {
      const i = cursor++;
      const bytes = await deps.fetchBytes(seg.segmentUris[i]);
      parts[i] = bytes;
      budget.used += bytes.length;
      if (budget.max && budget.used > budget.max) throw new DashError('too-large', 'Stream exceeds the maximum capture size.');
      onSegment();
    }
  };
  const limit = Math.max(1, deps.concurrency ?? 6);
  await Promise.all(Array.from({ length: Math.min(limit, total) }, worker));
  const init = seg.initUri ? await deps.fetchBytes(seg.initUri) : undefined;
  return { init, segments: parts };
}

/**
 * Full capture: MPD URL → one muxed MP4. Parses the MPD, refuses live/DRM, selects
 * the highest video + audio, expands each SegmentTemplate, fetches every segment,
 * and muxes the two fMP4 tracks together.
 */
export async function captureDash(url: string, deps: DashDeps, opts: DashCaptureOptions = {}): Promise<DashCaptureResult> {
  // The MPD is page-controlled and every segment/init URL is resolved from it
  // (incl. its BaseURL). Route all fetches through the SSRF guard so a hostile
  // manifest cannot aim them at an internal/loopback/link-local host (the
  // offscreen fetcher has <all_urls>).
  const gd: DashDeps = {
    ...deps,
    fetchText: (u) => (assertSafeCaptureUrl(u), deps.fetchText(u)),
    fetchBytes: (u) => (assertSafeCaptureUrl(u), deps.fetchBytes(u)),
  };
  const xml = await gd.fetchText(url);
  const manifest = parseMpd(xml, url);
  assertDownloadable(manifest);

  // Audio-only (#204): emit just the highest audio Representation as `.m4a`, no
  // re-encode. DASH is always demuxed, so the audio track is directly muxable.
  // After assertDownloadable, so DRM/live still refuse first.
  if (opts.audioOnly) {
    const audioRep = manifest.audio.length ? selectRepresentation(manifest.audio, 'highest') : undefined;
    if (!audioRep) throw new DashError('audio-unavailable', 'This stream has no separate audio track to extract as audio-only.');
    const aExp = expandSegments(audioRep, manifest.durationSec);
    const totalA = aExp.segmentUris.length;
    let doneA = 0;
    const onSegmentA = (): void => deps.onProgress?.(++doneA, totalA);
    const budgetA: DashBudget = { used: 0, max: opts.maxBytes };
    let audioTrack: { init?: Uint8Array; segments: Uint8Array[] };
    try {
      audioTrack = await fetchDashTrack(aExp, gd, onSegmentA, budgetA);
    } catch (e) {
      if (e instanceof DashError) throw e;
      throw new DashError('fetch-failed', 'A segment could not be fetched.');
    }
    if (!audioTrack.init) throw new DashError('unsupported', 'The audio representation has no initialization segment.');
    let m4a: Uint8Array;
    try {
      m4a = muxAudioOnly({ init: audioTrack.init, segments: audioTrack.segments });
    } catch {
      throw new DashError('unsupported', 'Could not extract this stream’s audio track.');
    }
    if (!m4a.length) throw new DashError('empty', 'Nothing was downloaded from the stream.');
    return {
      bytes: m4a,
      ext: 'm4a',
      mime: 'audio/mp4',
      muxedAudio: false,
      segmentCount: totalA,
      durationSec: Math.round(manifest.durationSec),
    };
  }

  const video = selectRepresentation(manifest.video, opts.quality)!;
  const audio = manifest.audio.length ? selectRepresentation(manifest.audio, 'highest') : undefined;

  const vExp = expandSegments(video, manifest.durationSec);
  const aExp = audio ? expandSegments(audio, manifest.durationSec) : undefined;

  const total = vExp.segmentUris.length + (aExp?.segmentUris.length ?? 0);
  let done = 0;
  const onSegment = (): void => deps.onProgress?.(++done, total);
  const budget: DashBudget = { used: 0, max: opts.maxBytes };

  let videoTrack: { init?: Uint8Array; segments: Uint8Array[] };
  let audioTrack: { init?: Uint8Array; segments: Uint8Array[] } | undefined;
  try {
    videoTrack = await fetchDashTrack(vExp, gd, onSegment, budget);
    audioTrack = aExp ? await fetchDashTrack(aExp, gd, onSegment, budget) : undefined;
  } catch (e) {
    if (e instanceof DashError) throw e;
    throw new DashError('fetch-failed', 'A segment could not be fetched.');
  }
  if (!videoTrack.init) throw new DashError('unsupported', 'The video representation has no initialization segment.');

  let bytes: Uint8Array;
  try {
    bytes = muxTracks(
      { init: videoTrack.init, segments: videoTrack.segments },
      audioTrack && audioTrack.init ? { init: audioTrack.init, segments: audioTrack.segments } : null,
    );
  } catch {
    throw new DashError('unsupported', 'Could not combine this stream’s tracks.');
  }
  if (!bytes.length) throw new DashError('empty', 'Nothing was downloaded from the stream.');

  return {
    bytes,
    ext: 'mp4',
    mime: 'video/mp4',
    video,
    muxedAudio: !!(audioTrack && audioTrack.init),
    segmentCount: vExp.segmentUris.length,
    durationSec: Math.round(manifest.durationSec),
  };
}
