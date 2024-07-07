import React from 'react';
import { ImageInfo } from '../../types';
import styles from './ImageList.module.scss';

interface ImageListProps {
  images: ImageInfo[];
}

const ImageList: React.FC<ImageListProps> = ({ images }) => {
  return (
    <div className={styles.imageList}>
      {images.map((image, index) => (
        <div key={index} className={styles.imageItem}>
          <img src={image.src} alt={image.alt} className={styles.thumbnail} />
          <div className={styles.imageInfo}>
            <p>Size: {image.width}x{image.height}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ImageList;
