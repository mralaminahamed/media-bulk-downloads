import { defineBackground } from 'wxt/utils/define-background';
// The background module registers all its listeners at import (top level), which
// MV3 requires so the service worker wakes on events. Keep it as a side-effect
// import here; main() stays empty.
import '@/extension/background';

export default defineBackground(() => {});
