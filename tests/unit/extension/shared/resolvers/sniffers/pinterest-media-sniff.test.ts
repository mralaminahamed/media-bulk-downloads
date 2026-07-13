import { describe, it, expect } from 'vitest';
import { extractPinterestMedia, pinPinimgUrl, pinIdFromUrl } from '@mbd/core/resolvers/sniffers/pinterest-media-sniff';

const imageMap = (hash: string) => ({
  '236x': { width: 236, height: 354, url: `https://i.pinimg.com/236x/${hash}.jpg` },
  '474x': { width: 474, height: 711, url: `https://i.pinimg.com/474x/${hash}.jpg` },
  orig: { width: 1000, height: 1500, url: `https://i.pinimg.com/originals/${hash}.jpg` },
});
const boardFeed = (pins: object[]) => ({ resource: { name: 'BoardFeedResource' }, resource_response: { data: pins } });

describe('extractPinterestMedia', () => {
  it('emits the orig image per pin, keyed by pin id', () => {
    const out = extractPinterestMedia(boardFeed([
      { id: '111111111111', type: 'pin', images: imageMap('aa/bb/cc') },
      { id: '222222222222', type: 'pin', images: imageMap('dd/ee/ff') },
    ]));
    expect(out).toEqual([
      { pinId: '111111111111', kind: 'image', url: 'https://i.pinimg.com/originals/aa/bb/cc.jpg', ext: 'jpg', width: 1000, height: 1500 },
      { pinId: '222222222222', kind: 'image', url: 'https://i.pinimg.com/originals/dd/ee/ff.jpg', ext: 'jpg', width: 1000, height: 1500 },
    ]);
  });

  it('falls back to the largest size when there is no orig', () => {
    const imgs = imageMap('aa/bb/cc'); delete (imgs as Record<string, unknown>).orig;
    const [c] = extractPinterestMedia(boardFeed([{ id: '111111111111', type: 'pin', images: imgs }]));
    expect(c.url).toBe('https://i.pinimg.com/474x/aa/bb/cc.jpg');
  });

  it('emits a video pin as the progressive mp4 with the image as poster', () => {
    const [c] = extractPinterestMedia(boardFeed([{
      id: '333333333333', type: 'pin', images: imageMap('aa/bb/cc'),
      videos: { video_list: { V_720P: { url: 'https://v1.pinimg.com/videos/720p/x.mp4' }, V_HLSV4: { url: 'https://v1.pinimg.com/videos/hls/x.m3u8' } } },
    }]));
    expect(c).toMatchObject({ pinId: '333333333333', kind: 'video', url: 'https://v1.pinimg.com/videos/720p/x.mp4', ext: 'mp4', poster: 'https://i.pinimg.com/originals/aa/bb/cc.jpg' });
  });

  it('falls back to the HLS master when no progressive mp4', () => {
    const [c] = extractPinterestMedia(boardFeed([{
      id: '333333333333', type: 'pin', images: imageMap('aa/bb/cc'),
      videos: { video_list: { V_HLSV4: { url: 'https://v1.pinimg.com/videos/hls/x.m3u8' } } },
    }]));
    expect(c).toMatchObject({ kind: 'video', url: 'https://v1.pinimg.com/videos/hls/x.m3u8', ext: 'm3u8' });
  });

  it('skips DRM/geo-locked (protected_delivery) video but still emits its image', () => {
    const [c, ...rest] = extractPinterestMedia(boardFeed([{
      id: '333333333333', type: 'pin', protected_delivery: true, images: imageMap('aa/bb/cc'),
      videos: { video_list: { V_720P: { url: 'https://v1.pinimg.com/videos/720p/x.mp4' } } },
    }]));
    expect(c.kind).toBe('image');
    expect(rest).toHaveLength(0);
  });

  it('flattens a carousel to one entry per slide, sharing the pin id, without the cover duplicate', () => {
    const out = extractPinterestMedia(boardFeed([{
      id: '444444444444', type: 'pin', images: imageMap('cover/xx/xx'),
      carousel_data: { carousel_slots: [{ images: imageMap('slide/01/aa') }, { images: imageMap('slide/02/bb') }] },
    }]));
    expect(out.map((e) => e.url)).toEqual([
      'https://i.pinimg.com/originals/slide/01/aa.jpg',
      'https://i.pinimg.com/originals/slide/02/bb.jpg',
    ]);
    expect(out.every((e) => e.pinId === '444444444444')).toBe(true);
  });

  it('ignores non-pin containers (a board object with a cover) — no type:"pin"', () => {
    expect(extractPinterestMedia(boardFeed([{ id: '555555555555', type: 'board', images: imageMap('board/cv/xx') }]))).toEqual([]);
  });

  it('drops non-pinimg / non-https URLs smuggled through the JSON', () => {
    const out = extractPinterestMedia(boardFeed([{ id: '111111111111', type: 'pin', images: { orig: { url: 'https://evil.example.com/x.jpg' } } }]));
    expect(out).toEqual([]);
  });

  it('never throws on malformed / cyclic input', () => {
    const cyclic: Record<string, unknown> = { id: '111111111111', type: 'pin' }; cyclic.self = cyclic;
    expect(() => extractPinterestMedia(cyclic)).not.toThrow();
    expect(() => extractPinterestMedia(null)).not.toThrow();
    expect(() => extractPinterestMedia('nope')).not.toThrow();
  });
});

describe('pinPinimgUrl', () => {
  it('accepts https pinimg family, rejects everything else', () => {
    expect(pinPinimgUrl('https://i.pinimg.com/originals/a.jpg')).toBe('https://i.pinimg.com/originals/a.jpg');
    expect(pinPinimgUrl('https://v1.pinimg.com/videos/x.mp4')).toBe('https://v1.pinimg.com/videos/x.mp4');
    expect(pinPinimgUrl('http://i.pinimg.com/a.jpg')).toBeNull();
    expect(pinPinimgUrl('https://evil.com/a.jpg')).toBeNull();
    expect(pinPinimgUrl(42)).toBeNull();
  });
});

describe('pinIdFromUrl', () => {
  it('extracts the trailing digits from a /pin/ url or slug', () => {
    expect(pinIdFromUrl('https://www.pinterest.com/pin/698058011039781102/')).toBe('698058011039781102');
    expect(pinIdFromUrl('/pin/some-slug--698058011039781102/')).toBe('698058011039781102');
    expect(pinIdFromUrl('https://www.pinterest.com/user/')).toBeNull();
  });
});
