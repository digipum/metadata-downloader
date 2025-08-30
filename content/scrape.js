// Injected on-demand by service worker/popup via chrome.scripting
// Exposes window.__scrapePage() which returns page+media metadata

(function () {
  if (typeof window === 'undefined') return;
  if (window.__scrapePage) return; // idempotent

  function getMetaByName(name) {
    const el = document.querySelector(`meta[name="${CSS.escape(name)}"]`);
    return el ? el.getAttribute('content') || '' : '';
  }

  function getMetaByProp(prop) {
    const el = document.querySelector(`meta[property="${CSS.escape(prop)}"]`);
    return el ? el.getAttribute('content') || '' : '';
  }

  function getLinkRel(rel) {
    const el = document.querySelector(`link[rel="${CSS.escape(rel)}"]`);
    return el ? el.getAttribute('href') || '' : '';
  }

  function safeParseJSON(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function firstTruthy(...vals) {
    return vals.find((v) => v && String(v).trim().length > 0) || '';
  }

  function collectJSONLD() {
    const nodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const out = [];
    for (const node of nodes) {
      const data = safeParseJSON(node.textContent || '');
      if (!data) continue;
      if (Array.isArray(data)) out.push(...data);
      else out.push(data);
    }
    return out;
  }

  function extractFromJSONLD(items) {
    // Look for types that usually have publisher/author
    const flatten = (val) => (Array.isArray(val) ? val : val ? [val] : []);
    const types = [
      'NewsArticle', 'Article', 'BlogPosting', 'VideoObject', 'ImageObject', 'WebPage', 'CreativeWork'
    ];
    const byType = (t) => items.find((it) => {
      const type = it['@type'];
      if (typeof type === 'string') return type === t;
      if (Array.isArray(type)) return type.includes(t);
      return false;
    });
    let chosen = null;
    for (const t of types) {
      const found = byType(t);
      if (found) { chosen = found; break; }
    }

    const publisher = chosen?.publisher?.name || chosen?.publisher || null;
    const authorArr = flatten(chosen?.author).map((a) => a?.name || a).filter(Boolean);
    const author = authorArr[0] || null;
    const datePublished = chosen?.datePublished || null;
    const dateModified = chosen?.dateModified || null;
    const headline = chosen?.headline || null;
    const name = chosen?.name || null;
    const description = chosen?.description || null;
    const license = chosen?.license || null;
    const isPartOf = chosen?.isPartOf?.name || null;
    const siteName = chosen?.publisher?.name || isPartOf || null;

    return {
      publisher,
      author,
      headline,
      name,
      description,
      datePublished,
      dateModified,
      license,
      siteName,
      rawItem: chosen || null,
    };
  }

  function extractPage() {
    const jsonld = collectJSONLD();
    const ld = extractFromJSONLD(jsonld);

    const title = firstTruthy(
      getMetaByProp('og:title'),
      document.title,
      ld.headline,
      ld.name
    );
    const description = firstTruthy(
      getMetaByName('description'),
      getMetaByProp('og:description'),
      ld.description
    );
    const siteName = firstTruthy(getMetaByProp('og:site_name'), ld.siteName);
    const publisher = firstTruthy(
      getMetaByName('publisher'),
      getMetaByProp('article:publisher'),
      getMetaByName('dc.publisher'),
      ld.publisher,
      siteName
    );
    const author = firstTruthy(
      getMetaByName('author'),
      getMetaByProp('article:author'),
      getMetaByName('dc.creator'),
      ld.author
    );
    const canonicalUrl = firstTruthy(getLinkRel('canonical'), location.href);
    const ogUrl = getMetaByProp('og:url');
    const pageUrl = firstTruthy(ogUrl, canonicalUrl, location.href);
    const ogImage = getMetaByProp('og:image');
    const favicon = firstTruthy(
      getLinkRel('icon'),
      getLinkRel('shortcut icon'),
      getLinkRel('apple-touch-icon')
    );
    const datePublished = firstTruthy(
      getMetaByProp('article:published_time'),
      getMetaByName('date'),
      ld.datePublished
    );
    const dateModified = firstTruthy(
      getMetaByProp('article:modified_time'),
      ld.dateModified
    );
    const license = firstTruthy(
      getMetaByName('license'),
      (document.querySelector('link[rel="license"]')?.getAttribute('href') || ''),
      ld.license
    );
    const lang = document.documentElement.getAttribute('lang') || '';

    return {
      url: pageUrl,
      title,
      description,
      siteName,
      publisher,
      author,
      canonicalUrl,
      ogUrl,
      ogImage,
      favicon,
      datePublished,
      dateModified,
      license,
      language: lang,
    };
  }

  function nearbyFigureCaption(el) {
    // Search up to nearest <figure> and take its <figcaption>
    let p = el;
    for (let i = 0; i < 3 && p; i++) {
      if (p.tagName === 'FIGURE') break;
      p = p.parentElement;
    }
    if (p && p.tagName === 'FIGURE') {
      const fc = p.querySelector('figcaption');
      if (fc) return fc.textContent?.trim() || '';
    }
    return '';
  }

  function guessCredit(el) {
    const attrKeys = ['data-credit', 'data-attribution', 'data-creditline', 'data-byline', 'data-caption'];
    for (const k of attrKeys) {
      const v = el.getAttribute(k);
      if (v) return v.trim();
    }
    // Nearby elements with credit classes
    const creditEl = el.closest('.credit, .byline, .attribution, .caption, [itemprop="creditText"]');
    if (creditEl) return creditEl.textContent?.trim() || '';
    // As a fallback, use author/site
    return '';
  }

  function collectMedia() {
    const items = [];

    // Images
    const imgs = Array.from(document.images || []);
    for (const img of imgs) {
      const src = img.currentSrc || img.src || '';
      if (!src) continue;
      items.push({
        type: 'image',
        src,
        srcset: img.srcset || '',
        alt: img.alt || '',
        title: img.title || '',
        width: Number(img.getAttribute('width')) || img.naturalWidth || null,
        height: Number(img.getAttribute('height')) || img.naturalHeight || null,
        caption: nearbyFigureCaption(img),
        credit: guessCredit(img),
      });
    }

    // Videos
    const vids = Array.from(document.querySelectorAll('video'));
    for (const v of vids) {
      const src = v.currentSrc || v.getAttribute('src') || '';
      const sources = Array.from(v.querySelectorAll('source')).map(s => ({
        src: s.getAttribute('src') || '',
        type: s.getAttribute('type') || '',
      })).filter(s => s.src);
      items.push({
        type: 'video',
        src,
        sources,
        poster: v.getAttribute('poster') || '',
        width: Number(v.getAttribute('width')) || v.videoWidth || null,
        height: Number(v.getAttribute('height')) || v.videoHeight || null,
        caption: nearbyFigureCaption(v),
        credit: guessCredit(v),
      });
    }

    // Audio
    const auds = Array.from(document.querySelectorAll('audio'));
    for (const a of auds) {
      const src = a.currentSrc || a.getAttribute('src') || '';
      const sources = Array.from(a.querySelectorAll('source')).map(s => ({
        src: s.getAttribute('src') || '',
        type: s.getAttribute('type') || '',
      })).filter(s => s.src);
      items.push({
        type: 'audio',
        src,
        sources,
        caption: nearbyFigureCaption(a),
        credit: guessCredit(a),
      });
    }

    return items;
  }

  window.__scrapePage = function () {
    const page = extractPage();
    const media = collectMedia();

    // Best-effort credit recommendation for each media item
    const defaultCredit = page.author || page.publisher || page.siteName || new URL(page.url).hostname;
    const enriched = media.map(m => ({
      ...m,
      recommendedCredit: m.credit || defaultCredit
    }));

    return {
      page,
      media: enriched,
      raw: {
        // Keep a small raw subset for debugging
        meta: {
          ogSiteName: getMetaByProp('og:site_name') || '',
          twitterSite: getMetaByName('twitter:site') || '',
        },
      },
    };
  };
})();

