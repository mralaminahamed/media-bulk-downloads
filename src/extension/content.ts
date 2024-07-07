import { ImageInfo } from '@/types';

function isBase64Image(src: string): boolean {
  return src.startsWith('data:image/');
}

function getBase64ImageType(src: string): string {
  const match = src.match(/^data:image\/(\w+);base64,/);
  return match ? match[1] : 'unknown';
}

function getBase64ImageSize(src: string): number {
  const base64 = src.split(',')[1];
  return base64 ? Math.ceil((base64.length * 3) / 4) : 0;
}

async function getImageInfo(url: string): Promise<{ size: number; type: string; isBase64: boolean }> {
  if (isBase64Image(url)) {
    return {
      size: getBase64ImageSize(url),
      type: getBase64ImageType(url),
      isBase64: true
    };
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('HEAD', url, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          const size = parseInt(xhr.getResponseHeader('Content-Length') || '0');
          const contentType = xhr.getResponseHeader('Content-Type') || '';
          const type = contentType.split('/')[1] || getTypeFromUrl(url);
          resolve({ size, type, isBase64: false });
        } else {
          reject(new Error('Failed to get image info'));
        }
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send();
  });
}

function getTypeFromUrl(url: string): string {
  const extension = url.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg';
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
      return extension;
    default:
      return 'unknown';
  }
}

async function getAllImages(): Promise<Awaited<ImageInfo[]>> {
  const images = Array.from(document.images);
  const svgs = Array.from(document.querySelectorAll('svg'));

  const imagePromises = images.map(async (img) => {
    try {
      const info = await getImageInfo(img.src);
      return {
        src: img.src,
        alt: img.alt,
        width: img.width,
        height: img.height,
        fileSize: info.size,
        type: info.type,
        isBase64: info.isBase64
      };
    } catch (error) {
      console.error(`Failed to get info for image ${img.src}:`, error);
      return null;
    }
  });

  const svgPromises = svgs.map(async (svg) => {
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], {type: 'image/svg+xml'});
    return {
      src: URL.createObjectURL(blob),
      alt: svg.getAttribute('aria-label') || 'SVG Image',
      width: svg.clientWidth,
      height: svg.clientHeight,
      fileSize: blob.size,
      type: 'svg',
      isBase64: false
    };
  });

  const results = await Promise.all([...imagePromises, ...svgPromises]);
  return results.filter((img): img is ImageInfo => img !== null);
}

chrome.runtime.onMessage.addListener((
    message: string,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ImageInfo[]) => void
) => {
  if (message === 'GET_IMAGES') {
    getAllImages().then(sendResponse);
    return true; // Indicates that the response is sent asynchronously
  }
});
