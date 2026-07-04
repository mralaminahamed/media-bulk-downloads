# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public GitHub issue.

Email **mrabir.ahamed@gmail.com** with:

- a description of the issue and its impact,
- steps to reproduce (or a proof of concept),
- the affected version.

You'll get an acknowledgement within a few days. Once the issue is confirmed and
fixed, a new version is published and the fix is noted in the changelog.

## Supported versions

The latest published version receives security fixes. Because this is a browser
extension distributed through the Chrome Web Store, Microsoft Edge Add-ons, and
Firefox Add-ons (AMO), users are auto-updated to the newest version.

## Scope

This extension runs entirely in the browser, stores data only on the user's
device, and makes no network calls by default. The most relevant areas for review
are: the content script's DOM reading, the background download handling, and the
opt-in "resolve originals" network requests to media CDNs.
