/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://example.com/" }
 */
import { collectMedia } from '@/extension/content/collect';

afterEach(() => { document.body.innerHTML = ''; });

describe('collectMedia — incremental scanRoots', () => {
  it('with no argument walks the whole document', () => {
    document.body.innerHTML = '<img src="https://cdn.example/full.jpg">';
    expect(collectMedia().map((i) => i.src)).toContain('https://cdn.example/full.jpg');
  });

  it('given a subtree, returns only media inside that subtree', () => {
    document.body.innerHTML =
      '<img src="https://cdn.example/outside.jpg">' +
      '<div id="added"><img src="https://cdn.example/inside.jpg"></div>';
    const srcs = collectMedia([document.getElementById('added')!]).map((i) => i.src);
    expect(srcs).toContain('https://cdn.example/inside.jpg');
    expect(srcs).not.toContain('https://cdn.example/outside.jpg');
  });

  it('scans the subtree root element itself when it is media', () => {
    document.body.innerHTML = '<img id="added" src="https://cdn.example/self.jpg">';
    expect(collectMedia([document.getElementById('added')!]).map((i) => i.src))
      .toContain('https://cdn.example/self.jpg');
  });
});
