import { buildStreamCommand, stripUrlSecrets, STREAM_COMMAND_ENGINES } from '@mbd/core/download/stream/download-command';

const M = 'https://cdn.example.com/live/master.m3u8';
const REF = 'https://watch.example.com/video/42';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';

describe('stripUrlSecrets', () => {
  it('drops signature/token/expiry params but keeps benign ones', () => {
    const out = stripUrlSecrets(`${M}?res=720&token=abc123&sig=deadbeef&Expires=999`);
    expect(out).toContain('res=720');
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('deadbeef');
    expect(out).not.toMatch(/Expires/i);
  });

  it('drops whole presigned families (X-Amz-*, X-Goog-*)', () => {
    const out = stripUrlSecrets(
      `${M}?X-Amz-Signature=sig&X-Amz-Credential=cred&X-Amz-Security-Token=tok&X-Goog-Signature=g`,
    );
    expect(out).toBe(M);
  });

  it('catches CloudFront-style capitalized params', () => {
    const out = stripUrlSecrets(`${M}?Policy=p&Signature=s&Key-Pair-Id=k`);
    expect(out).toBe(M);
  });

  it('leaves a URL with no query untouched', () => {
    expect(stripUrlSecrets(M)).toBe(M);
  });

  it('returns an unparseable URL as-is instead of throwing', () => {
    expect(stripUrlSecrets('not a url')).toBe('not a url');
  });
});

describe('buildStreamCommand — yt-dlp', () => {
  const cmd = buildStreamCommand({ manifestUrl: M, engine: 'yt-dlp', referer: REF, userAgent: UA });

  it('starts with yt-dlp and carries the manifest URL', () => {
    expect(cmd.startsWith('yt-dlp ')).toBe(true);
    expect(cmd).toContain(`'${M}'`);
  });

  it('sets --referer and --user-agent with the given values', () => {
    expect(cmd).toContain(`--referer '${REF}'`);
    expect(cmd).toContain(`--user-agent '${UA}'`);
  });

  it('omits header flags when referer/UA are absent', () => {
    const bare = buildStreamCommand({ manifestUrl: M, engine: 'yt-dlp' });
    expect(bare).toBe(`yt-dlp '${M}'`);
    expect(bare).not.toContain('--referer');
    expect(bare).not.toContain('--user-agent');
  });
});

describe('buildStreamCommand — ffmpeg', () => {
  const cmd = buildStreamCommand({ manifestUrl: M, engine: 'ffmpeg', referer: REF, userAgent: UA });

  it('is an ffmpeg stream-copy to out.mp4', () => {
    expect(cmd.startsWith('ffmpeg ')).toBe(true);
    expect(cmd).toContain(`-i '${M}'`);
    expect(cmd).toContain('-c copy');
    expect(cmd).toContain(`'out.mp4'`);
  });

  it('passes the User-Agent and Referer header correctly', () => {
    expect(cmd).toContain(`-user_agent '${UA}'`);
    expect(cmd).toContain(`-headers 'Referer: ${REF}'`);
  });
});

describe('buildStreamCommand — audio-only (I13)', () => {
  it('yt-dlp adds -x (--extract-audio) and still carries the headers', () => {
    const cmd = buildStreamCommand({ manifestUrl: M, engine: 'yt-dlp', referer: REF, userAgent: UA, audioOnly: true });
    expect(cmd).toContain('yt-dlp -x');
    expect(cmd).toContain(`--referer '${REF}'`);
    expect(cmd).toContain(`'${M}'`);
  });

  it('ffmpeg drops video and copies audio to out.m4a (not a full-video out.mp4)', () => {
    const cmd = buildStreamCommand({ manifestUrl: M, engine: 'ffmpeg', referer: REF, userAgent: UA, audioOnly: true });
    expect(cmd).toContain('-vn');
    expect(cmd).toContain('-c:a copy');
    expect(cmd).toContain(`'out.m4a'`);
    expect(cmd).not.toContain('out.mp4');
  });

  it('audioOnly false/omitted keeps the full-stream copy (unchanged)', () => {
    expect(buildStreamCommand({ manifestUrl: M, engine: 'ffmpeg' })).toContain(`'out.mp4'`);
    expect(buildStreamCommand({ manifestUrl: M, engine: 'yt-dlp' })).not.toContain('-x');
  });
});

describe('buildStreamCommand — security', () => {
  it('never emits cookies for any engine', () => {
    for (const engine of STREAM_COMMAND_ENGINES) {
      const cmd = buildStreamCommand({ manifestUrl: `${M}?token=abc`, engine, referer: REF, userAgent: UA });
      expect(cmd.toLowerCase()).not.toContain('cookie');
    }
  });

  it('strips secrets from the manifest URL before embedding it', () => {
    const cmd = buildStreamCommand({ manifestUrl: `${M}?token=SECRET_TOKEN&res=1080`, engine: 'yt-dlp' });
    expect(cmd).not.toContain('SECRET_TOKEN');
    expect(cmd).toContain('res=1080');
  });

  it('strips secrets from the referer too', () => {
    const cmd = buildStreamCommand({ manifestUrl: M, engine: 'yt-dlp', referer: `${REF}?auth=PAGE_SECRET` });
    expect(cmd).not.toContain('PAGE_SECRET');
  });

  it('single-quotes a hostile URL so it cannot break out of its argument', () => {
    const evil = "https://x.test/a.m3u8?q='; rm -rf ~ #";
    const cmd = buildStreamCommand({ manifestUrl: evil, engine: 'yt-dlp' });
    // The embedded single quote is neutralized as '\'' — a naive build would emit
    // `=';` (an unquoted break-out into `; rm`); the escaped form never does.
    expect(cmd).toContain(`'\\''`);
    expect(cmd).not.toContain(`=';`);
  });
});
