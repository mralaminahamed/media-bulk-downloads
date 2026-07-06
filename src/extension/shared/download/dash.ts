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
