/* ============================================================
   ZMT PIECE — ترتيب الحقول / عرض الأعمدة / الملء التلقائي للأسعار
   ------------------------------------------------------------
   Shared, purely-visual input layout for Quick Entry (F1) and Smart Add.

   • Field order is SHARED between both screens. The row number (#) and the
     delete button are fixed (always first / always last). Fields hidden by
     FV keep their slot in the order and stay hidden.
   • Column widths are INDEPENDENT per screen, with hard min/max and a
     per-field reset. Defaults reproduce the shipped 3.2.7 layout exactly.
   • Auto-fill is OFF by default and remembered. Its base is ALWAYS the buy
     price. Bands are contiguous: the operator enters only lower bounds,
     the first one is 0 and the last one means infinity; a band applies for
     [min, nextMin) so there are never gaps or overlaps, even for decimals.
     Prices are calculated with exact decimal arithmetic — 109.2 stays 109.2.

   Nothing here writes to the database, invoices, stock, permissions,
   printing or sync. Everything lives in one localStorage key.
   ============================================================ */
(function (root) {
  'use strict';

  var KEY = 'zmt_form_layout';
  var PAGE_QE = 'quick-entry';
  var PAGE_SMART = 'smart-add';

  function T(key, fb) {
    try {
      var v = (typeof root.t === 'function') ? root.t(key) : '';
      return v || fb || key;
    } catch (e) { return fb || key; }
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- canonical fields ----------------------------------------- */
  // `native` maps a canonical key to the name used by each page's own markup.
  // A field absent on a page is simply skipped there; the shared order still
  // keeps its slot so both screens agree when the field is available again.
  var FIELDS = [
    { key: 'idx',       native: { 'quick-entry': 'idx',        'smart-add': 'idx' },             label: 'formLayout.rowNo',        fb: '#',                         fixed: 'first' },
    { key: 'product',   native: { 'quick-entry': 'product',    'smart-add': 'name' },            label: 'quickEntry.searchProduct', fb: 'المنتج',                  wide: true },
    { key: 'qty',       native: { 'quick-entry': 'qty',        'smart-add': 'qty' },             label: 'quickEntry.qty',          fb: 'الكمية' },
    { key: 'unit',      native: { 'quick-entry': 'unit',       'smart-add': null },              label: 'units.label',             fb: 'الوحدة' },
    { key: 'buy',       native: { 'quick-entry': 'buy',        'smart-add': 'price' },           label: 'quickEntry.buyPrice',     fb: 'سعر الشراء' },
    { key: 'amount',    native: { 'quick-entry': 'amount',     'smart-add': 'amount' },          label: 'quickEntry.purchaseAmount', fb: 'مبلغ المشتريات' },
    { key: 'pdisc',     native: { 'quick-entry': 'pdisc',      'smart-add': null },              label: 'quickEntry.purchaseDiscount', fb: 'خصم الشراء %' },
    { key: 'sell',      native: { 'quick-entry': 'sell',       'smart-add': 'sell' },            label: 'quickEntry.sellPrice',    fb: 'سعر البيع',                 price: true },
    { key: 'whole',     native: { 'quick-entry': 'whole',      'smart-add': 'whole' },           label: 'quickEntry.wholesalePrice', fb: 'سعر الجملة',             price: true },
    { key: 'minPrice',  native: { 'quick-entry': 'minPrice',   'smart-add': 'minPrice' },        label: 'quickEntry.minPrice',     fb: 'السعر الأدنى',              fv: 'minPrice' },
    { key: 'brand',     native: { 'quick-entry': 'brand',      'smart-add': null },              label: 'quickEntry.brand',        fb: 'العلامة' },
    { key: 'barcode',   native: { 'quick-entry': 'barcode',    'smart-add': 'barcode' },         label: 'quickEntry.barcode',      fb: 'الباركود' },
    { key: 'reference', native: { 'quick-entry': 'reference',  'smart-add': 'reference' },       label: 'quickEntry.reference',    fb: 'المرجع',                    fv: 'reference' },
    { key: 'plu',       native: { 'quick-entry': 'plu',        'smart-add': 'plu' },             label: 'quickEntry.plu',          fb: 'PLU',                       fv: 'plu' },
    { key: 'country',   native: { 'quick-entry': 'country',    'smart-add': 'countryOfOrigin' }, label: 'quickEntry.countryOfOrigin', fb: 'البلد',                fv: 'country' },
    { key: 'mark',      native: { 'quick-entry': 'mark',       'smart-add': 'mark' },            label: 'quickEntry.mark',         fb: 'المارك',                    fv: 'mark' },
    { key: 'storage',   native: { 'quick-entry': 'storage',    'smart-add': null },              label: 'quickEntry.storageLocation', fb: 'مكان التخزين' },
    { key: 'family',    native: { 'quick-entry': 'family',     'smart-add': null },              label: 'quickEntry.family',       fb: 'العائلة' },
    { key: 'expiry',    native: { 'quick-entry': 'expiry',     'smart-add': null },              label: 'inventory.expiryDate',    fb: 'تاريخ الانتهاء' },
    { key: 'del',       native: { 'quick-entry': 'del',        'smart-add': 'del' },             label: 'formLayout.delete',       fb: 'حذف',                       fixed: 'last' },
  ];
  var BY_KEY = {};
  FIELDS.forEach(function (f) { BY_KEY[f.key] = f; });

  var DEFAULT_WIDTH_QE = {
    idx: 40, product: 185, qty: 90, unit: 96, buy: 88, amount: 110, pdisc: 84,
    sell: 88, whole: 88, minPrice: 90, brand: 114, reference: 108, plu: 100,
    barcode: 124, country: 98, mark: 98, storage: 114, family: 120, expiry: 128, del: 34,
  };
  var DEFAULT_WIDTH_SMART = {
    idx: 40, product: 260, qty: 90, buy: 110, amount: 110, sell: 110, whole: 110,
    minPrice: 90, barcode: 140, reference: 120, plu: 100, country: 100, mark: 100, del: 44,
  };
  var EXTRA_DEFAULT_QE = 190;    // extra prices live in a full-width band in F1
  var EXTRA_DEFAULT_SMART = 110; // and in their own column in Smart Add

  function isPage(p) { return p === PAGE_SMART ? PAGE_SMART : PAGE_QE; }
  function isExtraKey(k) { return String(k || '').indexOf('extra:') === 0; }
  function extraId(k) { return String(k || '').slice(6); }
  function extraKey(id) { return 'extra:' + id; }

  function extraFields() {
    try { return (root.ExtraPrices && root.ExtraPrices.fields()) || []; } catch (e) { return []; }
  }

  function defaultOrder() { return FIELDS.map(function (f) { return f.key; }); }

  function defWidth(page, key) {
    if (isExtraKey(key)) return page === PAGE_SMART ? EXTRA_DEFAULT_SMART : EXTRA_DEFAULT_QE;
    var f = BY_KEY[key];
    if (!f) return 110;
    var w = (page === PAGE_SMART ? DEFAULT_WIDTH_SMART : DEFAULT_WIDTH_QE)[key];
    return w || 110;
  }
  function widthRange(page, key) {
    var f = BY_KEY[key];
    if (f && f.fixed) return { min: defWidth(page, key), max: defWidth(page, key) };
    return { min: (f && f.wide || isExtraKey(key)) ? 120 : 48, max: (f && f.wide) ? 600 : 480 };
  }
  function clampWidth(page, key, v) {
    var r = widthRange(page, key);
    var n = parseInt(v, 10);
    if (!isFinite(n)) n = defWidth(page, key);
    return Math.max(r.min, Math.min(r.max, n));
  }

  /* ---------- normalisation / persistence ------------------------------ */
  function normalizeOrder(order) {
    var extras = extraFields().map(function (f) { return extraKey(f.id); });
    var known = {};
    defaultOrder().concat(extras).forEach(function (k) { known[k] = true; });
    var out = [], seen = {};
    (Array.isArray(order) ? order : []).forEach(function (k) {
      if (!known[k] || seen[k] || k === 'idx' || k === 'del') return;
      seen[k] = true; out.push(k);
    });
    // Fields added after the order was first saved (new extra price, etc.)
    // take their factory place instead of vanishing from the sheet.
    defaultOrder().concat(extras).forEach(function (k) {
      if (k === 'idx' || k === 'del' || seen[k] || !known[k]) return;
      seen[k] = true; out.push(k);
    });
    return ['idx'].concat(out, ['del']);
  }

  function normalizeWidths(page, widths) {
    var out = {};
    defaultOrder().concat(extraFields().map(function (f) { return extraKey(f.id); })).forEach(function (k) {
      var src = widths && typeof widths === 'object' ? widths : {};
      out[k] = clampWidth(page, k, Object.prototype.hasOwnProperty.call(src, k) ? src[k] : defWidth(page, k));
    });
    return out;
  }

  function normalizeBands(bands) {
    var out = [];
    (Array.isArray(bands) ? bands : []).forEach(function (b, i) {
      if (!b || typeof b !== 'object') return;
      var min = parseFloat(b.min);
      if (!isFinite(min) || min < 0) min = 0;
      min = i === 0 ? 0 : Math.max(min, out.length ? out[out.length - 1].min + 0.01 : 0);
      min = Math.round(min * 100) / 100;
      if (out.length && min <= out[out.length - 1].min) return;
      var src = b.pcts || b;   // `pcts` is the saved shape; flat keys are legacy.
      var pcts = { sell: numPct(src.sell), whole: numPct(src.whole), minPrice: numPct(src.minPrice) };
      extraFields().forEach(function (f) { pcts[extraKey(f.id)] = numPct(src.extras ? src.extras[f.id] : src[extraKey(f.id)]); });
      out.push({ min: min, pcts: pcts });
    });
    if (!out.length) out.push({ min: 0, pcts: { sell: 0, whole: 0 } });
    return out;
  }
  function numPct(v) {
    var n = parseFloat(v);
    if (!isFinite(n)) return 0;
    return Math.max(-99, Math.min(1000, Math.round(n * 100) / 100));
  }
  function defaultBands() { return [{ min: 0, pcts: { sell: 0, whole: 0, minPrice: 0 } }]; }

  function defaults() {
    return {
      order: defaultOrder(),
      widths: { 'quick-entry': normalizeWidths(PAGE_QE, {}), 'smart-add': normalizeWidths(PAGE_SMART, {}) },
      autoFill: { enabled: false, bands: defaultBands() },
    };
  }

  function load() {
    var d = defaults();
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (!raw) return d;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return d;
      d.order = normalizeOrder(o.order);
      d.widths[PAGE_QE] = normalizeWidths(PAGE_QE, o.widths && o.widths[PAGE_QE]);
      d.widths[PAGE_SMART] = normalizeWidths(PAGE_SMART, o.widths && o.widths[PAGE_SMART]);
      if (o.autoFill && typeof o.autoFill === 'object') {
        d.autoFill.enabled = o.autoFill.enabled === true;
        d.autoFill.bands = normalizeBands(o.autoFill.bands);
      }
    } catch (e) {}
    return d;
  }
  function persist(cfg) {
    try { root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  var saved = load();
  var draft = null;
  var panelPage = PAGE_QE;
  var panelOpen = false;
  var listeners = [];

  function onApply(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function current() { return panelOpen && draft ? draft : saved; }
  function notify() {
    var cfg = current();
    listeners.forEach(function (fn) { try { fn(cfg); } catch (e) {} });
    try {
      if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('zmt:form-layout-changed', { detail: clone(cfg) }));
    } catch (e) {}
  }
  function save(cfg) {
    // Keep the two structural invariants true no matter who calls save():
    // # first, delete last, every known field present exactly once.
    if (cfg && cfg.order) cfg.order = normalizeOrder(cfg.order);
    if (cfg && cfg.autoFill && cfg.autoFill.bands) cfg.autoFill.bands = normalizeBands(cfg.autoFill.bands);
    saved = cfg;
    draft = clone(cfg);
    persist(saved);
    notify();
    return saved;
  }
  // Programmatic / immediate change (buttons, verifiers, cross-window sync).
  function setLive(patch) {
    var next = clone(saved);
    if (patch && patch.order) next.order = normalizeOrder(patch.order);
    if (patch && patch.widths) {
      if (patch.widths[PAGE_QE]) next.widths[PAGE_QE] = normalizeWidths(PAGE_QE, patch.widths[PAGE_QE]);
      if (patch.widths[PAGE_SMART]) next.widths[PAGE_SMART] = normalizeWidths(PAGE_SMART, patch.widths[PAGE_SMART]);
    }
    if (patch && patch.autoFill) {
      if (typeof patch.autoFill.enabled === 'boolean') next.autoFill.enabled = patch.autoFill.enabled;
      if (patch.autoFill.bands) next.autoFill.bands = normalizeBands(patch.autoFill.bands);
    }
    return save(next);
  }
  function reset() { return save(defaults()); }

  /* ---------- layout helpers used by both pages ------------------------ */
  function orderFor(page) {
    var cfg = current();
    var nativeByKey = {};
    FIELDS.forEach(function (f) { nativeByKey[f.key] = f.native[isPage(page)] || null; });
    var out = [];
    cfg.order.forEach(function (k) {
      var n = isExtraKey(k) ? (isPage(page) === PAGE_SMART ? k : null) : nativeByKey[k];
      if (n) out.push(n);
    });
    return out;
  }
  function widthFor(page, nativeKey) {
    var canon = nativeToCanonical(nativeKey);
    return clampWidth(isPage(page), canon, current().widths[isPage(page)][canon]);
  }
  function nativeToCanonical(nativeKey) {
    var k = String(nativeKey || '');
    if (isExtraKey(k)) return k;
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i];
      if (f.native[PAGE_QE] === k || f.native[PAGE_SMART] === k) return f.key;
    }
    return k;
  }
  function sortKeys(nativeKeys, page) {
    var rank = {};
    orderFor(page).forEach(function (k, i) { rank[k] = i; });
    return (nativeKeys || []).slice().sort(function (a, b) {
      var ra = rank[a] == null ? 9999 : rank[a];
      var rb = rank[b] == null ? 9999 : rank[b];
      return ra - rb;
    });
  }
  // CSS track list for a set of already-ordered native column keys.
  function tracksFor(page, nativeCols, opts) {
    var p = isPage(page);
    var wide = nativeCols.indexOf(p === PAGE_SMART ? 'name' : 'product') >= 0;
    return nativeCols.map(function (k) {
      var w = widthFor(p, k);
      var canon = nativeToCanonical(k);
      var hiddenAmount = canon === 'amount' && opts && opts.amountOff;
      if (hiddenAmount) return '0px';
      return (wide && canon === 'product') ? ('minmax(' + w + 'px,2fr)') : (w + 'px');
    }).join(' ');
  }
  function minWidthFor(page, nativeCols, opts) {
    var p = isPage(page);
    var total = 0;
    nativeCols.forEach(function (k) {
      var canon = nativeToCanonical(k);
      if (canon === 'amount' && opts && opts.amountOff) return;
      // minmax(min,2fr) contributes its min to the grid's intrinsic width.
      total += widthFor(p, k);
    });
    return total;
  }

  /* ---------- exact decimal percentage --------------------------------- */
  function decParts(v) {
    var s = String(v == null ? '' : v).trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) s = String(parseFloat(v) || 0);
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    var p = s.split('.');
    var frac = p[1] || '';
    return { neg: neg, n: parseInt((p[0] || '0') + frac, 10) || 0, d: frac.length };
  }
  function pow10(n) { var r = 1; for (var i = 0; i < n; i++) r *= 10; return r; }
  function fmtRatio(num, den) {
    if (!isFinite(num) || !isFinite(den) || den <= 0) return '0';
    var sign = num < 0 ? '-' : '';
    num = Math.abs(num);
    var ip = Math.floor(num / den);
    var rem = num - ip * den;
    if (!rem) return sign + ip;
    var digits = '', seen = {};
    for (var i = 0; i < 12 && rem && !seen[rem]; i++) {
      seen[rem] = 1;
      rem *= 10;
      var d = Math.floor(rem / den);
      digits += String(d);
      rem -= d * den;
    }
    digits = digits.replace(/0+$/, '');
    return sign + ip + (digits ? '.' + digits : '');
  }
  // base × (1 + pct/100), written without Math.round and without float noise.
  function applyPercent(base, pct) {
    var b = decParts(base), f = decParts(pct);
    var factor = 100 * pow10(f.d) + (f.neg ? -f.n : f.n);
    if (factor < 0) factor = 0;                  // a price never goes negative
    var num = b.n * factor;
    var den = pow10(b.d) * 100 * pow10(f.d);
    var out = fmtRatio(num, den);
    if (b.neg && parseFloat(out) !== 0) out = '-' + out;
    return out;
  }

  function bandFor(base, bands) {
    var n = parseFloat(base) || 0;
    var hit = null;
    (bands || []).forEach(function (b) { if (n >= b.min) hit = b; });
    return hit || (bands && bands[0]) || { min: 0, pcts: {} };
  }
  function isEmptyValue(v) {
    return v == null || String(v).trim() === '' || parseFloat(v) === 0;
  }

  /** Fill sell / wholesale / extra price cells from the current band.
      state = { locked:{}, auto:{} } stored on the page's row object.
      targets = [{ key:'sell', value:row.sell, set:function(v){...} }, ...]
      mode 'toggle' → only genuinely empty cells; 'buy' → unlocked cells that
      were previously auto-filled (plus empty ones). Returns change count. */
  function fillRow(base, state, targets, mode) {
    var cfg = current();
    if (!cfg.autoFill.enabled) return 0;
    if (!state || typeof state !== 'object') return 0;
    if (!state.locked) state.locked = {};
    if (!state.auto) state.auto = {};
    var band = bandFor(base, cfg.autoFill.bands);
    var changed = 0;
    (targets || []).forEach(function (t) {
      if (!t || state.locked[t.key]) return;
      var empty = isEmptyValue(t.value);
      if (mode === 'buy') {
        if (!empty && !state.auto[t.key]) return;   // manual / product value wins
      } else if (!empty) return;                    // fill only empty fields
      var pct = (band.pcts && band.pcts[t.key]) || 0;
      var out = applyPercent(base, pct);
      if (String(t.value) === out) { state.auto[t.key] = true; return; }
      t.set(out);
      state.auto[t.key] = true;
      changed++;
    });
    return changed;
  }
  function lockPrice(state, key) {
    if (!state) return;
    if (!state.locked) state.locked = {};
    if (!state.auto) state.auto = {};
    state.locked[key] = true;
    state.auto[key] = false;
  }
  function priceState(row) {
    if (!row) return { locked: {}, auto: {} };
    if (!row._priceState || typeof row._priceState !== 'object') row._priceState = { locked: {}, auto: {} };
    return row._priceState;
  }

  /* ---------- settings panel ------------------------------------------- */
  var flBuilt = false;
  var activeTab = 'order';
  var widthPage = PAGE_QE;
  var statusTimer = 0;

  function $(id) { return (root.document && root.document.getElementById) ? root.document.getElementById(id) : null; }

  function build() {
    if (flBuilt) return;
    if (!root.document || !root.document.body) return;
    flBuilt = true;
    var o = root.document.createElement('div');
    o.className = 'modal-overlay fl-overlay';
    o.id = 'flOverlay';
    o.setAttribute('style', 'display:none');
    o.innerHTML =
      '<div class="modal fl-modal" role="dialog" aria-modal="true" aria-labelledby="flTitle">' +
        '<div class="modal-header fl-header"><h3 id="flTitle"></h3>' +
          '<button class="modal-close" id="flClose" type="button">&times;</button></div>' +
        '<div class="fl-tabs" role="tablist">' +
          '<button type="button" class="fl-tab is-active" data-fl-tab="order" onclick="FormLayout.uiTab(\'order\')"></button>' +
          '<button type="button" class="fl-tab" data-fl-tab="width" onclick="FormLayout.uiTab(\'width\')"></button>' +
          '<button type="button" class="fl-tab" data-fl-tab="auto" onclick="FormLayout.uiTab(\'auto\')"></button>' +
        '</div>' +
        '<div class="modal-body fl-body">' +
          '<div class="fl-help" id="flHelp"></div>' +
          '<div class="fl-pane" id="flPaneOrder"></div>' +
          '<div class="fl-pane" id="flPaneWidth" style="display:none"></div>' +
          '<div class="fl-pane" id="flPaneAuto" style="display:none"></div>' +
        '</div>' +
        '<div class="modal-footer fl-footer"><span class="fl-status" id="flStatus"></span>' +
          '<div class="fl-actions">' +
            '<button type="button" class="btn fl-reset" id="flReset" onclick="FormLayout.uiReset()"></button>' +
            '<button type="button" class="btn btn-primary fl-save" id="flSave" onclick="FormLayout.uiSave()"></button>' +
          '</div></div>' +
      '</div>';
    root.document.body.appendChild(o);
    var close = $('flClose');
    if (close) close.addEventListener('click', function () { closePanel(); });
    o.addEventListener('mousedown', function (e) { if (e.target === o) closePanel(); });
    if (root.document.addEventListener) {
      root.document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && o.style.display !== 'none') closePanel();
      });
    }
    refreshLabels();
  }

  function fieldLabel(k) {
    if (isExtraKey(k)) {
      var f = extraFields().find(function (x) { return extraKey(x.id) === k; });
      return f ? f.name : k;
    }
    var d = BY_KEY[k];
    return d ? T(d.label, d.fb) : k;
  }
  function isHiddenField(k) {
    var d = BY_KEY[k];
    if (!d || !d.fv || !root.FV || !root.FV.isVisible) return false;
    return root.FV.isVisible(d.fv) === false;
  }
  function dragHtml(k) {
    return '<span class="fl-grip" title="' + esc(T('formLayout.drag', 'اسحب أو استخدم الأسهم')) + '">⋮⋮</span>';
  }

  function renderOrder() {
    var box = $('flPaneOrder');
    if (!box) return;
    var rows = draft.order.map(function (k, i) {
      var d = BY_KEY[k];
      var fixed = d && d.fixed;
      var hidden = isHiddenField(k);
      var badge = fixed
        ? '<span class="fl-fixed">' + esc(T(fixed === 'first' ? 'formLayout.fixedFirst' : 'formLayout.fixedLast', fixed === 'first' ? 'ثابت' : 'ثابت')) + '</span>'
        : (hidden ? '<span class="fl-hidden">' + esc(T('formLayout.hiddenFv', 'مخفي — يبقى في مكانه')) + '</span>' : '');
      var up = fixed ? '' : '<button type="button" class="fl-mini" ' + (i === 1 ? 'disabled' : '') + ' onclick="FormLayout.uiMoveField(\'' + k + '\',-1)" title="↑">↑</button>';
      var down = fixed ? '' : '<button type="button" class="fl-mini" ' + (i === draft.order.length - 2 ? 'disabled' : '') + ' onclick="FormLayout.uiMoveField(\'' + k + '\',1)" title="↓">↓</button>';
      return '<div class="fl-order-item' + (fixed ? ' is-fixed' : '') + (hidden ? ' is-hidden' : '') + '" data-fl-key="' + esc(k) + '"' + (fixed ? '' : ' draggable="true"') + '>' +
        (fixed ? '<span class="fl-grip is-locked">⌾</span>' : dragHtml(k)) +
        '<span class="fl-order-label">' + esc(fieldLabel(k)) + '</span>' + badge +
        '<span class="fl-order-btns">' + up + down + '</span></div>';
    }).join('');
    box.innerHTML = '<div class="fl-order-head">' + esc(T('formLayout.orderHead', 'الترتيب مشترك بين الإدخال السريع والإضافة الذكية')) + '</div>' +
      '<div class="fl-order-list" id="flOrderList">' + rows + '</div>';
    bindDrag();
  }
  function bindDrag() {
    var list = $('flOrderList');
    if (!list || !list.addEventListener) return;
    var from = null;
    list.addEventListener('dragstart', function (e) {
      var item = e.target && e.target.closest ? e.target.closest('.fl-order-item') : null;
      if (!item || !item.getAttribute('draggable')) { if (e.preventDefault) e.preventDefault(); return; }
      from = item.getAttribute('data-fl-key');
      item.classList.add('is-dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', from); } catch (x) {} }
    });
    list.addEventListener('dragover', function (e) {
      var item = e.target && e.target.closest ? e.target.closest('.fl-order-item') : null;
      if (item && item.getAttribute('draggable') && e.preventDefault) e.preventDefault();
    });
    list.addEventListener('drop', function (e) {
      var item = e.target && e.target.closest ? e.target.closest('.fl-order-item') : null;
      if (!from || !item || !item.getAttribute('draggable')) return;
      if (e.preventDefault) e.preventDefault();
      uiMoveTo(from, item.getAttribute('data-fl-key'));
      from = null;
    });
    list.addEventListener('dragend', function () {
      from = null;
      var all = list.querySelectorAll('.is-dragging');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('is-dragging');
    });
  }

  function renderWidth() {
    var box = $('flPaneWidth');
    if (!box) return;
    var tabs = '<div class="fl-page-tabs">' +
      '<button type="button" class="fl-page-tab' + (widthPage === PAGE_QE ? ' is-active' : '') + '" onclick="FormLayout.uiWidthPage(\'quick-entry\')">' + esc(T('formLayout.pageQe', 'الإدخال السريع (F1)')) + '</button>' +
      '<button type="button" class="fl-page-tab' + (widthPage === PAGE_SMART ? ' is-active' : '') + '" onclick="FormLayout.uiWidthPage(\'smart-add\')">' + esc(T('formLayout.pageSmart', 'الإضافة الذكية')) + '</button></div>';
    var rows = draft.order.filter(function (k) {
      var d = BY_KEY[k];
      return !(d && d.fixed);
    }).map(function (k) {
      var r = widthRange(widthPage, k);
      var v = clampWidth(widthPage, k, draft.widths[widthPage][k]);
      return '<div class="fl-width-row" data-fl-key="' + esc(k) + '">' +
        '<div class="fl-width-top"><span>' + esc(fieldLabel(k)) + '</span>' +
          '<span class="fl-width-val"><b class="fl-width-num">' + v + '</b> ' + esc(T('display.px', 'px')) +
          '<button type="button" class="fl-mini fl-width-reset" onclick="FormLayout.uiResetWidth(\'' + esc(k) + '\')" title="' + esc(T('formLayout.resetField', 'افتراضي')) + '">↺</button></span></div>' +
        '<input type="range" class="fl-range" min="' + r.min + '" max="' + r.max + '" step="1" value="' + v + '" oninput="FormLayout.uiSetWidth(\'' + esc(k) + '\',this.value,\'range\')">' +
        '<input type="number" class="fl-num" min="' + r.min + '" max="' + r.max + '" step="1" value="' + v + '" onchange="FormLayout.uiSetWidth(\'' + esc(k) + '\',this.value,\'num\')" onblur="FormLayout.uiSetWidth(\'' + esc(k) + '\',this.value,\'num\')">' +
      '</div>';
    }).join('');
    box.innerHTML = tabs + '<div class="fl-width-list">' + rows + '</div>';
  }

  function renderAuto() {
    var box = $('flPaneAuto');
    if (!box) return;
    var on = !!draft.autoFill.enabled;
    var extras = extraFields();
    var head =
      '<div class="fl-auto-toggle' + (on ? ' is-on' : '') + '">' +
        '<button type="button" class="fl-switch" id="flAutoSwitch" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" onclick="FormLayout.uiToggleAuto()"><span></span></button>' +
        '<div><b id="flAutoState">' + esc(T(on ? 'formLayout.autoOn' : 'formLayout.autoOff', on ? 'مفعّل' : 'موقف')) + '</b>' +
        '<small>' + esc(T('formLayout.autoBase', 'الأساس دائمًا هو سعر الشراء — لا يتم تغيير أي حقل كُتب يدويًا')) + '</small></div></div>' +
      '<div class="fl-band-help">' + esc(T('formLayout.bandHelp', 'أدخل الحد الأدنى لكل نطاق فقط. النطاق الأول يبدأ من 0 والأخير إلى ما لا نهاية؛ الحد الأعلى يُشتق تلقائيًا من الحد التالي بلا فجوات ولا تداخل.')) + '</div>';
    var cols = '<div class="fl-band-row fl-band-head"><span>' + esc(T('formLayout.from', 'من')) + '</span><span>' + esc(T('formLayout.to', 'إلى')) + '</span>' +
      '<span>' + esc(T('quickEntry.sellPrice', 'بيع %')) + '</span><span>' + esc(T('quickEntry.wholesalePrice', 'جملة %')) + '</span>' +
      '<span>' + esc(T('quickEntry.minPrice', 'السعر الأدنى')) + '</span>' +
      extras.map(function (f) { return '<span style="color:' + esc(f.color) + '">' + esc(f.name) + ' %</span>'; }).join('') +
      '<span></span></div>';
    var rows = draft.autoFill.bands.map(function (b, i) {
      var next = draft.autoFill.bands[i + 1];
      var upper = next ? ('&lt; ' + next.min) : '∞';
      var minCell = i === 0
        ? '<b class="fl-band-zero">0</b>'
        : '<input type="number" step="0.01" min="' + (draft.autoFill.bands[i - 1].min + 0.01) + '" value="' + b.min + '" onchange="FormLayout.uiSetBandMin(' + i + ',this.value)">';
      return '<div class="fl-band-row">' + minCell +
        '<span class="fl-band-upper">' + upper + '</span>' +
        '<input type="number" step="0.01" value="' + (b.pcts.sell || 0) + '" onchange="FormLayout.uiSetBandPct(' + i + ',\'sell\',this.value)">' +
        '<input type="number" step="0.01" value="' + (b.pcts.whole || 0) + '" onchange="FormLayout.uiSetBandPct(' + i + ',\'whole\',this.value)">' +
        '<input type="number" step="0.01" value="' + (b.pcts.minPrice || 0) + '" onchange="FormLayout.uiSetBandPct(' + i + ',\'minPrice\',this.value)">' +
        extras.map(function (f) {
          return '<input type="number" step="0.01" value="' + (b.pcts[extraKey(f.id)] || 0) + '" onchange="FormLayout.uiSetBandPct(' + i + ',\'' + extraKey(f.id) + '\',this.value)">';
        }).join('') +
        '<button type="button" class="fl-mini fl-band-del" ' + (i === 0 ? 'disabled' : '') + ' onclick="FormLayout.uiRemoveBand(' + i + ')" title="' + esc(T('formLayout.removeBand', 'حذف النطاق')) + '">×</button></div>';
    }).join('');
    box.innerHTML = head + cols + '<div class="fl-band-list">' + rows + '</div>' +
      '<button type="button" class="btn btn-sm fl-add-band" onclick="FormLayout.uiAddBand()"><i class="fas fa-plus"></i> ' + esc(T('formLayout.addBand', 'إضافة نطاق')) + '</button>';
  }

  function render() {
    if (!flBuilt) return;
    var tabs = root.document.querySelectorAll('.fl-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-fl-tab') === activeTab);
    ['order', 'width', 'auto'].forEach(function (t) {
      var p = $('flPane' + t.charAt(0).toUpperCase() + t.slice(1));
      if (p) p.style.display = (t === activeTab) ? '' : 'none';
    });
    var help = $('flHelp');
    if (help) help.textContent = T('flHelp' + activeTab.charAt(0).toUpperCase() + activeTab.slice(1), {
      order: T('formLayout.orderHelp', 'اسحب الحقل أو استخدم ↑ ↓. الترتيب نفسه يُطبَّق في الشاشتين؛ رقم السطر وزر الحذف ثابتان.', ''),
      width: T('formLayout.widthHelp', 'عرض كل حقل مستقل لكل شاشة. 0 لا يعني تلقائي هنا — القيم محصورة بين الحد الأدنى والأقصى.'),
      auto: T('formLayout.autoHelp', 'يعمل الملء فقط على الحقول الفارغة، ويُثبَّت أي حقل عدّلته يدويًا.')
    }[activeTab]);
    renderOrder(); renderWidth(); renderAuto();
  }

  function openPanel(page) {
    build();
    if (!flBuilt) return;
    panelPage = isPage(page);
    widthPage = panelPage;
    activeTab = 'order';
    draft = clone(saved);
    panelOpen = true;
    var o = $('flOverlay');
    if (o) o.style.display = 'flex';
    refreshLabels();
    render();
    notify();                     // preview uses the draft from now on
  }
  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    draft = null;
    var o = $('flOverlay');
    if (o) o.style.display = 'none';
    notify();                     // discard the draft, restore saved layout
  }

  /* ---------- panel UI actions (also callable from tests) -------------- */
  function uiTab(tab) {
    if (['order', 'width', 'auto'].indexOf(tab) < 0) return;
    activeTab = tab; render();
  }
  function uiWidthPage(p) { widthPage = isPage(p); renderWidth(); }
  function uiMoveField(key, dir) {
    var i = draft.order.indexOf(key);
    if (i < 0) return;
    var d = BY_KEY[key];
    if (d && d.fixed) return;
    var j = i + dir;
    if (j < 1 || j > draft.order.length - 2) return;
    var tmp = draft.order[i]; draft.order[i] = draft.order[j]; draft.order[j] = tmp;
    renderOrder(); notify();
  }
  function uiMoveTo(key, target) {
    if (key === target) return;
    var a = draft.order.indexOf(key), b = draft.order.indexOf(target);
    if (a < 1 || b < 1 || a > draft.order.length - 2 || b > draft.order.length - 2) return;
    draft.order.splice(a, 1);
    draft.order.splice(draft.order.indexOf(target), 0, key);
    renderOrder(); notify();
  }
  function uiSetWidth(key, raw, source) {
    if (!(key in draft.widths[widthPage])) return;
    var v = clampWidth(widthPage, key, raw);
    draft.widths[widthPage][key] = v;
    var row = root.document.querySelector('.fl-width-row[data-fl-key="' + key + '"]');
    if (row) {
      var num = row.querySelector('.fl-width-num'); if (num) num.textContent = v;
      var range = row.querySelector('.fl-range'); if (range && source !== 'range') range.value = v;
      var n = row.querySelector('.fl-num'); if (n && source !== 'num') n.value = v;
    }
    notify();
  }
  function uiResetWidth(key) {
    draft.widths[widthPage][key] = defWidth(widthPage, key);
    renderWidth(); notify();
  }
  function uiToggleAuto() {
    draft.autoFill.enabled = !draft.autoFill.enabled;
    renderAuto(); notify();
  }
  function uiSetBandMin(i, raw) {
    var b = draft.autoFill.bands[i];
    if (!b || i === 0) return;
    var prev = draft.autoFill.bands[i - 1].min;
    var next = draft.autoFill.bands[i + 1] ? draft.autoFill.bands[i + 1].min : Infinity;
    var v = parseFloat(raw);
    if (!isFinite(v)) return;
    v = Math.max(Math.round((prev + 0.01) * 100) / 100, Math.min(Math.round((next - 0.01) * 100) / 100, v));
    b.min = Math.round(v * 100) / 100;
    renderAuto(); notify();
  }
  function uiSetBandPct(i, key, raw) {
    var b = draft.autoFill.bands[i];
    if (!b || !b.pcts || !(key in b.pcts)) return;
    b.pcts[key] = numPct(raw);
    notify();                     // keep the caret: the input is not re-rendered
  }
  function uiAddBand() {
    var bands = draft.autoFill.bands;
    var last = bands[bands.length - 1];
    bands.push({ min: Math.round((last.min + 100) * 100) / 100, pcts: (function () {
      var p = { sell: 0, whole: 0, minPrice: 0 };
      extraFields().forEach(function (f) { p[extraKey(f.id)] = 0; });
      return p;
    })() });
    renderAuto(); notify();
  }
  function uiRemoveBand(i) {
    if (i <= 0 || draft.autoFill.bands.length <= 1) return;
    draft.autoFill.bands.splice(i, 1);
    renderAuto(); notify();
  }
  function uiSave() {
    if (!panelOpen) return;
    var next = clone(draft);
    next.order = normalizeOrder(next.order);
    next.widths = { 'quick-entry': normalizeWidths(PAGE_QE, next.widths[PAGE_QE]), 'smart-add': normalizeWidths(PAGE_SMART, next.widths[PAGE_SMART]) };
    next.autoFill.bands = normalizeBands(next.autoFill.bands);
    panelOpen = false;
    draft = null;
    var o = $('flOverlay'); if (o) o.style.display = 'none';
    save(next);
  }
  function uiReset() {
    if (!panelOpen) return;
    draft = defaults();
    render(); notify();
  }

  /* ---------- labels / boot -------------------------------------------- */
  function refreshLabels() {
    var title = $('flTitle');
    if (title) title.textContent = T('formLayout.title', 'إعدادات نماذج الإدخال');
    var set = function (id, txt) { var e = $(id); if (e) e.textContent = txt; };
    var tabs = root.document ? root.document.querySelectorAll('.fl-tab') : [];
    if (tabs[0]) tabs[0].textContent = T('formLayout.tabOrder', 'ترتيب الحقول');
    if (tabs[1]) tabs[1].textContent = T('formLayout.tabWidth', 'عرض الأعمدة');
    if (tabs[2]) tabs[2].textContent = T('formLayout.tabAuto', 'الملء التلقائي');
    set('flSave', T('display.save', 'حفظ التغييرات'));
    set('flReset', T('formLayout.resetAll', 'إعادة الضبط'));
    set('flClose', '×');
    if (flBuilt) render();
  }

  function boot() {
    if (root.addEventListener) {
      root.addEventListener('zmt:language', refreshLabels);
      root.addEventListener('storage', function (e) {
        if (e && e.key && e.key !== KEY) return;
        var fresh = load();
        saved = fresh;
        if (panelOpen) { draft = clone(fresh); render(); }
        notify();
      });
    }
    refreshLabels();
  }
  if (root.document && root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
  else boot();

  var api = {
    KEY: KEY, FIELDS: FIELDS, PAGE_QE: PAGE_QE, PAGE_SMART: PAGE_SMART,
    defaults: defaults, load: load, save: save, setLive: setLive, reset: reset,
    current: current, onApply: onApply, refreshLabels: refreshLabels,
    orderFor: orderFor, widthFor: widthFor, sortKeys: sortKeys,
    tracksFor: tracksFor, minWidthFor: minWidthFor, nativeToCanonical: nativeToCanonical,
    isExtraKey: isExtraKey, extraKey: extraKey, extraId: extraId,
    applyPercent: applyPercent, bandFor: bandFor, fillRow: fillRow,
    priceState: priceState, lockPrice: lockPrice, enabled: function () { return !!current().autoFill.enabled; },
    bands: function () { return clone(current().autoFill.bands); },
    open: openPanel, close: closePanel,
    uiTab: uiTab, uiWidthPage: uiWidthPage, uiMoveField: uiMoveField, uiMoveTo: uiMoveTo,
    uiSetWidth: uiSetWidth, uiResetWidth: uiResetWidth, uiToggleAuto: uiToggleAuto,
    uiSetBandMin: uiSetBandMin, uiSetBandPct: uiSetBandPct, uiAddBand: uiAddBand,
    uiRemoveBand: uiRemoveBand, uiSave: uiSave, uiReset: uiReset,
  };
  root.FormLayout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
