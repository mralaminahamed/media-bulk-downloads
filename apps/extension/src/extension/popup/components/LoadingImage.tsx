import React, { useState } from 'react';
import { LoadingImageProps } from '@mbd/core/types';

/**
 * Image with a shimmer skeleton underneath until it decodes. `onError` also
 * clears the skeleton so a broken image doesn't shimmer forever. Callers key
 * this by src so navigating to a new image resets the loading state.
 */
export const LoadingImage: React.FC<LoadingImageProps> = ({ src, alt, className, style, lazy }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <span className="skeleton mbd:absolute mbd:inset-0" aria-hidden="true" />}
      <img
        src={src}
        alt={alt}
        loading={lazy ? 'lazy' : undefined}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`${className} mbd:transition-opacity mbd:duration-200 ${loaded ? 'mbd:opacity-100' : 'mbd:opacity-0'}`}
        style={style}
      />
    </>
  );
};
