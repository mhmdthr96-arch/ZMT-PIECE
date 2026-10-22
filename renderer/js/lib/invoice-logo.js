// ============================================================
// ZMT PIECE — Business logo for printed documents
// ------------------------------------------------------------
// One source of truth for the shop/company logo that appears on
// every printed document (sale invoice, purchase invoice, payment
// voucher, preparation sheet, PDF and emailed copies).
//
// LOCAL ONLY: the image is copied to <userData>/zmt-invoice-logo/
// on this machine and only its PATH is stored in localStorage.
// It is deliberately NOT part of the cloud backup — the free
// Supabase tier is never spent on image bytes. The trade-off is
// that the logo does not travel to another device: a missing file
// simply prints the document without a logo, never an error.
//
// WHY A DATA URL: every print path renders inside an isolated popup
// (window.open) or a hidden `data:` URL window (PDF export), where a
// `file://` image src does not load. So the stored file is inlined
// as a base64 data URL each time it is drawn.
//
// COLOUR: black & white printing in this app strips colours with
// `!important` but does NOT touch `filter`, so a monochrome copy is
// produced with a CSS grayscale filter at draw time.
// ============================================================
(function () {
  const STORE_KEY = 'zmt_invoice_logo';

  const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];

  const DEFAULTS = {
    path: '',
    position: 'top-center',
    size: 80,      // px
    opacity: 20,   // % — a faint watermark by default
  };

  function load() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { parsed = null; }
    const d = Object.assign({}, DEFAULTS);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.path === 'string') d.path = parsed.path;
      if (POSITIONS.indexOf(parsed.position) !== -1) d.position = parsed.position;
      const size = parseInt(parsed.size, 10);
      if (isFinite(size)) d.size = Math.min(160, Math.max(30, size));
      const op = parseInt(parsed.opacity, 10);
      if (isFinite(op)) d.opacity = Math.min(100, Math.max(10, op));
    }
    return d;
  }

  function save(cfg) {
    const clean = {
      path: String((cfg && cfg.path) || ''),
      position: POSITIONS.indexOf(cfg && cfg.position) !== -1 ? cfg.position : DEFAULTS.position,
      size: Math.min(160, Math.max(30, parseInt(cfg && cfg.size, 10) || DEFAULTS.size)),
      opacity: Math.min(100, Math.max(10, parseInt(cfg && cfg.opacity, 10) || DEFAULTS.opacity)),
    };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(clean)); } catch (e) {}
    return clean;
  }

  function clear() {
    const cfg = load();
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    if (cfg.path && window.electronAPI && window.electronAPI.invoiceLogoRemove) {
      try { window.electronAPI.invoiceLogoRemove(cfg.path); } catch (e) {}
    }
  }

  function hasLogo() {
    return !!load().path;
  }

  // Small cache so a document printed twice does not re-read the disk, while a
  // logo change still takes effect immediately (the cache is keyed by the path,
  // which changes on every import).
  let _cache = { path: '', dataUrl: '' };

  // Synchronous snapshot of the last resolved data URL. The invoice builders are
  // plain string templates (no room for await), so they read this. It is
  // refreshed by warm() at startup, after an import, and before every print.
  let _current = '';

  // Resolve the stored logo to an inlineable data URL and remember it for the
  // synchronous builders. Always resolves (never rejects) — a missing file
  // yields '' so callers just print without a logo.
  async function warm() {
    const cfg = load();
    if (!cfg.path) { _current = ''; _cache = { path: '', dataUrl: '' }; return ''; }
    if (_cache.path === cfg.path) { _current = _cache.dataUrl; return _current; }
    if (!window.electronAPI || !window.electronAPI.invoiceLogoDataUrl) { _current = ''; return ''; }
    try {
      const res = await window.electronAPI.invoiceLogoDataUrl(cfg.path);
      if (res && res.success && res.dataUrl) {
        _cache = { path: cfg.path, dataUrl: res.dataUrl };
        _current = res.dataUrl;
        return _current;
      }
    } catch (e) { /* print without a logo */ }
    _current = '';
    return '';
  }

  function current() { return _current; }

  // Drop the cached data URL (called after an import/remove).
  function invalidate() { _cache = { path: '', dataUrl: '' }; _current = ''; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Build the standalone <img> for a given data URL. `mono` produces the
  // grayscale copy used by black & white printing. Returns '' when there is
  // nothing to draw, so callers can splice it in unconditionally.
  function imgHTML(dataUrlStr, opts) {
    if (!dataUrlStr) return '';
    const cfg = load();
    const o = opts || {};
    const size = Math.min(160, Math.max(30, parseInt(o.size, 10) || cfg.size));
    const opacity = Math.min(100, Math.max(10, parseInt(o.opacity, 10) || cfg.opacity));
    const mono = !!o.mono;
    const extra = o.style ? ' ' + o.style : '';
    return '<img src="' + dataUrlStr + '" alt="" class="zmt-doc-logo" ' +
      'style="width:' + size + 'px;height:auto;max-height:' + size + 'px;object-fit:contain;' +
      'opacity:' + (opacity / 100) + ';filter:grayscale(' + (mono ? 100 : 0) + '%);' +
      'vertical-align:middle;' + extra + '">';
  }

  // Which grid cell does this position belong to? The invoice header is a
  // 3-column row (shop | logo | document type). "bottom-*" drops the logo to a
  // centred band under the header instead.
  function isBottom(position) {
    return String(position || '').indexOf('bottom-') === 0;
  }

  function align(position) {
    if (/right$/.test(position)) return 'right';
    if (/left$/.test(position)) return 'left';
    return 'center';
  }

  // Is the logo configured? Used by the invoice builders to decide between a
  // three-column header and the original two-column one.
  function isEnabled() { return hasLogo(); }

  // The document header row, kept here (not in a page script) so it is available
  // on every page — the invoice screen, the sales screen and the settings
  // preview all render the exact same header.
  //
  //   with a logo : [ shop 45% ] [ logo 15% ] [ document type 40% ]
  //   without one : the original two-column layout, untouched (no empty gap)
  //
  // `leftCell` / `rightCell` are already-rendered HTML; this only lays them out.
  function headerRow(leftCell, rightCell, mono) {
    const twoCol = '<table style="width:100%;border-collapse:collapse" dir="ltr"><tr>' +
      '<td style="vertical-align:top;width:60%">' + leftCell + '</td>' +
      '<td style="vertical-align:top;text-align:right;width:40%">' + rightCell + '</td>' +
      '</tr></table>';

    if (!headerRow._data || !headerRow._data()) return twoCol;

    const cfg = load();
    const img = imgHTML(headerRow._data(), { mono: !!mono });

    // A "bottom" position puts the logo in its own band under the row, aligned
    // per the chosen cell (bottom-left / bottom-center / bottom-right).
    if (isBottom(cfg.position)) {
      return twoCol + '<div style="text-align:' + align(cfg.position) + ';margin-top:10px">' + img + '</div>';
    }

    return '<table style="width:100%;border-collapse:collapse" dir="ltr"><tr>' +
      '<td style="vertical-align:top;width:45%">' + leftCell + '</td>' +
      '<td style="vertical-align:top;text-align:' + align(cfg.position) + ';width:15%;padding:0 8px">' + img + '</td>' +
      '<td style="vertical-align:top;text-align:right;width:40%">' + rightCell + '</td>' +
      '</tr></table>';
  }
  // The data-URL source is the synchronous snapshot kept by warm(): this lib
  // stays free of any async dependency for its callers.
  headerRow._data = function () { return _current; };

  window.InvoiceLogo = {
    STORE_KEY: STORE_KEY,
    POSITIONS: POSITIONS,
    DEFAULTS: DEFAULTS,
    load: load,
    save: save,
    clear: clear,
    hasLogo: hasLogo,
    isEnabled: isEnabled,
    warm: warm,
    current: current,
    invalidate: invalidate,
    imgHTML: imgHTML,
    headerRow: headerRow,
    isBottom: isBottom,
    align: align,
    esc: esc,
  };

  // Keep the synchronous snapshot available as early as possible. The builders
  // fall back to "no logo" until this resolves, which is always safe.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { warm(); });
  } else {
    warm();
  }
})();
