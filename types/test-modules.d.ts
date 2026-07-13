// Ambient declarations for the workspace package test suites.

// Vite `?raw` imports (used by @mbd/core tests to load HTML / m3u8 fixtures as
// strings without a filesystem read).
declare module '*?raw' {
  const content: string;
  export default content;
}
