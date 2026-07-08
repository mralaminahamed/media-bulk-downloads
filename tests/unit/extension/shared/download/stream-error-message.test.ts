import { streamErrorMessage } from '@/extension/shared/download/stream-error-message';

describe('streamErrorMessage', () => {
  it('maps each known code to a specific message', () => {
    expect(streamErrorMessage('live')).toMatch(/live/i);
    expect(streamErrorMessage('drm')).toMatch(/DRM/i);
    expect(streamErrorMessage('sample-aes')).toMatch(/SAMPLE-AES/i);
    expect(streamErrorMessage('demuxed-unsupported')).toMatch(/separately/i);
    expect(streamErrorMessage('too-large')).toMatch(/1 GB/);
  });
  it('falls back for an unknown code', () => {
    expect(streamErrorMessage('weird')).toMatch(/Couldn.t capture/i);
  });
  it('maps the DASH-only codes', () => {
    expect(streamErrorMessage('no-representations')).toMatch(/no downloadable video/i);
    expect(streamErrorMessage('unsupported')).toMatch(/can’t be captured/i);
    expect(streamErrorMessage('empty')).toMatch(/nothing/i);
    expect(streamErrorMessage('fetch-failed')).toMatch(/couldn’t be downloaded/i);
  });
});
