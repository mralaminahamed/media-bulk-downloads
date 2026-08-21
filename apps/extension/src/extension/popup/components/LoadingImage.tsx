import React, { useState } from 'react';
import { LoadingImageProps } from '@mbd/core/types';

/**
 * Image with a shimmer skeleton underneath until it decodes. If `src` fails to
 * load it falls back to `fallbackSrc` once (a smaller/on-page variant that may
 * render when a signed original won't in the extension popup); if that fails too
 * it clears the skeleton and calls `onFailed` so the caller can show a graceful
 * placeholder instead of a broken box. Callers key this by src so navigating to a
 * new image remounts and resets the loading state.
 */
export const LoadingImage: React.FC<LoadingImageProps> = ({ src, alt, className, style, lazy, fallbackSrc, onFailed }) => {
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState(src);

  const handleError = (): void => {
    if (fallbackSrc && current !== fallbackSrc) {
      setCurrent(fallbackSrc);
      return;
    }
    setLoaded(true);
    onFailed?.();
  };

  return (
    <>
      {!loaded && <span className="skeleton mbd:absolute mbd:inset-0" aria-hidden="true" />}
      <img
        src={current}
        alt={alt}
        loading={lazy ? 'lazy' : undefined}
        onLoad={() => setLoaded(true)}
        onError={handleError}
        className={`${className} mbd:transition-opacity mbd:duration-200 ${loaded ? 'mbd:opacity-100' : 'mbd:opacity-0'}`}
        style={style}
      />
    </>
  );
};
