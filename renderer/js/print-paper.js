// ============================================================================
// ZMT PIECE — GLOBAL PRINT PAPER SETTINGS (feature 4)
// ============================================================================
// One paper choice for every document the app prints: invoices, purchase
// invoices, waybills, employee preparation sheets, previews and the zakat
// report. Thermal barcode / receipt printing keeps its own independent
// settings (thermal-print.js, barcode-print.js) and deliberately ignores this
// module.
//
// Stored in localStorage as JSON:
//   zmt_print_paper = { preset, orientation, margin, width, height }
//
// Every print window copies the app stylesheets, so the rule returned by
// pageRule() must be emitted AFTER them to win the cascade.
// ============================================================================
(function (root) {
  'use strict';

  var KEY = 'zmt_print_paper';

  // Physical sizes in millimetres (portrait). `css` is the keyword the print
  // engine understands; custom papers emit an explicit mm pair instead.
  var PRESETS = [
    { id: 'A3',        label: 'A3',        css: 'A3',        w: 297, h: 420 },
    { id: 'A4',        label: 'A4',        css: 'A4',        w: 210, h: 297 },
    { id: 'A5',        label: 'A5',        css: 'A5',        w: 148, h: 210 },
    { id: 'A6',        label: 'A6',        css: 'A6',        w: 105, h: 148 },
    { id: 'B4',        label: 'B4',        css: 'B4',        w: 250, h: 353 },
    { id: 'B5',        label: 'B5',        css: 'B5',        w: 176, h: 250 },
    { id: 'Letter',    label: 'Letter',    css: 'Letter',    w: 216, h: 279 },
    { id: 'Legal',     label: 'Legal',     css: 'Legal',     w: 216, h: 356 },
    { id: 'Executive', label: 'Executive', css: 'Executive', w: 184, h: 267 },
    { id: 'custom',    label: 'مخصص',      css: '',          w: 210, h: 297 },
  ];

  function presetById(id) {
    return PRESETS.find(function (p) { return p.id === id; }) || null;
  }

  function clampNum(v, min, max, fallback) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function normalize(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var preset = presetById(raw.preset) ? raw.preset : 'A4';
    var def = presetById(preset);
    var orientation = raw.orientation === 'landscape' ? 'landscape' : 'portrait';
    // margin: null means "let the caller keep its historical default".
    var margin = (raw.margin === null || raw.margin === undefined || raw.margin === '')
      ? null
      : clampNum(raw.margin, 0, 50, 10);
    var width = clampNum(raw.width, 20, 1000, def.w);
    var height = clampNum(raw.height, 20, 1000, def.h);
    return { preset: preset, orientation: orientation, margin: margin, width: width, height: height };
  }

  function config() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    return normalize(raw);
  }

  function save(raw) {
    var cfg = normalize(raw);
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
    applyToDocument();
    return cfg;
  }

  function dims(cfg) {
    cfg = cfg || config();
    var def = presetById(cfg.preset) || presetById('A4');
    var w = cfg.preset === 'custom' ? cfg.width : def.w;
    var h = cfg.preset === 'custom' ? cfg.height : def.h;
    if (cfg.orientation === 'landscape') { var t = w; w = h; h = t; }
    return { w: w, h: h };
  }

  // CSS `size` value: a keyword + orientation for standard paper, explicit
  // millimetres for a custom sheet.
  function sizeCss(cfg) {
    cfg = cfg || config();
    if (cfg.preset === 'custom') {
      var d = dims(cfg);
      return d.w + 'mm ' + d.h + 'mm';
    }
    var def = presetById(cfg.preset) || presetById('A4');
    return def.css + ' ' + cfg.orientation;
  }

  function marginCss(cfg, fallbackMm) {
    cfg = cfg || config();
    var m = cfg.margin == null ? fallbackMm : cfg.margin;
    if (m === null || m === undefined || m === '') return null;
    return Number(m) + 'mm';
  }

  // Complete @page rule for a print window. `fallbackMarginMm` keeps each
  // document's historical margin until the manager saves a global one.
  function pageRule(fallbackMarginMm) {
    var cfg = config();
    var m = marginCss(cfg, fallbackMarginMm == null ? 10 : fallbackMarginMm);
    return '@page{size:' + sizeCss(cfg) + (m ? ';margin:' + m : '') + '}';
  }

  // Width used by the on-screen preview sheet.
  function previewWidthCss() {
    var d = dims(config());
    return d.w + 'mm';
  }

  function labelOf(id) {
    var p = presetById(id);
    return p ? p.label : 'A4';
  }

  // ---------------------------------------------------------------------------
  // Settings UI. Lives here (not in the lazily loaded Settings page) because
  // the title-bar «نمط الطابعة» shortcut must open the same sheet from any page.
  // ---------------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function tr(key, fallback) {
    try {
      if (typeof root.t === 'function') {
        var v = root.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function el(id) { return document.getElementById(id); }

  function previewText() {
    var preset = el('ppPreset') ? el('ppPreset').value : 'A4';
    var orientation = el('ppOrientation') ? el('ppOrientation').value : 'portrait';
    var custom = preset === 'custom';
    var w, h;
    if (custom) {
      w = parseFloat(el('ppWidth') && el('ppWidth').value) || 0;
      h = parseFloat(el('ppHeight') && el('ppHeight').value) || 0;
    } else {
      var def = presetById(preset) || presetById('A4');
      w = def.w; h = def.h;
    }
    if (orientation === 'landscape') { var t2 = w; w = h; h = t2; }
    var m = el('ppMargin') && el('ppMargin').value !== '' ? el('ppMargin').value : '—';
    var ori = orientation === 'landscape' ? 'أفقية (Landscape)' : 'عمودية (Portrait)';
    return labelOf(preset) + ' · ' + ori + ' · ' + Math.round(w) + '×' + Math.round(h) + ' mm · هامش ' + m + ' mm';
  }

  function syncForm() {
    var preset = el('ppPreset') ? el('ppPreset').value : 'A4';
    var row = el('ppCustomRow');
    if (row) row.style.display = preset === 'custom' ? '' : 'none';
    var prev = el('ppPreview');
    if (prev) prev.textContent = previewText();
  }

  function openSettings() {
    if (typeof document === 'undefined') return;
    var existing = el('printPaperModal');
    if (existing) existing.remove();

    var cfg = config();
    var custom = cfg.preset === 'custom';
    var options = PRESETS.map(function (p) {
      return '<option value="' + esc(p.id) + '" ' + (p.id === cfg.preset ? 'selected' : '') + '>' +
        esc(p.label) + (p.id === 'custom' ? '' : ' (' + p.w + '×' + p.h + ' mm)') + '</option>';
    }).join('');

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'printPaperModal';
    modal.style.display = 'flex';
    modal.innerHTML = `<div class="modal" style="max-width:560px">
    <div class="modal-header">
      <h3><i class="fas fa-print" style="color:var(--bmw-blue-1)"></i> اعدادات الطباعة</h3>
      <button class="modal-close" type="button" id="ppClose">&times;</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      <div class="settings-hint">يُطبَّق حجم الورق على كل فواتير البرنامج: البيع، الشراء، المرتجعات، سندات التسليم والتحضير، والمعاينات. طباعة الباركود/الإيصال الحراري مستقلة تماماً.</div>

      <div class="form-group">
        <label>حجم الورق</label>
        <select class="form-input" id="ppPreset">${options}</select>
      </div>

      <div class="form-row" id="ppCustomRow" style="display:${custom ? '' : 'none'}">
        <div class="form-group">
          <label>العرض (mm)</label>
          <input type="number" class="form-input" id="ppWidth" min="20" max="1000" step="1" value="${cfg.width}" dir="ltr">
        </div>
        <div class="form-group">
          <label>الارتفاع (mm)</label>
          <input type="number" class="form-input" id="ppHeight" min="20" max="1000" step="1" value="${cfg.height}" dir="ltr">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>الاتجاه</label>
          <select class="form-input" id="ppOrientation">
            <option value="portrait" ${cfg.orientation === 'landscape' ? '' : 'selected'}>عمودية (Portrait)</option>
            <option value="landscape" ${cfg.orientation === 'landscape' ? 'selected' : ''}>أفقية (Landscape)</option>
          </select>
        </div>
        <div class="form-group">
          <label>الهامش (mm)</label>
          <input type="number" class="form-input" id="ppMargin" min="0" max="50" step="1" value="${cfg.margin == null ? 10 : cfg.margin}" dir="ltr">
        </div>
      </div>

      <div class="settings-hint" id="ppPreview" style="font-weight:700;color:var(--bmw-blue-1);background:rgba(var(--accent-rgb),0.06);border:1px dashed rgba(var(--accent-rgb),0.35);border-radius:8px;padding:10px 12px"></div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--silver-200)">
      <button class="btn btn-secondary" type="button" id="ppCancel">${esc(tr('common.cancel', 'إلغاء'))}</button>
      <button class="btn btn-primary" type="button" id="ppSave"><i class="fas fa-save"></i> ${esc(tr('common.save', 'حفظ'))}</button>
    </div>
  </div>`;
    document.body.appendChild(modal);

    ['ppPreset', 'ppOrientation', 'ppWidth', 'ppHeight', 'ppMargin'].forEach(function (id) {
      var node = el(id);
      if (node) node.addEventListener('input', syncForm);
    });
    el('ppClose').addEventListener('click', closeSettings);
    el('ppCancel').addEventListener('click', closeSettings);
    el('ppSave').addEventListener('click', saveSettings);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeSettings(); });
    syncForm();
  }

  function closeSettings() {
    var node = el('printPaperModal');
    if (node) node.remove();
  }

  function saveSettings() {
    var preset = el('ppPreset') ? el('ppPreset').value : 'A4';
    var orientation = el('ppOrientation') ? el('ppOrientation').value : 'portrait';
    var marginRaw = el('ppMargin') ? el('ppMargin').value : '10';
    var margin = marginRaw === '' ? 10 : Math.max(0, Math.min(50, parseFloat(marginRaw) || 0));
    var width = el('ppWidth') ? parseFloat(el('ppWidth').value) : 210;
    var height = el('ppHeight') ? parseFloat(el('ppHeight').value) : 297;
    if (!isFinite(width) || width < 20 || width > 1000) width = 210;
    if (!isFinite(height) || height < 20 || height > 1000) height = 297;
    save({ preset: preset, orientation: orientation, margin: margin, width: width, height: height });
    closeSettings();
    refreshTitleBar();
    try { root.alert('تم حفظ إعدادات الطباعة'); } catch (e) {}
  }

  // ===== Title-bar «نمط الطابعة» shortcut =====
  function currentSummary() {
    var cfg = config();
    if (cfg.preset === 'custom') {
      var d = dims(cfg);
      return 'مخصص ' + d.w + '×' + d.h;
    }
    return labelOf(cfg.preset) + ' ' + (cfg.orientation === 'landscape' ? 'أفقي' : 'عمودي');
  }

  function refreshTitleBar() {
    var label = el('printPaperLabel');
    if (label) label.textContent = 'نمط الطابعة: ' + currentSummary();
    var dd = el('printPaperDropdown');
    if (dd && dd.classList.contains('open')) renderDropdown(dd);
  }

  function renderDropdown(dd) {
    var cfg = config();
    var items = PRESETS.filter(function (p) { return p.id !== 'custom'; }).map(function (p) {
      var active = p.id === cfg.preset && cfg.preset !== 'custom';
      return '<button type="button" class="tb-dropdown-item tb-pp-preset' + (active ? ' is-active' : '') +
        '" data-pp-preset="' + esc(p.id) + '">' +
        '<i class="fas ' + (active ? 'fa-check' : 'fa-file') + '"></i> ' + esc(p.label) +
        ' <span class="tb-pp-dims">' + p.w + '×' + p.h + ' mm</span></button>';
    }).join('');
    dd.innerHTML =
      '<div class="tb-dropdown-title">حجم ورق الفواتير</div>' + items +
      '<div class="tb-dropdown-sep"></div>' +
      '<button type="button" class="tb-dropdown-item" id="ppOpenFull">' +
      '<i class="fas fa-sliders"></i> اتجاه، هامش أو ورق مخصص…</button>';
  }

  function pickPreset(id) {
    var cfg = config();
    save({ preset: id, orientation: cfg.orientation, margin: cfg.margin, width: cfg.width, height: cfg.height });
    refreshTitleBar();
  }

  function setupTitleBar() {
    var wrap = el('tbPrintPaper');
    var btn = el('btnPrintPaper');
    var dd = el('printPaperDropdown');
    if (!wrap || !btn || !dd) return;
    renderDropdown(dd);
    refreshTitleBar();

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      renderDropdown(dd);
      dd.classList.toggle('open');
    });

    dd.addEventListener('click', function (e) {
      var presetBtn = e.target.closest ? e.target.closest('[data-pp-preset]') : null;
      if (presetBtn) {
        pickPreset(presetBtn.getAttribute('data-pp-preset'));
        dd.classList.remove('open');
        return;
      }
      if (e.target.closest && e.target.closest('#ppOpenFull')) {
        dd.classList.remove('open');
        openSettings();
      }
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) dd.classList.remove('open');
    });
  }

  // Keep the app's own print path (Ctrl+P on the main window) in sync with the
  // chosen sheet. A late <style> wins over the static @media print rule.
  function applyToDocument(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.head) return;
    var el = doc.getElementById('zmt-print-paper-style');
    if (!el) {
      el = doc.createElement('style');
      el.id = 'zmt-print-paper-style';
      doc.head.appendChild(el);
    }
    var cfg = config();
    // Until the manager saves a margin, keep the app's historical print margin
    // (8 mm top/bottom, 10 mm left/right) instead of silently tightening it.
    var m = cfg.margin == null ? '8mm 10mm' : cfg.margin + 'mm';
    el.textContent = '@media print{' + '@page{size:' + sizeCss(cfg) + ';margin:' + m + '}' + '}';
  }

  var api = {
    KEY: KEY,
    PRESETS: PRESETS,
    presetById: presetById,
    config: config,
    save: save,
    dims: dims,
    sizeCss: sizeCss,
    marginCss: marginCss,
    pageRule: pageRule,
    previewWidthCss: previewWidthCss,
    labelOf: labelOf,
    applyToDocument: applyToDocument,
    openSettings: openSettings,
    closeSettings: closeSettings,
    saveSettings: saveSettings,
    setupTitleBar: setupTitleBar,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PrintPaper = api;

  if (typeof document !== 'undefined') {
    var boot = function () {
      try { applyToDocument(); } catch (e) {}
      try { setupTitleBar(); } catch (e) {}
      // Another window (or a settings save in this one) changed the paper.
      window.addEventListener('storage', function (e) {
        if (e && e.key === KEY) { try { applyToDocument(); } catch (err) {} }
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
