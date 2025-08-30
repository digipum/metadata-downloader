# Media Metadata Capture (Chrome Extension)

Scrape publisher, author, license, and media credits from the current page, then save and export for later attribution. Also attempts to auto-capture page context when a download starts.

## Features

- One-click scrape from the popup
- Extracts common metadata (publisher, author, site, canonical URL, dates, license)
- Finds media on the page (images/videos/audio) with alt, caption, and nearby credit text
- Suggests a recommended credit for each media item
- Save to local storage and manage from the Options page
- Export single capture or all captures as JSON
- Background auto-capture on download (best effort)

### Optional: Auto-write XMP via exiftool

- On download completion, the extension can call a native helper that runs `exiftool` to embed XMP tags (creator, credit, rights/license, source URL) into the downloaded file.

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode (top right).
3. Click "Load unpacked" and select the `chrome-media-metadata-capture` folder.
4. Pin the extension for quick access (optional).

### Enable Native Tagging (exiftool)

Chrome extensions cannot modify file contents directly, so native messaging is used to call a small helper that runs `exiftool` locally.

1. Install exiftool (macOS: `brew install exiftool`, Windows: install from exiftool.org, Linux: use your package manager).
2. Note your extension ID after loading it (see `chrome://extensions`).
3. Copy `native-host/tag_with_exiftool.py` somewhere stable, e.g. `/usr/local/bin/tag_with_exiftool.py`, and make it executable (`chmod +x`).
4. Create a native host manifest using `native-host/com.mediacapture.exiftool.json`:
   - Replace `REPLACE_WITH_ABSOLUTE_PATH_TO_tag_with_exiftool.py` with the absolute script path.
   - Replace `REPLACE_WITH_EXTENSION_ID` with your extension ID.
5. Install the manifest:
   - macOS (Chrome Stable): place the JSON at `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.mediacapture.exiftool.json`
   - Linux: `~/.config/google-chrome/NativeMessagingHosts/com.mediacapture.exiftool.json`
   - Windows: add registry key `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.mediacapture.exiftool` with default value pointing to the JSON file.

Once installed, new completed downloads will be tagged automatically when the extension has page context.

## Usage

- Navigate to a page containing media.
- Click the extension icon to open the popup.
- The extension scrapes the page automatically; click "Save" to store.
- Use "Copy JSON" or "Download JSON" to export the current scrape.
- Manage saved items via the "Manage Saved" link (Options page). Search, export, or clear.
- When a download is initiated from a tab, the background attempts to auto-scrape and save the context.

## Notes & Limitations

- Some sites block script injection or heavily obfuscate markup; scraping may return partial data.
- The downloads API does not always provide the originating tab; in those cases we fall back to the active tab.
- License information is heuristic; verify before publishing.
- No icons are bundled; Chrome will use a default puzzle-piece icon in the toolbar.
- Native messaging must be configured correctly for XMP tagging; if not present, downloads are still captured/saved but not modified.

## Project Structure

- `manifest.json`: MV3 config.
- `background.js`: Service worker; listens to downloads and saves captures.
- `content/scrape.js`: Scraper injected on-demand; exposes `window.__scrapePage()`.
- `popup/popup.html|css|js`: Popup UI for scraping, saving, and exporting.
- `options/options.html|js`: Saved captures management page.
- `native-host/tag_with_exiftool.py`: Native helper to run exiftool.
- `native-host/com.mediacapture.exiftool.json`: Manifest template for native messaging (edit and install).

## Privacy

- All data is stored locally using `chrome.storage.local` and never leaves your machine.

## License

- For your friend’s personal workflow; adapt as needed.
