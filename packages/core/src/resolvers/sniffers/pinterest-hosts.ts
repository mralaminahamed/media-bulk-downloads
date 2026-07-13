/**
 * Pinterest's country domains — the single source of truth for the MAIN-world
 * sniffer's `matches` and the isolated relay's host gate. Add a ccTLD here and
 * both the entrypoint match patterns and the relay follow. Pinterest serves the
 * same app on each of these.
 */
export const PINTEREST_DOMAINS = [
  'pinterest.com', 'pinterest.at', 'pinterest.ca', 'pinterest.ch', 'pinterest.cl',
  'pinterest.co.kr', 'pinterest.co.uk', 'pinterest.com.au', 'pinterest.com.mx',
  'pinterest.de', 'pinterest.dk', 'pinterest.es', 'pinterest.fr', 'pinterest.ie',
  'pinterest.it', 'pinterest.jp', 'pinterest.nz', 'pinterest.ph', 'pinterest.pt',
  'pinterest.ru', 'pinterest.se', 'pinterest.info',
] as const;

/** Content-script match patterns: apex + any subdomain of each domain. */
export const PINTEREST_MATCHES: string[] = PINTEREST_DOMAINS.map((d) => `*://*.${d}/*`);

/** True when `host` is one of the Pinterest domains or a subdomain of one. */
export function isPinterestHost(host: string): boolean {
  return PINTEREST_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}
