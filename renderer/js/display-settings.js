/* ============================================================
   ZMT PIECE — إعدادات العرض (Display Settings)
   ------------------------------------------------------------
   A single top-bar button opens a panel that controls eight purely
   visual values plus two invoice-column switches (Référence / Marque). They are stored per device in localStorage and
   applied as CSS variables on <html>, so every open page reflows
   instantly — no reload, no rebuild:

     --sales-card-min   حجم بطاقات البيع            (140 – 420 px)
     --inv-card-min     حجم بطاقات المخزون          (150 – 450 px)
     --sales-card-h     ارتفاع بطاقات البيع         (0 = تلقائي – 520 px)
     --inv-card-h       ارتفاع بطاقات المخزون       (0 = تلقائي – 520 px)
     --sidebar-width    عرض القائمة الجانبية        (120 – 400 px)
     --sales-name-size  خط أسماء منتجات البيع       (10 – 32  px)
     --prod-name-size   خط أسماء منتجات المخزون     (10 – 40  px)
     --sales-cart-width عرض سلة البيع                (300 – 700 px)

   Nothing here ever touches the database, so invoices, stock,
   printing, reports and LAN sync are 100% unaffected.

   Behaviour contract (matches the request):
     • «حفظ التغييرات» is disabled until something actually changed.
     • Dragging/saving only previews live; nothing is written until Save.
     • Closing without saving restores the last saved values.
     • «إعادة الضبط» restores the exact first-install defaults.
   ============================================================ */
