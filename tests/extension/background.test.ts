import { Sign } from 'crypto';
import { filterImages, updateTabBadge, loadSettings } from './../../src/extension/background';
import { ImageInfo, SettingsData } from './../../src/types';


describe('Background Script', () => {
    let mockChrome: any;
  
    beforeEach(() => {
      mockChrome = {
        storage: {
          sync: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
        tabs: {
          query: jest.fn(),
          sendMessage: jest.fn(),
        },
        action: {
          setBadgeText: jest.fn(),
          setBadgeBackgroundColor: jest.fn(),
        },
        runtime: {
          lastError: null,
        },
      };
  
      global.chrome = mockChrome;
    });
  
    describe('filterImages', () => {
      it('filters images based on minimum size', () => {
        const images: ImageInfo[] = [
          { src: 'image1.jpg', width: 100, height: 100, alt: 'image1', type: 'jpeg', fileSize: 1000, isBase64: false },
          { src: 'image2.jpg', width: 50, height: 50, alt: 'image2', type: 'jpeg', fileSize: 500, isBase64: false },
        ];
  
        const result = filterImages(images);
        expect(result).toHaveLength(2);
  
        // Set minimum size to 75
        (global as any).currentSettings = { minimumImageSize: 75, excludeBase64Images: false };
        const filteredResult = filterImages(images);
        expect(filteredResult).toHaveLength(1);
        expect(filteredResult[0].src).toBe('image1.jpg');
      });
  
      it('excludes base64 images when setting is enabled', () => {
        const images: ImageInfo[] = [
          { src: 'image1.jpg', width: 100, height: 100, alt: 'image1', type: 'jpeg', fileSize: 1000, isBase64: false },
          { src: 'data:image/png;base64,abc123', width: 100, alt: 'abc123', height: 100, type: 'png', fileSize: 500, isBase64: true },
        ];
  
        (global as any).currentSettings = { minimumImageSize: 0, excludeBase64Images: true };
        const result = filterImages(images);
        expect(result).toHaveLength(1);
        expect(result[0].src).toBe('image1.jpg');
      });
    });
  
    describe('updateTabBadge', () => {
      it('updates badge with image count', () => {
        const tabId = 1;
        const images: ImageInfo[] = [
          { src: 'image1.jpg', width: 100, height: 100, alt: 'image1', type: 'jpeg', fileSize: 1000, isBase64: false },
          { src: 'image2.jpg', width: 100, height: 100, alt: 'image2', type: 'jpeg', fileSize: 1000, isBase64: false },
        ];
  
        mockChrome.tabs.sendMessage.mockImplementation((id: string, message: string, callback : any ) => {
          callback(images);
        });
  
        updateTabBadge(tabId);
  
        expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId });
        expect(mockChrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4F46E5', tabId });
      });
  
      it('handles errors gracefully', () => {
        const tabId = 1;
        mockChrome.runtime.lastError = { message: 'Error' };
  
        updateTabBadge(tabId);
  
        expect(mockChrome.action.setBadgeText).not.toHaveBeenCalled();
        expect(mockChrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  
        mockChrome.runtime.lastError = null;
      });
    });
  
    describe('loadSettings', () => {
      it('loads settings from storage', () => {
        const mockSettings: SettingsData = {
          downloadPath: 'downloads',
          fileNamePrefix: 'img_',
          popupWidth: 500,
          popupHeight: 700,
          showImageCount: true,
          minimumImageSize: 50,
          excludeBase64Images: true,
        };
  
        mockChrome.storage.sync.get.mockImplementation((keys, callback) => {
          callback({ settings: mockSettings });
        });
  
        loadSettings();
  
        expect(mockChrome.storage.sync.get).toHaveBeenCalledWith(['settings'], expect.any(Function));
        expect((global as any).currentSettings).toEqual(mockSettings);
      });
    });
  });
  