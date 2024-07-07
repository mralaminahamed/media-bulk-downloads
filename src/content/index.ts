import { ImageInfo, GetImagesMessage } from '../types';

function getAllImages(): ImageInfo[] {
  const images = Array.from(document.images);
  const svgs = Array.from(document.querySelectorAll('svg'));
  
  const imageInfos: ImageInfo[] = images.map(img => ({
    src: img.src,
    alt: img.alt,
    width: img.width,
    height: img.height
  }));

  const svgInfos: ImageInfo[] = svgs.map(svg => {
    const svgData = new XMLSerializer().serializeToString(svg);
    return {
      src: 'data:image/svg+xml;base64,' + btoa(svgData),
      alt: svg.getAttribute('aria-label') || 'SVG Image',
      width: svg.clientWidth,
      height: svg.clientHeight
    };
  });

  return [...imageInfos, ...svgInfos];
}

chrome.runtime.onMessage.addListener((
  message: GetImagesMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ImageInfo[]) => void
) => {
  if (message === 'GET_IMAGES') {
    sendResponse(getAllImages());
  }
});

export {}
