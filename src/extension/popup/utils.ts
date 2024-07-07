/**
 * Determines whether the current page is the extension popup or a regular tab.
 * @returns A promise that resolves to true if it's the popup, false otherwise.
 */
export async function isExtensionPopup(): Promise<boolean> {
    // If chrome.action is not available, we're not in an extension context
    if (!chrome.action) {
        return false;
    }

    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            // If there's no active tab, we're in the popup
            if (!tabs.length) {
                resolve(true);
                return;
            }

            // Check if the current window is the popup
            chrome.windows.getCurrent((window) => {
                resolve(window.type === 'popup');
            });
        });
    });
}

/**
 * Determines the current context of the script execution.
 * @returns A string indicating the context: 'popup', 'options', 'content-script', or 'other'.
 */
export function getExtensionContext(): string {
    if (chrome.extension) {
        const url = window.location.href;
        if (url.includes('index.html')) {
            return 'popup';
        } else if (chrome.runtime?.getManifest()) {
            return 'content-script';
        }
    }
    return 'other';
}
