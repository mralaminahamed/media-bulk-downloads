# End-to-end tests (Playwright)

Real-browser e2e for the on-page **bubble**: Playwright loads the *built* MV3
extension into a persistent Chromium, seeds settings to mount the bubble, and
drives the actual UI against a local fixture page. This is what caught the
shadow-DOM outside-click bug the jsdom unit tests could not see.

## Run

```bash
yarn test:e2e          # builds the extension, then runs headless
yarn test:e2e:headed   # same, with a visible browser
```

`test:e2e` runs `wxt build` first (the specs load `.output/chrome-mv3`). Chromium
is installed once with `yarn playwright install chromium`.

## Layout

```
tests/e2e/
  fixtures/
    extension.ts   # Playwright fixture: loads the extension, exposes context +
                   # extensionId; serviceWorker() waits for the background SW
  helpers/
    bubble.ts      # openBubblePage() (seeds bubbleEnabled + opens the launcher),
                   # openPanel(), itemCount()
  pages/
    media.html     # static fixture page with sample media (data: SVGs, two
                   # fbcdn variants that collapse to one item, a distinct host)
  server/
    serve.mjs      # zero-dependency static server for pages/, run by webServer
  specs/
    exclude.spec.ts       # exclude by URL + host, Excluded panel, Clear all
    download.spec.ts      # download an item -> Download History records it
    favourites.spec.ts    # add a favourite -> Favourites panel lists it
    deep-scan.spec.ts     # deep scan runs without dropping the grid
```

Config: `playwright.config.ts` (repo root) — `testDir: tests/e2e`, one worker
(the extension needs a persistent context), and the `webServer` that serves
`pages/`.

## Notes

- The bubble lives in an open **shadow root**; Playwright's role/CSS locators
  pierce it automatically (`getByRole('button', { name: 'Media Bulk Downloads' })`).
- The bubble is off by default; `openBubblePage` seeds
  `chrome.storage.sync` (`bubbleEnabled: true`) through the service worker before
  navigating, so the content script mounts it.
- Extensions load headless via the `chromium` channel (Playwright's
  chrome-extensions guide).
