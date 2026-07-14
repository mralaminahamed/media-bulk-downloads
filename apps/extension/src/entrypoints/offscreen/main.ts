import { installOffscreenCaptureHost } from '@/extension/offscreen';

// The offscreen document is a plain extension page; wire up the capture host on load.
installOffscreenCaptureHost();
