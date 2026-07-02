import React, { useState } from 'react';
import { ImageInfo } from '@/types';
import { EyeIcon, ArrowDownTrayIcon, ArrowTopRightOnSquareIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface ImageListProps {
  images: ImageInfo[];
  onImageDownload: (image: ImageInfo) => void;
}

const SIZE_UNITS = ['Bytes', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Formats a byte count for display. Remote images whose size isn't known yet
 * (0) render as "Unknown" rather than a misleading "0 Bytes".
 */
export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown';

  const k = 1024;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), SIZE_UNITS.length - 1);
  const value = bytes / Math.pow(k, exponent);

  return `${parseFloat(value.toFixed(2))} ${SIZE_UNITS[exponent]}`;
};

const ImageList: React.FC<ImageListProps> = ({ images, onImageDownload }) => {
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);

  const handleCloseModal = () => setSelectedImage(null);

  return (
      <div>
        <div className="grid grid-cols-3 gap-4">
          {images.map((image: ImageInfo, index: number) => (
              <div key={`${image.src}-${index}`} className="bg-white border border-neutral-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                <div className="relative aspect-square">
                  <img src={image.src} alt={image.alt} loading="lazy" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100">
                    <button
                        onClick={() => setSelectedImage(image)}
                        title="View Details"
                        aria-label="View Details"
                        className="text-white text-xs bg-primary-600 px-2 py-1 rounded-full hover:bg-primary-700 transition-colors mr-2"
                    >
                      <EyeIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onImageDownload(image)}
                        title="Download Image"
                        aria-label="Download Image"
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
                  <h3 className="text-lg font-semibold text-neutral-800 truncate flex-grow">Image Preview</h3>
                  <a
                      href={selectedImage.src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-700 ml-2"
                      title="Open in new tab"
                  >
                    <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                  </a>
                  <button onClick={handleCloseModal} title="Close" aria-label="Close" className="text-neutral-500 hover:text-neutral-700 ml-2">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4">
                  <img src={selectedImage.src} alt={selectedImage.alt} className="max-w-full max-h-[60vh] object-contain mx-auto" />
                  <div className="mt-4 text-sm text-neutral-600">
                    {selectedImage.alt && <p>Alt: {selectedImage.alt}</p>}
                    <p>Dimensions: {selectedImage.width}x{selectedImage.height}</p>
                    <p>File size: {formatFileSize(selectedImage.fileSize)}</p>
                    <p>Type: {selectedImage.type.toUpperCase()}{selectedImage.isBase64 ? ' (Base64)' : ''}</p>
                    <p className="break-all">Source: {selectedImage.src.slice(0, 100)}{selectedImage.src.length > 100 ? '…' : ''}</p>
                  </div>
                </div>
                <div className="p-4 border-t border-neutral-200 flex justify-end">
                  <button
                      onClick={() => onImageDownload(selectedImage)}
                      title="Download Image"
                      aria-label="Download Image"
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
