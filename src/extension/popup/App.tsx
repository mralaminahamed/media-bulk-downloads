import React, { useCallback, useEffect, useRef, useState } from 'react';
import ImageList from './components/ImageList';
import Settings from './components/Settings';
import FilterToolbar from './components/FilterToolbar';
import { AppState, DownloadMessage, DownloadResponse, FilterOptions, ImageInfo, SettingsData } from '@/types';
import { filterImagesBySettings } from '../shared/filters';
import { getImageFileSize, mapWithConcurrency } from './utils';
import { Cog6ToothIcon, ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const DEFAULT_SETTINGS: SettingsData = {
  downloadPath: '',
  fileNamePrefix: 'image_',
  popupWidth: 400,
  popupHeight: 600,
  showImageCount: true,
  minimumImageSize: 0,
  excludeBase64Images: false,
};

// Concurrent HEAD requests when enriching remote image sizes.
const SIZE_FETCH_CONCURRENCY = 6;

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    status: '',
    images: [],
    filteredImages: [],
    isLoading: true,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);

  // All images collected from the page, before any settings/toolbar filtering.
  const rawImagesRef = useRef<ImageInfo[]>([]);
  // Generation guard so a newer refresh cancels stale size-enrichment writes.
  const enrichGenRef = useRef(0);

  useEffect(() => {
    loadSettings();
    void fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.style.width = `${settings.popupWidth}px`;
    document.body.style.height = `${settings.popupHeight}px`;
  }, [settings.popupWidth, settings.popupHeight]);

  const loadSettings = () => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...result.settings });
      }
    });
  };

  /**
   * Lazily fills in remote image byte sizes. Runs only from the popup on the
   * active tab (user-initiated), never from the background badge path.
   */
  const enrichImageSizes = useCallback(async (images: ImageInfo[]): Promise<void> => {
    const generation = ++enrichGenRef.current;
    const targets = images.filter((img) => !img.isBase64 && img.fileSize <= 0);

    await mapWithConcurrency(targets, SIZE_FETCH_CONCURRENCY, async (img) => {
      const size = await getImageFileSize(img.src);
      // A newer refresh started, or nothing useful came back — drop this write.
      if (generation !== enrichGenRef.current || size <= 0) return;

      const apply = (list: ImageInfo[]) =>
        list.map((i) => (i.src === img.src ? { ...i, fileSize: size } : i));

      setState((prev) => ({
        ...prev,
        images: apply(prev.images),
        filteredImages: apply(prev.filteredImages),
      }));
    });
  }, []);

  const fetchImages = useCallback(async (): Promise<void> => {
    enrichGenRef.current++; // cancel any in-flight enrichment
    setState((prev) => ({ ...prev, isLoading: true, status: 'Getting images...' }));

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        setState((prev) => ({ ...prev, status: 'No active tab found.', isLoading: false }));
        return;
      }

      chrome.tabs.sendMessage(tab.id, 'GET_IMAGES', (imageList: ImageInfo[]) => {
        if (chrome.runtime.lastError) {
          setState((prev) => ({
            ...prev,
            status: `Error: ${chrome.runtime.lastError?.message || 'Unknown error occurred'}`,
            isLoading: false,
          }));
          return;
        }

        const raw = Array.isArray(imageList) ? imageList : [];
        rawImagesRef.current = raw;
        const eligible = filterImagesBySettings(raw, settings);

        setState((prev) => ({
          ...prev,
          images: eligible,
          filteredImages: eligible,
          status: eligible.length > 0 ? `Found ${eligible.length} images.` : 'No images found!',
          isLoading: false,
        }));

        void enrichImageSizes(eligible);
      });
    } catch {
      setState((prev) => ({
        ...prev,
        status: 'An error occurred while fetching images.',
        isLoading: false,
      }));
    }
  }, [settings, enrichImageSizes]);

  // Re-derive the eligible base list when the settings that affect it change.
  useEffect(() => {
    if (rawImagesRef.current.length === 0) return;
    const eligible = filterImagesBySettings(rawImagesRef.current, settings);
    setState((prev) => ({
      ...prev,
      images: eligible,
      filteredImages: eligible,
      status: `Showing ${eligible.length} of ${rawImagesRef.current.length} images.`,
    }));
    void enrichImageSizes(eligible);
    // Intentionally keyed on the two settings fields that affect eligibility,
    // not the whole `settings` object (avoids re-running on popup size changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.minimumImageSize, settings.excludeBase64Images, enrichImageSizes]);

  const applyFilters = (images: ImageInfo[], filters: FilterOptions): ImageInfo[] => {
    const minBytes = (Number.isFinite(filters.minSize) ? filters.minSize : 0) * 1024;
    return images.filter((img) => {
      if (filters.imageType !== 'all' && img.type !== filters.imageType) {
        return false;
      }
      // Only apply the size floor when the size is actually known (>0).
      if (minBytes > 0 && img.fileSize > 0 && img.fileSize < minBytes) {
        return false;
      }
      return !(!filters.includeBase64 && img.isBase64);
    });
  };

  const handleFilterChange = (filters: FilterOptions) => {
    const filteredImages = applyFilters(state.images, filters);
    setState((prev) => ({
      ...prev,
      filteredImages,
      status: `Showing ${filteredImages.length} of ${state.images.length} images.`,
    }));
  };

  const handleDownload = (images: ImageInfo | ImageInfo[]): void => {
    const imagesToDownload = Array.isArray(images) ? images : [images];
    setState((prev) => ({
      ...prev,
      status: `Initiating download of ${imagesToDownload.length} image(s)...`,
    }));

    const message: DownloadMessage = { type: 'DOWNLOAD_IMAGES', images: imagesToDownload };
    chrome.runtime.sendMessage(message, (response: DownloadResponse) => {
      if (chrome.runtime.lastError) {
        setState((prev) => ({
          ...prev,
          status: `Error: ${chrome.runtime.lastError?.message || 'Unknown error occurred'}`,
        }));
      } else {
        setState((prev) => ({ ...prev, status: response.message }));
      }
    });
  };

  const handleBulkDownload = (): void => {
    const imagesToDownload = state.filteredImages.length > 0 ? state.filteredImages : state.images;
    handleDownload(imagesToDownload);
  };

  const handleSingleImageDownload = (image: ImageInfo): void => {
    handleDownload(image);
  };

  // Single source of truth for persistence: the popup owns writing settings.
  const handleSettingsChange = (newSettings: SettingsData) => {
    setSettings(newSettings);
    chrome.storage.sync.set({ settings: newSettings });
  };

  return (
      <div className="bg-neutral-50 min-h-screen p-4 space-y-4 animate-fade-in">
        <header className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-700">Image Bulk Downloads</h1>
          <button onClick={() => setShowSettings(true)} className="p-2 text-neutral-600 hover:text-primary-600 transition-colors" title="Settings">
            <Cog6ToothIcon className="w-6 h-6" />
          </button>
        </header>

        {state.isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="ml-2 text-neutral-600">Getting images...</p>
            </div>
        ) : state.images.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xl text-neutral-600">No images found!</p>
              <button onClick={fetchImages} className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors">
                Refresh
              </button>
            </div>
        ) : (
            <>
              <FilterToolbar onFilterChange={handleFilterChange} extensionSettings={settings} />

              <div className="bg-white rounded-lg shadow-md p-4 space-y-4 animate-slide-up">
                <div className="flex justify-between items-center">
                  <button
                      onClick={handleBulkDownload}
                      disabled={state.filteredImages.length === 0}
                      className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowDownTrayIcon className="w-5 h-5" />
                    <span>Download Images</span>
                  </button>
                  <button onClick={fetchImages} className="p-2 text-neutral-600 hover:text-primary-600 transition-colors" title="Refresh Images">
                    <ArrowPathIcon className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-sm text-neutral-600 italic">{state.status}</p>

                <ImageList images={state.filteredImages} onImageDownload={handleSingleImageDownload} />
              </div>
            </>
        )}

        {showSettings && (
            <Settings onClose={() => setShowSettings(false)} onSettingsChange={handleSettingsChange} settings={settings}/>
        )}
      </div>
  );
};

export default App;
