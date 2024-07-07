import React, { useState, useEffect } from 'react';
import ImageList from './components/ImageList';
import { ImageInfo, AppState, DownloadMessage, DownloadResponse } from '../types';
import styles from './App.module.scss';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    status: '',
    images: [],
    isLoading: false
  });

  useEffect(() => {
    fetchImages();
  }, []);

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
            setState(prevState => ({
              ...prevState,
              images: imageList,
              status: `Found ${imageList.length} images.`,
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

  return (
      <div className={styles.app}>
        <h1>Image Bulk Downloads</h1>
        <p>Click the button to download all images from the current page.</p>
        <button onClick={handleDownload} disabled={state.isLoading || state.images.length === 0}>
          Download Images
        </button>
        <p className={styles.status}>{state.status}</p>
        {state.isLoading ? (
            <p>Loading...</p>
        ) : (
            <ImageList images={state.images} />
        )}
      </div>
  );
};

export default App;
