import React, { useState, useEffect } from 'react';
import ImageList from './components/ImageList';
import Settings from './components/Settings';
import FilterToolbar from './components/FilterToolbar';
import { ImageInfo, AppState, DownloadMessage, DownloadResponse, SettingsData, FilterOptions } from '@/types';
import { Cog6ToothIcon, ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    status: '',
    images: [],
    filteredImages: [],
    isLoading: true
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<SettingsData>({
    downloadPath: '',
    fileNamePrefix: 'image_',
    popupWidth: 400,
    popupHeight: 600,
    showImageCount: true,
    minimumImageSize: 0,
    excludeBase64Images: false,
  });

  useEffect(() => {
    loadSettings();
    void fetchImages();
  }, []);

  useEffect(() => {
    document.body.style.width = `${settings.popupWidth}px`;
    document.body.style.height = `${settings.popupHeight}px`;
  }, [settings.popupWidth, settings.popupHeight]);

  const loadSettings = () => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        setSettings(result.settings);
      }
    });
  };

  const fetchImages = async (): Promise<void> => {
    setState(prevState => ({ ...prevState, isLoading: true, status: 'Getting images...' }));

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, 'GET_IMAGES', (imageList: ImageInfo[]) => {
          if (chrome.runtime.lastError) {
            setState(prevState => ({
              ...prevState,
              status: `Error: ${chrome.runtime.lastError?.message || 'Unknown error occurred'}`,
              isLoading: false
            }));
          } else if (imageList && imageList.length > 0) {
            setState(prevState => ({
              ...prevState,
              images: imageList,
              filteredImages: imageList,
              status: `Found ${imageList.length} images.`,
              isLoading: false
            }));
          } else {
            setState(prevState => ({
              ...prevState,
              status: 'No images found!',
              isLoading: false
            }));
          }
        });
      }
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        status: 'An error occurred while fetching images.',
        isLoading: false
      }));
    }
  };

  const handleFilterChange = (filters: FilterOptions) => {
    const filteredImages = applyFilters(state.images, filters);
    setState(prevState => ({
      ...prevState,
      filteredImages,
      status: `Showing ${filteredImages.length} of ${state.images.length} images.`
    }));
  };

  const applyFilters = (images: ImageInfo[], filters: FilterOptions): ImageInfo[] => {
    return images.filter(img => {
      if (filters.imageType !== 'all' && img.type !== filters.imageType) {
        return false;
      }
      if (img.fileSize < filters.minSize * 1024) { // Convert KB to bytes
        return false;
      }

      return !(!filters.includeBase64 && img.isBase64);
    });
  };

  const handleDownload = (images: ImageInfo | ImageInfo[]): void => {
    const imagesToDownload = Array.isArray(images) ? images : [images];
    setState(prevState => ({ ...prevState, status: `Initiating download of ${imagesToDownload.length} image(s)...` }));

    const message: DownloadMessage = { type: 'DOWNLOAD_IMAGES', images: imagesToDownload };
    chrome.runtime.sendMessage(message, (response: DownloadResponse) => {
      if (chrome.runtime.lastError) {
        setState(prevState => ({
          ...prevState,
          status: `Error: ${chrome.runtime.lastError?.message || 'Unknown error occurred'}`
        }));
      } else {
        setState(prevState => ({ ...prevState, status: response.message }));
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

  const handleSettingsChange = (newSettings: SettingsData) => {
    setSettings(newSettings);
    chrome.storage.sync.set({ settings: newSettings }, () => {
      // console.log('Settings saved');
    });
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
