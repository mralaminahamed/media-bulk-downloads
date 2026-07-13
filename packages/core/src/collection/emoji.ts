/**
 * Detects emoji / emote graphics served by the well-known emoji CDNs, so the
 * collection filter can hide them when the user enables "Exclude emoji". Covers
 * the classic twemoji hosts (Twitter, WordPress core, GitHub, jsdelivr/cdnjs
 * emoji packs, the legacy maxcdn host), Facebook / Instagram (emoji.php renderer
 * + rsrc.php static UI sprites/glyphs), and the chat/reaction emoji of Slack,
 * Discord, Twitch, plus the Emojipedia / Google Noto / JoyPixels image CDNs.
 *
 * Each rule matches on host + path — never a bare substring — to keep false
 * positives near zero: a rule either names a host that serves ONLY emoji (so any
 * path is fine) or pairs a shared host with an emoji-only path segment. A `.`
 * boundary host-suffix match rejects look-alikes (evilfbcdn.net, fakegithubassets.com).
 * Collected srcs are always absolute http(s) URLs, so an unparseable src is
 * treated as not-emoji.
 */

/** Exact host, or a `.`-boundary suffix match (`a.example.com` matches `example.com`). */
function hostIs(host: string, name: string): boolean {
  return host === name || host.endsWith('.' + name);
}

/** Emoji/emote pack names as they appear in a jsdelivr / cdnjs path. */
const EMOJI_PACK = /\/(twemoji|openmoji|noto-emoji|emojione|joypixels|emoji-datasource)/;

const ANY = (): true => true;

/** A src is emoji if any rule's host matches AND its path predicate passes. */
const RULES: ReadonlyArray<{ host: (h: string) => boolean; path: (p: string) => boolean }> = [
  // Twitter twemoji.
  { host: (h) => h === 'abs.twimg.com', path: (p) => p.startsWith('/emoji/') },
  // WordPress core emoji.
  { host: (h) => h === 's.w.org', path: (p) => p.startsWith('/images/core/emoji/') },
  // Legacy twemoji host (whole host is emoji).
  { host: (h) => h === 'twemoji.maxcdn.com', path: ANY },
  // Emoji packs mirrored on jsdelivr / cdnjs (twemoji, openmoji, noto, joypixels…).
  { host: (h) => h === 'cdn.jsdelivr.net', path: (p) => EMOJI_PACK.test(p) },
  { host: (h) => h === 'cdnjs.cloudflare.com', path: (p) => EMOJI_PACK.test(p) },
  // GitHub's rendered unicode emoji.
  { host: (h) => hostIs(h, 'githubassets.com'), path: (p) => p.includes('/images/icons/emoji/') },
  // Facebook / Instagram / Messenger: the emoji.php renderer, and the rsrc.php
  // resource endpoint that serves reaction icons + emoji-picker sprite sheets +
  // chrome glyphs (never user media — real photos live on scontent hosts /v/…).
  {
    host: (h) => hostIs(h, 'fbcdn.net') || hostIs(h, 'facebook.com'),
    path: (p) => p.includes('/emoji.php') || p.startsWith('/rsrc.php/'),
  },
  // Emojipedia image CDN (dedicated to emoji artwork).
  { host: (h) => h === 'em-content.zobj.net', path: ANY },
  // Slack: custom-emoji host + the standard-emoji asset bundle on the app CDN.
  { host: (h) => h === 'emoji.slack-edge.com', path: ANY },
  { host: (h) => h === 'a.slack-edge.com', path: (p) => p.includes('emoji-assets') },
  // Discord custom emoji / reactions (avatars + attachments use other paths).
  { host: (h) => h === 'cdn.discordapp.com', path: (p) => p.startsWith('/emojis/') },
  // Twitch emotes (user pictures / clips use other paths).
  { host: (h) => h === 'static-cdn.jtvnw.net', path: (p) => p.startsWith('/emoticons/') },
  // Google Noto emoji (animated + static).
  { host: (h) => h === 'fonts.gstatic.com', path: (p) => p.startsWith('/s/e/notoemoji/') },
  // JoyPixels image CDN (dedicated to emoji artwork).
  { host: (h) => h === 'cdn.joypixels.com', path: ANY },
];

export function isEmojiUrl(src: string): boolean {
  let host: string;
  let path: string;
  try {
    const u = new URL(src);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return false;
  }
  return RULES.some((rule) => rule.host(host) && rule.path(path));
}
