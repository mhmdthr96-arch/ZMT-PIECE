// Smart Add Invoice (OCR) — invoices page
(function () {
  'use strict';

  var _smartRows = []; // {name, qty, price, ...}
var _smartUndo = []; // deep-cloned snapshots (JSON strings) of {rows, paid}
var _smartUndoPtr = -1;
var _smartRefOpen = -1;
var _smartMarkOpen = -1;

  // ===== SMART EXCEL READER =============================================
  // Many suppliers send their invoice as an .xlsx/.xls/.csv whose column
  // titles are explicit in Arabic or French (Référence / Produit / Qté /
  // Prix). Read those titles directly and feed the SAME _smartRows →
  // openSmartEdit pipeline used by OCR: no second preview, no new storage,
  // no change to the OCR path for PDFs and images.
  var SMART_EXCEL_SYNONYMS = [
    { field: 'reference', words: ['المرجع', 'مرجع', 'رقم المرجع', 'reference', 'numero de reference', 'reference produit', 'ref produit', 'ref'] },
    { field: 'name', words: ['اسم المنتج', 'المنتج', 'الصنف', 'البيان', 'المادة', 'الوصف', 'produit', 'designation', 'libelle', 'article', 'product', 'description', 'item'] },
    { field: 'qty', words: ['الكمية', 'القطع', 'العلب', 'كمية', 'عدد', 'quantite', 'quantity', 'qte', 'qty', 'nombre', 'nb'] },
    { field: 'price', words: ['سعر الشراء', 'سعر الوحدة', 'سعر القطعة', 'السعر', 'prix d achat', 'prix achat', 'prix unitaire', 'prix', 'buy price', 'unit price', 'price', 'pu'] },
    { field: 'barcode', words: ['الباركود', 'باركود', 'code barre', 'codebarre', 'barcode'] },
    { field: 'mark', words: ['المارك', 'مارك', 'marque', 'mark'] },
    { field: 'sell', words: ['سعر البيع', 'prix de vente', 'prix vente', 'sell price', 'selling price'] },
    { field: 'whole', words: ['سعر الجملة', 'prix de gros', 'prix gros', 'wholesale price'] },
    { field: 'minPrice', words: ['السعر الادنى', 'سعر ادنى', 'prix minimum', 'prix plancher', 'minimum price'] },
  ];

  function smartExcelNorm(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // Référence -> reference
      .replace(/[\u064b-\u065f\u0670]/g, '')               // strip Arabic harakat
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
      .trim();
  }

  function smartExcelMapHeaders(headers) {
    var norm = (headers || []).map(smartExcelNorm);
    var used = {}, map = {}, f, w, i;
    // Exact titles first (e.g. "Prix de vente" must not be stolen by "Prix").
    for (f = 0; f < SMART_EXCEL_SYNONYMS.length; f++) {
      var spec = SMART_EXCEL_SYNONYMS[f];
      for (w = 0; w < spec.words.length; w++) {
        var target = smartExcelNorm(spec.words[w]);
        var at = norm.indexOf(target);
        if (at >= 0 && used[at] == null) {
          map[spec.field] = at; used[at] = spec.field; break;
        }
      }
    }
    // Then the longest contained title for the columns still unmapped.
    for (f = 0; f < SMART_EXCEL_SYNONYMS.length; f++) {
      if (map[SMART_EXCEL_SYNONYMS[f].field] != null) continue;
      var found = null;
      for (w = 0; w < SMART_EXCEL_SYNONYMS[f].words.length; w++) {
        var key = smartExcelNorm(SMART_EXCEL_SYNONYMS[f].words[w]);
        if (!key) continue;
        for (i = 0; i < norm.length; i++) {
          if (used[i] != null || norm[i].indexOf(key) < 0) continue;
          if (!found || key.length > found.len) found = { at: i, len: key.length };
        }
      }
      if (found) { map[SMART_EXCEL_SYNONYMS[f].field] = found.at; used[found.at] = SMART_EXCEL_SYNONYMS[f].field; }
    }
    return map;
  }

  function smartExcelNumber(raw) {
    if (raw == null || raw === '') return NaN;
    if (typeof raw === 'number') return isFinite(raw) ? raw : NaN;
    if (window.InvoiceOCR && typeof InvoiceOCR.parseAmount === 'function') {
      var parsed = InvoiceOCR.parseAmount(raw);
      if (isFinite(parsed)) return parsed;
    }
    // Standalone fallback (the OCR module is loaded lazily on some builds).
    var s = String(raw).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/\s/g, '').replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    var dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
    if (dot >= 0 && comma >= 0) {
      s = (dot > comma) ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
    } else if (comma >= 0) {
      var parts = s.split(',');
      s = (parts.length === 2 && parts[1].length <= 2) ? parts[0] + '.' + parts[1] : parts.join('');
    } else if (dot >= 0 && s.split('.').length > 2) {
      s = s.replace(/\./g, '');
    }
    return parseFloat(s);
  }

  function smartExcelRows(parsed) {
    var headers = (parsed && parsed.headers) || [];
    var source = (parsed && parsed.rows) || [];
    var map = smartExcelMapHeaders(headers);
    var rows = [];
    for (var i = 0; i < source.length; i++) {
      var raw = source[i] || {};
      function get(field) {
        var at = map[field];
        if (at == null || !headers[at]) return '';
        var value = raw[headers[at]];
        return value == null ? '' : value;
      }
      var name = String(get('name')).trim();
      var reference = String(get('reference')).trim();
      var qty = smartExcelNumber(get('qty'));
      var price = smartExcelNumber(get('price'));
      if (!name && !reference && !isFinite(qty) && !isFinite(price)) continue;
      var row = {
        name: name, qty: isFinite(qty) ? qty : 0,
        price: isFinite(price) ? price : 0,
        reference: reference, verified: true
      };
      var barcode = String(get('barcode')).trim();
      var mark = String(get('mark')).trim();
      if (barcode) row.barcode = barcode;
      if (mark) row.mark = mark;
      ['sell', 'whole', 'minPrice'].forEach(function (field) {
        var n = smartExcelNumber(get(field));
        if (isFinite(n) && n > 0) row[field] = n;
      });
      rows.push(row);
    }
    var missing = ['name', 'qty', 'price'].filter(function (field) { return map[field] == null; });
    return { rows: rows, map: map, missing: missing };
  }

  window.SmartExcel = {
    isSpreadsheet: function (name) { return /\.(xlsx|xlsm|xls|csv)$/i.test(String(name || '')); },
    normalizeHeader: smartExcelNorm,
    mapHeaders: smartExcelMapHeaders,
    rowsFromParsed: smartExcelRows,
    synonyms: SMART_EXCEL_SYNONYMS
  };

  // ===== CENT (.00) DISPLAY TOGGLE =====================================
  // Same shared preference as Quick Entry (identical fallback definition; the
  // first script loaded wins). Fresh installs start OFF, every click is saved.
  window.CentFormat = window.CentFormat || (function () {
    var KEY = 'zmt_cent_format_on';
    function enabled() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
    function set(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} }
    function format(value) {
      if (value == null || String(value).trim() === '') return '';
      var s = String(value).trim()
        .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
        .replace(/,/g, '.').replace(/[^\d.\-]/g, '');
      if (!s) return '';
      var n = parseFloat(s);
      return isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : '';
    }
    function display(value) { return enabled() ? format(value) : value; }
    return { key: KEY, enabled: enabled, set: set, format: format, display: display };
  })();

  // Progress / spinner styles for the Smart Add modal (injected once).
  if (typeof document !== 'undefined' && document.getElementById &&
      !document.getElementById('smartProgressStyle') && document.head) {
    var _smartStyle = document.createElement('style');
    _smartStyle.id = 'smartProgressStyle';
    _smartStyle.textContent =
      '@keyframes smart-spin{to{transform:rotate(360deg)}}' +
      '.smart-spinner{display:inline-block;width:18px;height:18px;border:2.5px solid rgba(111,66,193,.22);border-top-color:#6f42c1;border-radius:50%;animation:smart-spin .8s linear infinite;vertical-align:-3px;flex:0 0 auto}' +
      '.smart-spinner.smart-spinner-sm{width:13px;height:13px;border-width:2px;margin-left:6px}' +
      '.smart-progress{margin-top:14px;padding:12px 14px;border:1px solid #e3e3e3;border-radius:10px;background:#fafafa}' +
      '.smart-progress-head{display:flex;align-items:center;gap:10px;font-weight:600;font-size:14px}' +
      '.smart-progress-head .smart-progress-text{flex:1 1 auto;min-width:0}' +
      '.smart-progress-pct{font-variant-numeric:tabular-nums;color:#6f42c1;font-weight:700;min-width:38px;text-align:left}' +
      '.smart-progress-track{height:8px;border-radius:999px;background:rgba(111,66,193,.14);overflow:hidden;margin-top:10px}' +
      '.smart-progress-bar{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#6f42c1,#9a7ad6);transition:width .25s ease}' +
      '.smart-progress.is-indeterminate .smart-progress-bar{width:35%;animation:smart-indeterminate 1.2s ease-in-out infinite}' +
      '@keyframes smart-indeterminate{0%{margin-left:-35%}100%{margin-left:100%}}' +
      '.smart-progress-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;font-size:12px;color:#777}' +
      '.smart-error{margin-top:12px;padding:12px 14px;border:1px solid #f1b0b7;background:#fdf2f3;color:#8a1f2b;border-radius:10px;font-size:13px;line-height:1.7}' +
      '.smart-error strong{display:block;margin-bottom:4px}' +
      '.smart-error-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}' +
      '.smart-offline-note{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#2e7d32;background:#eef7ef;border:1px solid #cfe8d2;border-radius:999px;padding:4px 10px;margin-bottom:10px}';
    document.head.appendChild(_smartStyle);
  }

  function _ensureModals() {
    if (!document.getElementById('smartAddModal')) {
      var m = document.createElement('div');
      m.id = 'smartAddModal';
      m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;align-items:center;justify-content:center';
      m.innerHTML =
        '<div class="card" style="width:820px;max-width:95vw;max-height:90vh;overflow:auto;padding:18px">' +
        '<h3 style="margin:0 0 8px"><i class="fas fa-magic"></i> إضافة ذكية — قراءة فاتورة</h3>' +
        '<div class="smart-offline-note"><i class="fas fa-shield-alt"></i> قراءة محلية بالكامل — تعمل بدون إنترنت</div>' +
        '<div class="form-group"><label>ملف الفاتورة (PDF / صورة / Excel)</label>' +
        '  <input type="file" class="form-input" id="smartFile" accept=".pdf,.png,.jpg,.jpeg,.jfif,.webp,.gif,.bmp,.tif,.tiff,.avif,.xlsx,.xlsm,.xls,.csv" onchange="resetSmartAddStatus()"></div>' +
        '<div class="form-group"><label>المورّد</label><input class="form-input" id="smartSupplier" list="smartSupplierDatalist" placeholder="اسم المورّد (اختياري)"><datalist id="smartSupplierDatalist"></datalist></div>' +
        '<div id="smartProgress" class="smart-progress" style="display:none" role="status" aria-live="polite">' +
        '  <div class="smart-progress-head">' +
        '    <span class="smart-spinner" aria-hidden="true"></span>' +
        '    <span id="smartProgressText" class="smart-progress-text">جارٍ المعالجة…</span>' +
        '    <span id="smartProgressPct" class="smart-progress-pct"></span>' +
        '  </div>' +
        '  <div class="smart-progress-track"><div id="smartProgressBar" class="smart-progress-bar"></div></div>' +
        '  <div class="smart-progress-foot">' +
        '    <span id="smartProgressStage"></span>' +
        '    <button type="button" class="btn btn-sm" id="smartCancelBtn" onclick="cancelSmartAddInvoice()"><i class="fas fa-stop-circle"></i> إلغاء</button>' +
        '  </div>' +
        '</div>' +
        '<div id="smartError" class="smart-error" style="display:none" role="alert"></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
        '  <button type="button" class="btn" onclick="closeSmartAddInvoice()">إغلاق</button>' +
        '  <button type="button" class="btn btn-primary" id="smartRunBtn" onclick="runSmartAddInvoice()"><i class="fas fa-bolt"></i> قراءة الفاتورة</button>' +
        '</div>' +
        '<div id="smartPreview" style="margin-top:12px;display:none"></div>' +
        '</div>';
      document.body.appendChild(m);
    }
    if (!document.getElementById('smartEditModal')) {
      var e = document.createElement('div');
      e.id = 'smartEditModal';
      e.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10002;align-items:center;justify-content:center';
      e.innerHTML =
        '<div class="card" style="width:100vw;max-width:100vw;height:100vh;max-height:100vh;margin:0;border-radius:0;overflow:auto;padding:18px">' +
        '<h3 style="margin:0 0 12px"><i class="fas fa-edit"></i> معاينة الفاتورة (تعديل قبل الحفظ)</h3>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
        '  <button type="button" class="btn btn-sm" id="smartUndoBtn" onclick="smartUndo()" title="تراجع (Ctrl+Z)" disabled><i class="fas fa-undo"></i></button>' +
'  <button type="button" class="btn btn-sm" id="smartRedoBtn" onclick="smartRedo()" title="إعادة (Ctrl+Y)" disabled><i class="fas fa-redo"></i></button>' +
'  <button type="button" class="btn btn-sm" data-fv="plu" onclick="smartToggleFV(\'plu\')" title="PLU"><i class="fas fa-barcode"></i></button>' +
        '  <button type="button" class="btn btn-sm" data-fv="reference" onclick="smartToggleFV(\'reference\')" title="مرجع"><i class="fas fa-hashtag"></i></button>' +
        '  <button type="button" class="btn btn-sm" data-fv="country" onclick="smartToggleFV(\'country\')" title="بلد منشأ"><i class="fas fa-globe"></i></button>' +
        '  <button type="button" class="btn btn-sm" data-fv="mark" onclick="smartToggleFV(\'mark\')" title="مارك"><i class="fas fa-tag"></i></button>' +
        '  <button type="button" class="btn btn-sm" data-fv="minPrice" onclick="smartToggleFV(\'minPrice\')" title="سعر أدنى"><i class="fas fa-arrow-down"></i></button>' +
        '  <button type="button" class="btn btn-sm smart-amount-btn" id="smartAmountBtn" onclick="smartToggleAmount()" aria-pressed="false" title="إظهار/إخفاء مبلغ المشتريات (الكمية × سعر الشراء)"><i class="fas fa-calculator"></i> <span>إظهار مبلغ المشتريات</span></button>' +
        '  <button type="button" class="btn btn-sm qe-layout-btn" id="smartLayoutBtn" onclick="smartOpenLayout()" data-i18n-title="formLayout.layoutBtn" title="ترتيب الحقول والعرض"><i class="fas fa-columns"></i></button>' +
        '  <button type="button" class="btn btn-sm qe-layout-btn fl-auto-on" id="smartAutoBtn" onclick="smartToggleAutoFill()" aria-pressed="false" data-i18n-title="formLayout.autoFillBtn" title="الملء التلقائي للأسعار"><i class="fas fa-wand-magic-sparkles"></i></button>' +
        '  <button type="button" class="btn btn-sm smart-cent-btn" id="smartCentBtn" onclick="smartToggleCent()" aria-pressed="false" title="إظهار المبالغ بصيغة السنتيم (.00)">.00</button>' +
        '  <button type="button" class="btn btn-sm btn-primary" onclick="copySmartRows()"><i class="fas fa-copy"></i> نسخ البيانات</button>' +
        '  <button type="button" class="btn btn-sm" onclick="copySmartRaw()"><i class="fas fa-clipboard"></i> نسخ النص الخام</button>' +
        '</div>' +
        '<div id="smartGrid" style="display:grid;grid-template-columns:minmax(260px,2fr) 90px 110px 110px 110px 90px 140px 120px 100px 100px 100px 44px;gap:6px;align-items:center;background:var(--silver-50);padding:8px;border-radius:8px"></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">' +
        '  <label>المدفوع الآن:</label><input type="number" class="form-input" id="smartPaid" value="0" min="0" step="any" style="width:120px" oninput="updateSmartTotals(); smartRecordHistory();">' +
        '  <span id="smartTotal" style="font-weight:700"></span>' +
        '  <button type="button" class="btn" onclick="closeSmartEdit()">إلغاء</button>' +
        '  <button type="button" class="btn btn-primary" onclick="confirmSmartEdit()">حفظ الفاتورة</button>' +
        '</div></div>';
      document.body.appendChild(e);
    }
    // The toolbar's FV buttons are created here, after the page-level FV.apply()
    // already ran, so paint their on/off colours now; updateSmartAmountBtn does
    // the same for the purchase-amount button.
    try { if (window.FV && FV.apply) FV.apply(); } catch (err) {}
    updateSmartAmountBtn();
    updateSmartAutoBtn();
    smartPaintCentBtn();
    var paid = document.getElementById('smartPaid');
    if (paid && !paid._zmtCentBound) {
      paid._zmtCentBound = true;
      paid.addEventListener('focusout', function () {
        if (!smartCentOn() || this.value === '') return;
        var f = CentFormat.format(this.value);
        if (f) this.value = f;
      });
    }
    bindSmartGridDrag();
  }

  var _smartBusy = false;
  var _smartAbort = null;
  var _smartStartedAt = 0;
  var _smartDetail = '';

  function smartEl(id) { return document.getElementById(id); }

  function smartElapsedText() {
    if (!_smartStartedAt) return '';
    var s = Math.max(0, Math.round((Date.now() - _smartStartedAt) / 1000));
    var txt = s < 60 ? (s + ' ث') : (Math.floor(s / 60) + ' د ' + (s % 60) + ' ث');
    return 'الوقت المنقضي: ' + txt;
  }

  function refreshSmartStage() {
    var stage = smartEl('smartProgressStage');
    if (!stage) return;
    var bits = [];
    if (_smartDetail) bits.push(_smartDetail);
    var t = smartElapsedText();
    if (t) bits.push(t);
    stage.textContent = bits.join(' — ');
  }

  function hideSmartProgress() {
    _smartDetail = '';
    var box = smartEl('smartProgress');
    if (box) {
      box.style.display = 'none';
      if (box.classList) box.classList.remove('is-indeterminate');
    }
    var bar = smartEl('smartProgressBar');
    if (bar) bar.style.width = '0%';
    var pct = smartEl('smartProgressPct');
    if (pct) pct.textContent = '';
  }

  // progress: null (busy, unknown) or 0..1 (determinate).
  function setSmartProgress(p) {
    var box = smartEl('smartProgress');
    if (!box) return;
    p = p || {};
    box.style.display = 'block';
    var numeric = typeof p.progress === 'number' && p.progress === p.progress;
    var value = numeric ? Math.max(1, Math.min(100, Math.round(p.progress * 100))) : null;
    if (box.classList) {
      if (value === null) box.classList.add('is-indeterminate');
      else box.classList.remove('is-indeterminate');
    }
    var text = smartEl('smartProgressText');
    if (text && p.message) text.textContent = p.message;
    var pct = smartEl('smartProgressPct');
    if (pct) pct.textContent = value === null ? '' : (value + '%');
    var bar = smartEl('smartProgressBar');
    if (bar) bar.style.width = value === null ? '35%' : (value + '%');
    _smartDetail = p.detail || '';
    refreshSmartStage();
  }

  function clearSmartError() {
    var box = smartEl('smartError');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  }

  function showSmartError(title, lines, opts) {
    var box = smartEl('smartError');
    opts = opts || {};
    if (!box) { alert(title); return; }
    var html = '<strong>' + escHtml(title) + '</strong>';
    (lines || []).forEach(function (l) { if (l) html += '<div>' + escHtml(l) + '</div>'; });
    if (opts.retry !== false) {
      html += '<div class="smart-error-actions">' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="runSmartAddInvoice()"><i class="fas fa-redo"></i> إعادة المحاولة</button>' +
        '</div>';
    }
    box.innerHTML = html;
    box.style.display = 'block';
  }

  function renderSmartRawText(raw) {
    var prev = smartEl('smartPreview');
    if (!prev) return;
    if (!raw) { prev.innerHTML = ''; prev.style.display = 'none'; return; }
    prev.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<strong>النص المقروء (قابل للتعديل قبل التحليل)</strong>' +
      '<button type="button" class="btn btn-sm" onclick="autoParseSmartText()"><i class="fas fa-list"></i> تحليل النص المُعدَّل</button>' +
      '</div><div style="font-size:12px;color:#777;margin-bottom:6px">لم يقرأ البرنامج صف منتج كامل (اسم + كمية + سعر). عدّل النص هنا ثم اضغط الزر.</div>' +
      '<textarea class="form-input" id="smartRawText" rows="8" style="width:100%">' + escHtml(raw) + '</textarea>';
    prev.style.display = 'block';
  }

  function showSmartFailure(res) {
    var reason = (res && res.reason) || 'no-text';
    var raw = (res && res.rawText) || '';
    hideSmartProgress();
    var title = 'لم يتم التعرف على أي منتج';
    var lines = [];
    if (reason === 'no-table') {
      lines.push('تمت قراءة نص من الفاتورة، لكن لم يكتمل أي صف منتج (اسم + كمية + سعر).');
      lines.push('يمكنك تعديل النص المقروء أسفل النافذة ثم الضغط على «تحليل النص المُعدَّل».');
    } else if (reason === 'no-text') {
      lines.push('لم يتمكن المحرك من قراءة أي نص من الملف.');
      lines.push('تأكد أن الملف صورة واضحة (PNG/JPG) أو PDF غير محمي، وأن الفاتورة غير مائلة.');
    } else {
      lines.push('لم يكتمل أي صف منتج من هذا الملف.');
      lines.push('جرّب صورة أوضح أو صفحة واحدة من الفاتورة.');
    }
    showSmartError(title, lines);
    renderSmartRawText(raw);
  }

  window.resetSmartAddStatus = function () {
    if (_smartBusy) return;
    clearSmartError();
    hideSmartProgress();
    var prev = smartEl('smartPreview');
    if (prev) { prev.innerHTML = ''; prev.style.display = 'none'; }
  };

  window.openSmartAddInvoice = function () {
    _ensureModals();
    var m = smartEl('smartAddModal');
    if (m) m.style.display = 'flex';
    window.resetSmartAddStatus();
    // supplier datalist
    try {
      var suppliers = DB.getSuppliers() || [];
      var dl = smartEl('smartSupplierDatalist');
      if (dl) dl.innerHTML = suppliers.map(function (s) { return '<option value="' + escHtml(s.name) + '">'; }).join('');
    } catch (e) {}
  };

  window.closeSmartAddInvoice = function () {
    // Closing while a file is being read must stop the work, not leave an
    // orphaned Tesseract worker consuming the CPU.
    if (_smartBusy) window.cancelSmartAddInvoice();
    var m = smartEl('smartAddModal');
    if (m) m.style.display = 'none';
    hideSmartProgress();
  };

  window.cancelSmartAddInvoice = function () {
    if (!_smartBusy || !_smartAbort) return;
    try { _smartAbort.abort(); } catch (e) {}
    setSmartProgress({ message: 'جارٍ إلغاء العملية…', progress: null });
  };

  window.runSmartAddInvoice = async function () {
    if (_smartBusy) return; // one read at a time (double-click guard)
    clearSmartError();

    var fileEl = smartEl('smartFile');
    var file = fileEl && fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;
    if (!file) {
      showSmartError('لم يتم اختيار ملف', ['اختر ملف فاتورة (PDF أو صورة أو Excel) أولاً ثم اضغط «قراءة الفاتورة».'], { retry: false });
      return;
    }
    var isSheet = !!(window.SmartExcel && SmartExcel.isSpreadsheet(file.name));
    if (!isSheet && (!window.InvoiceOCR || typeof InvoiceOCR.ocrFile !== 'function')) {
      showSmartError('محرّك القراءة غير متاح', ['لم يتم تحميل وحدة القراءة المحلية. أعد تشغيل البرنامج ثم حاول مرة أخرى.'], { retry: false });
      return;
    }
    if (isSheet && (!window.FileParsers || (typeof FileParsers.parseExcel !== 'function' && typeof FileParsers.parseCSV !== 'function'))) {
      showSmartError('قارئ Excel غير متاح', ['لم يتم تحميل وحدة قراءة الجداول. أعد تشغيل البرنامج ثم حاول مرة أخرى.'], { retry: false });
      return;
    }

    var modal = smartEl('smartAddModal');
    var btn = smartEl('smartRunBtn');
    var btnHtml = btn ? btn.innerHTML : '';
    _smartBusy = true;
    _smartStartedAt = Date.now();
    _smartAbort = (typeof AbortController === 'function') ? new AbortController() : null;
    if (modal) modal.setAttribute('aria-busy', 'true');
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.innerHTML = '<span class="smart-spinner smart-spinner-sm"></span> جارٍ القراءة…';
    }
    var ticker = null;
    if (typeof setInterval === 'function') {
      ticker = setInterval(function () {
        if (!_smartBusy) return;
        refreshSmartStage();
      }, 500);
    }
    // Shown instantly, before any async work: the user always sees that the
    // file is being read.
    setSmartProgress({ message: 'جارٍ تحضير الملف…', progress: null });

    try {
      if (isSheet) {
        var fileName = String(file.name || '');
        setSmartProgress({ message: 'جارٍ قراءة جدول Excel…', progress: null });
        var buffer = (typeof file.arrayBuffer === 'function')
          ? await file.arrayBuffer()
          : await new Promise(function (resolve, reject) {
              var reader = new FileReader();
              reader.onload = function () { resolve(reader.result); };
              reader.onerror = function () { reject(reader.error || new Error('file read error')); };
              reader.readAsArrayBuffer(file);
            });
        setSmartProgress({ message: 'جارٍ مطابقة أعمدة الفاتورة…', progress: null });
        var parsed = /\.csv$/i.test(fileName)
          ? await FileParsers.parseCSV(buffer)
          : await FileParsers.parseExcel(buffer);
        var sheet = SmartExcel.rowsFromParsed(parsed);
        if (!sheet.rows.length) {
          var headText = (parsed.headers || []).join(' | ');
          renderSmartRawText(headText);
          showSmartError('لم يتم العثور على صفوف في ملف Excel', [
            'تأكد أن الورقة الأولى تحتوي على صف عناوين ثم صفوف المنتجات تحته.',
            'العناوين المتوقعة: المرجع / المنتج / الكمية / السعر (أو Référence / Produit / Qté / Prix).',
          ], { retry: false });
          return;
        }
        if (sheet.missing.length) {
          // A partial mapping still opens the editable grid; the cashier can
          // fix the qty/price by hand, exactly like a doubtful OCR line.
          try {
            showSmartProgress({
              message: 'تمت القراءة مع أعمدة غير مطابقة: ' + sheet.missing.join('، '),
              progress: 1,
              detail: 'يمكنك تعديل القيم في الشبكة قبل الحفظ.',
            });
          } catch (e) {}
        }
        _smartRows = sheet.rows;
        _smartRawText = (parsed.headers || []).join(' | ') + '\n' + (parsed.rows || []).map(function (r) {
          return (parsed.headers || []).map(function (h) { return r[h] == null ? '' : r[h]; }).join(' | ');
        }).join('\n');
        setSmartProgress({
          message: 'تمت قراءة الجدول بنجاح — ' + sheet.rows.length + ' صف',
          progress: 1,
        });
        setTimeout(function () {
          closeSmartAddInvoice();
          openSmartEdit();
        }, 180);
        return;
      }

      var res = await InvoiceOCR.ocrFile(file, {
        signal: _smartAbort ? _smartAbort.signal : null,
        onProgress: function (p) {
          setSmartProgress({
            message: (p && p.message) || 'جارٍ المعالجة…',
            progress: p ? p.progress : null,
            detail: p && p.rows ? (p.rows + ' صف محتمل') : '',
          });
        },
      });
      var rows = (res && res.rows) || [];
      var raw = (res && res.rawText) || '';
      if (rows.length) {
        _smartRows = rows;
        _smartRawText = raw;
        var unverified = rows.filter(function (r) { return r.verified === false; }).length;
        setSmartProgress({
          message: 'تمت القراءة بنجاح — ' + rows.length + ' صف' + (unverified ? ' (' + unverified + ' يحتاج تحققاً)' : ''),
          progress: 1,
        });
        // Let the success state paint once before switching modals.
        setTimeout(function () {
          closeSmartAddInvoice();
          openSmartEdit();
        }, 180);
        return;
      }
      _smartRows = [];
      showSmartFailure({ reason: (res && res.reason) || (raw ? 'no-table' : 'no-text'), rawText: raw });
    } catch (e) {
      var code = e && e.code ? String(e.code) : '';
      if (code === 'aborted') {
        setSmartProgress({ message: 'تم إلغاء العملية.', progress: 0 });
      } else {
        hideSmartProgress();
        if (code === 'timeout') {
          showSmartError('استغرق التحليل وقتاً طويلاً', [
            'الملف كبير أو جودة الصورة منخفضة.',
            'جرّب صورة أوضح أو صفحة واحدة فقط، أو أعد المحاولة.',
          ]);
        } else if (code === 'lib-missing') {
          showSmartError('محرّك القراءة غير محمّل', [
            'ملفات القراءة المحلية غير موجودة أو تالفة.',
            'أعد تثبيت البرنامج ثم حاول مرة أخرى.',
          ], { retry: false });
        } else if (code === 'pdf-render') {
          showSmartError('تعذّر فتح ملف PDF', [
            'قد يكون الملف محمياً بكلمة مرور أو تالفاً.',
            'جرّب تصدير الصفحة كصورة PNG ثم أعد المحاولة.',
          ]);
        } else if (code === 'unsupported') {
          showSmartError('صيغة الملف غير مدعومة', ['استخدم ملف PDF أو صورة PNG/JPG.'], { retry: false });
        } else if (isSheet) {
          showSmartError('تعذّرت قراءة ملف Excel', [
            String((e && e.message) || e || 'خطأ غير معروف') + '.',
            'تأكد من أن الملف غير محمي بكلمة مرور، وأن به صفاً واحداً على الأقل للعناوين.',
          ]);
        } else {
          showSmartError('تعذّرت قراءة الفاتورة', [
            String((e && e.message) || e || 'خطأ غير معروف') + '.',
            'إذا تكرر الخطأ، أعد تشغيل البرنامج ثم حاول مرة أخرى.',
          ]);
        }
      }
    } finally {
      _smartBusy = false;
      _smartStartedAt = 0;
      _smartAbort = null;
      if (ticker && typeof clearInterval === 'function') clearInterval(ticker);
      if (modal) modal.removeAttribute('aria-busy');
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.innerHTML = btnHtml;
      }
    }
  };

  window.autoParseSmartText = function () {
    var el = smartEl('smartRawText');
    if (!el || !window.InvoiceOCR || typeof InvoiceOCR.parseRowsFromText !== 'function') return;
    // Prefer the printed-table reader when the pasted text carries a
    // "Référence | Désignation" header (it keeps the reference column and the
    // exact prices); it falls back to the generic scanner for every other
    // format, exactly like before.
    _smartRows = (typeof InvoiceOCR.parseInvoiceText === 'function'
      ? InvoiceOCR.parseInvoiceText(el.value)
      : InvoiceOCR.parseRowsFromText(el.value)) || [];
    _smartRawText = el.value;
    if (!_smartRows.length) {
      showSmartError('لم يتم العثور على أي صف مكتمل', ['تأكد من وجود اسم المنتج مع الكمية وسعر الشراء في نفس السطر.'], { retry: false });
      return;
    }
    closeSmartAddInvoice();
    openSmartEdit();
  };

  // Responsive checkerboard (F1-like, wide grid)
  function applySmartFullscreen() {
    if (typeof document === 'undefined') return;
    var m = document.getElementById('smartEditModal');
    if (!m) return;
    m.style.alignItems = 'stretch';
    m.style.justifyContent = 'stretch';
    var card = m.querySelector('.card');
    if (card) {
      card.style.width = '100vw';
      card.style.maxWidth = '100vw';
      card.style.height = '100vh';
      card.style.maxHeight = '100vh';
      card.style.margin = '0';
      card.style.borderRadius = '0';
      card.style.padding = '18px 22px';
      card.style.overflow = 'auto';
    }
  }

  var _smartRawText = '';
  function _copyText(text, okMsg) {
    var done = function () { try { alert(okMsg); } catch (e) {} };
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { _copyFallback(text, done); });
        return;
      }
    } catch (e) {}
    _copyFallback(text, done);
  }
  function _copyFallback(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch (e) {
      try { alert('انسخ يدوياً:\n' + text); } catch (err) {}
    }
  }
  // Copy the preview grid exactly as shown (name / qty / buy price), plus the
  // computed total — so the result can be pasted back for diagnosis.
  window.copySmartRows = function () {
    if (!_smartRows.length) { alert('لا توجد صفوف للنسخ'); return; }
    var total = _smartRows.reduce(function (s, r) { return s + ((parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0)); }, 0);
    var lines = ['المنتج | الكمية | شراء | المجموع', '-------------------------'];
    _smartRows.forEach(function (r, i) {
      lines.push((i + 1) + '. ' + (r.name || '') + ' | ' + (r.qty || '') + ' | ' + (r.price || '') +
        ' | ' + ((parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0)));
    });
    lines.push('الإجمالي: ' + total);
    _copyText(lines.join('\n'), 'تم نسخ ' + _smartRows.length + ' صفاً');
  };
  window.copySmartRaw = function () {
    if (!_smartRawText) { alert('لا يوجد نص خام'); return; }
    _copyText(_smartRawText, 'تم نسخ النص الخام');
  };
  window.openSmartEdit = function () {
    _ensureModals();
    applySmartFullscreen();
    var m = document.getElementById('smartEditModal');
    if (m) m.style.display = 'flex';
    renderSmartGrid();
    _smartRows.forEach(function (r) { smartAutoFillRow(r, 'toggle'); });
    smartResetHistory();
    // Raw OCR text (collapsed): the only way to diagnose a misread digit.
    var old = document.getElementById('smartRawDetails');
    if (old) old.remove();
    if (_smartRawText && m) {
      var card = m.querySelector('.card');
      if (card) {
        var details = document.createElement('details');
        details.id = 'smartRawDetails';
        details.style.cssText = 'margin-top:10px;font-size:12px;color:#666';
        details.innerHTML = '<summary>النص الخام المقروء (للتشخيص)</summary>' +
          '<button type="button" class="btn btn-sm" style="margin:6px 0" onclick="copySmartRaw()"><i class="fas fa-clipboard"></i> نسخ النص الخام</button>' +
          '<textarea class="form-input" readonly rows="10" style="width:100%;direction:rtl">' +
          escHtml(_smartRawText) + '</textarea>';
        card.appendChild(details);
      }
    }
  };
  window.closeSmartEdit = function () {
    var m = document.getElementById('smartEditModal'); if (m) m.style.display = 'none';
    _smartRows = [];
    _smartRawText = '';
  };

  // Reference keys used by matchProduct. normalizeRef() folds case and every
  // separator ("53812-0K010/TYF091LA" -> "538120K010TYF091LA"); refCore()
  // additionally drops a trailing "/variant" block so a stored bare core
  // ("53812-0K010") still matches a full printed reference. The side markers
  // (LH/RH/LA/RA) are deliberately KEPT: stripping them would let an LH row
  // match an RH part that differs by one character — the exact mistake to avoid.
  function normalizeRef(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function refCore(v) {
    // A trailing "/<alnum>" block is a variant suffix; a suffix that carries
    // its own "-" ("/212-11G4") stays part of the key.
    return normalizeRef(String(v || '').toUpperCase().trim().replace(/\/[A-Z0-9]{1,10}$/, ''));
  }

  // Auto-match = strong evidence only, and *discriminated* when several
  // products are alike (e.g. "LAME PM" vs "LAME GM"): the buy price read
  // from the invoice must be close to the product's buy price, otherwise
  // the first fuzzy hit would fill the WRONG barcode/reference/mark.
  function matchProduct(row) {
    var prods = DB.getProducts() || [];
    if (row.barcode) {
      var byBc = DB.getProductByBarcode(row.barcode);
      if (byBc) return { product: byBc, via: 'barcode' };
    }
    if (row.reference) {
      // No DB.getProductByReference: scan the catalogue by reference key.
      // 1) exact reference (case / space / hyphen / slash insensitive).
      var refKey = normalizeRef(row.reference);
      if (refKey.length >= 3) {
        var byRef = prods.find(function (p) { return p.reference && normalizeRef(p.reference) === refKey; });
        if (byRef) return { product: byRef, via: 'reference' };
        // 2) the row prints a variant suffix ("…/TYF091LA") while the stored
        // reference is the bare core, or vice-versa. Match on the core, but
        // only when exactly ONE product fits — never guess between variants
        // (an LH row must not land on an RH part).
        var core = refCore(row.reference);
        if (core && core.length >= 6) {
          var hits = prods.filter(function (p) {
            if (!p.reference) return false;
            return normalizeRef(p.reference) === core || refCore(p.reference) === refKey;
          });
          if (hits.length === 1) return { product: hits[0], via: 'reference' };
        }
      }
    }
    if (!row.name) return { product: null, via: null };
    var q = normSearch(row.name).trim();
    if (!q) return { product: null, via: null };
    var qTokens = q.split(/\s+/).filter((t) => t.length >= 2);
    var rowBuy = parseFloat(row.price) || 0;
    var best = null, bestScore = -1, bestTie = -1, secondScore = -1;
    for (var i = 0; i < prods.length && i < 2000; i++) {
      var p = prods[i];
      var pname = normSearch(p.name || '').trim();
      if (!pname) continue;
      var score = 0;
      if (pname === q) {
        score = 100; // exact name
      } else if (q.length >= 4 && pname.indexOf(q) === 0) {
        score = 50; // strong prefix
      } else if (qTokens.length >= 3 && q.length >= 8 &&
                 qTokens.every((t) => pname.indexOf(t) !== -1)) {
        // Every significant word appears in the product name (e.g. a
        // "BOUCHON RADIATEUR YARIS HILUX COROLLA" row). Model digits
        // stripped by OCR (TD27 -> TD) still match as substrings.
        score = 40;
      } else {
        var s = productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin);
        if (q.length >= 4 && s >= 10) score = s;
      }
      if (!score) continue;
      // Discriminator: purchase invoice price ~ product buy price.
      var bp = parseFloat(p.buyPrice) || 0;
      var tie = 0;
      if (rowBuy > 0 && bp > 0) {
        var diff = Math.abs(bp - rowBuy) / Math.max(bp, rowBuy);
        if (diff <= 0.01) tie = 30;
        else if (diff <= 0.10) tie = 10;
        else if (score >= 40 && diff > 0.5) continue; // price far: not this product
      }
      var searchS = 0;
      try { searchS = productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin) || 0; } catch (e) {}
      var total = score + tie + Math.min(searchS, 20) / 1000;
      if (total > bestScore || (total === bestScore && searchS > bestTie)) {
        secondScore = bestScore;
        bestScore = total; bestTie = searchS; best = p;
      } else if (total > secondScore) {
        secondScore = total;
      }
    }
    // Two near-identical products ("LAME PM" / "LAME GM") must not be filled
    // from a weak/ambiguous match: leave barcode/reference/mark empty so the
    // cashier picks the right one from the name dropdown.
    var ambiguous = secondScore >= 40 && (bestScore - secondScore) < 0.001;
    if (best && bestScore >= 40 && !ambiguous) return { product: best, via: (bestScore >= 100 ? 'name-exact' : 'name') };
    return { product: null, via: null };
  }

  // Styles for the name-autocomplete dropdown (injected once).
  if (!document.getElementById('smartNameStyle')) {
    var st = document.createElement('style');
    st.id = 'smartNameStyle';
    st.textContent =
      '.smart-name-wrap{position:relative;min-width:0}' +
      '.smart-name-results{position:absolute;top:100%;right:0;left:0;z-index:1000;background:#fff;border:1px solid var(--silver-300);border-radius:0 0 8px 8px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-height:240px;overflow:auto;display:none}' +
      '.smart-name-head{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;border-bottom:1px solid var(--silver-200);background:#fafafa;font-size:12px;color:var(--silver-600)}' +
      '.smart-name-close{border:1px solid var(--silver-300);background:#fff;cursor:pointer;font-size:12px;line-height:1;padding:3px 8px;color:var(--silver-600);border-radius:6px;white-space:nowrap}' +
      '.smart-name-close:hover{background:#fdecea;border-color:#e6b0aa;color:#c0392b}' +
      '.smart-name-item{padding:8px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--silver-100)}' +
      '.smart-name-item:last-child{border-bottom:none}' +
      '.smart-name-item:hover{background:rgba(var(--accent-rgb),.08)}';
    document.head.appendChild(st);
  }

  // Extra sale prices configured in inventory are part of the preview grid too.
  // They stay empty by default; the user fills them like sell / wholesale.
  function smartExtraFields() {
    try { return (window.ExtraPrices && ExtraPrices.fields()) || []; } catch (e) { return []; }
  }
  function smartCols() {
    // The same visible-column model the grid uses, so the arrow keys can never
    // land on a column the field-visibility settings hid. The row number and
    // the amount are not focusable inputs, so they stay out of the arrow path.
    return smartColumns().map(function (c) { return c.key; })
      .filter(function (k) { return k !== 'del' && k !== 'idx' && k !== 'amount'; });
  }
  function smartFocus(col, rowIdx, select) {
    var inp = document.querySelector('[data-col="' + col + '"][data-row="' + rowIdx + '"]');
    if (inp) { inp.focus(); if (select !== false && inp.select) inp.select(); }
    return inp;
  }
  window.addSmartRow = function () {
    _smartRows.push({ name: '', qty: 1, price: 0, sell: '', whole: '', minPrice: 0, extraPrices: {}, barcode: '', reference: '', plu: '', countryOfOrigin: '', mark: '' });
    renderSmartGrid();
    var idx = _smartRows.length - 1;
    smartFocus('name', idx);
    smartAutoFillRow(_smartRows[idx], 'toggle');
    updateSmartTotals();
    smartRecordHistory();
  };
  window.smartKeydown = function (e) {
    var modal = document.getElementById('smartEditModal');
    if (!modal || modal.style.display === 'none') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      // Close the name dropdown first; a second Escape closes the modal.
      if (_smartNameOpen >= 0) { smartHideNameList(_smartNameOpen); return; }
      if (_smartRefOpen >= 0) { smartHideRefList(_smartRefOpen); return; }
      if (_smartMarkOpen >= 0) { smartHideMarkList(_smartMarkOpen); return; }
      closeSmartEdit();
      return;
    }
    // Undo / Redo shortcuts (Excel-like).
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) smartRedo(); else smartUndo();
        return;
      }
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); smartRedo(); return; }
    }
    var inp = e.target;
    var isGridCell = !!(inp && inp.dataset && inp.dataset.col);
    // "+" adds a row like F1 — but not while typing text elsewhere.
    if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      var tag = inp && inp.tagName;
      if (isGridCell || (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT')) {
        e.preventDefault(); addSmartRow(); return;
      }
    }
    if (!isGridCell) return;
    var cols = smartCols();
    var ci = cols.indexOf(inp.dataset.col);
    var ri = parseInt(inp.dataset.row, 10);
    if (ci < 0 || isNaN(ri)) return;
    // RTL: the first column is on the right, so Right goes back; LTR: Right
    // goes forward. This keeps the physical arrow matching the visible cell.
    var rtl = (typeof window.isRTL === 'function') ? window.isRTL() : ((window.__lang || 'ar') === 'ar');
    if (e.key === 'ArrowRight') { e.preventDefault(); smartFocus(cols[rtl ? Math.max(0, ci - 1) : Math.min(cols.length - 1, ci + 1)], ri); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); smartFocus(cols[rtl ? Math.min(cols.length - 1, ci + 1) : Math.max(0, ci - 1)], ri); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); smartFocus(cols[ci], Math.max(0, ri - 1)); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); smartFocus(cols[ci], Math.min(_smartRows.length - 1, ri + 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (inp.dataset.col === 'name') {
        var box = document.getElementById('smartNameResults_' + ri);
        var first = box ? box.querySelector('.smart-name-item') : null;
        var onclick = first ? first.getAttribute('onclick') : null;
        if (onclick) { try { new Function(onclick)(); return; } catch (err) {} }
      }
      var nextCol = cols[ci + 1] || (ri + 1 < _smartRows.length ? cols[0] : null);
      var nextRow = cols[ci + 1] ? ri : ri + 1;
      if (nextCol) smartFocus(nextCol, nextRow);
    }
  };
  // Attach once at document level (capture) so arrow keys / "+" behave
  // like F1 even before the user clicks a cell.
  if (typeof document !== 'undefined' && !window.__smartKeysBound) {
    window.__smartKeysBound = true;
    document.addEventListener('keydown', function (ev) {
      if (window.smartKeydown) window.smartKeydown(ev);
    }, true);
  }

  // Fields that are copied from a matched product. We remember which ones
  // the system filled (`_auto`) so a wrong match can never poison the row:
  // as soon as the user edits the name, auto values are dropped instead of
  // being reused as "barcode evidence" on the next render.
  // NOTE: sell price / wholesale price are deliberately NOT auto-filled —
  // they are left for the user to decide.
  var SMART_MATCH_FIELDS = ['barcode', 'reference', 'plu', 'countryOfOrigin', 'mark'];
  function smartAutoMap(r) { if (!r._auto) r._auto = {}; return r._auto; }
  function clearSmartAuto(r) {
    if (!r) return;
    var a = smartAutoMap(r);
    SMART_MATCH_FIELDS.forEach(function (f) {
      if (a[f]) { r[f] = ''; a[f] = false; }
    });
  }
  // Auto-fill from a *strong* match only. Auto-filled barcode/reference are
  // excluded from matching so they cannot lock the row to a wrong product.
  function matchSmartRow(r) {
    var a = smartAutoMap(r);
    var probe = {
      name: r.name,
      price: r.price,
      barcode: a.barcode ? '' : r.barcode,
      reference: a.reference ? '' : r.reference,
    };
    var match = matchProduct(probe);
    var p = match.product;
    if (p) {
      SMART_MATCH_FIELDS.forEach(function (f) {
        if (!r[f] || a[f]) { r[f] = p[f] || ''; a[f] = true; }
      });
    }
    return match;
  }
  // Refresh the visible inputs after an in-place name change (no re-render,
  // so the caret stays where the user is typing).
  function syncSmartRowInputs(i) {
    var r = _smartRows[i];
    if (!r) return;
    SMART_MATCH_FIELDS.forEach(function (f) {
      var el = document.querySelector('[data-col="' + f + '"][data-row="' + i + '"]');
      if (el && String(el.value) !== String(r[f] == null ? '' : r[f])) el.value = r[f] == null ? '' : r[f];
    });
  }

  /* ---------- per-line purchase amount (الكمية × سعر الشراء) ---------- */
  // The column sits right after «شراء» and stays collapsed until the toolbar
  // button «إظهار مبلغ المشتريات» turns it on. The choice is kept per machine
  // and shared with the Quick-Entry grid through the same localStorage key, so
  // both grids agree on one setting.
  var SMART_AMOUNT_KEY = 'zmt_show_purchase_amount';
  function smartShowAmount() {
    try { return localStorage.getItem(SMART_AMOUNT_KEY) === '1'; } catch (e) { return false; }
  }
  function smartSetShowAmount(on) {
    try { localStorage.setItem(SMART_AMOUNT_KEY, on ? '1' : '0'); } catch (e) {}
    updateSmartAmountBtn();
    renderSmartGrid();
  }
  window.smartToggleAmount = function () { smartSetShowAmount(!smartShowAmount()); };

  /* ---------- .00 cent display (shared with Quick Entry) ---------- */
  var SMART_MONEY_COLS = { price: 1, sell: 1, whole: 1, minPrice: 1 };
  function smartCentOn() { return !!(window.CentFormat && CentFormat.enabled()); }
  function isSmartMoneyInput(el) {
    if (!el || !el.getAttribute) return false;
    var col = String(el.getAttribute('data-col') || '');
    return !!(SMART_MONEY_COLS[col] || col.indexOf('extra:') === 0);
  }
  function applySmartCent() {
    if (!smartCentOn() || !document.querySelectorAll) return;
    var inputs = document.querySelectorAll('#smartGrid input[data-col]');
    for (var i = 0; i < inputs.length; i++) {
      if (!isSmartMoneyInput(inputs[i]) || inputs[i].value === '') continue;
      var f = CentFormat.format(inputs[i].value);
      if (f) inputs[i].value = f;
    }
    var paid = document.getElementById('smartPaid');
    if (paid && paid.value !== '') {
      var fp = CentFormat.format(paid.value);
      if (fp) paid.value = fp;
    }
  }
  function stripSmartCent() {
    if (!document.querySelectorAll) return;
    var inputs = document.querySelectorAll('#smartGrid input[data-col]');
    for (var i = 0; i < inputs.length; i++) {
      if (!isSmartMoneyInput(inputs[i])) continue;
      if (/\.00$/.test(inputs[i].value)) inputs[i].value = inputs[i].value.slice(0, -3);
    }
    var paid = document.getElementById('smartPaid');
    if (paid && /\.00$/.test(paid.value)) paid.value = paid.value.slice(0, -3);
  }
  function smartPaintCentBtn() {
    var btn = document.getElementById('smartCentBtn');
    if (!btn) return;
    var on = smartCentOn();
    if (btn.classList) btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  window.smartToggleCent = function () {
    var on = !smartCentOn();
    if (window.CentFormat) CentFormat.set(on);
    smartPaintCentBtn();
    if (on) applySmartCent(); else stripSmartCent();
  };

  function updateSmartAmountBtn() {
    var btn = document.getElementById('smartAmountBtn');
    if (!btn) return;
    var on = smartShowAmount();
    if (btn.classList) btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var lbl = btn.querySelector('span');
    if (lbl) lbl.textContent = on ? 'إخفاء مبلغ المشتريات' : 'إظهار مبلغ المشتريات';
  }

  /* ---------- row colour state (جديد / موجود / كمية منخفضة) ---------- */
  function lowThreshold() {
    try { return (typeof DB !== 'undefined' && DB.getLowStockThreshold) ? (DB.getLowStockThreshold() || 0) : 0; }
    catch (e) { return 0; }
  }
  // A row the user picked by hand carries an explicit productId — that is the
  // strongest evidence of which article the line means.
  function smartRowProduct(r) {
    if (r && r.productId && typeof DB !== 'undefined' && DB.getProduct) {
      var picked = DB.getProduct(r.productId);
      if (picked) return picked;
    }
    return null;
  }
  // A side-effect-free twin of matchSmartRow: it answers "which article does
  // this row describe?" without auto-filling anything, so it is safe to run on
  // every keystroke while the caret stays where the user is typing.
  function smartProbeMatch(r) {
    if (!r) return null;
    var picked = smartRowProduct(r);
    if (picked) return picked;
    var a = r._auto || {};
    var probe = {
      name: r.name, price: r.price,
      barcode: a.barcode ? '' : r.barcode,
      reference: a.reference ? '' : r.reference,
    };
    var m = matchProduct(probe);
    return (m && m.product) ? m.product : null;
  }
  function smartRowState(r) {
    if (!r) return '';
    var p = smartProbeMatch(r);
    if (p) return ((parseFloat(p.quantity) || 0) <= lowThreshold()) ? 'low' : 'ok';
    if (String(r.name || '').trim()) return 'new';
    return '';
  }
  // Colour the flat grid's cells of one row in place (no re-render → caret safe).
  function refreshSmartRowState(i) {
    var cont = document.getElementById('smartGrid');
    var r = _smartRows[i];
    if (!cont || !r) return;
    var t = smartColumns().length;
    if (!t) return;
    var state = smartRowState(r);
    for (var k = 0; k < t; k++) {
      var cell = cont.children[t + i * t + k];
      if (!cell || !cell.classList) continue;
      cell.classList.remove('smart-row-new', 'smart-row-ok', 'smart-row-low');
      if (state) cell.classList.add('smart-row-' + state);
    }
  }
  function refreshSmartAmount(i) {
    var r = _smartRows[i]; if (!r) return;
    var el = document.querySelector('#smartGrid [data-col="amount"][data-row="' + i + '"]');
    if (el) el.textContent = 'DA' + fmtMoney((parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0));
  }
  // Row number → product card, only when the row resolves to an existing
  // article. Everyone may view it (no permission gate), like the inventory «i».
  window.smartShowProduct = function (i) {
    var r = _smartRows[i]; if (!r) return;
    var p = smartProbeMatch(r);
    if (!p) return;
    if (typeof showProductDetails === 'function') showProductDetails(p.id);
  };
  window.smartCtxProduct = function (e, productId) {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof showProductDetails === 'function') showProductDetails(productId);
    return false;
  };
  // Toggling a field-visibility button must re-render the flat grid, otherwise
  // the header, the tracks and the cells drift apart.
  window.smartToggleFV = function (k) {
    try { if (window.FV && FV.toggle) FV.toggle(k); } catch (e) {}
    if (document.getElementById('smartGrid')) { try { renderSmartGrid(); } catch (e) {} }
  };
  function onSmartFVChanged() {
    if (document.getElementById('smartGrid')) { try { renderSmartGrid(); } catch (e) {} }
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('zmt:field-visibility-changed', onSmartFVChanged);
    // The standalone Quick-Entry window shares the same localStorage; a change
    // made there reaches this window as a storage event. Re-applying FV makes
    // the Smart grid hide exactly the fields Quick Entry hid.
    window.addEventListener('storage', function (e) {
      if (e && e.key && e.key !== 'zmt_field_visibility') return;
      try { if (window.FV && FV.apply) FV.apply(); } catch (err) {}
    });
  }

  // One column model drives the tracks, the header labels and the cells, and a
  // column hidden by the field-visibility settings is not emitted at all.
  // Emitting every cell and hiding some with CSS (the old body.fv-hide-* rules
  // match the inputs but never their header) used to slide each following
  // value into the neighbouring column: names in the quantity field, prices in
  // the barcode field.
  function smartHidden(fvKey) {
    if (!fvKey) return false;
    try { return !!(window.FV && FV.isVisible && FV.isVisible(fvKey) === false); } catch (e) { return false; }
  }
  function smartColumns() {
    var fl = (typeof FormLayout !== 'undefined') ? FormLayout : null;
    var defs = {
      idx: { label: '#', track: '40px' },
      name: { label: 'المنتج', track: 'minmax(260px,2fr)' },
      qty: { label: 'الكمية', track: '90px' },
      price: { label: 'شراء', track: '110px' },
      amount: { label: 'مبلغ المشتريات', track: '110px' },
      sell: { label: 'بيع', track: '110px' },
      whole: { label: 'جملة', track: '110px' },
      minPrice: { label: 'السعر الأدنى', track: '90px', fv: 'minPrice' },
      barcode: { label: 'الباركود', track: '140px' },
      reference: { label: 'المرجع', track: '120px', fv: 'reference' },
      plu: { label: 'PLU', track: '100px', fv: 'plu' },
      countryOfOrigin: { label: 'بلد', track: '100px', fv: 'country' },
      mark: { label: 'مارك', track: '100px', fv: 'mark' },
      del: { label: '', track: '44px' },
    };
    smartExtraFields().forEach(function (f) {
      defs['extra:' + f.id] = { label: f.name, color: f.color, track: '110px' };
    });
    // One shared order drives both grids; hidden FV fields simply do not emit a
    // column here (their slot in the shared order is untouched).
    var keys = fl ? fl.orderFor(fl.PAGE_SMART) : ['idx', 'name', 'qty', 'price', 'amount', 'sell', 'whole', 'minPrice', 'barcode', 'reference', 'plu', 'countryOfOrigin', 'mark', 'del'];
    if (!fl) smartExtraFields().forEach(function (f) { keys.splice(keys.length - 1, 0, 'extra:' + f.id); });
    var cols = [];
    keys.forEach(function (k) {
      var d = defs[k];
      if (!d) return;
      // مبلغ المشتريات stays an independent toggle, not a layout field.
      if (k === 'amount' && !smartShowAmount()) return;
      var track = d.track;
      if (fl) track = (k === 'name' ? 'minmax(' : '') + fl.widthFor(fl.PAGE_SMART, k) + 'px' + (k === 'name' ? ',2fr)' : '');
      cols.push({ key: k, label: d.label, color: d.color, fv: d.fv, track: track });
    });
    return cols.filter(function (c) { return !smartHidden(c.fv); });
  }

  function renderSmartGrid() {
    var cont = document.getElementById('smartGrid');
    if (!cont) return;
    // The grid is rebuilt from scratch, so any open name dropdown is gone too.
    _smartNameOpen = -1;
    _smartRefOpen = -1;
    _smartMarkOpen = -1;
    var cols = smartColumns();
    cont.style.gridTemplateColumns = cols.map(function (c) { return c.track; }).join(' ');
    cont.innerHTML = cols.map(function (c) {
      return '<div style="font-weight:700;font-size:12px;color:' + (c.color || 'var(--silver-600)') + '">' + escHtml(c.label) + '</div>';
    }).join('');
    _smartRows.forEach((r, i) => {
      var match = matchSmartRow(r);
      var p = match.product || smartRowProduct(r);
      r._matchId = p ? p.id : null;
      var extras = smartExtraFields();
      var map = r.extraPrices && typeof r.extraPrices === 'object' ? r.extraPrices : {};
      var cells = {
        idx: '<div class="smart-idx fl-drag-handle' + (p ? ' smart-idx-click' : '') + '" draggable="true" data-col="idx" data-row="' + i + '" title="اسحب لترتيب الأسطر — انقر على الرقم لبطاقة المنتج" oncontextmenu="if(event){event.preventDefault();}smartShowProduct(' + i + ');return false;">' +
          '<button type="button" class="fl-move" onclick="if(event)event.stopPropagation();smartMoveRow(' + i + ',-1)" title="تحريك السطر للأعلى">↑</button>' +
          '<span class="smart-idx-num" onclick="smartShowProduct(' + i + ')">' + (i + 1) + '</span>' +
          '<button type="button" class="fl-move" onclick="if(event)event.stopPropagation();smartMoveRow(' + i + ',1)" title="تحريك السطر للأسفل">↓</button>' +
        '</div>',
        name: '<div class="smart-name-wrap" data-col="name">' +
          '<input class="form-input" style="width:100%" data-col="name" data-row="' + i + '" value="' + escHtml(r.name) + '" autocomplete="off" oninput="smartNameInput(' + i + ',this.value)" onfocus="smartNameFocus(' + i + ',this.value)" onclick="smartNameFocus(' + i + ',this.value)" onblur="smartNameBlur(' + i + ')" onchange="updateSmartRow(' + i + ',\'name\',this.value)" title="' + escHtml(((r.verified === false) ? '⚠ تحقق من الكمية/السعر — لا يطابق مجموع السطر المطبوع. ' : '') + (match.via ? ('مطابق: ' + (p ? p.name : '')) : '')) + '">' +
          '<div class="smart-name-results" id="smartNameResults_' + i + '" onmousedown="event.preventDefault()"></div>' +
        '</div>',
        qty: '<input class="form-input" type="number" step="any" min="0" data-col="qty" data-row="' + i + '" value="' + (r.qty || 1) + '" oninput="updateSmartRow(' + i + ',\'qty\',this.value)" onchange="updateSmartRow(' + i + ',\'qty\',this.value)">',
        price: '<input class="form-input" type="number" step="any" min="0" data-col="price" data-row="' + i + '" value="' + (r.price || 0) + '" oninput="updateSmartRow(' + i + ',\'price\',this.value)" onchange="updateSmartRow(' + i + ',\'price\',this.value)">',
        amount: '<div class="smart-amount" data-col="amount" data-row="' + i + '" style="text-align:center;font-weight:700;direction:ltr;white-space:nowrap">DA' + fmtMoney((parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0)) + '</div>',
        sell: '<input class="form-input" type="number" step="any" min="0" data-col="sell" data-row="' + i + '" value="' + (r.sell === '' || r.sell == null ? '' : r.sell) + '" onchange="updateSmartRow(' + i + ',\'sell\',this.value)">',
        whole: '<input class="form-input" type="number" step="any" min="0" data-col="whole" data-row="' + i + '" value="' + (r.whole === '' || r.whole == null ? '' : r.whole) + '" onchange="updateSmartRow(' + i + ',\'whole\',this.value)">',
        minPrice: '<input class="form-input fv-minPrice" type="number" step="any" min="0" data-col="minPrice" data-row="' + i + '" title="السعر الأدنى" value="' + escHtml(Number(r.minPrice) > 0 ? r.minPrice : ((p && Number(p.minPrice) > 0) ? p.minPrice : 0)) + '" onchange="updateSmartRow(' + i + ',\'minPrice\',this.value)">',
        barcode: '<input class="form-input" data-col="barcode" data-row="' + i + '" value="' + escHtml(r.barcode || '') + '" onchange="updateSmartRow(' + i + ',\'barcode\',this.value)">',
        reference: '<div class="smart-name-wrap" data-col="reference">' +
          '<input class="form-input fv-reference" data-col="reference" data-row="' + i + '" value="' + escHtml(r.reference || '') + '" autocomplete="off" oninput="smartRefInput(' + i + ',this.value)" onfocus="smartRefFocus(' + i + ',this.value)" onclick="smartRefFocus(' + i + ',this.value)" onblur="smartRefBlur(' + i + ')" onchange="updateSmartRow(' + i + ',\'reference\',this.value)" title="مرجع">' +
          '<div class="smart-name-results" id="smartRefResults_' + i + '" onmousedown="event.preventDefault()"></div>' +
        '</div>',
        plu: '<input class="form-input fv-plu" data-col="plu" data-row="' + i + '" value="' + escHtml(r.plu || '') + '" dir="ltr" onchange="updateSmartRow(' + i + ',\'plu\',this.value)">',
        countryOfOrigin: '<input class="form-input fv-country" data-col="countryOfOrigin" data-row="' + i + '" value="' + escHtml(r.countryOfOrigin || '') + '" onchange="updateSmartRow(' + i + ',\'countryOfOrigin\',this.value)">',
        mark: '<div class="smart-name-wrap" data-col="mark">' +
          '<input class="form-input fv-mark" data-col="mark" data-row="' + i + '" value="' + escHtml(r.mark || '') + '" autocomplete="off" oninput="smartMarkInput(' + i + ',this.value)" onfocus="smartMarkFocus(' + i + ',this.value)" onclick="smartMarkFocus(' + i + ',this.value)" onblur="smartMarkBlur(' + i + ')" onchange="updateSmartRow(' + i + ',\'mark\',this.value)" title="مارك">' +
          '<div class="smart-name-results" id="smartMarkResults_' + i + '" onmousedown="event.preventDefault()"></div>' +
        '</div>',
        del: '<button type="button" class="btn btn-sm" onclick="removeSmartRow(' + i + ')"><i class="fas fa-times"></i></button>',
      };
      extras.forEach(function (f) {
        var value = map[f.id];
        var display = (value === '' || value == null) ? '' : value;
        cells['extra:' + f.id] = '<input class="form-input" type="number" step="any" min="0" data-col="extra:' + escHtml(f.id) + '" data-row="' + i + '" value="' + escHtml(display) + '" onchange="updateSmartExtraRow(' + i + ',\'' + escHtml(f.id) + '\',this.value)">';
      });
      var state = p ? (((parseFloat(p.quantity) || 0) <= lowThreshold()) ? 'low' : 'ok')
                    : (String(r.name || '').trim() ? 'new' : '');
      var start = cont.children.length;
      cont.insertAdjacentHTML('beforeend', cols.map(function (c) { return cells[c.key] || ''; }).join(''));
      for (var k = start; k < cont.children.length; k++) {
        var cellEl = cont.children[k];
        if (!cellEl || !cellEl.classList) continue;
        cellEl.classList.add('smart-cell');
        if (state) cellEl.classList.add('smart-row-' + state);
      }
    });
    updateSmartTotals();
    paintAllSmartPriceMarks();
    updateSmartAutoBtn();
    smartPaintCentBtn();
    applySmartCent();
  }

  window.updateSmartRow = function (i, field, value) {
    var r = _smartRows[i];
    if (!r) return;
    if (['qty', 'price', 'sell', 'whole', 'minPrice'].indexOf(field) >= 0) r[field] = parseFloat(value) || 0;
    else r[field] = value;
    if (SMART_MATCH_FIELDS.indexOf(field) >= 0) {
      // Manual edit: this value belongs to the user, never overwrite it.
      smartAutoMap(r)[field] = false;
    }
    // Totals are qty × buy-price: update them live, not only on blur.
    if (field === 'qty' || field === 'price') {
      try { window.updateSmartTotals(); } catch (e) {}
      refreshSmartAmount(i);
    }
    if (field === 'name') {
      // Name changed -> previous auto-filled barcode/ref/mark is stale.
      clearSmartAuto(r);
      matchSmartRow(r);
      syncSmartRowInputs(i);
    }
    if (typeof FormLayout !== 'undefined' && FormLayout.enabled()) {
      if (field === 'sell' || field === 'whole' || field === 'minPrice') {
        FormLayout.lockPrice(FormLayout.priceState(r), field);
        paintSmartPriceMarks(i);
      } else if (field === 'price') {
        smartAutoFillRow(r, 'buy');
      }
    }
    refreshSmartRowState(i);
    smartRecordHistory();
  };

  window.updateSmartExtraRow = function (i, fieldId, value) {
    var r = _smartRows[i];
    if (!r) return;
    if (!r.extraPrices || typeof r.extraPrices !== 'object') r.extraPrices = {};
    var v = parseFloat(value) || 0;
    if (v > 0) r.extraPrices[fieldId] = v;
    else delete r.extraPrices[fieldId];
    if (typeof FormLayout !== 'undefined' && FormLayout.enabled()) {
      FormLayout.lockPrice(FormLayout.priceState(r), FormLayout.extraKey(fieldId));
      paintSmartPriceMarks(i);
    }
    smartRecordHistory();
  };

  /* ---------- tiered auto-fill — shared with Quick Entry ---------------- */
  // Buying price is the ONLY base. sell / wholesale / minimum / every extra
  // price are derived from the band that matches it. A hand-typed value locks just that
  // cell; editing the buying price recalculates unlocked cells only.
  function smartCell(i, key) {
    return document.querySelector('#smartGrid [data-col="' + key + '"][data-row="' + i + '"]');
  }
  function paintSmartPriceMarks(i) {
    if (typeof FormLayout === 'undefined' || i == null || i < 0) return;
    var r = _smartRows[i]; if (!r) return;
    var st = FormLayout.priceState(r);
    var keys = ['sell', 'whole', 'minPrice'];
    smartExtraFields().forEach(function (f) { keys.push(FormLayout.extraKey(f.id)); });
    keys.forEach(function (k) {
      var el = smartCell(i, k);
      if (!el || !el.classList) return;
      el.classList.remove('fl-locked-price', 'fl-auto-price');
      if (st.locked[k]) el.classList.add('fl-locked-price');
      else if (st.auto[k]) el.classList.add('fl-auto-price');
    });
  }
  function paintAllSmartPriceMarks() {
    for (var i = 0; i < _smartRows.length; i++) paintSmartPriceMarks(i);
  }
  function smartAutoFillRow(r, mode) {
    if (!r || typeof FormLayout === 'undefined' || !FormLayout.enabled()) return 0;
    var i = _smartRows.indexOf(r);
    var st = FormLayout.priceState(r);
    var targets = [
      { key: 'sell', value: r.sell, set: function (v) {
        r.sell = v; var el = smartCell(i, 'sell'); if (el) el.value = v;
      } },
      { key: 'whole', value: r.whole, set: function (v) {
        r.whole = v; var el = smartCell(i, 'whole'); if (el) el.value = v;
      } },
      { key: 'minPrice', value: r.minPrice, set: function (v) {
        r.minPrice = v; var el = smartCell(i, 'minPrice'); if (el) el.value = v;
      } },
    ];
    smartExtraFields().forEach(function (f) {
      var key = FormLayout.extraKey(f.id);
      var map = r.extraPrices && typeof r.extraPrices === 'object' ? r.extraPrices : (r.extraPrices = {});
      targets.push({ key: key, value: map[f.id], set: function (v) {
        if (parseFloat(v) > 0) map[f.id] = parseFloat(v); else delete map[f.id];
        var el = smartCell(i, key); if (el) el.value = v;
      } });
    });
    var n = FormLayout.fillRow(parseFloat(r.price) || 0, st, targets, mode);
    if (n) paintSmartPriceMarks(i);
    return n;
  }
  function updateSmartAutoBtn() {
    var btn = document.getElementById('smartAutoBtn');
    if (!btn || typeof FormLayout === 'undefined') return;
    var on = FormLayout.enabled();
    if (btn.classList) btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  window.smartToggleAutoFill = function () {
    if (typeof FormLayout === 'undefined') return;
    var on = !FormLayout.enabled();
    FormLayout.setLive({ autoFill: { enabled: on } });
    if (on) _smartRows.forEach(function (r) { smartAutoFillRow(r, 'toggle'); });
    updateSmartAutoBtn();
  };
  window.smartOpenLayout = function () {
    if (typeof FormLayout !== 'undefined') FormLayout.open(FormLayout.PAGE_SMART);
  };

  /* ---------- row reordering (drag handle + ↑↓ in the number column) ----- */
  window.smartMoveRow = function (i, dir) {
    var to = i + (dir < 0 ? -1 : 1);
    if (i < 0 || to < 0 || to >= _smartRows.length) return;
    var moved = _smartRows.splice(i, 1)[0];
    _smartRows.splice(to, 0, moved);
    renderSmartGrid();
    smartRecordHistory();
  };
  window.smartReorderRows = function (from, to) {
    if (from == null || to == null || from === to) return;
    if (from < 0 || from >= _smartRows.length || to < 0 || to >= _smartRows.length) return;
    var moved = _smartRows.splice(from, 1)[0];
    _smartRows.splice(to, 0, moved);
    renderSmartGrid();
    smartRecordHistory();
  };
  var _smartGridDragBound = false;
  function bindSmartGridDrag() {
    if (_smartGridDragBound) return;
    var cont = document.getElementById('smartGrid');
    if (!cont || !cont.addEventListener) return;
    _smartGridDragBound = true;
    // Commit the .00 format when a money cell loses focus, not on every key.
    cont.addEventListener('focusout', function (e) {
      if (!smartCentOn() || !isSmartMoneyInput(e.target) || e.target.value === '') return;
      var f = CentFormat.format(e.target.value);
      if (f) e.target.value = f;
    });
    var from = null;
    cont.addEventListener('dragstart', function (e) {
      var handle = e.target && e.target.closest ? e.target.closest('.fl-drag-handle') : null;
      var cell = handle && handle.getAttribute ? handle : null;
      if (!cell || cell.getAttribute('data-col') !== 'idx') { if (e.preventDefault) e.preventDefault(); return; }
      from = parseInt(cell.getAttribute('data-row'), 10);
      cell.classList.add('fl-row-drag');
      if (e.dataTransfer) { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(from)); } catch (x) {} }
    });
    cont.addEventListener('dragover', function (e) {
      var cell = e.target && e.target.closest ? e.target.closest('[data-col="idx"]') : null;
      if (cell && from != null) { if (e.preventDefault) e.preventDefault(); cell.classList.add('fl-row-over'); }
    });
    cont.addEventListener('dragleave', function (e) {
      var cell = e.target && e.target.closest ? e.target.closest('[data-col="idx"]') : null;
      if (cell) cell.classList.remove('fl-row-over');
    });
    cont.addEventListener('drop', function (e) {
      var cell = e.target && e.target.closest ? e.target.closest('[data-col="idx"]') : null;
      if (!cell || from == null) return;
      if (e.preventDefault) e.preventDefault();
      window.smartReorderRows(from, parseInt(cell.getAttribute('data-row'), 10));
      from = null;
    });
    cont.addEventListener('dragend', function () {
      from = null;
      var all = cont.querySelectorAll('.fl-row-drag, .fl-row-over');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('fl-row-drag', 'fl-row-over');
    });
  }
  if (typeof FormLayout !== 'undefined' && FormLayout.onApply) {
    FormLayout.onApply(function () {
      if (document.getElementById('smartGrid')) renderSmartGrid();
      updateSmartAutoBtn();
    });
  }

  // Index of the row whose name dropdown is currently open (-1 = none). Escape
  // uses it to close the list first instead of the whole modal.
  var _smartNameOpen = -1;
  // ---- "similar products" scoring for the name dropdown --------------------
  // The strict scorer used by the search boxes requires EVERY word of the query
  // to appear in the product, so a long OCR name ("AILE FPI.TH VIGO 2007-09 4X2
  // LH") finds nothing as soon as the stored name is worded a little
  // differently. The dropdown is a helper, not a filter, so it also accepts
  // "similar" articles: a shared 4-letter run, or at least four letters in
  // common regardless of order. Strong matches always rank first.
  function smartFuzzyKey(v) {
    return String(v || '')
      .toLowerCase()
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[^0-9a-z\u0600-\u06FF]+/g, '');
  }
  // Distinct characters the two keys share, ignoring order.
  function smartSharedChars(a, b) {
    var setB = {}, i;
    for (i = 0; i < b.length; i++) setB[b[i]] = true;
    var seen = {}, n = 0;
    for (i = 0; i < a.length; i++) {
      var c = a[i];
      if (setB[c] && !seen[c]) { seen[c] = true; n++; }
    }
    return n;
  }
  // Distinct k-letter runs present in both keys (position-independent).
  function smartSharedGrams(a, b, k) {
    if (a.length < k || b.length < k) return 0;
    var grams = {}, i, n = 0, seen = {};
    for (i = 0; i + k <= a.length; i++) grams[a.slice(i, i + k)] = true;
    for (i = 0; i + k <= b.length; i++) {
      var g = b.slice(i, i + k);
      if (grams[g] && !seen[g]) { seen[g] = true; n++; }
    }
    return n;
  }
  function smartNameSuggestions(value) {
    var q = normSearch(value || '');
    if (!q) return [];
    var qk = smartFuzzyKey(value);
    if (!qk) return [];
    var prods = DB.getProducts() || [];
    var out = [];
    for (var i = 0; i < prods.length; i++) {
      var p = prods[i];
      var base = 0;
      try { base = productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin) || 0; } catch (e) {}
      var pk = smartFuzzyKey(p.name);
      var grams = smartSharedGrams(qk, pk, 4);
      var chars = smartSharedChars(qk, pk);
      // Floor requested by the user: four letters in common, any order.
      if (!(base > 0 || grams > 0 || chars >= 4)) continue;
      out.push({ p: p, s: base * 100 + grams * 10 + chars, grams: grams, chars: chars });
    }
    out.sort(function (a, b) {
      if (b.s !== a.s) return b.s - a.s;
      return String(a.p.name || '').localeCompare(String(b.p.name || ''));
    });
    return out.slice(0, 15).map(function (x) { return x.p; });
  }
  // Build the "similar products" list for row `i` from a query. Pure display:
  // it never touches the row's data, so calling it on focus cannot drop a
  // barcode/reference that was matched automatically.
  function smartShowNameList(i, value) {
    var box = document.getElementById('smartNameResults_' + i);
    if (!box) return;
    var prods = smartNameSuggestions(value);
    if (!prods.length) { smartHideNameList(i); return; }
    box.innerHTML = '<div class="smart-name-head">' +
        '<span>منتجات مشابهة</span>' +
        '<button type="button" class="smart-name-close" title="إغلاق القائمة دون اختيار" onclick="smartCloseNameList(' + i + ')">إغلاق ✕</button>' +
      '</div>' +
      prods.map((p) => {
      return '<div class="smart-name-item" onclick="smartPickProduct(' + i + ',\'' + p.id + '\')" oncontextmenu="if(event){event.preventDefault();}smartCtxProduct(event,\'' + p.id + '\');return false;" title="كليك يمين: تفاصيل المنتج">' +
        '<strong>' + escHtml(p.name) + '</strong>' +
        (p.barcode ? ' <span style="color:var(--silver-500);font-size:11px">' + escHtml(p.barcode) + '</span>' : '') +
        (p.mark ? ' <span style="color:var(--silver-400);font-size:11px">' + escHtml(p.mark) + '</span>' : '') +
        '</div>';
    }).join('');
    box.style.display = 'block';
    _smartNameOpen = i;
  }
  function smartHideNameList(i) {
    var box = document.getElementById('smartNameResults_' + i);
    if (box) { box.innerHTML = ''; box.style.display = 'none'; }
    if (_smartNameOpen === i) _smartNameOpen = -1;
  }
  // ===== HISTORY (UNDO / REDO) =========================================
  function smartPaidValue() {
    var el = document.getElementById('smartPaid');
    return el ? (parseFloat(el.value) || 0) : 0;
  }
  function smartSetPaidValue(v) {
    var el = document.getElementById('smartPaid');
    if (el) el.value = (v == null ? 0 : v);
  }
  function smartSnapshotStr() {
    return JSON.stringify({ rows: _smartRows, paid: smartPaidValue() });
  }
  function smartUpdateUndoButtons() {
    var u = document.getElementById('smartUndoBtn');
    var r = document.getElementById('smartRedoBtn');
    if (u) u.disabled = !(_smartUndoPtr > 0);
    if (r) r.disabled = !(_smartUndoPtr >= 0 && _smartUndoPtr < _smartUndo.length - 1);
  }
  function smartResetHistory() {
    _smartUndo = [smartSnapshotStr()];
    _smartUndoPtr = 0;
    smartUpdateUndoButtons();
  }
  function smartRecordHistory() {
    var snap = smartSnapshotStr();
    if (_smartUndoPtr >= 0 && _smartUndo[_smartUndoPtr] === snap) return;
    _smartUndo = _smartUndo.slice(0, _smartUndoPtr + 1);
    _smartUndo.push(snap);
    if (_smartUndo.length > 200) { _smartUndo.shift(); if (_smartUndoPtr > 0) _smartUndoPtr--; }
    _smartUndoPtr = _smartUndo.length - 1;
    smartUpdateUndoButtons();
  }
  window.smartUndo = function () {
    if (_smartUndoPtr <= 0) return;
    _smartUndoPtr--;
    var st = JSON.parse(_smartUndo[_smartUndoPtr]);
    _smartRows = JSON.parse(JSON.stringify(st.rows));
    smartSetPaidValue(st.paid);
    renderSmartGrid();
    smartUpdateUndoButtons();
  };
  window.smartRedo = function () {
    if (_smartUndoPtr >= _smartUndo.length - 1) return;
    _smartUndoPtr++;
    var st = JSON.parse(_smartUndo[_smartUndoPtr]);
    _smartRows = JSON.parse(JSON.stringify(st.rows));
    smartSetPaidValue(st.paid);
    renderSmartGrid();
    smartUpdateUndoButtons();
  };
  window.smartRecordHistory = smartRecordHistory;
  window.smartResetHistory = smartResetHistory;
  // ===== REFERENCE DROPDOWN ============================================
  function smartRefSuggestions(value) {
    var q = String(value == null ? '' : value).trim().toLowerCase();
    var seen = {};
    var out = [];
    (DB.getProducts() || []).forEach(function (p) {
      var v = p.reference;
      if (!v) return;
      if (seen[v]) return;
      seen[v] = true;
      if (!q || String(v).toLowerCase().indexOf(q) >= 0) out.push(String(v));
    });
    return out.slice(0, 15);
  }
  function smartHideRefList(i) {
    var box = document.getElementById('smartRefResults_' + i);
    if (box) { box.innerHTML = ''; box.style.display = 'none'; }
    if (_smartRefOpen === i) _smartRefOpen = -1;
  }
  function smartShowRefList(i, value) {
    var box = document.getElementById('smartRefResults_' + i);
    if (!box) return;
    var vals = smartRefSuggestions(value);
    if (!vals.length) { smartHideRefList(i); return; }
    box.innerHTML = '<div class="smart-name-head"><span>مراجع موجودة</span>' +
      '<button type="button" class="smart-name-close" onclick="smartCloseRefList(' + i + ')">إغلاق ✕</button></div>' +
      vals.map(function (v) {
        return '<div class="smart-name-item" data-v="' + escHtml(v) + '" onclick="smartPickRef(' + i + ', this.dataset.v)">' + escHtml(v) + '</div>';
      }).join('');
    box.style.display = 'block';
    _smartRefOpen = i;
  }
  window.smartCloseRefList = function (i) { smartHideRefList(i); };
  window.smartRefInput = function (i, value) {
    if (!_smartRows[i]) return;
    _smartRows[i].reference = value;
    var a = smartAutoMap(_smartRows[i]);
    a.reference = false;
    var el = document.querySelector('[data-col="reference"][data-row="' + i + '"]');
    if (el) el.value = value;
    smartShowRefList(i, value);
    smartRecordHistory();
  };
  window.smartRefFocus = function (i, value) {
    if (!_smartRows[i]) return;
    smartShowRefList(i, value);
  };
  window.smartRefBlur = function (i) {
    setTimeout(function () { smartHideRefList(i); }, 150);
  };
  window.smartPickRef = function (i, value) {
    var row = _smartRows[i];
    if (!row) return;
    row.reference = value;
    smartAutoMap(row).reference = false;
    smartHideRefList(i);
    var el = document.querySelector('[data-col="reference"][data-row="' + i + '"]');
    if (el) el.value = value;
    refreshSmartRowState(i);
    smartRecordHistory();
  };
  // ===== MARK DROPDOWN ===================================================
  function smartMarkSuggestions(value) {
    var q = String(value == null ? '' : value).trim().toLowerCase();
    var seen = {};
    var out = [];
    (DB.getProducts() || []).forEach(function (p) {
      var v = p.mark;
      if (!v) return;
      if (seen[v]) return;
      seen[v] = true;
      if (!q || String(v).toLowerCase().indexOf(q) >= 0) out.push(String(v));
    });
    return out.slice(0, 15);
  }
  function smartHideMarkList(i) {
    var box = document.getElementById('smartMarkResults_' + i);
    if (box) { box.innerHTML = ''; box.style.display = 'none'; }
    if (_smartMarkOpen === i) _smartMarkOpen = -1;
  }
  function smartShowMarkList(i, value) {
    var box = document.getElementById('smartMarkResults_' + i);
    if (!box) return;
    var vals = smartMarkSuggestions(value);
    if (!vals.length) { smartHideMarkList(i); return; }
    box.innerHTML = '<div class="smart-name-head"><span>مارك موجود</span>' +
      '<button type="button" class="smart-name-close" onclick="smartCloseMarkList(' + i + ')">إغلاق ✕</button></div>' +
      vals.map(function (v) {
        return '<div class="smart-name-item" data-v="' + escHtml(v) + '" onclick="smartPickMark(' + i + ', this.dataset.v)">' + escHtml(v) + '</div>';
      }).join('');
    box.style.display = 'block';
    _smartMarkOpen = i;
  }
  window.smartCloseMarkList = function (i) { smartHideMarkList(i); };
  window.smartMarkInput = function (i, value) {
    if (!_smartRows[i]) return;
    _smartRows[i].mark = value;
    var a = smartAutoMap(_smartRows[i]);
    a.mark = false;
    var el = document.querySelector('[data-col="mark"][data-row="' + i + '"]');
    if (el) el.value = value;
    smartShowMarkList(i, value);
    smartRecordHistory();
  };
  window.smartMarkFocus = function (i, value) {
    if (!_smartRows[i]) return;
    smartShowMarkList(i, value);
  };
  window.smartMarkBlur = function (i) {
    setTimeout(function () { smartHideMarkList(i); }, 150);
  };
  window.smartPickMark = function (i, value) {
    var row = _smartRows[i];
    if (!row) return;
    row.mark = value;
    smartAutoMap(row).mark = false;
    smartHideMarkList(i);
    var el = document.querySelector('[data-col="mark"][data-row="' + i + '"]');
    if (el) el.value = value;
    refreshSmartRowState(i);
    smartRecordHistory();
  };
  // Explicit close button on the dropdown header: dismiss the list without
  // choosing anything. The row's name is left exactly as the user had it.
  window.smartCloseNameList = function (i) { smartHideNameList(i); };
  // F1-style name autocomplete inside the smart preview grid.
  window.smartNameInput = function (i, value) {
    if (!_smartRows[i]) return;
    _smartRows[i].name = value;
    // Typing a new name invalidates anything auto-filled for the old one.
    clearSmartAuto(_smartRows[i]);
    var el = document.querySelector('[data-col="name"][data-row="' + i + '"]');
    if (el) el.value = value;
    syncSmartRowInputs(i);
    refreshSmartRowState(i);
    smartShowNameList(i, value);
    smartRecordHistory();
  };
  // Clicking / focusing the name field shows the same list for the value that
  // is already there (e.g. a name read from the invoice), so an existing
  // article can be picked without retyping. Display only — it must never clear
  // the auto-matched barcode/reference, so it does not go through
  // smartNameInput (which drops the auto-fills).
  window.smartNameFocus = function (i, value) {
    if (!_smartRows[i]) return;
    smartShowNameList(i, value);
  };
  window.smartNameBlur = function (i) {
    // Delay so a click on a suggestion still lands before the list is hidden
    // (the results box also calls preventDefault on mousedown as a safeguard).
    setTimeout(function () { smartHideNameList(i); }, 150);
  };

  window.smartPickProduct = function (i, productId) {
    var row = _smartRows[i];
    var p = DB.getProduct(productId);
    if (!row || !p) return;
    row.productId = p.id;
    row.name = p.name;
    row.barcode = p.barcode || row.barcode || '';
    row.reference = p.reference || row.reference || '';
    row.plu = p.plu || row.plu || '';
    row.countryOfOrigin = p.countryOfOrigin || row.countryOfOrigin || '';
    row.mark = p.mark || row.mark || '';
    // Sell / wholesale prices stay untouched — the user fills them.
    // A manual pick is user evidence: keep these values, don't treat them
    // as disposable auto-fills.
    row._auto = {};
    smartHideNameList(i);
    renderSmartGrid();
    smartFocus('qty', i);
    smartRecordHistory();
  };
  window.removeSmartRow = function (i) {
    _smartRows.splice(i, 1);
    renderSmartGrid();
    // Keep keyboard flow: focus the same row's name cell, else last row.
    if (_smartRows.length) smartFocus('name', Math.min(i, _smartRows.length - 1));
    smartRecordHistory();
  };
  window.updateSmartTotals = function () {
    var total = _smartRows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
    var el = document.getElementById('smartTotal');
    if (el) el.textContent = 'الإجمالي: DA' + fmtMoney(total);
  };

  window.confirmSmartEdit = function () {
    if (!_smartRows.length) { alert('أضف منتجًا واحدًا على الأقل'); return; }
    var supplierName = document.getElementById('smartSupplier') ? document.getElementById('smartSupplier').value.trim() : '';
    var supplierId = null;
    if (supplierName) {
      var sup = (DB.getSuppliers() || []).find((s) => s.name === supplierName);
      if (sup) supplierId = sup.id;
    }
    var total = _smartRows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
    var paidEl = document.getElementById('smartPaid');
    var paid = paidEl ? (parseFloat(paidEl.value) || 0) : 0;
    if (paid > total) paid = total;
    var supplierDebt = Math.max(0, total - paid);

    // Create invoice (purchase/supplier format)
    var invoiceId = null;
    try {
      var items = _smartRows.map((r) => {
        var match = matchSmartRow(r);
        var p = match.product;
        var enteredExtras = {};
        var validExtraIds = {};
        smartExtraFields().forEach(function (f) { validExtraIds[f.id] = true; });
        var rowExtras = r.extraPrices && typeof r.extraPrices === 'object' ? r.extraPrices : {};
        Object.keys(rowExtras).forEach(function (id) {
          if (validExtraIds[id] && (parseFloat(rowExtras[id]) || 0) > 0) enteredExtras[id] = parseFloat(rowExtras[id]) || 0;
        });
        var extraPrices = p ? Object.assign({}, p.extraPrices || {}, enteredExtras) : enteredExtras;
        if (window.ExtraPrices && ExtraPrices.cleanPriceMap) extraPrices = ExtraPrices.cleanPriceMap(extraPrices);
        var prod = p
          ? DB.addOrMergeProduct({
              id: p.id,
              name: p.name,
              barcode: r.barcode || p.barcode || '',
              brandId: p.brandId || '',
              buyPrice: r.price || p.buyPrice || 0,
              sellPrice: r.sell || p.sellPrice || 0,
              wholesalePrice: r.whole || p.wholesalePrice || 0,
              extraPrices: extraPrices,
              quantity: r.qty || 0,
              supplierId: supplierId,
              reference: r.reference || p.reference || '',
              plu: r.plu || p.plu || '',
              countryOfOrigin: r.countryOfOrigin || p.countryOfOrigin || '',
              mark: r.mark || p.mark || '',
              minPrice: (parseFloat(r.minPrice) || parseFloat(p.minPrice) || 0),
            }, { source: 'smart-purchase-existing' })
          : DB.addOrMergeProduct({
              name: r.name,
              barcode: r.barcode || (DB.generateBarcode ? DB.generateBarcode() : ('P' + Date.now())),
              buyPrice: r.price || 0,
              sellPrice: r.sell || r.price || 0,
              wholesalePrice: r.whole || 0,
              extraPrices: extraPrices,
              quantity: r.qty || 0,
              supplierId: supplierId,
              reference: r.reference || '',
              plu: r.plu || '',
              countryOfOrigin: r.countryOfOrigin || '',
              mark: r.mark || '',
              minPrice: Math.max(0, parseFloat(r.minPrice) || 0),
            }, { source: 'smart-purchase-new' });
        var prod2 = prod && prod.product ? prod.product : prod;
        return {
          productId: prod2 ? prod2.id : null,
          barcode: prod2 ? prod2.barcode : (r.barcode || ''),
          name: prod2 ? prod2.name : r.name,
          qty: r.qty || 1,
          price: r.price || 0,
          total: (r.qty || 0) * (r.price || 0),
          costPrice: r.price || 0,
        };
      });
      var inv = DB.addInvoice({
        supplierId: supplierId || null,
        type: supplierId ? 'supplier' : 'purchase',
        date: Date.now(),
        items: items,
        totalAmount: total,
        timbreFiscal: 0,
      });
      invoiceId = inv && inv.id ? inv.id : null;
    } catch (e) {
      console.warn('[SmartAdd] invoice create failed', e);
    }

    // Payment (supplier debt)
    if (supplierId) {
      var sup = (DB.getSuppliers() || []).find((s) => s.id === supplierId);
      if (sup) {
        var list = DB.getSuppliers() || [];
        var idx = list.findIndex((s) => s.id === supplierId);
        if (idx >= 0) {
          list[idx].balance = (parseFloat(list[idx].balance) || 0) + supplierDebt;
          DB.saveSuppliers(list);
        }
      }
      if (paid > 0) {
        try {
          DB.addPayment({
            supplierId: supplierId,
            invoiceId: invoiceId || undefined,
            amount: paid,
            method: 'cash',
            note: 'دفعة عند الإضافة الذكية',
          });
        } catch (e) {}
      }
    }

    closeSmartEdit();
    if (typeof filterInvoices === 'function') filterInvoices();
    alert('تم تسجيل فاتورة الشراء بقيمة DA' + fmtMoney(total));
  };
})();
