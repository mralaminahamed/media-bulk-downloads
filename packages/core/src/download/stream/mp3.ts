import type { AudioFormat } from '@mbd/core/types';

/**
 * Audio-only MP3 transcode (#321). The stream engines already extract an `.m4a`
 * (AAC, no re-encode — #204/#320); this module turns decoded PCM into an MP3 when
 * the user asks for one. It is the PURE half: given Float32 PCM channels it emits
 * MP3 bytes. The Web-Audio decode that produces those channels lives in the
 * offscreen host (decodeAudioData is DOM-only), so this stays unit-testable in
 * node.
 *
 * The lamejs encoder is loaded with a dynamic `import()` INSIDE `encodeMp3`, so it
 * lands in its own async chunk and never bloats the popup bundle — importing this
 * module for its labels/helpers pulls no encoder code.
 */

/** The formats the audio-capture action can produce. `m4a` is the original
 *  passthrough (default); the `mp3-*` variants re-encode at that CBR bitrate. */
export const AUDIO_FORMATS: readonly AudioFormat[] = ['m4a', 'mp3-128', 'mp3-192', 'mp3-320'];

/** Human labels for the settings dropdown + per-item override menu. */
export const AUDIO_FORMAT_LABELS: Record<AudioFormat, string> = {
  'm4a': 'M4A (original)',
  'mp3-128': 'MP3 · 128 kbps',
  'mp3-192': 'MP3 · 192 kbps',
  'mp3-320': 'MP3 · 320 kbps',
};

/** The MP3 bitrate for a format, or null for the M4A passthrough (no re-encode). */
export function mp3BitrateFor(format: AudioFormat): 128 | 192 | 320 | null {
  switch (format) {
    case 'mp3-128': return 128;
    case 'mp3-192': return 192;
    case 'mp3-320': return 320;
    default: return null;
  }
}

/** True when the format requires a decode → MP3 re-encode (vs M4A passthrough). */
export const isMp3Format = (format: AudioFormat): boolean => mp3BitrateFor(format) !== null;

/**
 * Upper bound on the extracted-audio byte size the offscreen host will decode →
 * MP3. `decodeAudioData` inflates compressed AAC to Float32 PCM (~10×), so an
 * extreme audio-only capture approaching the 1 GB stream cap would balloon to
 * multiple GB of PCM and OOM-crash the offscreen document (an OOM is not reliably
 * catchable). Above this ceiling the transcode is refused up front, surfacing the
 * normal `mp3_transcode_failed` code instead of a crash. Generous — a typical
 * audio-only capture (a music track or clip) is far below it; only pathological
 * multi-hour, high-bitrate inputs reach it.
 */
export const MP3_TRANSCODE_MAX_INPUT_BYTES = 256 * 1024 * 1024;

/** Whether `byteLength` of extracted audio is within the safe decode → MP3 ceiling. */
export const canTranscodeToMp3 = (byteLength: number): boolean =>
  byteLength > 0 && byteLength <= MP3_TRANSCODE_MAX_INPUT_BYTES;

/** Clamp a Float32 sample to signed 16-bit PCM. Asymmetric scale (0x8000 for the
 *  negative rail, 0x7fff for the positive) so full-scale ±1.0 maps without clipping. */
function floatTo16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] < -1 ? -1 : samples[i] > 1 ? 1 : samples[i];
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

/**
 * Encode decoded PCM to a CBR MP3 at `kbps`. Mono when a single channel is given,
 * otherwise the first two channels are taken as L/R (lamejs is mono-or-stereo).
 * lamejs consumes Int16 PCM one 1152-sample MPEG frame at a time; the trailing
 * `flush()` emits the final partial frame.
 *
 * The encoder module is imported lazily so it stays out of any eager bundle.
 */
export async function encodeMp3(
  channels: readonly Float32Array[],
  sampleRate: number,
  kbps: number,
): Promise<Uint8Array> {
  if (!channels.length) throw new Error('encodeMp3: no channels');
  const { Mp3Encoder } = await import('@breezystack/lamejs');

  const stereo = channels.length >= 2;
  const encoder = new Mp3Encoder(stereo ? 2 : 1, sampleRate, kbps);
  const left = floatTo16(channels[0]);
  const right = stereo ? floatTo16(channels[1]) : undefined;

  const BLOCK = 1152; // one MPEG-1 Layer III frame
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += BLOCK) {
    const l = left.subarray(i, i + BLOCK);
    const buf = right
      ? encoder.encodeBuffer(l, right.subarray(i, i + BLOCK))
      : encoder.encodeBuffer(l);
    if (buf.length) chunks.push(buf);
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(tail);
  return concat(chunks);
}