(function () {
  'use strict';

  var DS_KEY = 'zmt_display_settings';

  /* key -> CSS var, hard range, factory default, icon, label */
  var DS_ITEMS = [
    { key: 'salesCard', css: '--sales-card-min',  min: 140, max: 420, def: 240, icon: 'fas fa-cart-plus',   label: 'display.salesCards', flabel: 'حجم بطاقات البيع' },
    { key: 'invCard',   css: '--inv-card-min',    min: 150, max: 450, def: 260, icon: 'fas fa-warehouse',   label: 'display.invCards',   flabel: 'حجم بطاقات المخزون' },
    // 0 means "auto": factory look is unchanged; internal scrolling in the grid
    // keeps every field/button reachable at any smaller fixed height.
    { key: 'salesHeight', css: '--sales-card-h', min: 0, max: 520, def: 0, zeroAuto: true, icon: 'fas fa-arrows-alt-v', label: 'display.salesHeight', flabel: 'ارتفاع بطاقات البيع' },
    { key: 'invHeight', css: '--inv-card-h', min: 0, max: 520, def: 0, zeroAuto: true, icon: 'fas fa-ruler-vertical', label: 'display.invHeight', flabel: 'ارتفاع بطاقات المخزون' },
    { key: 'sidebar',   css: '--sidebar-width',   min: 120, max: 400, def: 240, icon: 'fas fa-columns',     label: 'display.sidebar',    flabel: 'عرض القائمة الجانبية' },
    { key: 'salesName', css: '--sales-name-size', min: 10,  max: 32,  def: 13,  icon: 'fas fa-text-height', label: 'display.salesName',  flabel: 'خط أسماء منتجات البيع' },
    { key: 'invName',   css: '--prod-name-size',  min: 10,  max: 40,  def: 16,  icon: 'fas fa-font',        label: 'display.invName',    flabel: 'خط أسماء منتجات المخزون' },
    { key: 'salesCart', css: '--sales-cart-width', min: 300, max: 700, def: 420, icon: 'fas fa-shopping-cart', label: 'display.salesCart', flabel: 'عرض سلة البيع' }
  ];

  var DS_BY_KEY = {};
  DS_ITEMS.forEach(function (it) { DS_BY_KEY[it.key] = it; });

  /* Two independent invoice-column switches. They deliberately use `name`
     (not `key`) so they never enter the slider pipeline: dsApply() writes CSS
     pixels only for DS_ITEMS. Both default to hidden exactly like the existing
     invoice-format choice — nothing changes on a fresh install. */
  var DS_SWITCHES = [
    { name: 'invShowReference', label: 'display.invShowReference', flabel: 'Référence', icon: 'fas fa-barcode' },
    { name: 'invShowMark',      label: 'display.invShowMark',      flabel: 'Marque',      icon: 'fas fa-tag' }
  ];
  function dsSwitchOn(v) { return v === true || v === 1 || v === '1' || v === 'true'; }

  /* The panel header icon: three sliders (the universal "display / view
     settings" glyph). Drawn inline so it never depends on a font. */
  var DS_SVG =
    '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
      '<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">' +
        '<path d="M3 7h4.6"/><path d="M12.4 7h8.6"/>' +
        '<path d="M3 12h10.6"/><path d="M18.4 12h2.6"/>' +
        '<path d="M3 17h6.6"/><path d="M14.4 17h6.6"/>' +
      '</g>' +
      '<g fill="currentColor">' +
        '<circle cx="10" cy="7" r="2.5"/><circle cx="16" cy="12" r="2.5"/><circle cx="12" cy="17" r="2.5"/>' +
      '</g>' +
    '</svg>';

  var dsSaved = null;     // persisted baseline
  var dsDraft = null;     // what the panel is editing (live preview)
  var dsBuilt = false;
  var dsStatusTimer = 0;

  /* ---------- values ---------- */

  function dsDefaults() {
    var o = {};
    DS_ITEMS.forEach(function (it) { o[it.key] = it.def; });
    DS_SWITCHES.forEach(function (sw) { o[sw.name] = false; });
    return o;
  }

  function dsClamp(key, v) {
    var it = DS_BY_KEY[key];
    if (!it) return 0;
    var n = parseInt(v, 10);
    if (!isFinite(n)) n = it.def;
    if (n < it.min) n = it.min;
    if (n > it.max) n = it.max;
    return n;
  }

  function dsLoad() {
    var out = dsDefaults();
    try {
      var raw = localStorage.getItem(DS_KEY);
      if (!raw) return out;
      var obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        DS_ITEMS.forEach(function (it) {
          if (Object.prototype.hasOwnProperty.call(obj, it.key)) out[it.key] = dsClamp(it.key, obj[it.key]);
        });
        DS_SWITCHES.forEach(function (sw) {
          if (Object.prototype.hasOwnProperty.call(obj, sw.name)) out[sw.name] = dsSwitchOn(obj[sw.name]);
        });
      }
    } catch (e) { /* corrupted value -> factory defaults, never a broken UI */ }
    return out;
  }

  function dsPersist(cfg) {
    try { localStorage.setItem(DS_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function dsApply(cfg) {
    var root = document.documentElement;
    DS_ITEMS.forEach(function (it) {
      var v = dsClamp(it.key, cfg[it.key]);
      // Height sliders use 0 as a real value ("auto"), not as a missing value.
      root.style.setProperty(it.css, (it.zeroAuto && v === 0) ? 'auto' : v + 'px');
    });
    // The sales cart width must also reach the live POS layout, which sets an
    // inline grid template when the page is open (drag handle / slider share
    // this single value).
    if (typeof window.applySalesCartWidth === 'function') {
      try { window.applySalesCartWidth(dsClamp('salesCart', cfg.salesCart), false); } catch (e) {}
    }
  }

  function dsIsDefault(cfg) {
    var d = dsDefaults();
    return DS_ITEMS.every(function (it) { return cfg[it.key] === d[it.key]; }) &&
      DS_SWITCHES.every(function (sw) { return !!cfg[sw.name] === !!d[sw.name]; });
  }

  function T(key, fb) {
    try {
      var v = (typeof window.t === 'function') ? window.t(key) : '';
      return v || fb || key;
    } catch (e) { return fb || key; }
  }

  function $(id) { return document.getElementById(id); }

  /* ---------- build the panel (once) ---------- */

  function dsBuild() {
    if (dsBuilt) return;
    dsBuilt = true;

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay ds-overlay';
    overlay.id = 'dsOverlay';
    overlay.style.display = 'none';
    overlay.innerHTML =
      '<div class="modal ds-modal" role="dialog" aria-modal="true" aria-labelledby="dsTitleText">' +
        '<div class="modal-header ds-header">' +
          '<h3 id="dsTitle"><span class="ds-header-icon">' + DS_SVG + '</span>' +
            '<span id="dsTitleText">إعدادات العرض</span></h3>' +
          '<button class="modal-close" id="dsClose" type="button">&times;</button>' +
        '</div>' +
        '<div class="modal-body ds-body">' +
          '<div class="ds-hint"><i class="fas fa-lightbulb"></i><span id="dsHintText"></span></div>' +
          '<div class="ds-price-tools" id="dsPriceTools">' +
            '<button class="btn ds-price-btn" id="dsApplyMinPrice" type="button"><i class="fas fa-arrow-down"></i><span id="dsApplyMinPriceText">تطبيق نسبة الحد الادنى</span></button>' +
            '<button class="btn ds-price-btn" id="dsApplySellPrice" type="button"><i class="fas fa-tag"></i><span id="dsApplySellPriceText">تطبيق سعر البيع</span></button>' +
          '</div>' +
          '<div class="ds-rows" id="dsRows"></div>' +
          '<div class="ds-preview">' +
            '<div class="ds-preview-head"><i class="fas fa-eye"></i><span id="dsPreviewTitle"></span></div>' +
            '<div class="ds-preview-stage" id="dsPreviewStage">' +
              '<div class="ds-pv">' +
                '<span class="ds-pv-tag" id="dsPvTagSales"></span>' +
                '<div class="prod-card ds-pv-card" id="dsPvSales">' +
                  '<div class="prod-card-title" id="dsPvSalesName"></div>' +
                  '<div class="ds-pv-meta" id="dsPvSalesMeta"></div>' +
                  '<div class="ds-pv-price">2,500.00 DA</div>' +
                '</div>' +
              '</div>' +
              '<div class="ds-pv">' +
                '<span class="ds-pv-tag" id="dsPvTagInv"></span>' +
                '<div class="prod-card ds-pv-card" id="dsPvInv">' +
                  '<div class="prod-card-title" id="dsPvInvName"></div>' +
                  '<div class="ds-pv-meta" id="dsPvInvMeta"></div>' +
                  '<div class="ds-pv-price">1,850.00 DA</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="modal-footer ds-footer">' +
          '<span class="ds-status" id="dsStatus"></span>' +
          '<div class="ds-actions">' +
            '<button class="btn ds-reset" id="dsReset" type="button">' +
              '<i class="fas fa-rotate-left"></i><span id="dsResetText"></span></button>' +
            '<button class="btn btn-primary ds-save" id="dsSave" type="button" disabled>' +
              '<i class="fas fa-check"></i><span id="dsSaveText"></span></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    dsBuildRows();

    $('dsClose').addEventListener('click', dsClose);
    $('dsSave').addEventListener('click', dsSave);
    $('dsReset').addEventListener('click', dsReset);
    $('dsApplyMinPrice').addEventListener('click', function () { dsApplyPrice('minPrice'); });
    $('dsApplySellPrice').addEventListener('click', function () { dsApplyPrice('sellPrice'); });
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) dsClose(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.style.display !== 'none') {
        e.stopPropagation();
        dsClose();
      }
    });
  }

  function dsBuildRows() {
    var wrap = $('dsRows');
    if (!wrap) return;
    wrap.innerHTML = '';
    DS_ITEMS.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'ds-row';
      row.dataset.key = it.key;
      row.innerHTML =
        '<div class="ds-row-top">' +
          '<span class="ds-row-label"><i class="' + it.icon + '"></i>' +
            '<span class="ds-row-name" data-ds-name="' + it.key + '"></span></span>' +
          '<span class="ds-row-val"><b class="ds-row-num"></b> <span class="ds-unit" data-ds-unit="' + it.key + '">px</span></span>' +
        '</div>' +
        '<div class="ds-row-ctrl">' +
          '<input type="range" class="ds-range" min="' + it.min + '" max="' + it.max + '" step="1">' +
          '<input type="number" class="ds-num" min="' + it.min + '" max="' + it.max + '" step="1" inputmode="numeric">' +
        '</div>';

      var range = row.querySelector('.ds-range');
      var num = row.querySelector('.ds-num');
      range.addEventListener('input', function () { dsSet(it.key, range.value, 'range'); });
      num.addEventListener('input', function () { dsSet(it.key, num.value, 'num'); });
      // Enter / arrows / leaving the field always normalise the box to the
      // clamped value, so a half-typed or out-of-range number can never linger.
      num.addEventListener('blur', function () {
        if (num.value === '') dsSyncRow(it.key, 'none');
        else dsSet(it.key, num.value, 'none');
      });
      num.addEventListener('change', function () {
        if (num.value === '') dsSyncRow(it.key, 'none');
        else dsSet(it.key, num.value, 'none');
      });
      num.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { dsSet(it.key, num.value, 'none'); num.blur(); }
      });
      wrap.appendChild(row);
    });

    // Invoice-column switches live in the same panel/storage, but stay outside
    // the slider list so none of the CSS-variable logic touches them.
    var group = document.createElement('div');
    group.className = 'ds-group';
    group.innerHTML = '<i class="fas fa-file-invoice"></i><span data-ds-group="invoiceGroup"></span>';
    wrap.appendChild(group);
    DS_SWITCHES.forEach(function (sw) {
      var row = document.createElement('div');
      row.className = 'ds-row ds-switch-row';
      row.dataset.key = sw.name;
      row.innerHTML =
        '<div class="ds-row-top">' +
          '<span class="ds-row-label"><i class="' + sw.icon + '"></i>' +
            '<span class="ds-row-name" data-ds-name="' + sw.name + '"></span></span>' +
          '<label class="ds-switch">' +
            '<input type="checkbox" class="ds-check">' +
            '<span class="ds-switch-track"></span>' +
          '</label>' +
        '</div>';
      var check = row.querySelector('.ds-check');
      check.addEventListener('change', function () { dsSetSwitch(sw.name, check.checked); });
      wrap.appendChild(row);
    });
  }

  function dsRowEl(key) {
    var wrap = $('dsRows');
    return wrap ? wrap.querySelector('.ds-row[data-key="' + key + '"]') : null;
  }

  /* ---------- live editing ---------- */

  function dsSet(key, raw, source) {
    if (raw === '' || raw == null) return;
    var n = parseInt(raw, 10);
    if (!isFinite(n)) return;
    dsDraft[key] = dsClamp(key, n);
    dsApply(dsDraft);
    dsSyncRow(key, source);
    dsUpdatePreview();
    dsRefreshDirty();
  }

  function dsSetSwitch(name, checked) {
    dsDraft[name] = !!checked;
    dsRefreshDirty();
  }

  /* source = the element the user is touching; never overwrite it,
     otherwise typing "2" on the way to "240" would be rewritten. */
  function dsSyncRow(key, source) {
    var row = dsRowEl(key);
    if (!row) return;
    if (DS_SWITCHES.some(function (sw) { return sw.name === key; })) {
      var chk = row.querySelector('.ds-check');
      if (chk) chk.checked = !!dsDraft[key];
      return;
    }
    var it = DS_BY_KEY[key];
    var v = dsDraft[key];
    var range = row.querySelector('.ds-range');
    var num = row.querySelector('.ds-num');
    if (source !== 'range') range.value = v;
    if (source !== 'num') num.value = v;
    var numLbl = row.querySelector('.ds-row-num');
    if (numLbl) numLbl.textContent = v;
    dsPaintRange(range, v, it);
  }

  function dsSyncAll() {
    DS_ITEMS.forEach(function (it) { dsSyncRow(it.key, 'none'); });
    DS_SWITCHES.forEach(function (sw) { dsSyncRow(sw.name, 'none'); });
  }

  function dsPaintRange(range, v, it) {
    if (!range) return;
    var p = ((v - it.min) / (it.max - it.min)) * 100;
    var dir = (document.documentElement.dir === 'ltr') ? 'to right' : 'to left';
    range.style.background =
      'linear-gradient(' + dir + ', var(--bmw-blue-1) ' + p + '%, var(--silver-300) ' + p + '%)';
  }

  function dsUpdatePreview() {
    var sc = $('dsPvSales'), ic = $('dsPvInv');
    if (!sc || !ic) return;
    sc.style.width = dsDraft.salesCard + 'px';
    sc.style.height = dsDraft.salesHeight ? dsDraft.salesHeight + 'px' : '';
    sc.style.overflowY = dsDraft.salesHeight ? 'auto' : '';
    $('dsPvSalesName').style.fontSize = dsDraft.salesName + 'px';
    ic.style.width = dsDraft.invCard + 'px';
    ic.style.height = dsDraft.invHeight ? dsDraft.invHeight + 'px' : '';
    ic.style.overflowY = dsDraft.invHeight ? 'auto' : '';
    $('dsPvInvName').style.fontSize = dsDraft.invName + 'px';
  }

  function dsDirty() {
    if (!dsDraft || !dsSaved) return false;
    return DS_ITEMS.some(function (it) { return dsDraft[it.key] !== dsSaved[it.key]; }) ||
      DS_SWITCHES.some(function (sw) { return !!dsDraft[sw.name] !== !!dsSaved[sw.name]; });
  }

  function dsRefreshDirty(flash) {
    var save = $('dsSave');
    if (!save) return;
    var status = $('dsStatus');
    save.disabled = !dsDirty();
    if (dsStatusTimer) { clearTimeout(dsStatusTimer); dsStatusTimer = 0; }
    if (flash === 'saved') {
      status.className = 'ds-status ok';
      status.innerHTML = '<i class="fas fa-circle-check"></i> ' + T('display.saved', 'تم حفظ التغييرات');
      dsStatusTimer = setTimeout(function () { dsRefreshDirty(); }, 2600);
    } else if (dsDirty()) {
      status.className = 'ds-status warn';
      status.innerHTML = '<i class="fas fa-circle-exclamation"></i> ' + T('display.dirty', 'تغييرات غير محفوظة');
    } else {
      status.className = 'ds-status';
      status.textContent = '';
    }
  }

  /* ---------- save / reset / open / close ---------- */

  function dsSetLive(key, raw) {
    if (!DS_BY_KEY[key]) return 0;
    var n = dsClamp(key, raw);
    dsSaved[key] = n;
    dsDraft = Object.assign({}, dsDraft || dsSaved);
    dsDraft[key] = n;
    dsApply(dsSaved);
    dsPersist(dsSaved);
    if (dsBuilt) { dsSyncRow(key, 'none'); dsUpdatePreview(); dsRefreshDirty(); }
    dsUpdateDot();
    return n;
  }

  function dsSave() {
    if (!dsDirty()) return;
    dsSaved = Object.assign({}, dsDraft);
    dsPersist(dsSaved);
    dsApply(dsSaved);
    dsUpdateDot();
    dsRefreshDirty('saved');
  }

  function dsReset() {
    dsDraft = dsDefaults();
    dsApply(dsDraft);
    dsSyncAll();
    dsUpdatePreview();
    dsRefreshDirty();
  }

  function dsOpen() {
    dsBuild();
    var overlay = $('dsOverlay');
    if (!overlay) return;
    dsDraft = Object.assign({}, dsSaved);
    dsApply(dsDraft);
    dsSyncAll();
    dsUpdatePreview();
    dsRefreshDirty();
    overlay.style.display = 'flex';
    var btn = $('btnDisplaySettings');
    if (btn) btn.classList.add('is-open');
  }

  function dsClose() {
    var overlay = $('dsOverlay');
    if (!overlay || overlay.style.display === 'none') return;
    dsApply(dsSaved);                 // discard any unsaved live preview
    dsDraft = Object.assign({}, dsSaved);   // panel state == applied state again
    dsSyncAll();
    dsUpdatePreview();
    dsRefreshDirty();
    overlay.style.display = 'none';
    var btn = $('btnDisplaySettings');
    if (btn) btn.classList.remove('is-open');
  }

  function dsToggle() {
    var overlay = $('dsOverlay');
    if (overlay && overlay.style.display !== 'none') dsClose();
    else dsOpen();
  }

  function dsUpdateDot() {
    var btn = $('btnDisplaySettings');
    if (btn) btn.classList.toggle('is-custom', !dsIsDefault(dsSaved));
  }

  /* ---------- price helpers (FormLayout bands) ----------------------------
     These are one-off bulk tools, not display settings: they only write a
     price when it is currently missing or zero, using the very same bands the
     smart-add / quick-entry forms use. Nothing with a real value is touched. */

  function dsApplyPrice(field) {
    // FormLayout band keys are `sell` / `minPrice`; the product card fields are
    // `sellPrice` / `minPrice`. Map the form key before reading the percentage.
    var pctKey = ({ sellPrice: 'sell', minPrice: 'minPrice' })[field] || field;
    var FL = window.FormLayout;
    // db.js declares `const DB` at classic-script top level: a global lexical
    // binding, NOT a property of window. Read the bare identifier first or the
    // tool would always report the database as unavailable in the real app.
    var DBApi = null;
    try { if (typeof DB !== 'undefined' && DB) DBApi = DB; } catch (e) { /* TDZ */ }
    if (!DBApi) { try { DBApi = global && global.DB; } catch (e) { /* non-fatal */ } }
    if (!FL || typeof FL.bands !== 'function' || !DBApi || typeof DBApi.getProducts !== 'function') {
      alert(T('display.priceToolUnavailable', 'إعدادات الأسعار غير متاحة حالياً.'));
      return;
    }
    var bands = FL.bands() || [];
    var products = DBApi.getProducts() || [];
    var updates = [];
    products.forEach(function (p) {
      var current = parseFloat(p[field]);
      if (isFinite(current) && current > 0) return;       // never overwrite a real price
      var base = parseFloat(p.buyPrice);
      if (!(base > 0)) base = parseFloat(p.realBuyPrice) || 0;
      if (!(base > 0)) return;                             // no cost → no percentage
      var band = FL.bandFor(base, bands);
      var pct = (band && band.pcts && band.pcts[pctKey]) || 0;
      var value = parseFloat(FL.applyPercent(base, pct));
      if (!isFinite(value) || value <= 0) return;
      value = Math.round(value * 100) / 100;
      if (!(value > 0)) return;
      var patch = {};
      patch[field] = value;
      updates.push({ id: p.id, patch: patch, name: p.name });
    });
    if (!updates.length) {
      alert(T('display.priceFillNone', 'لا توجد منتجات تحتاج تعبئة هذا السعر.'));
      return;
    }
    var msg = T('display.priceFillConfirm', 'سيتم تعبئة السعر لعدد %n من المنتجات التي ليس لها سعر مسجّل. هل تريد المتابعة؟')
      .replace('%n', updates.length);
    if (!confirm(msg)) return;
    var done = 0;
    updates.forEach(function (u) {
      var res = DBApi.updateProduct(u.id, u.patch);
      if (!res || res.ok !== false) done++;
    });
    alert(T('display.priceFillDone', 'تم تحديث %n من المنتجات.').replace('%n', done));
  }

  /* ---------- labels (all four languages) ---------- */

  function setTxt(id, key, fb) {
    var el = $(id);
    if (el) el.textContent = T(key, fb);
  }

  function refreshLabels() {
    var btn = $('btnDisplaySettings');
    if (btn) btn.title = T('display.title', 'إعدادات العرض');
    var close = $('dsClose');
    if (close) { close.title = T('display.close', 'إغلاق'); close.setAttribute('aria-label', T('display.close', 'إغلاق')); }
    if (!dsBuilt) return;

    setTxt('dsTitleText', 'display.title', 'إعدادات العرض');
    setTxt('dsHintText', 'display.hint', 'اسحب المؤشر أو اكتب القيمة بدقة، ثم اضغط «حفظ التغييرات». المعاينة أدناه تتبع حركتك لحظيًا.');
    setTxt('dsPreviewTitle', 'display.preview', 'معاينة مباشرة');
    setTxt('dsPvTagSales', 'display.tagSales', 'بطاقات البيع');
    setTxt('dsPvTagInv', 'display.tagInv', 'بطاقات المخزون');
    setTxt('dsPvSalesName', 'display.sample1', 'فلتر زيت BOSCH');
    setTxt('dsPvSalesMeta', 'display.sampleMeta1', '12 قطعة في المخزون');
    setTxt('dsPvInvName', 'display.sample2', 'فلتر هواء MANN');
    setTxt('dsPvInvMeta', 'display.sampleMeta2', 'الباركود: 4024300');
    setTxt('dsResetText', 'display.reset', 'إعادة الضبط إلى الافتراضي');
    setTxt('dsSaveText', 'display.save', 'حفظ التغييرات');
    setTxt('dsApplyMinPriceText', 'display.applyMinPrice', 'تطبيق نسبة الحد الادنى');
    setTxt('dsApplySellPriceText', 'display.applySellPrice', 'تطبيق سعر البيع');
    var minBtn = $('dsApplyMinPrice');
    if (minBtn) minBtn.title = T('display.applyMinPrice', 'تطبيق نسبة الحد الادنى');
    var sellBtn = $('dsApplySellPrice');
    if (sellBtn) sellBtn.title = T('display.applySellPrice', 'تطبيق سعر البيع');

    DS_ITEMS.forEach(function (it) {
      var n = document.querySelector('[data-ds-name="' + it.key + '"]');
      if (n) n.textContent = T(it.label, it.flabel);
      var u = document.querySelector('[data-ds-unit="' + it.key + '"]');
      if (u) u.textContent = T('display.px', 'px');
    });
    var grp = document.querySelector('[data-ds-group="invoiceGroup"]');
    if (grp) grp.textContent = T('display.invoiceGroup', 'أعمدة الفاتورة');
    DS_SWITCHES.forEach(function (sw) {
      var n = document.querySelector('[data-ds-name="' + sw.name + '"]');
      if (n) n.textContent = T(sw.label, sw.flabel);
    });

    dsRefreshDirty();
  }

  function dsInit() {
    dsBootLoad();          // DOM-ready re-read (the earliest guaranteed storage)
    dsBuild();
    refreshLabels();
    dsUpdateDot();
    var btn = $('btnDisplaySettings');
    if (btn) btn.addEventListener('click', dsToggle);
  }

  /* ---------- boot ----------
     The values are read and applied as early as possible so the very first
     painted page already honours them. Chromium may however expose an empty
     localStorage for a few instants while the (file://) document is still
     initialising — which would silently drop the user's settings. So we
     re-read a few times and apply again only when something actually differs
     (no visible reflow in the normal case). */
  function dsBootLoad() {
    if (dsBuilt && dsDirty()) return;              // never clobber an open edit
    var fresh = dsLoad();
    var same = DS_ITEMS.every(function (it) { return fresh[it.key] === dsSaved[it.key]; }) &&
      DS_SWITCHES.every(function (sw) { return !!fresh[sw.name] === !!dsSaved[sw.name]; });
    if (same) return;
    dsSaved = fresh;
    dsDraft = Object.assign({}, dsSaved);
    dsApply(dsSaved);
    if (dsBuilt) { dsSyncAll(); dsUpdatePreview(); dsRefreshDirty(); }
    dsUpdateDot();
  }

  dsSaved = dsLoad();
  dsDraft = Object.assign({}, dsSaved);
  dsApply(dsSaved);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dsInit);
  } else {
    dsInit();
  }
  window.addEventListener('load', dsBootLoad);
  setTimeout(dsBootLoad, 400);
  setTimeout(dsBootLoad, 1600);

  window.DisplaySettings = {
    refreshLabels: refreshLabels,
    open: dsOpen,
    close: dsClose,
    defaults: dsDefaults,
    setLive: dsSetLive,
    current: function () { return Object.assign({}, dsSaved); },
    invoiceColumns: function () {
      return {
        reference: !!dsSaved.invShowReference,
        mark: !!dsSaved.invShowMark
      };
    },
    items: DS_ITEMS
  };
})();
