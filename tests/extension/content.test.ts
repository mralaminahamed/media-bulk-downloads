import  {isBase64Image,getBase64ImageType,getBase64ImageSize,getImageDimensions,getImageType,getFileSize,parseSrcset,collectImages} from './../../src/extension/content';

describe('Content Script', () => {
    beforeEach(() => {
      // Mock DOM
      document.body.innerHTML = `
        <img src="test1.jpg" alt="Test 1" width="100" height="100">
        <img src="test2.png" alt="Test 2" width="200" height="200" srcset="test2-small.png 300w, test2-large.png 1000w">
        <picture>
          <source srcset="test3-wide.webp 1000w, test3-narrow.webp 500w" type="image/webp">
          <img src="test3.jpg" alt="Test 3" width="300" height="300">
        </picture>
        <div style="background-image: url('test4.gif');"></div>
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==" alt="Base64 Image">
      `;
  
      // Mock fetch for file size
      global.fetch = jest.fn().mockImplementation(() => 
        Promise.resolve({
          headers: {
            get: jest.fn().mockReturnValue('1000'), // mock file size of 1000 bytes
          },
        })
      );
  
      // Mock chrome API
      global.chrome = {
        runtime: {
          onMessage: {
            addListener: jest.fn(),
          },
        },
      } as any;
    });
  
    describe('isBase64Image', () => {
      it('correctly identifies base64 images', () => {
        expect(isBase64Image('data:image/png;base64,abc123')).toBe(true);
        expect(isBase64Image('https://example.com/image.png')).toBe(false);
      });
    });
  
    describe('getBase64ImageType', () => {
      it('extracts correct image type from base64 string', () => {
        expect(getBase64ImageType('data:image/png;base64,abc123')).toBe('png');
        expect(getBase64ImageType('data:image/jpeg;base64,abc123')).toBe('jpeg');
        expect(getBase64ImageType('invalid string')).toBe('unknown');
      });
    });
  
    describe('getBase64ImageSize', () => {
      it('calculates correct size for base64 image', () => {
        expect(getBase64ImageSize('data:image/png;base64,YWJjZGVmZ2g=')).toBe(9);
      });
    });
  
    describe('getImageDimensions', () => {
      it('returns correct dimensions for an image', () => {
        const img = document.querySelector('img') as HTMLImageElement;
        expect(getImageDimensions(img)).toEqual({ width: 100, height: 100 });
      });
    });
  
    describe('getImageType', () => {
      it('determines correct image type from URL', () => {
        expect(getImageType('image.jpg')).toBe('jpeg');
        expect(getImageType('icon.png')).toBe('png');
        expect(getImageType('animation.gif')).toBe('gif');
        expect(getImageType('vector.svg')).toBe('svg');
        expect(getImageType('image.webp')).toBe('webp');
        expect(getImageType('file.txt')).toBe('unknown');
      });
    });
  
    describe('getFileSize', () => {
      it('fetches correct file size', async () => {
        const size = await getFileSize('https://example.com/image.jpg');
        expect(size).toBe(1000);
      });
    });
  
    describe('parseSrcset', () => {
      it('correctly parses srcset string', () => {
        const srcset = 'image-1x.png 1x, image-2x.png 2x, image-3x.png 3x';
        expect(parseSrcset(srcset)).toEqual(['image-1x.png', 'image-2x.png', 'image-3x.png']);
      });
    });
  
    describe('collectImages', () => {
      it('collects all images including srcset and background images', async () => {
        const images = await collectImages();
        
        expect(images).toHaveLength(9); // 5 unique images + 2 from srcset + 1 base64 + 1 background image
        
        expect(images).toEqual([
            { src: 'test1.jpg', alt: 'Test 1', width: 100, height: 100, type: 'jpeg', fileSize: 1000, isBase64: false },
            { src: 'test2.png', alt: 'Test 2', width: 200, height: 200, type: 'png', fileSize: 1000, isBase64: false },
            { src: 'test2-small.png', alt: 'Test 2', type: 'png', fileSize: 1000, isBase64: false },
            { src: 'test2-large.png', alt: 'Test 2', type: 'png', fileSize: 1000, isBase64: false },
            { src: 'test3.jpg', alt: 'Test 3', width: 300, height: 300, type: 'jpeg', fileSize: 1000,isBase64: false },
            { src: 'test3-wide.webp', type: 'webp', fileSize: 1000, isBase64: false },
            { src: 'test3-narrow.webp', type: 'webp', fileSize: 1000, isBase64: false },
            { src: 'test4.gif', type: 'gif', fileSize: 1000, isBase64: false },
            { alt: 'Base64 Image', type: 'png', isBase64: true }
          ]);
      });
  
      it('does not collect duplicate images', async () => {
        document.body.innerHTML += `<img src="test1.jpg" alt="Duplicate Test 1">`;
        const images = await collectImages();
        const test1Images = images.filter(img => img.src === 'test1.jpg');
        expect(test1Images).toHaveLength(1);
      });
    });
  
    describe('Message Handling', () => {
      it('responds with collected images when GET_IMAGES message is received', async () => {
        const sendResponse = jest.fn();
        const messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
        
        await messageListener('GET_IMAGES', {}, sendResponse);
        
        expect(sendResponse).toHaveBeenCalledWith(expect.arrayContaining([
          expect.objectContaining({ src: 'test1.jpg' }),
          expect.objectContaining({ src: 'test2.png' }),
          expect.objectContaining({ src: 'test2-small.png' }),
          expect.objectContaining({ src: 'test2-large.png' }),
          expect.objectContaining({ src: 'test3.jpg' }),
          expect.objectContaining({ src: 'test3-wide.webp' }),
          expect.objectContaining({ src: 'test3-narrow.webp' }),
          expect.objectContaining({ src: 'test4.gif' })
        ]));
      });
  
      it('does not respond to unknown message types', async () => {
        const sendResponse = jest.fn();
        const messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
        
        await messageListener('UNKNOWN_MESSAGE', {}, sendResponse);
        
        expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles fetch errors gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      const images = await collectImages();
      const failedImage = images.find(img => img.src === 'test1.jpg');
      
      expect(failedImage).toBeDefined();
      expect(failedImage?.fileSize).toBe(0);
    });

    it('handles invalid base64 data gracefully', async () => {
      document.body.innerHTML += `<img src="data:image/png;base64,invalid" alt="Invalid Base64">`;
      
      const images = await collectImages();
      const invalidBase64Image = images.find(img => img.alt === 'Invalid Base64');
      
      expect(invalidBase64Image).toBeDefined();
      expect(invalidBase64Image?.fileSize).toBe(0);
      expect(invalidBase64Image?.type).toBe('png');
    });
  });

  describe('Performance', () => {
    it('handles a large number of images efficiently', async () => {
      // Add 1000 image elements to the DOM
      for (let i = 0; i < 1000; i++) {
        document.body.innerHTML += `<img src="test${i}.jpg" alt="Test ${i}">`;
      }

      const startTime = performance.now();
      const images = await collectImages();
      const endTime = performance.now();

      expect(images.length).toBeGreaterThan(1000);
      expect(endTime - startTime).toBeLessThan(5000); // Assuming it should take less than 5 seconds
    });
  });

  describe('Accessibility', () => {
    it('correctly captures alt text for images', async () => {
      const images = await collectImages();
      const imageWithAlt = images.find(img => img.src === 'test1.jpg');
      expect(imageWithAlt?.alt).toBe('Test 1');
    });

    it('handles images without alt text', async () => {
      document.body.innerHTML += `<img src="no-alt.jpg">`;
      const images = await collectImages();
      const imageWithoutAlt = images.find(img => img.src === 'no-alt.jpg');
      expect(imageWithoutAlt?.alt).toBe('');
    });
  });

  describe('CSS Background Images', () => {
    it('correctly captures CSS background images', async () => {
      const images = await collectImages();
      const backgroundImage = images.find(img => img.src === 'test4.gif');
      expect(backgroundImage).toBeDefined();
      expect(backgroundImage?.type).toBe('gif');
    });

    it('handles multiple background images', async () => {
      document.body.innerHTML += `
        <div style="background-image: url('bg1.png'), url('bg2.png');">
      `;
      const images = await collectImages();
      const bg1 = images.find(img => img.src === 'bg1.png');
      const bg2 = images.find(img => img.src === 'bg2.png');
      expect(bg1).toBeDefined();
      expect(bg2).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('handles images with query parameters in URL', async () => {
      document.body.innerHTML += `<img src="image.jpg?width=100&height=100" alt="Image with query params">`;
      const images = await collectImages();
      const imageWithParams = images.find(img => img.src.includes('image.jpg?width=100'));
      expect(imageWithParams).toBeDefined();
      expect(imageWithParams?.type).toBe('jpeg');
    });

    it('handles data URIs for non-image types', async () => {
      document.body.innerHTML += `<img src="data:text/plain;base64,SGVsbG8gV29ybGQ=" alt="Non-image data URI">`;
      const images = await collectImages();
      const nonImageDataUri = images.find(img => img.alt === 'Non-image data URI');
      expect(nonImageDataUri).toBeDefined();
      expect(nonImageDataUri?.type).toBe('unknown');
    });
  });
});
