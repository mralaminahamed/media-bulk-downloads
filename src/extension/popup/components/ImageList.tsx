import React, { useState } from 'react';
import { ImageInfo } from '@/types';
import { EyeIcon, ArrowDownTrayIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

interface ImageListProps {
  images: ImageInfo[];
  onImageDownload: (image: ImageInfo) => void;
}

const ImageList: React.FC<ImageListProps> = ({ images, onImageDownload }) => {
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);

  const handleImageClick = (image: ImageInfo) => {
    setSelectedImage(image);
  };

  const handleCloseModal = () => {
    setSelectedImage(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k : number = 1024;
    const sizes : string[] = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i : number = Math.floor(Math.log(bytes) / Math.log(k));

    const imageSize = parseFloat((bytes / Math.pow(k, i)).toFixed(2));

    if ( Number.isNaN(imageSize) ) return '0 Bytes';
    if (imageSize < 0.01) return '0 Bytes';
    if (imageSize < 0.1) return '0.01 KB';

    return imageSize + ' ' + sizes[i] || '';
  };

  return (
      <div>
        <div className="grid grid-cols-3 gap-4">
          {images.map((image: ImageInfo, index : number) => (
              <div key={index} className="bg-white border border-neutral-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                <div className="relative aspect-square">
                  <img src={image.src} alt={image.alt} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100">
                    <button
                        onClick={() => handleImageClick(image)}
                        className="text-white text-xs bg-primary-600 px-2 py-1 rounded-full hover:bg-primary-700 transition-colors mr-2"
                    >
                      <EyeIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onImageDownload(image)}
                        className="text-white text-xs bg-secondary-600 px-2 py-1 rounded-full hover:bg-secondary-700 transition-colors"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-2 text-xs">
                  <p className="truncate text-neutral-600">{image.alt || 'No alt text'}</p>
                  <p className="text-neutral-500">
                    {image.width}x{image.height} - {formatFileSize(image.fileSize)} - {image.type.toUpperCase()}
                    {image.isBase64 && ' (Base64)'}
                  </p>
                </div>
              </div>
          ))}
        </div>

        {selectedImage && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in" onClick={handleCloseModal}>
              <div className="bg-white rounded-lg shadow-xl max-w-3xl max-h-[90vh] overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-neutral-200 flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-neutral-800 truncate flex-grow">{selectedImage.alt || 'Image Preview'}</h3>
                  <a
                      href={selectedImage.src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-700 ml-2"
                      title="Open in new tab"
                  >
                    <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                  </a>
                  <button onClick={handleCloseModal} className="text-neutral-500 hover:text-neutral-700 ml-2">
                    <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>
                <div className="p-4">
                  <img src={selectedImage.src} alt={selectedImage.alt} className="max-w-full max-h-[60vh] object-contain mx-auto" />
                  <div className="mt-4 text-sm text-neutral-600">
                    <p>Dimensions: {selectedImage.width}x{selectedImage.height}</p>
                    <p>File size: {formatFileSize(selectedImage.fileSize)}</p>
                    <p>Type: {selectedImage.type.toUpperCase()}{selectedImage.isBase64 ? ' (Base64)' : ''}</p>
                    <p>Source: {selectedImage.src.substring(0, 100)}...</p>
                  </div>
                </div>
                <div className="p-4 border-t border-neutral-200 flex justify-end">
                  <button
                      onClick={() => onImageDownload(selectedImage)}
                      className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                  >
                    <ArrowDownTrayIcon className="w-5 h-5" />
                    <span>Download Image</span>
                  </button>
                </div>
              </div>
            </div>
        )}
      </div>
  );
};

export default ImageList;
