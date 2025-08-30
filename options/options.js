function e(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  Object.assign(el, props);
  for (const c of children) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

async function loadCaptures() {
  const { captures = [] } = await chrome.storage.local.get('captures');
  return captures;
}

function matchesQuery(item, q) {
  if (!q) return true;
  q = q.toLowerCase();
  const p = item.page || {};
  return [p.title, p.url, p.publisher, p.author, p.siteName]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderList(q = '') {
  const container = document.getElementById('list');
  container.innerHTML = '';
  const captures = await loadCaptures();
  const filtered = captures.filter((it) => matchesQuery(it, q));
  if (!filtered.length) {
    container.appendChild(e('div', { className: 'muted' }, ['No saved captures.']));
    return;
  }
  filtered.forEach((c, idx) => {
    const p = c.page || {};
    const head = e('div', {}, [
      e('strong', {}, [p.title || 'Untitled']),
      ' ',
      e('span', { className: 'muted' }, [`· ${p.publisher || p.siteName || new URL(p.url || 'https://example.com').hostname}`])
    ]);
    const meta = e('div', { className: 'mono' }, [p.url || '']);
    const actions = e('div', { className: 'actions' }, [
      e('button', { onclick: () => downloadJSON(c, `capture_${idx + 1}.json`) }, ['Export']),
      e('button', { onclick: async () => {
        const { captures = [] } = await chrome.storage.local.get('captures');
        const i = captures.indexOf(c);
        if (i >= 0) { captures.splice(i, 1); await chrome.storage.local.set({ captures }); await renderList(document.getElementById('q').value); }
      } }, ['Delete'])
    ]);
    const item = e('div', { className: 'item' }, [head, meta, actions]);
    container.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const q = document.getElementById('q');
  const exportAll = document.getElementById('exportAll');
  const clearAll = document.getElementById('clearAll');

  q.addEventListener('input', () => renderList(q.value));
  exportAll.addEventListener('click', async () => {
    const captures = await loadCaptures();
    downloadJSON(captures, 'captures.json');
  });
  clearAll.addEventListener('click', async () => {
    if (!confirm('Clear all saved captures?')) return;
    await chrome.storage.local.set({ captures: [] });
    await renderList('');
  });

  await renderList('');
});

