import { describe, it, expect } from 'vitest';
import { isFbPhotoGrid } from '@/extension/shared/active-tab/fb-grid-url';

describe('isFbPhotoGrid', () => {
  it('is true on profile/photos and album grids', () => {
    expect(isFbPhotoGrid('https://www.facebook.com/profile.php?id=61563550864295&sk=photos')).toBe(true);
    expect(isFbPhotoGrid('https://www.facebook.com/someuser/photos')).toBe(true);
    expect(isFbPhotoGrid('https://www.facebook.com/media/set/?set=a.123')).toBe(true);
  });
  it('is false on a single photo, non-photo FB pages, and non-FB hosts', () => {
    expect(isFbPhotoGrid('https://www.facebook.com/photo.php?fbid=123')).toBe(false);
    expect(isFbPhotoGrid('https://www.facebook.com/marketplace/')).toBe(false);
    expect(isFbPhotoGrid('https://example.com/photos')).toBe(false);
  });
});
