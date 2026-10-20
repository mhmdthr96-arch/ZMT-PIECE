/* ============================================================
   ZMT PIECE — إعدادات العرض (Display Settings)
   ------------------------------------------------------------
   A single top-bar button opens a panel that controls five purely
   visual values. They are stored per device in localStorage and
   applied as CSS variables on <html>, so every open page reflows
   instantly — no reload, no rebuild:

     --sales-card-min   حجم بطاقات البيع            (140 – 420 px)
     --inv-card-min     حجم بطاقات المخزون          (150 – 450 px)
     --sidebar-width    عرض القائمة الجانبية        (120 – 400 px)
     --sales-name-size  خط أسماء منتجات البيع       (10 – 32  px)
     --prod-name-size   خط أسماء منتجات المخزون     (10 – 40  px)

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
    { key: 'sidebar',   css: '--sidebar-width',   min: 120, max: 400, def: 240, icon: 'fas fa-columns',     label: 'display.sidebar',    flabel: 'عرض القائمة الجانبية' },
    { key: 'salesName', css: '--sales-name-size', min: 10,  max: 32,  def: 13,  icon: 'fas fa-text-height', label: 'display.salesName',  flabel: 'خط أسماء منتجات البيع' },
    { key: 'invName',   css: '--prod-name-size',  min: 10,  max: 40,  def: 16,  icon: 'fas fa-font',        label: 'display.invName',    flabel: 'خط أسماء منتجات المخزون' }
  ];

  var DS_BY_KEY = {};
  DS_ITEMS.forEach(function (it) { DS_BY_KEY[it.key] = it; });

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
      root.style.setProperty(it.css, dsClamp(it.key, cfg[it.key]) + 'px');
    });
  }

  function dsIsDefault(cfg) {
    var d = dsDefaults();
    return DS_ITEMS.every(function (it) { return cfg[it.key] === d[it.key]; });
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

  /* source = the element the user is touching; never overwrite it,
     otherwise typing "2" on the way to "240" would be rewritten. */
  function dsSyncRow(key, source) {
    var row = dsRowEl(key);
    if (!row) return;
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
    $('dsPvSalesName').style.fontSize = dsDraft.salesName + 'px';
    ic.style.width = dsDraft.invCard + 'px';
    $('dsPvInvName').style.fontSize = dsDraft.invName + 'px';
  }

  function dsDirty() {
    if (!dsDraft || !dsSaved) return false;
    return DS_ITEMS.some(function (it) { return dsDraft[it.key] !== dsSaved[it.key]; });
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

    DS_ITEMS.forEach(function (it) {
      var n = document.querySelector('[data-ds-name="' + it.key + '"]');
      if (n) n.textContent = T(it.label, it.flabel);
      var u = document.querySelector('[data-ds-unit="' + it.key + '"]');
      if (u) u.textContent = T('display.px', 'px');
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
    var same = DS_ITEMS.every(function (it) { return fresh[it.key] === dsSaved[it.key]; });
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
    current: function () { return Object.assign({}, dsSaved); },
    items: DS_ITEMS
  };
})();
