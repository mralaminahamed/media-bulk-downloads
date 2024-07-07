import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')

if (app) {
  app.innerHTML = `
    <h1>Image Bulk Downloads</h1>
    <p>Click the button to download all images from the current page.</p>
    <button id="downloadBtn">Download Images</button>
    <p id="status"></p>
  `

  document.getElementById('downloadBtn')?.addEventListener('click', async () => {
    const statusElement = document.getElementById('status')
    if (statusElement) {
      statusElement.textContent = 'Collecting images...'

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, 'GET_IMAGES', (images: string[]) => {
          if (chrome.runtime.lastError) {
            statusElement.textContent = 'Error: ' + chrome.runtime.lastError.message
          } else if (images && images.length > 0) {
            chrome.runtime.sendMessage({ type: 'DOWNLOAD_IMAGES', images })
            statusElement.textContent = `Downloading ${images.length} images...`
          } else {
            statusElement.textContent = 'No images found on this page.'
          }
        })
      }
    }
  })
}

export {}
