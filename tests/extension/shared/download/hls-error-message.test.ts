import { hlsErrorMessage } from '@/extension/shared/download/hls-error-message';

describe('hlsErrorMessage', () => {
  it('maps each known code to a specific message', () => {
    expect(hlsErrorMessage('live')).toMatch(/live/i);
    expect(hlsErrorMessage('drm')).toMatch(/DRM/i);
    expect(hlsErrorMessage('sample-aes')).toMatch(/SAMPLE-AES/i);
    expect(hlsErrorMessage('demuxed-unsupported')).toMatch(/separately/i);
    expect(hlsErrorMessage('too-large')).toMatch(/1 GB/);
  });
  it('falls back for an unknown code', () => {
    expect(hlsErrorMessage('weird')).toMatch(/Couldn.t capture/i);
  });
});
