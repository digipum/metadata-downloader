async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function scrapeActive() {
  const tabId = await getActiveTabId();
  if (!tabId) throw new Error('No active tab');
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/scrape.js'] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (typeof window !== 'undefined' && window.__scrapePage ? window.__scrapePage() : null),
  });
  if (!result) throw new Error('Failed to scrape. Page may block scripts.');
  return result;
}

function e(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  Object.assign(el, props);
  for (const c of children) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

function render(result) {
  const pageEl = document.getElementById('page');
  const mediaEl = document.getElementById('media');
  pageEl.innerHTML = '';
  mediaEl.innerHTML = '';

  if (!result) {
    pageEl.textContent = 'No data.';
    return;
  }

  const p = result.page;
  const rows = [
    ['Title', p.title],
    ['URL', p.url],
    ['Site', p.siteName],
    ['Publisher', p.publisher],
    ['Author', p.author],
    ['Published', p.datePublished],
    ['Updated', p.dateModified],
    ['License', p.license],
    ['Canonical', p.canonicalUrl],
    ['Language', p.language],
  ];
  for (const [k, v] of rows) {
    const line = e('div', {}, [
      e('label', { className: 'small' }, [k + ': ']),
      e('span', { className: 'mono' }, [v || '—'])
    ]);
    pageEl.appendChild(line);
  }

  const media = result.media || [];
  const count = e('div', { className: 'muted' }, [String(media.length) + ' media item(s) found']);
  mediaEl.appendChild(count);
  media.forEach((m, idx) => {
    const container = e('div', { className: 'item' });
    container.appendChild(e('div', { className: 'small' }, [`#${idx + 1} ${m.type}`]));
    if (m.src) {
      container.appendChild(e('img', { src: m.src, className: 'preview' }));
      container.appendChild(e('div', { className: 'src mono' }, [m.src]));
      const cb = e('input', { type: 'checkbox', className: 'media-select', value: m.src });
      container.appendChild(e('label', { className: 'small select' }, [cb, ' Select']));
    }
    if (m.alt) container.appendChild(e('div', {}, ['Alt: ', e('span', { className: 'mono' }, [m.alt])]));
    if (m.caption) container.appendChild(e('div', {}, ['Caption: ', e('span', { className: 'mono' }, [m.caption])]));
    if (m.credit) container.appendChild(e('div', {}, ['Credit: ', e('span', { className: 'mono' }, [m.credit])]));
    if (m.recommendedCredit) container.appendChild(e('div', {}, ['Recommended credit: ', e('span', { className: 'mono' }, [m.recommendedCredit])]));
    mediaEl.appendChild(container);
  });
}

function downloadJSON(obj, filename = 'metadata.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveToStorage(payload) {
  const { captures = [] } = await chrome.storage.local.get('captures');
  captures.unshift({
    kind: 'manual-capture',
    capturedAt: new Date().toISOString(),
    page: payload.page,
    media: payload.media,
    raw: payload.raw || {},
  });
  await chrome.storage.local.set({ captures });
}

document.addEventListener('DOMContentLoaded', async () => {
  const refreshBtn = document.getElementById('refresh');
  const saveBtn = document.getElementById('save');
  const copyBtn = document.getElementById('copy');
  const downloadBtn = document.getElementById('download');
  const downloadMediaBtn = document.getElementById('download-media');

  let current = null;

  async function doScrape() {
    try {
      refreshBtn.disabled = true;
      current = await scrapeActive();
      render(current);
    } catch (e) {
      document.getElementById('page').textContent = 'Error: ' + (e.message || String(e));
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener('click', doScrape);
  saveBtn.addEventListener('click', async () => {
    if (!current) return;
    await saveToStorage(current);
    saveBtn.textContent = 'Saved!';
    setTimeout(() => (saveBtn.textContent = 'Save'), 1200);
  });
  copyBtn.addEventListener('click', async () => {
    if (!current) return;
    await navigator.clipboard.writeText(JSON.stringify(current, null, 2));
    copyBtn.textContent = 'Copied!';
    setTimeout(() => (copyBtn.textContent = 'Copy JSON'), 1200);
  });
  downloadBtn.addEventListener('click', () => {
    if (!current) return;
    const fnSafe = (current.page?.title || 'metadata').replace(/[^a-z0-9]+/gi, '_').slice(0, 50);
    downloadJSON(current, `${fnSafe || 'metadata'}.json`);
  });
  downloadMediaBtn.addEventListener('click', () => {
    const selected = Array.from(document.querySelectorAll('.media-select:checked'));
    selected.forEach((cb) => {
      const url = cb.value;
      if (url) {
        chrome.downloads.download({ url });
      }
    });
  });

  doScrape();
});

