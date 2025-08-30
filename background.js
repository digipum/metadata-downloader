// Media Metadata Capture - background service worker (MV3)

/*
Listens for download creations and attempts to scrape the page from which
the download was initiated to capture attribution metadata automatically.

Also exposes small helpers via chrome.runtime.onMessage if needed later.
*/

async function scrapeTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/scrape.js"],
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (typeof window !== 'undefined' && window.__scrapePage ? window.__scrapePage() : null),
    });
    return result || null;
  } catch (err) {
    console.warn('scrapeTab failed', err);
    return null;
  }
}

async function saveCapture(capture) {
  try {
    const { captures = [] } = await chrome.storage.local.get("captures");
    captures.unshift(capture); // newest first
    await chrome.storage.local.set({ captures });
  } catch (e) {
    console.warn('saveCapture error', e);
  }
}

// Keep a short-lived in-memory map of captures by download id for tagging
const pendingByDownloadId = new Map();

function toNonEmptyString(v) {
  return (v == null ? '' : String(v)).trim();
}

function buildXmpFromPage(page) {
  const url = toNonEmptyString(page?.url || '');
  const author = toNonEmptyString(page?.author || '');
  const publisher = toNonEmptyString(page?.publisher || '');
  const site = toNonEmptyString(page?.siteName || '');
  const license = toNonEmptyString(page?.license || '');
  const title = toNonEmptyString(page?.title || '');

  const creator = author || publisher || site || '';
  const credit = publisher || site || creator || '';
  const now = new Date().toISOString().replace(/\..+$/, '');

  const xmp = {};
  if (creator) xmp['XMP-dc:creator'] = creator;
  if (title) xmp['XMP-dc:title'] = title;
  if (url) xmp['XMP-dc:source'] = url;
  if (credit) xmp['XMP-photoshop:Credit'] = credit;
  xmp['XMP-xmp:CreatorTool'] = 'Media Metadata Capture (Chrome)';
  xmp['XMP-xmp:MetadataDate'] = now;

  if (license) {
    // If license looks like a URL, set WebStatement and mark usage
    const isUrl = /^https?:\/\//i.test(license);
    if (isUrl) {
      xmp['XMP-xmpRights:WebStatement'] = license;
      xmp['XMP-dc:rights'] = 'See WebStatement for license terms';
      xmp['XMP-xmpRights:UsageTerms'] = 'See WebStatement for license terms';
    } else {
      xmp['XMP-dc:rights'] = license;
      xmp['XMP-xmpRights:UsageTerms'] = license;
    }
    xmp['XMP-xmpRights:Marked'] = true;
  }
  return xmp;
}

async function sendNativeTag(filePath, page) {
  try {
    const xmp = buildXmpFromPage(page);
    const payload = { type: 'tag', file: filePath, xmp, page };
    const resp = await chrome.runtime.sendNativeMessage('com.mediacapture.exiftool', payload);
    return resp;
  } catch (e) {
    console.warn('Native tagging failed', e);
    return null;
  }
}

chrome.downloads.onCreated.addListener(async (item) => {
  try {
    // Not all DownloadItem fields are always present; guard carefully
    const now = new Date().toISOString();
    const downloadInfo = {
      id: item.id,
      url: item.url,
      finalUrl: item.finalUrl || null,
      filename: item.filename || null,
      mime: item.mime || null,
      referrer: item.referrer || null,
      // tabId is not guaranteed; it's present when the download is initiated from a tab
      tabId: item.tabId != null ? item.tabId : null,
      startedAt: now,
    };

    let scrape = null;
    if (downloadInfo.tabId != null) {
      scrape = await scrapeTab(downloadInfo.tabId);
    } else {
      // Fallback: try active tab in the current window
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (active && active.id != null) {
        scrape = await scrapeTab(active.id);
      }
    }

    if (scrape) {
      const capture = {
        kind: 'auto-download-capture',
        capturedAt: new Date().toISOString(),
        download: downloadInfo,
        page: scrape.page,
        media: scrape.media,
        raw: scrape.raw || {},
      };
      // Save to storage for the user
      await saveCapture(capture);
      // Keep in memory until completion to tag file via native host
      if (downloadInfo.id != null) {
        pendingByDownloadId.set(downloadInfo.id, capture);
      }
    }
  } catch (e) {
    console.warn('onCreated handler failed', e);
  }
});

chrome.downloads.onChanged.addListener(async (delta) => {
  try {
    if (!delta || delta.id == null) return;
    if (delta.state && delta.state.current === 'complete') {
      const id = delta.id;
      const capture = pendingByDownloadId.get(id);
      if (!capture) return;
      // Resolve the final filename (absolute path)
      const [info] = await chrome.downloads.search({ id });
      const file = info && info.filename ? info.filename : null;
      if (file) {
        await sendNativeTag(file, capture.page);
      }
      pendingByDownloadId.delete(id);
    }
  } catch (e) {
    console.warn('onChanged failed', e);
  }
});

// Optional: respond to manual save requests from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === 'save-capture') {
      await saveCapture(msg.payload);
      sendResponse({ ok: true });
      return;
    }
  })();
  // indicate async response
  return true;
});
