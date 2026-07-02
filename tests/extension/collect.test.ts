import { collectImages } from '@/extension/collect';

const setBody = (html: string) => {
  document.body.innerHTML = html;
};

describe('collectImages — original upgrade', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('upgrades a Twitter URL, keeps the small variant as thumbnailSrc, and parses type', () => {
    setBody('<img src="https://pbs.twimg.com/media/ABC?format=jpg&name=360x360" alt="t">');
    const [img] = collectImages();
    expect(img.src).toBe('https://pbs.twimg.com/media/ABC?format=jpg&name=orig');
    expect(img.thumbnailSrc).toBe('https://pbs.twimg.com/media/ABC?format=jpg&name=360x360');
    expect(img.type).toBe('jpeg');
  });

  it('collapses two size variants of the same media to one original entry', () => {
    setBody(
      '<img src="https://pbs.twimg.com/media/ABC?format=jpg&name=360x360">' +
        '<img src="https://pbs.twimg.com/media/ABC?format=jpg&name=900x900">',
    );
    const originals = collectImages().filter((i) => i.src.includes('/media/ABC'));
    expect(originals).toHaveLength(1);
    expect(originals[0].src).toContain('name=orig');
  });

  it('fills dimensions from the URL when the DOM reports 0x0', () => {
    // srcset candidates arrive with no element dimensions.
    setBody('<img srcset="https://cdn.shopify.com/s/files/1/x/y_800x600.jpg 1x">');
    const shop = collectImages().find((i) => i.src.includes('shopify'));
    expect(shop).toBeDefined();
    expect(shop!.width).toBe(800);
    expect(shop!.height).toBe(600);
  });
});
