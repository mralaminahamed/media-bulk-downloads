/**
 * build-firefox.ts
 *
 * Post-build adapter: copies the Chrome `dist/` output to `dist-firefox/` and
 * patches manifest.json for Firefox Manifest V3 compatibility.
 *
 * Run after `yarn build`:
 *   node scripts/build-firefox.ts
 */

import { cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'dist');
const DEST = resolve(ROOT, 'dist-firefox');
const MANIFEST_PATH = resolve(DEST, 'manifest.json');

const GEOCKE_ID = 'media-bulk-downloads@mralaminahamed';

// ── 1. Clean & copy ─────────────────────────────────────────────────────────
if (existsSync(DEST)) {
  rmSync(DEST, { recursive: true });
}
cpSync(SRC, DEST, { recursive: true });
console.log(`Copied dist/ → dist-firefox/`);

// ── 2. Patch manifest.json ──────────────────────────────────────────────────
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

// Firefox MV3 uses background.scripts, not service_worker.
if (manifest.background?.service_worker) {
  const sw = manifest.background.service_worker;
  manifest.background = { scripts: [sw] };
}

// Firefox does not support use_dynamic_url in web_accessible_resources.
if (Array.isArray(manifest.web_accessible_resources)) {
  for (const entry of manifest.web_accessible_resources) {
    delete entry.use_dynamic_url;
  }
}

// Firefox requires browser_specific_settings for self-distributed add-ons.
manifest.browser_specific_settings = {
  gecko: {
    id: GEOCKE_ID,
    strict_min_version: '109.0',
  },
};

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Patched manifest.json for Firefox`);
console.log(`  - background.service_worker → background.scripts`);
console.log(`  - removed use_dynamic_url`);
console.log(`  - added browser_specific_settings.gecko`);
console.log(`Done. Load dist-firefox/ in about:debugging to test.`);
