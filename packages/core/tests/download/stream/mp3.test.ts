import { describe, it, expect } from 'vitest';
import { encodeMp3, mp3BitrateFor, isMp3Format, AUDIO_FORMATS, AUDIO_FORMAT_LABELS } from '@mbd/core/download/stream/mp3';
import type { AudioFormat } from '@mbd/core/types';

/** A short sine tone as Float32 PCM — realistic enough for the encoder to emit
 *  real frames without pulling a media fixture. */
function sine(samples: number, sampleRate: number, hz: number): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = 0.4 * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return out;
}

/** MP3 frames begin with an 11-bit sync word: 0xFF followed by three set bits. */
function startsWithMp3Frame(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

const RATE = 44100;

describe('mp3BitrateFor / isMp3Format', () => {
  it('maps each mp3 format to its CBR bitrate and m4a to null', () => {
    expect(mp3BitrateFor('mp3-128')).toBe(128);
    expect(mp3BitrateFor('mp3-192')).toBe(192);
    expect(mp3BitrateFor('mp3-320')).toBe(320);
    expect(mp3BitrateFor('m4a')).toBeNull();
  });

  it('isMp3Format is true only for the mp3 variants', () => {
    expect(isMp3Format('m4a')).toBe(false);
    expect(isMp3Format('mp3-128')).toBe(true);
    expect(isMp3Format('mp3-320')).toBe(true);
  });

  it('exposes a label for every listed format', () => {
    for (const f of AUDIO_FORMATS) expect(AUDIO_FORMAT_LABELS[f]).toBeTruthy();
    expect(AUDIO_FORMATS).toContain('m4a');
  });
});

describe('encodeMp3', () => {
  // ~0.25s so the encoder produces several frames, not just a flush tail.
  const mono = [sine(RATE / 4, RATE, 440)];
  const stereo = [sine(RATE / 4, RATE, 440), sine(RATE / 4, RATE, 660)];

  for (const format of ['mp3-128', 'mp3-192', 'mp3-320'] as AudioFormat[]) {
    const kbps = mp3BitrateFor(format)!;

    it(`emits a valid MP3 stream for mono @ ${kbps}kbps`, async () => {
      const bytes = await encodeMp3(mono, RATE, kbps);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);
      expect(startsWithMp3Frame(bytes)).toBe(true);
    });

    it(`emits a valid MP3 stream for stereo @ ${kbps}kbps`, async () => {
      const bytes = await encodeMp3(stereo, RATE, kbps);
      expect(bytes.length).toBeGreaterThan(0);
      expect(startsWithMp3Frame(bytes)).toBe(true);
    });
  }

  it('a higher bitrate yields more bytes for the same input', async () => {
    const at128 = await encodeMp3(stereo, RATE, 128);
    const at320 = await encodeMp3(stereo, RATE, 320);
    expect(at320.length).toBeGreaterThan(at128.length);
  });

  it('throws when given no channels', async () => {
    await expect(encodeMp3([], RATE, 192)).rejects.toThrow();
  });
});
