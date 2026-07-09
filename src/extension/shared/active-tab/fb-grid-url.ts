/** True for a Facebook photo-grid surface (profile photos or an album), where
 *  tiles carry per-photo fbids — the only surface original-capture supports. A
 *  single-photo viewer route (/photo.php?fbid=) is deliberately excluded. */
export function isFbPhotoGrid(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const h = u.hostname;
  if (h !== 'facebook.com' && !h.endsWith('.facebook.com')) return false;
  if (/\/photo\.php$/.test(u.pathname) || /[?&]fbid=/.test(u.search)) return false;
  if (u.searchParams.get('sk') === 'photos') return true;
  if (/\/photos\/?$/.test(u.pathname)) return true;
  if (/\/media\/set\/?$/.test(u.pathname)) return true;
  return false;
}
