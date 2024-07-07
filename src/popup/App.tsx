import React, { useState, useEffect } from 'react';
import ImageList from './components/ImageList';
import Settings from './components/Settings';
import { ImageInfo, AppState, DownloadMessage, DownloadResponse, SettingsData } from '@/types';
import { Cog6ToothIcon, ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    status: '',
    images: [],
    isLoading: false
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
    setState(prevState => ({ ...prevState, isLoading: true, status: 'Collecting images...' }));

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
            const filteredImages = filterImages(imageList);
            setState(prevState => ({
              ...prevState,
              images: filteredImages,
              status: `Found ${filteredImages.length} images.`,
              isLoading: false
            }));
          } else {
            setState(prevState => ({
              ...prevState,
              status: 'No images found on this page.',
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

  const filterImages = (images: ImageInfo[]): ImageInfo[] => {
    return images.filter(img =>
        (img.width >= settings.minimumImageSize && img.height >= settings.minimumImageSize) &&
        (!settings.excludeBase64Images || !img.src.startsWith('data:'))
    );
  };

  const handleDownload = (): void => {
    setState(prevState => ({ ...prevState, status: 'Initiating download...' }));
    const message: DownloadMessage = { type: 'DOWNLOAD_IMAGES', images: state.images };
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

  /**
   * Handle settings change
   *
   * @param newSettings
   */
  const handleSettingsChange = (newSettings: SettingsData) => {
    setSettings(newSettings);
    void fetchImages();
  };

  return (
      <div className="bg-neutral-50 min-h-screen p-4 space-y-4 animate-fade-in">
        <header className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-700">Image Bulk Downloads</h1>
          <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-neutral-600 hover:text-primary-600 transition-colors"
              title="Settings"
          >
            <Cog6ToothIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="bg-white rounded-lg shadow-md p-4 space-y-4 animate-slide-up">
          <div className="flex justify-between items-center">
            <button
                onClick={handleDownload}
                disabled={state.isLoading || state.images.length === 0}
                className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              <span>Download Images</span>
            </button>
            <button
                onClick={fetchImages}
                className="p-2 text-neutral-600 hover:text-primary-600 transition-colors"
                title="Refresh Images"
            >
              <ArrowPathIcon className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-neutral-600 italic">{state.status}</p>

          {state.isLoading ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
          ) : (
              <ImageList images={state.images} />
          )}
        </div>

        {showSettings && (
            <Settings
                onClose={() => setShowSettings(false)}
                onSettingsChange={handleSettingsChange}
                settings={settings}
            />
        )}
      </div>
  );
};

export default App;
