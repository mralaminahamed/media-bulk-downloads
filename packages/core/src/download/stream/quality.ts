import { STREAM_TARGET_HEIGHT } from '@mbd/core/download/stream/capture-constants';
import { SettingsData } from '@mbd/core/types';

/** The user's global "Stream quality" preference (#288). */
export type StreamQuality = SettingsData['streamQuality'];

/**
 * Map the global "Stream quality" setting to the engine's variant selector
 * (`selectVariant` / `selectRepresentation`, HLS + DASH share the same shape):
 *
 *   - `auto`  → the target-height default (STREAM_TARGET_HEIGHT) — today's
 *               behaviour, so the default changes nothing.
 *   - `best`  → `'highest'` bandwidth, `worst` → `'lowest'`.
 *   - `1080` / `720` / `480` → that exact height; the engine's numeric path
 *               already resolves to the highest-bitrate variant AT that height
 *               (closest-height, ties → higher bandwidth), so no engine change.
 *
 * A corrupt/legacy value (sync storage tolerates unknown shapes) falls back to
 * the auto target rather than a NaN height.
 */
export function streamQualityToEngine(quality: StreamQuality): number | 'highest' | 'lowest' {
  switch (quality) {
    case 'best':
      return 'highest';
    case 'worst':
      return 'lowest';
    case 'auto':
      return STREAM_TARGET_HEIGHT;
    default: {
      const height = Number(quality);
      return Number.isFinite(height) ? height : STREAM_TARGET_HEIGHT;
    }
  }
}
