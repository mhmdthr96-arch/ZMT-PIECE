// QR code helper for product cards (inventory + sales).
//
// The setting is OFF by default and remembered in localStorage. The QR payload
// intentionally contains only stable identifiers: names, prices and quantities
// change, so encoding them would make an old printed code misleading.
var ProductQR = (function () {
  var KEY = 'zmt_product_qr_enabled';
  var _cache = Object.create(null);
  // Printed labels need a physical size in mm and must work even while the
  // card setting is OFF. Keep that variant in its own cache so the 52px card
  // markup (and its existing cache key) is never touched.
  var _printCache = Object.create(null);

  function enabled() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  function set(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  }

  function payloadOf(product) {
    if (!product) return '';
    var id = String(product.id == null ? '' : product.id).trim();
    var barcode = String(product.barcode || '').trim();
    var stableId = id || barcode;
    if (!stableId) return '';
    return 'ZMT-PRODUCT|' + stableId + (barcode ? '|' + barcode : '');
  }

  function sizeAttrOf(options) {
    var mm = options && options.sizeMm;
    mm = parseFloat(mm);
    if (!isFinite(mm) || mm <= 0) return '';
    return Math.max(8, Math.min(120, Math.round(mm))) + 'mm';
  }

  // Returns an inline SVG string, or '' when disabled / unavailable.
  // options.force  : ignore the card-level ON/OFF switch (print dialog only).
  // options.sizeMm : physical square size for printed labels; omitted for cards.
  function svgOf(product, options) {
    var opt = options || {};
    if (!opt.force && !enabled()) return '';
    var payload = payloadOf(product);
    if (!payload) return '';
    var sizeAttr = sizeAttrOf(opt);
    if (!sizeAttr && _cache[payload]) return _cache[payload];
    var cacheKey = sizeAttr ? payload + '|' + sizeAttr : payload;
    var cache = sizeAttr ? _printCache : _cache;
    if (cache[cacheKey]) return cache[cacheKey];

    if (typeof window === 'undefined' || typeof window.qrcodegen !== 'function') return '';
    try {
      var qr = window.qrcodegen(0, 'M');
      qr.addData(payload, 'Byte');
      qr.make();
      var n = qr.getModuleCount();
      var quiet = 2;
      var dim = n + quiet * 2;
      var path = '';
      for (var r = 0; r < n; r++) {
        var c = 0;
        while (c < n) {
          if (!qr.isDark(r, c)) { c++; continue; }
          var start = c;
          while (c < n && qr.isDark(r, c)) c++;
          var width = c - start;
          path += 'M' + (start + quiet) + ' ' + (r + quiet) + 'h' + width + 'v1h-' + width + 'z';
        }
      }
      var attr = sizeAttr || '52';
      var cls = sizeAttr ? 'prod-qr-svg bp-qr-svg' : 'prod-qr-svg';
      var svg = '<svg class="' + cls + '" viewBox="0 0 ' + dim + ' ' + dim + '" width="' + attr + '" height="' + attr + '" ' +
        'xmlns="http://www.w3.org/2000/svg" aria-label="QR" focusable="false">' +
        '<rect width="' + dim + '" height="' + dim + '" fill="#fff"/>' +
        '<path d="' + path + '" fill="#000" shape-rendering="crispEdges"/></svg>';
      cache[cacheKey] = svg;
      return svg;
    } catch (e) {
      return '';
    }
  }

  // Card-ready markup. Clicks must never reach the card's "add to cart" or
  // "edit product" handlers — the QR is a passive identifier, not a button.
  function htmlOf(product) {
    var svg = svgOf(product);
    if (!svg) return '';
    return '<span class="prod-qr" title="QR" onclick="event.stopPropagation()" ondblclick="event.stopPropagation()">' + svg + '</span>';
  }

  // Print-dialog entry point: never gated by the card switch, always sized in mm.
  function svgForPrint(product, sizeMm) {
    return svgOf(product, { force: true, sizeMm: sizeMm });
  }

  function refreshCards() {
    var page = (typeof window !== 'undefined') ? window._currentPageId : '';
    try {
      if (page === 'inventory' && typeof renderInventory === 'function') renderInventory();
      if (page === 'sales' && typeof renderSalesProducts === 'function') renderSalesProducts();
    } catch (e) {}
  }

  return { KEY: KEY, enabled: enabled, set: set, payloadOf: payloadOf, svgOf: svgOf, svgForPrint: svgForPrint, htmlOf: htmlOf, refreshCards: refreshCards };
})();
