// ============================================================
// ZMT PIECE — Barcode Label Printing (shared module, loaded at startup)
// ------------------------------------------------------------
// Opens a print modal (injected on demand into document.body) with:
//  - copy count (defaults to current stock)
//  - custom label size in mm (width x height)
//  - paper mode: one label per sheet (thermal) OR a grid on A4
//  - live on-screen preview scaled to fit
// Barcode SVG generation is robust:
//  - EAN-13 / EAN-8 only when the full number carries a valid check digit
//  - otherwise CODE128 rendered on sanitized ASCII
//  - clear error message instead of a silent text-only label
// ============================================================

(function () {
  'use strict';

  var MODE_SHEET = 'sheet';
  var MODE_A4 = 'a4';
  var CFG_KEY = 'zmt_barcode_print_cfg';
  var PREVIEW_CAP = 50;
  var QTY_MAX = 500;

  var _productId = null;
  var _modal = null;
  var _cfg = { wMm: 40, hMm: 30, mode: MODE_SHEET, rotate: 0, flip: false, barH: 14, barW: 2, halign: 'center', valign: 'center', showPrice: true, showShop: true };

  // ---------- helpers ----------

  function esc(s) {
    s = String(s == null ? '' : s);
    if (typeof window !== 'undefined' && window.escHtml) return window.escHtml(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function clampNum(v, min, max) {
    var n = parseFloat(v);
    if (!isFinite(n)) n = min;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function modalEl(sel) {
    return _modal ? _modal.querySelector(sel) : null;
  }

  function elVal(sel) {
    var el = modalEl(sel);
    return el ? el.value : '';
  }

  function readQty() {
    var q = parseInt(elVal('[data-bp-qty]'), 10);
    if (!isFinite(q) || q < 1) q = 1;
    if (q > QTY_MAX) q = QTY_MAX;
    return q;
  }

  function readCfgFromInputs() {
    _cfg.wMm = clampNum(elVal('[data-bp-w]'), 10, 150);
    _cfg.hMm = clampNum(elVal('[data-bp-h]'), 10, 150);
    var flipEl = modalEl('[data-bp-flip]');
    if (flipEl) _cfg.flip = !!flipEl.checked;
    _cfg.barH = clampNum(elVal('[data-bp-barh]'), 6, 120);
    _cfg.barW = clampNum(elVal('[data-bp-barw]'), 1, 6);
    var hEl = modalEl('[data-bp-halign]');
    if (hEl) _cfg.halign = hEl.value || 'center';
    var vEl = modalEl('[data-bp-valign]');
    if (vEl) _cfg.valign = vEl.value || 'center';
    var spEl = modalEl('[data-bp-showprice]');
    if (spEl) _cfg.showPrice = !!spEl.checked;
    var ssEl = modalEl('[data-bp-showshop]');
    if (ssEl) _cfg.showShop = !!ssEl.checked;
    return _cfg;
  }

  function loadCfg() {
    var c = null;
    try { c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) { c = null; }
    var cfg = { wMm: 40, hMm: 30, mode: MODE_SHEET, rotate: 0, flip: false, barH: 14, barW: 2, halign: 'center', valign: 'center', showPrice: true, showShop: true };
    if (c) {
      if (c.wMm > 0 && c.hMm > 0) { cfg.wMm = c.wMm; cfg.hMm = c.hMm; }
      if (c.mode === MODE_SHEET || c.mode === MODE_A4) cfg.mode = c.mode;
      if ([0, 90, 180, 270].indexOf(c.rotate) >= 0) cfg.rotate = c.rotate;
      if (typeof c.flip === 'boolean') cfg.flip = c.flip;
      if (c.barH > 0) cfg.barH = c.barH;
      if (c.barW > 0) cfg.barW = c.barW;
      if (c.halign) cfg.halign = c.halign;
      if (c.valign) cfg.valign = c.valign;
      if (typeof c.showPrice === 'boolean') cfg.showPrice = c.showPrice;
      if (typeof c.showShop === 'boolean') cfg.showShop = c.showShop;
    }
    return cfg;
  }

  function saveCfg() {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify({
        wMm: _cfg.wMm, hMm: _cfg.hMm, mode: _cfg.mode, rotate: _cfg.rotate, flip: _cfg.flip,
        barH: _cfg.barH, barW: _cfg.barW, halign: _cfg.halign, valign: _cfg.valign,
        showPrice: _cfg.showPrice, showShop: _cfg.showShop
      }));
    } catch (e) { /* ignore quota/security errors */ }
  }

  // ---------- EAN check digits ----------

  // EAN-13: 12 digits weighted (1,3,1,3,...) from the LEFT.
  function ean13CheckDigit(d12) {
    var sum = 0;
    for (var i = 0; i < 12; i++) sum += (d12.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10;
  }

  // EAN-8: 7 digits weighted (3,1,3,1,...) from the LEFT.
  function ean8CheckDigit(d7) {
    var sum = 0;
    for (var i = 0; i < 7; i++) sum += (d7.charCodeAt(i) - 48) * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10;
  }

  function asciiOnly(s) {
    return String(s == null ? '' : s).replace(/[^\x20-\x7E]/g, '');
  }

  function chooseFormat(ascii) {
    if (/^\d{13}$/.test(ascii)) {
      if ((ascii.charCodeAt(12) - 48) === ean13CheckDigit(ascii.slice(0, 12))) return 'EAN13';
    }
    if (/^\d{8}$/.test(ascii)) {
      if ((ascii.charCodeAt(7) - 48) === ean8CheckDigit(ascii.slice(0, 7))) return 'EAN8';
    }
    return 'CODE128';
  }

  // ---------- barcode SVG ----------

  function genBarcodeSVG(code) {
    if (typeof JsBarcode !== 'function') {
      return { ok: false, svg: '', error: 'مكتبة توليد الباركود غير محمّلة' };
    }
    if (typeof document === 'undefined') {
      return { ok: false, svg: '', error: 'بيئة العرض غير متوفرة' };
    }
    var ascii = asciiOnly(code).trim();
    if (!ascii) {
      return { ok: false, svg: '', error: 'الباركود غير قابل للطباعة (يحتوي على محارف غير مدعومة)' };
    }
    var format = chooseFormat(ascii);
    // JsBarcode requires an <svg> (or <canvas>) element as its target — a plain
    // <div> throws InvalidElementException and silently yields no bars.
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var barW = (_cfg && _cfg.barW) ? _cfg.barW : 2;
    try {
      JsBarcode(svg, ascii, { format: format, displayValue: false, width: barW, height: 80, margin: 0 });
      var w = parseFloat(svg.getAttribute('width')) || 100;
      var h = parseFloat(svg.getAttribute('height')) || 30;
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      return { ok: true, svg: svg.outerHTML, error: '', format: format };
    } catch (e) {
      return { ok: false, svg: '', error: 'تعذر توليد الباركود: ' + (e.message || '') };
    }
  }

  // ---------- label building ----------

  function buildLabelHtml(product, svg) {
    var rot = _cfg.rotate || 0;
    var swap = (rot === 90 || rot === 270);
    // For 90/270 the whole label is rotated, so swap its box dimensions to the
    // physical paper size and let the CSS transform re-orient the content.
    var w = swap ? _cfg.hMm : _cfg.wMm;
    var h = swap ? _cfg.wMm : _cfg.hMm;
    var nameFont = Math.max(6, Math.min(11, Math.round(h * 0.22)));
    var subFont = Math.max(6, Math.min(9, Math.round(h * 0.16)));
    var svgHmm = Math.max(6, _cfg.barH || Math.round(h * 0.42));
    var price = 'DA' + fmtMoney((parseFloat(product.sellPrice) || 0));
    var shop = getPrintInfo().name;
    var transform = 'rotate(' + rot + 'deg)' + (_cfg.flip ? ' scaleX(-1)' : '');
    var just = _cfg.valign === 'start' ? 'flex-start' : (_cfg.valign === 'end' ? 'flex-end' : 'center');
    var ali = _cfg.halign === 'start' ? 'flex-start' : (_cfg.halign === 'end' ? 'flex-end' : 'center');

    var html = ''
      + '<div class="bp-label" style="width:' + w + 'mm;height:' + h + 'mm;'
      + 'transform:' + transform + ';transform-origin:center center;'
      + 'justify-content:' + just + ';align-items:' + ali + ';">'
      +   '<div class="bp-name" style="font-size:' + nameFont + 'px">' + esc(product.name) + '</div>';
    if (_cfg.showShop && shop) {
      html += '<div class="bp-shop" style="font-size:' + subFont + 'px">' + esc(shop) + '</div>';
    }
    html += '<div class="bp-svg" style="max-height:' + svgHmm + 'mm">' + svg + '</div>'
      +   '<div class="bp-code" dir="ltr" style="font-size:' + subFont + 'px">' + esc(product.barcode) + '</div>';
    if (_cfg.showPrice) {
      html += '<div class="bp-price" style="font-size:' + subFont + 'px">' + price + '</div>';
    }
    html += '</div>';
    return html;
  }

  // isPrint=true -> full quantity laid out for the printer; false -> preview capped.
  function buildLabelsHtml(product, qty, isPrint) {
    var gen = genBarcodeSVG(product.barcode);
    if (!gen.ok) return { ok: false, html: '', error: gen.error };

    var count = isPrint ? qty : Math.min(qty, PREVIEW_CAP);
    var label = buildLabelHtml(product, gen.svg);
    var parts = [];
    for (var i = 0; i < count; i++) parts.push(label);
    var html = parts.join('');

    if (isPrint) {
      if (_cfg.mode === MODE_A4) {
        html = '<div class="bp-a4-grid">' + html + '</div>';
      } else {
        var pages = [];
        for (i = 0; i < qty; i++) pages.push('<div class="bp-sheet-page">' + label + '</div>');
        html = pages.join('');
      }
    } else {
      if (qty > PREVIEW_CAP) {
        html += '<div class="bp-more-note">… سيُطبع ' + qty + ' نسخة كاملة عند الطباعة</div>';
      }
      if (_cfg.mode === MODE_A4) {
        html = '<div class="bp-a4-sheet"><div class="bp-a4-grid">' + html + '</div></div>';
      }
    }
    return { ok: true, html: html, error: '' };
  }

  // ---------- CSS ----------

  var BP_CSS = ''
    + '.bp-label{box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;'
    + 'align-items:center;text-align:center;overflow:hidden;background:#fff;color:#111;'
    + "font-family:'ZMT Digits','Segoe UI',Tahoma,Arial,sans-serif;}"
    + '.bp-name{font-weight:700;max-width:98%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.bp-svg{display:flex;justify-content:center;align-items:center;flex:1 1 auto;min-height:0;max-width:98%;}'
    + '.bp-svg svg{display:block;width:100%;height:100%;max-width:98%;}'
    + '.bp-code{font-weight:700;letter-spacing:1px;}'
    + '.bp-price{font-weight:600;color:#333;direction:ltr;font-family:\'ZMT Digits\',\'Courier New\',monospace;}'
    + '.bp-more-note{font-size:12px;color:#888;padding:8px;text-align:center;}'
    + '.bp-error{padding:24px;color:#c0392b;text-align:center;font-size:14px;}'
    + '.bp-a4-sheet{background:#fff;box-shadow:0 1px 8px rgba(0,0,0,.18);}'
    + '.bp-a4-grid{display:flex;flex-wrap:wrap;gap:2mm;}'
    + '.bp-preview{background:repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 0 0/12px 12px;'
    + 'border:1px solid var(--silver-300,#ddd);border-radius:8px;padding:10px;height:280px;'
    + 'overflow:auto;margin-top:6px;}'
    + '.bp-scale{transform-origin:top right;display:inline-block;vertical-align:top;}'
    + '.bp-inner{display:inline-block;}'
    + '.bp-mode-btn.active{background:var(--primary,#0066B1);color:#fff;}'
    + '.bp-shop{font-weight:700;color:#444;max-width:98%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.bp-rot-btn.active{background:var(--primary,#0066B1);color:#fff;}';

  var MODAL_HTML = ''
    + '<div class="modal" style="max-width:560px">'
    +   '<div class="modal-header">'
    +     '<h3><i class="fas fa-barcode"></i> طباعة باركود</h3>'
    +     '<button class="modal-close" data-bp-close type="button">&times;</button>'
    +   '</div>'
    +   '<div class="modal-body">'
    +     '<div class="selected-prod-info" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    +       '<strong data-bp-name></strong>'
    +       '<span class="text-muted" dir="ltr" data-bp-code></span>'
    +     '</div>'
    +     '<div class="form-group">'
    +       '<label>عدد النسخ <span style="font-weight:400;color:var(--silver-500,#888)">(الافتراضي = الكمية المخزنة)</span></label>'
    +       '<input type="text" inputmode="numeric" class="form-input no-spinner num-input" data-bp-qty value="1" min="1" max="' + QTY_MAX + '" dir="ltr">'
    +     '</div>'
    +     '<div class="form-group">'
    +       '<label>مقاس الملصق (عرض × ارتفاع بالمليمتر)</label>'
    +       '<div style="display:flex;align-items:center;gap:8px">'
    +         '<input type="text" inputmode="decimal" class="form-input no-spinner num-input" data-bp-w value="40" min="10" max="150" style="width:110px" dir="ltr">'
    +         '<span>×</span>'
    +         '<input type="text" inputmode="decimal" class="form-input no-spinner num-input" data-bp-h value="30" min="10" max="150" style="width:110px" dir="ltr">'
    +       '</div>'
    +     '</div>'
    +     '<div class="form-group">'
    +       '<label>نوع الورق</label>'
    +       '<div style="display:flex;gap:8px">'
    +         '<button type="button" class="btn btn-sm bp-mode-btn" data-bp-mode-sheet><i class="fas fa-file"></i> ملصق لكل ورقة (حرارية)</button>'
    +         '<button type="button" class="btn btn-sm bp-mode-btn" data-bp-mode-a4><i class="fas fa-columns"></i> شبكة على A4</button>'
    +       '</div>'
      +       '<div data-bp-cols-info class="text-muted" style="font-size:12px;margin-top:6px;display:none"></div>'
      +     '</div>'
      +     '<div class="form-group">'
      +       '<label>اتجاه ومرآة الملصق</label>'
      +       '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      +         '<button type="button" class="btn btn-sm bp-rot-btn" data-bp-rot="0">0°</button>'
      +         '<button type="button" class="btn btn-sm bp-rot-btn" data-bp-rot="90">90°</button>'
      +         '<button type="button" class="btn btn-sm bp-rot-btn" data-bp-rot="180">180°</button>'
      +         '<button type="button" class="btn btn-sm bp-rot-btn" data-bp-rot="270">270°</button>'
      +         '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;margin:0"><input type="checkbox" data-bp-flip> عكس أفقي (مرآة)</label>'
      +       '</div>'
      +     '</div>'
      +     '<div class="form-group">'
      +       '<label>حجم الباركود</label>'
      +       '<div style="display:flex;align-items:center;gap:8px">'
      +         '<span style="font-size:12px;color:var(--silver-500)">ارتفاع (مم)</span>'
      +         '<input type="text" inputmode="decimal" class="form-input no-spinner num-input" data-bp-barh value="14" min="6" max="120" style="width:90px" dir="ltr">'
      +         '<span style="font-size:12px;color:var(--silver-500)">سُمك الخط</span>'
      +         '<input type="text" inputmode="decimal" class="form-input no-spinner num-input" data-bp-barw value="2" min="1" max="6" step="0.5" style="width:80px" dir="ltr">'
      +       '</div>'
      +     '</div>'
      +     '<div class="form-group">'
      +       '<label>التوسيط</label>'
      +       '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +         '<select class="form-input" data-bp-halign style="width:140px">'
      +           '<option value="center">أفقي: وسط</option><option value="start">أفقي: يمين</option><option value="end">أفقي: يسار</option>'
      +         '</select>'
      +         '<select class="form-input" data-bp-valign style="width:140px">'
      +           '<option value="center">رأسي: وسط</option><option value="start">رأسي: أعلى</option><option value="end">رأسي: أسفل</option>'
      +         '</select>'
      +       '</div>'
      +     '</div>'
      +     '<div class="form-group">'
      +       '<label>المحتوى المعروض</label>'
      +       '<div style="display:flex;gap:14px;flex-wrap:wrap">'
      +         '<label style="display:inline-flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" data-bp-showprice checked> إظهار السعر</label>'
      +         '<label style="display:inline-flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" data-bp-showshop checked> إظهار اسم المحل</label>'
      +       '</div>'
      +     '</div>'
      +     '<div class="form-group">'
      +       '<label>معاينة</label>'
    +       '<div class="bp-preview" data-bp-preview>'
    +         '<div class="bp-scale" data-bp-scale><div class="bp-inner" data-bp-inner></div></div>'
    +       '</div>'
    +     '</div>'
    +     '<div class="modal-footer" style="border-top:none;padding:0;margin-top:4px">'
    +       '<button type="button" class="btn btn-primary" data-bp-print><i class="fas fa-print"></i> طباعة</button>'
    +       '<button type="button" class="btn" data-bp-cancel>إلغاء</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';

  // ---------- modal lifecycle ----------

  function ensureCSS() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('bp-print-style')) return;
    var st = document.createElement('style');
    st.id = 'bp-print-style';
    st.textContent = BP_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function wireModal() {
    _modal.addEventListener('click', function (e) {
      if (e.target === _modal) closePrintBarcodeModal();
    });
    var closeBtn = modalEl('[data-bp-close]');
    if (closeBtn) closeBtn.addEventListener('click', closePrintBarcodeModal);
    var cancelBtn = modalEl('[data-bp-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', closePrintBarcodeModal);
    var printBtn = modalEl('[data-bp-print]');
    if (printBtn) printBtn.addEventListener('click', printLabels);

    ['[data-bp-qty]', '[data-bp-w]', '[data-bp-h]'].forEach(function (sel) {
      var el = modalEl(sel);
      if (el) el.addEventListener('input', renderPreview);
    });
    var sheetBtn = modalEl('[data-bp-mode-sheet]');
    if (sheetBtn) sheetBtn.addEventListener('click', function () { _cfg.mode = MODE_SHEET; renderPreview(); });
    var a4Btn = modalEl('[data-bp-mode-a4]');
    if (a4Btn) a4Btn.addEventListener('click', function () { _cfg.mode = MODE_A4; renderPreview(); });

    _modal.querySelectorAll('[data-bp-rot]').forEach(function (b) {
      b.addEventListener('click', function () {
        _cfg.rotate = parseInt(b.getAttribute('data-bp-rot'), 10) || 0;
        renderPreview();
      });
    });
    var readAndRender = function () { readCfgFromInputs(); renderPreview(); };
    ['[data-bp-flip]', '[data-bp-barh]', '[data-bp-barw]', '[data-bp-halign]', '[data-bp-valign]', '[data-bp-showprice]', '[data-bp-showshop]'].forEach(function (sel) {
      var el = modalEl(sel);
      if (el) { el.addEventListener('input', readAndRender); el.addEventListener('change', readAndRender); }
    });
  }

  function ensureModal() {
    if (typeof document === 'undefined') return false;
    ensureCSS();
    if (_modal && document.body.contains(_modal)) return true;
    _modal = document.createElement('div');
    _modal.id = 'printBarcodeModal';
    _modal.className = 'modal-overlay';
    _modal.style.display = 'none';
    _modal.innerHTML = MODAL_HTML;
    document.body.appendChild(_modal);
    wireModal();
    return true;
  }

  function updateModeUI() {
    var sheetBtn = modalEl('[data-bp-mode-sheet]');
    var a4Btn = modalEl('[data-bp-mode-a4]');
    if (sheetBtn) sheetBtn.classList.toggle('active', _cfg.mode === MODE_SHEET);
    if (a4Btn) a4Btn.classList.toggle('active', _cfg.mode === MODE_A4);
    var info = modalEl('[data-bp-cols-info]');
    if (!info) return;
    if (_cfg.mode === MODE_A4) {
      var w = readCfgFromInputs().wMm;
      var cols = Math.max(1, Math.floor((210 - 12) / (w + 2)));
      info.style.display = '';
      info.textContent = 'يتّسع ' + cols + ' ملصق في الصف الواحد على ورق A4 (210×297مم)';
    } else {
      info.style.display = 'none';
    }
  }

  function updateRotUI() {
    if (!_modal) return;
    _modal.querySelectorAll('[data-bp-rot]').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.getAttribute('data-bp-rot'), 10) === (_cfg.rotate || 0));
    });
  }

  function renderPreview() {
    if (!_modal || typeof DB === 'undefined' || !_productId) return;
    var product = DB.getProduct(_productId);
    if (!product) return;
    readCfgFromInputs();
    var qty = readQty();
    var container = modalEl('[data-bp-preview]');
    var scaleWrap = modalEl('[data-bp-scale]');
    var inner = modalEl('[data-bp-inner]');
    if (!container || !scaleWrap || !inner) return;

    var res = buildLabelsHtml(product, qty, false);
    inner.innerHTML = res.ok ? res.html : '<div class="bp-error">' + esc(res.error) + '</div>';
    updateModeUI();
    updateRotUI();

    // Fit preview to the available width.
    var natural = inner.offsetWidth;
    if (!natural) natural = ((_cfg.mode === MODE_A4 ? 210 : _cfg.wMm) * 3.78) + 8;
    var avail = container.clientWidth - 16;
    var s = Math.max(0.2, Math.min(1, avail / (natural || 1)));
    scaleWrap.style.transform = 'scale(' + s + ')';
    scaleWrap.style.transformOrigin = 'top right';
    scaleWrap.style.width = Math.round(natural * s) + 'px';
    scaleWrap.style.height = Math.round(inner.offsetHeight * s) + 'px';
  }

  function onEsc(e) {
    if (e.key === 'Escape') closePrintBarcodeModal();
  }

  // ---------- public API ----------

  // Centralized print header resolver. When an active company exists its
  // profile is used (name/phone/address/NIS/NIF/RC/ARTICLE) — matching the
  // legal requirement to print the company instead of the store; otherwise
  // the store's own stored values are used. Available as window.getPrintInfo().
  function getPrintInfo() {
    var store = {
      name: (typeof localStorage !== 'undefined' ? localStorage.getItem('zmt_store_name') : '') || 'ZMT PIECE',
      address: (typeof localStorage !== 'undefined' ? localStorage.getItem('zmt_store_address') : '') || '',
      phone: (typeof localStorage !== 'undefined' ? localStorage.getItem('zmt_store_phone') : '') || '',
      nis: (typeof localStorage !== 'undefined' ? localStorage.getItem('zmt_store_nis') : '') || '',
      nif: (typeof localStorage !== 'undefined' ? localStorage.getItem('zmt_store_nif') : '') || '',
      rcc: (typeof localStorage !== 'undefined' ? localStorage.getItem('zmt_store_rcc') : '') || '',
      article: (typeof localStorage !== 'undefined' ? localStorage.getItem('zmt_store_article') : '') || ''
    };
    var company = null;
    try {
      var companyId = (typeof Auth !== 'undefined' && Auth.getCompanyId) ? Auth.getCompanyId() : null;
      if (companyId && typeof DB !== 'undefined' && DB.getCompany) company = DB.getCompany(companyId);
    } catch (e) { company = null; }
    if (company) {
      return {
        name: company.storeName || company.name || store.name,
        address: company.address || store.address,
        phone: company.phone || store.phone,
        nis: company.nis || store.nis,
        nif: company.nif || store.nif,
        rcc: company.rcc || store.rcc,
        article: company.article || store.article
      };
    }
    return store;
  }

  function openPrintBarcodeModal(productId) {
    if (typeof DB === 'undefined' || typeof DB.getProduct !== 'function') return;
    var product = DB.getProduct(productId);
    if (!product) return;
    if (!ensureModal()) return;

    _productId = productId;
    _cfg = loadCfg();

    var nameEl = modalEl('[data-bp-name]');
    var codeEl = modalEl('[data-bp-code]');
    if (nameEl) nameEl.textContent = product.name || '';
    if (codeEl) codeEl.textContent = product.barcode || '';

    var qtyEl = modalEl('[data-bp-qty]');
    if (qtyEl) qtyEl.value = Math.max(1, parseInt(product.quantity, 10) || 1);
    var wEl = modalEl('[data-bp-w]');
    var hEl = modalEl('[data-bp-h]');
    if (wEl) wEl.value = _cfg.wMm;
    if (hEl) hEl.value = _cfg.hMm;

    var flipEl = modalEl('[data-bp-flip]');
    if (flipEl) flipEl.checked = !!_cfg.flip;
    var barhEl = modalEl('[data-bp-barh]');
    if (barhEl) barhEl.value = _cfg.barH;
    var barwEl = modalEl('[data-bp-barw]');
    if (barwEl) barwEl.value = _cfg.barW;
    var halignEl = modalEl('[data-bp-halign]');
    if (halignEl) halignEl.value = _cfg.halign;
    var valignEl = modalEl('[data-bp-valign]');
    if (valignEl) valignEl.value = _cfg.valign;
    var spEl = modalEl('[data-bp-showprice]');
    if (spEl) spEl.checked = !!_cfg.showPrice;
    var ssEl = modalEl('[data-bp-showshop]');
    if (ssEl) ssEl.checked = !!_cfg.showShop;
    updateRotUI();

    _modal.style.display = 'flex';
    renderPreview();
    if (typeof document !== 'undefined') document.addEventListener('keydown', onEsc);
    setTimeout(function () {
      var q = modalEl('[data-bp-qty]');
      if (q) { q.focus(); q.select(); }
    }, 50);
  }

  function closePrintBarcodeModal() {
    saveCfg();
    if (_modal) _modal.style.display = 'none';
    if (typeof document !== 'undefined') document.removeEventListener('keydown', onEsc);
  }

  function printLabels() {
    if (typeof DB === 'undefined' || !_productId) return;
    var product = DB.getProduct(_productId);
    if (!product) { alert('المنتج غير موجود'); return; }
    if (!product.barcode) { alert('هذا المنتج لا يملك باركود — أضف باركوداً من صفحة التعديل أولاً'); return; }

    readCfgFromInputs();
    saveCfg();
    var qty = readQty();
    var res = buildLabelsHtml(product, qty, true);
    if (!res.ok) { alert(res.error); return; }

    var rot = _cfg.rotate || 0;
    var swap = (rot === 90 || rot === 270);
    var pw = swap ? _cfg.hMm : _cfg.wMm;
    var ph = swap ? _cfg.wMm : _cfg.hMm;
    var pageCss;
    if (_cfg.mode === MODE_A4) {
      pageCss = ''
        + '@page { size: A4; margin: 6mm; }'
        + 'html,body{margin:0;padding:0;}'
        + '.bp-a4-grid{display:flex;flex-wrap:wrap;gap:2mm;}'
        + '.bp-a4-grid .bp-label{border:1px dashed #999;break-inside:avoid;page-break-inside:avoid;}'
        + '.bp-more-note{display:none;}';
    } else {
      pageCss = ''
        + '@page { size: ' + pw + 'mm ' + ph + 'mm; margin: 0; }'
        + 'html,body{margin:0;padding:0;}'
        + '.bp-sheet-page{width:' + pw + 'mm;height:' + ph + 'mm;display:flex;align-items:center;justify-content:center;page-break-after:always;break-after:page;}'
        + '.bp-sheet-page:last-child{page-break-after:auto;break-after:auto;}'
        + '.bp-label{border:none;}'
        + '.bp-more-note{display:none;}';
    }

    var win = window.open('', '', 'width=720,height=720');
    if (!win) { alert('الرجاء السماح بالنوافذ المنبثقة للطباعة'); return; }

    win.document.write(
      '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>طباعة الباركود</title>'
      + '<style>' + BP_CSS + pageCss + '</style>'
      + '</head><body>' + res.html
      + '<script>window.print();window.close();<\/script>'
      + '</body></html>'
    );
    win.document.close();
  }

  // ---------- expose ----------

  window.BP = {
    open: openPrintBarcodeModal,
    close: closePrintBarcodeModal,
    print: printLabels,
    ean13CheckDigit: ean13CheckDigit,
    ean8CheckDigit: ean8CheckDigit,
    asciiOnly: asciiOnly,
    chooseFormat: chooseFormat,
    genBarcodeSVG: genBarcodeSVG
  };
  window.openPrintBarcodeModal = openPrintBarcodeModal;
  window.closePrintBarcodeModal = closePrintBarcodeModal;
  window.printBarcodeLabels = printLabels;
  window.getPrintInfo = getPrintInfo;
})();
