/**
 * mux.ts — combine demuxed fragmented-MP4 tracks into one playable MP4.
 *
 * Adaptive streams (DASH, and demuxed HLS) ship video and audio as SEPARATE
 * fMP4 tracks; concatenating segments only yields a playable-with-audio file
 * when they are muxed together (MPEG-TS is; fMP4 usually isn't). This wraps
 * mp4box.js to do that: demux each track's (init + segments) into samples, then
 * write a single MP4 carrying both a video and an audio track.
 *
 * mp4box parses synchronously (onReady/onSamples fire during appendBuffer/flush),
 * so this is a synchronous transform — no async plumbing needed. Validated
 * end-to-end against real DASH (Big Buck Bunny): the output decodes as H.264 +
 * AAC with correct duration.
 */

import * as MP4Box from 'mp4box';

// mp4box's public types don't cover the write API (addTrack options,
// description_boxes, DataStream buffer) we rely on, so narrow locally.
type Mp4boxFile = ReturnType<typeof MP4Box.createFile>;
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFile = Mp4boxFile & Record<string, any>;

export interface MuxTrack {
  /** The fMP4 initialization segment (ftyp + moov). */
  init: Uint8Array;
  /** The media segments (moof + mdat), in playback order. */
  segments: Uint8Array[];
}

interface Demuxed {
  info: any;
  samples: any[];
  /** The source stsd sample-description entry — carries avcC / esds, reused verbatim. */
  entry: any;
}

/** mp4box wants each appended buffer tagged with its byte offset in the stream. */
function chunk(u: Uint8Array, fileStart: number): any {
  const ab = u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer & { fileStart: number };
  ab.fileStart = fileStart;
  return ab;
}

/** Parse one track's fMP4 into its samples + sample-description entry. */
function demux(track: MuxTrack): Demuxed {
  const file = MP4Box.createFile() as AnyFile;
  const out: Demuxed = { info: null, samples: [], entry: null };
  file.onReady = (info: any) => {
    out.info = info.tracks[0];
    file.setExtractionOptions(out.info.id, null, { nbSamples: Number.MAX_SAFE_INTEGER });
    file.start();
  };
  file.onSamples = (_id: number, _user: unknown, samples: any[]) => {
    for (const s of samples) out.samples.push(s);
  };
  let offset = 0;
  file.appendBuffer(chunk(track.init, offset));
  offset += track.init.length;
  for (const seg of track.segments) {
    file.appendBuffer(chunk(seg, offset));
    offset += seg.length;
  }
  file.flush();
  if (!out.info || !out.samples.length) throw new Error('mux: no decodable samples in a track');
  out.entry = file.getTrackById(out.info.id).mdia.minf.stbl.stsd.entries[0];
  return out;
}

/** Create a track on the destination mirroring the source, reusing its codec boxes. */
function addTrack(dst: AnyFile, d: Demuxed, kind: 'video' | 'audio'): number {
  const { info, entry } = d;
  if (kind === 'audio') {
    return dst.addTrack({
      type: entry.type, // 'mp4a', 'Opus', …
      hdlr: 'soun',
      timescale: info.timescale,
      channel_count: entry.channel_count,
      samplerate: entry.samplerate,
      samplesize: entry.samplesize,
      description_boxes: entry.boxes, // esds
    });
  }
  return dst.addTrack({
    type: entry.type, // 'avc1', 'hvc1', …
    hdlr: 'vide',
    timescale: info.timescale,
    width: entry.width || (info.video && info.video.width) || info.track_width,
    height: entry.height || (info.video && info.video.height) || info.track_height,
    description_boxes: entry.boxes, // avcC / hvcC
  });
}

function copySamples(dst: AnyFile, trackId: number, d: Demuxed): void {
  for (const s of d.samples) {
    dst.addSample(trackId, s.data, { duration: s.duration, dts: s.dts, cts: s.cts, is_sync: s.is_sync });
  }
}

/**
 * Mux a video track and (optionally) an audio track into one MP4's bytes.
 * With no audio, produces a valid video-only MP4. Throws if the video track has
 * no decodable samples.
 */
export function muxTracks(video: MuxTrack, audio?: MuxTrack | null): Uint8Array {
  const v = demux(video);
  const a = audio ? demux(audio) : null;

  const dst = MP4Box.createFile() as AnyFile;
  const vId = addTrack(dst, v, 'video');
  copySamples(dst, vId, v);
  if (a) {
    const aId = addTrack(dst, a, 'audio');
    copySamples(dst, aId, a);
  }

  return serialize(dst);
}

/**
 * Extract just the audio track into an MP4/M4A container's bytes (#204). The AAC
 * (or Opus) samples and their codec box (esds) are copied VERBATIM — a container
 * remux, never a re-encode — so the output is the exact source audio, losslessly,
 * in a single-track `.m4a`. Throws if the audio track has no decodable samples
 * (same guard as the A/V mux). MP3 transcode is deliberately out of scope here.
 */
export function muxAudioOnly(audio: MuxTrack): Uint8Array {
  const a = demux(audio);
  const dst = MP4Box.createFile() as AnyFile;
  const aId = addTrack(dst, a, 'audio');
  copySamples(dst, aId, a);
  return serialize(dst);
}

/** Flush the destination file to its final MP4 byte buffer. */
function serialize(dst: AnyFile): Uint8Array {
  const ds = dst.getBuffer() as unknown as { buffer: ArrayBuffer; byteLength?: number; position?: number };
  const len = ds.byteLength ?? ds.position ?? ds.buffer.byteLength;
  return new Uint8Array(ds.buffer.slice(0, len));
}
