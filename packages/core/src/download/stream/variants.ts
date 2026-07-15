/**
 * Per-stream variant model (#314). Normalizes an HLS master's variants and a DASH
 * MPD's video Representations to one `StreamVariant` shape for the picker. Pure —
 * no DOM, no fetch — so it is node-unit-testable; the fetch that produces the
 * manifest text lives in the background `LIST_VARIANTS` handler.
 */

import type { StreamVariant } from '@mbd/core/types';
import { parseMaster } from '@mbd/core/download/stream/hls';
import { parseMpd } from '@mbd/core/download/stream/dash';

/** Human label for a rendition: "1080p · 5.2 Mbps", or just the rate when the
 *  rendition advertises no resolution. Rates ≥ 1 Mbps show Mbps (1 decimal), else kbps. */
export function formatVariantLabel(height: number | undefined, bandwidth: number): string {
  const rate = bandwidth >= 1_000_000
    ? `${(bandwidth / 1_000_000).toFixed(1)} Mbps`
    : `${Math.round(bandwidth / 1000)} kbps`;
  return height ? `${height}p · ${rate}` : rate;
}

/** Collapse raw renditions to one entry per distinct height (highest bandwidth
 *  wins), drop height-less ones, and sort height-desc — exactly the set the
 *  capture quality plumbing (which targets a height) can address. */
function collapse(raw: { height?: number; bandwidth: number }[]): StreamVariant[] {
  const best = new Map<number, number>(); // height → max bandwidth
  for (const r of raw) {
    if (!r.height) continue;
    const cur = best.get(r.height);
    if (cur === undefined || r.bandwidth > cur) best.set(r.height, r.bandwidth);
  }
  return [...best.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([height, bandwidth]) => ({ height, bandwidth, label: formatVariantLabel(height, bandwidth) }));
}

export function variantsFromMaster(text: string, baseUrl: string): StreamVariant[] {
  return collapse(parseMaster(text, baseUrl).map((v) => ({ height: v.resolution?.height, bandwidth: v.bandwidth })));
}

export function variantsFromMpd(xml: string, baseUrl: string): StreamVariant[] {
  return collapse(parseMpd(xml, baseUrl).video.map((r) => ({ height: r.height, bandwidth: r.bandwidth })));
}
