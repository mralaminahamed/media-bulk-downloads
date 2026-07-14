import { captureHls, HlsError } from '@mbd/core/download/stream/hls';
import { captureDash, DashError } from '@mbd/core/download/stream/dash';
import { browserHlsDeps } from '@mbd/core/download/stream/hls-webcrypto';
import { browserDashDeps } from '@mbd/core/download/stream/dash-fetch';
import { encodeMp3, mp3BitrateFor } from '@mbd/core/download/stream/mp3';
import { AudioFormat, CaptureRunMessage, CaptureRunResult } from '@mbd/core/types';

/**
 * The offscreen document's capture host. The offscreen realm has DOM APIs
 * (URL.createObjectURL, WebCrypto) and, with <all_urls>, a CORS-free fetch — but
 * no chrome.downloads. It runs the HLS or DASH engine (per the message's
 * `engine`), broadcasts progress for the popup, and hands the assembled bytes
 * back as a same-extension blob URL for the background to download. mp4box (via
 * the engines' mux path) loads here, off the popup bundle.
 */
export function installOffscreenCaptureHost(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || (message as { type?: unknown }).type !== 'CAPTURE_RUN') return;
    const { runId, manifestUrl, engine, quality, maxBytes, audioOnly, audioFormat } = message as CaptureRunMessage;
    void runCapture(runId, manifestUrl, engine, quality, maxBytes, !!audioOnly, audioFormat ?? 'm4a').then(sendResponse);
    return true; // response is sent asynchronously
  });
}

/** Publish assembled bytes as a same-extension blob URL, kept alive long enough
 *  for the background's chrome.downloads to read it. */
function publish(bytes: Uint8Array, mime: string): string {
  // A standalone ArrayBuffer copy — Blob rejects a plain Uint8Array's
  // ArrayBufferLike backing under strict DOM types.
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blobUrl = URL.createObjectURL(new Blob([ab], { type: mime }));
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  return blobUrl;
}

/**
 * Decode the extracted M4A (AAC) and re-encode it to a CBR MP3 (#321). The
 * offscreen realm is the only capture context with Web Audio, so decodeAudioData
 * runs here; the PCM → MP3 step is the pure `encodeMp3`. An OfflineAudioContext
 * (not a realtime AudioContext) does the decode — it touches no audio hardware and
 * is exempt from the autoplay policy, so no user gesture or running graph is
 * needed. lamejs is fed the decoded buffer's own sample rate, so pitch is correct
 * regardless of whether the decode resampled.
 */
async function transcodeToMp3(m4a: Uint8Array, kbps: number): Promise<Uint8Array> {
  const ab = m4a.buffer.slice(m4a.byteOffset, m4a.byteOffset + m4a.byteLength) as ArrayBuffer;
  const ctx = new OfflineAudioContext(2, 1, 44100);
  const audio = await ctx.decodeAudioData(ab);
  const channels: Float32Array[] = [];
  for (let c = 0; c < audio.numberOfChannels; c++) channels.push(audio.getChannelData(c));
  return encodeMp3(channels, audio.sampleRate, kbps);
}

async function runCapture(
  runId: string,
  manifestUrl: string,
  engine: 'hls' | 'dash',
  quality: CaptureRunMessage['quality'],
  maxBytes: number,
  audioOnly: boolean,
  audioFormat: AudioFormat,
): Promise<CaptureRunResult> {
  const onProgress = (done: number, total: number): void => {
    void chrome.runtime.sendMessage({ type: 'CAPTURE_PROGRESS', runId, done, total });
  };
  let res;
  try {
    res = engine === 'dash'
      ? await captureDash(manifestUrl, browserDashDeps(onProgress), { quality, maxBytes, audioOnly })
      : await captureHls(manifestUrl, browserHlsDeps(onProgress), { quality, maxBytes, audioOnly });
  } catch (e) {
    const code = e instanceof HlsError || e instanceof DashError ? e.code : 'unknown';
    return { ok: false, code };
  }

  // MP3 re-encode is opt-in and audio-only; anything else keeps the original
  // engine bytes (M4A/video) untouched — zero change to the #204/#320 path.
  const kbps = audioOnly ? mp3BitrateFor(audioFormat) : null;
  try {
    if (kbps !== null) {
      const mp3 = await transcodeToMp3(res.bytes, kbps);
      return { ok: true, blobUrl: publish(mp3, 'audio/mpeg'), ext: 'mp3', segmentCount: res.segmentCount, muxedAudio: !!res.muxedAudio };
    }
    return { ok: true, blobUrl: publish(res.bytes, res.mime), ext: res.ext, segmentCount: res.segmentCount, muxedAudio: !!res.muxedAudio };
  } catch {
    // A transcode/blob failure (the audio extracted fine): surface a distinct code
    // for MP3 — rather than silently handing back an M4A the user didn't ask for —
    // and preserve the original path's coded failure for the passthrough case.
    return { ok: false, code: kbps !== null ? 'mp3_transcode_failed' : 'unknown' };
  }
}
