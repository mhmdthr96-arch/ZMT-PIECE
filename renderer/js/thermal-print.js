/* ============================================================
   ZMT PIECE — الطباعة الحرارية (Thermal printer)
   ------------------------------------------------------------
   Small 58/80 mm roll printers (cafés / restaurants / POS). The
   receipt is plain HTML printed *silently* through the same hidden
   BrowserWindow path the restaurant module already uses
   (main.js restPrintHidden → webContents.print({silent:true})), so
   no ESC/POS driver is required and Arabic renders correctly,
   because Windows rasterises the page through the printer driver.

   Everything is stored per device in localStorage, so nothing here
   ever touches the database, stock, invoices or LAN sync.
   ============================================================ */
(function () {
  'use strict';

  var TP_KEY = 'zmt_thermal_settings';

  var DEFAULTS = {
    enabled: false,
    printer: '',
    paperWidth: 80,
    marginTop: 2, marginRight: 2, marginBottom: 2, marginLeft: 2,
    fontSize: 11,
    fontFamily: 'mono',
    fontWeight: 'normal',
    lineHeight: 1.3,
    rotation: 0,
    scale: 100,
    copies: 1,
    direction: 'rtl',
    showStore: true,
    showAddress: true,
    showDateTime: true,
    showFooter: true,
    footerText: ''
  };

  /* ---------- tiny helpers ---------- */

  function T(key, fb) {
    try { var v = (typeof window.t === 'function') ? window.t(key) : ''; return v || fb; }
    catch (e) { return fb; }
  }
  function esc(v) {
    if (typeof window.escHtml === 'function') { try { return window.escHtml(v); } catch (e) {} }
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(v) {
    try { return (typeof window.fmtMoney === 'function') ? window.fmtMoney(v) : String(v); }
    catch (e) { return String(v); }
  }
  function num(v) {
    if (v == null) return 0;
    var s = (typeof window.toLatinDigits === 'function') ? window.toLatinDigits(String(v)) : String(v);
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function clamp(v, a, b) { v = num(v); return v < a ? a : (v > b ? b : v); }
  function $(id) { return document.getElementById(id); }

  /* ---------- persistence ---------- */

  var saved = loadSettings();

  function loadSettings() {
    var d = Object.assign({}, DEFAULTS);
    try {
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(TP_KEY) : null;
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          Object.keys(DEFAULTS).forEach(function (k) { if (o[k] !== undefined && o[k] !== null) d[k] = o[k]; });
        }
      }
    } catch (e) { /* keep defaults */ }
    d.enabled = !!d.enabled;
    return d;
  }
  function persist() { try { localStorage.setItem(TP_KEY, JSON.stringify(saved)); } catch (e) {} }

  /* ---------- receipt HTML ---------- */

  function fontStack(fam) {
    if (fam === 'sans') return "'Segoe UI','Helvetica Neue',Arial,sans-serif";
    if (fam === 'serif') return "Georgia,'Times New Roman',serif";
    return "'Courier New',ui-monospace,Consolas,monospace";
  }
  function weightCss(w) { return w === '900' ? '900' : (w === 'bold' ? '700' : '400'); }

  function normalizeItems(inv, res) {
    var items = (res && res.items) || (inv && inv.items) || [];
    return items.map(function (it) {
      var qty = num(it.qty);
      var unit = num(it.price);
      var line = (it.total != null) ? num(it.total) : unit * qty;
      return { name: it.name || '', qty: qty, unit: unit, line: line, orig: num(it.originalPrice != null ? it.originalPrice : it.price) };
    });
  }

  // Build a complete, standalone HTML document for the receipt.
  function buildReceiptHtml(inv, res, s) {
    s = s || saved;
    var store = (typeof window.getPrintInfo === 'function') ? window.getPrintInfo() : { name: 'ZMT PIECE' };
    var items = normalizeItems(inv, res);
    var totalAmount = (res && res.totalAmount != null) ? num(res.totalAmount) : num(inv && inv.totalAmount);
    var gross = items.reduce(function (a, it) { return a + it.orig * it.qty; }, 0);
    if (gross <= 0) gross = totalAmount;
    var discount = Math.max(0, gross - totalAmount);

    var when = new Date((inv && inv.createdAt) || Date.now());
    var dateStr = when.toLocaleDateString('fr-DZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
    var timeStr = when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    var paper = clamp(s.paperWidth, 40, 120);
    var mT = clamp(s.marginTop, 0, 20), mB = clamp(s.marginBottom, 0, 20);
    var mL = clamp(s.marginLeft, 0, 20), mR = clamp(s.marginRight, 0, 20);
    var contentW = Math.max(30, paper - mL - mR);
    var fs = clamp(s.fontSize, 7, 24);
    var lh = clamp(s.lineHeight, 1, 2.4);
    var zoom = clamp(s.scale, 50, 200) / 100;
    var rot = clamp(s.rotation, 0, 359);
    var dir = (s.direction === 'ltr') ? 'ltr' : 'rtl';

    var rows = items.map(function (it) {
      return '<tr>' +
        '<td class="tp-c-name">' + esc(it.name || '—') + '</td>' +
        '<td class="tp-c-qty">' + it.qty + '</td>' +
        '<td class="tp-c-price">' + money(it.unit) + '</td>' +
        '<td class="tp-c-total">' + money(it.line) + '</td>' +
        '</tr>';
    }).join('');

    var footTxt = (s.footerText && String(s.footerText).trim()) ? String(s.footerText).trim() : T('thermal.thanks', 'شكرًا لزيارتكم');
    var footer = s.showFooter ? ('<div class="tp-foot">' + esc(footTxt) + '</div>') : '';

    var head = '';
    if (s.showStore) head += '<div class="tp-store">' + esc(store.name || '') + '</div>';
    if (s.showAddress) {
      if (store.address) head += '<div class="tp-meta">' + esc(store.address) + '</div>';
      if (store.phone) head += '<div class="tp-meta">Tél: ' + esc(store.phone) + '</div>';
    }
    if (s.showDateTime) head += '<div class="tp-meta">' + esc(dateStr) + ' — ' + esc(timeStr) + '</div>';

    return '<!DOCTYPE html><html dir="' + dir + '"><head><meta charset="utf-8"><title>Ticket</title><style>' +
      '@page{ size:' + paper + 'mm auto; margin:' + mT + 'mm ' + mR + 'mm ' + mB + 'mm ' + mL + 'mm; }' +
      'html,body{ margin:0; padding:0; background:#fff; color:#000; }' +
      'body{ font-family:' + fontStack(s.fontFamily) + '; font-size:' + fs + 'px; font-weight:' + weightCss(s.fontWeight) + '; line-height:' + lh + '; }' +
      '.tp-doc{ width:' + contentW + 'mm; max-width:100%; margin:0 auto; zoom:' + zoom + ';' + (rot ? ' transform:rotate(' + rot + 'deg);' : '') + ' }' +
      '.tp-store{ font-size:' + (fs + 3) + 'px; font-weight:900; text-align:center; letter-spacing:.3px; }' +
      '.tp-meta{ text-align:center; font-size:' + Math.max(6, fs - 1) + 'px; margin-top:1px; }' +
      '.tp-rule{ border:0; border-top:1px dashed #000; margin:6px 0; }' +
      'table{ width:100%; border-collapse:collapse; }' +
      'thead th{ font-size:' + Math.max(6, fs - 1) + 'px; text-align:start; border-bottom:1px dashed #000; padding-bottom:2px; }' +
      'td,th{ padding:2px 0; vertical-align:top; }' +
      '.tp-c-name{ word-break:break-word; }' +
      '.tp-c-qty{ text-align:center; } .tp-c-price,.tp-c-total{ text-align:end; white-space:nowrap; }' +
      '.tp-sum .tp-line{ display:flex; justify-content:space-between; gap:8px; }' +
      '.tp-sum .tp-net{ font-weight:900; font-size:' + (fs + 2) + 'px; border-top:1px dashed #000; margin-top:3px; padding-top:3px; }' +
      '.tp-foot{ text-align:center; margin-top:8px; font-size:' + Math.max(6, fs - 1) + 'px; }' +
      '.tp-cut{ text-align:center; margin-top:10px; font-size:' + Math.max(6, fs - 2) + 'px; }' +
      '</style></head><body><div class="tp-doc">' +
        '<div class="tp-head">' + head + '</div>' +
        '<hr class="tp-rule">' +
        '<table class="tp-items"><thead><tr>' +
          '<th>' + esc(T('thermal.item', 'المنتج')) + '</th>' +
          '<th class="tp-c-qty">' + esc(T('thermal.qty', 'كمية')) + '</th>' +
          '<th class="tp-c-price">' + esc(T('thermal.price', 'السعر')) + '</th>' +
          '<th class="tp-c-total">' + esc(T('thermal.total', 'الإجمالي')) + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
        '<hr class="tp-rule">' +
        '<div class="tp-sum">' +
          '<div class="tp-line"><span>' + esc(T('thermal.gross', 'الإجمالي')) + '</span><span>' + money(gross) + '</span></div>' +
          '<div class="tp-line"><span>' + esc(T('thermal.discount', 'التخفيض')) + '</span><span>' + money(discount) + '</span></div>' +
          '<div class="tp-line tp-net"><span>' + esc(T('thermal.netTotal', 'الإجمالي بعد التخفيض')) + '</span><span>' + money(totalAmount) + '</span></div>' +
        '</div>' +
        footer +
        '<div class="tp-cut">· · · · · · · · · · · · · ·</div>' +
      '</div></body></html>';
  }

  /* ---------- printing ---------- */

  function listPrinters() {
    if (!window.electronAPI || !window.electronAPI.restListPrinters) return Promise.resolve([]);
    try {
      return window.electronAPI.restListPrinters().then(function (l) { return l || []; })
        .catch(function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }

  function printHtml(html, deviceName, s) {
    s = s || saved;
    if (!window.electronAPI || !window.electronAPI.restPrint) {
      // Browser fallback (web/phone client): normal popup print.
      try {
        var w = window.open('', '_blank', 'width=320,height=640');
        if (w) {
          w.document.write(html);
          try { w.document.close(); } catch (e) {}
          setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 350);
        }
      } catch (e) {}
      return Promise.resolve({ ok: false, fallback: true });
    }
    var dev = (deviceName != null) ? deviceName : (s.printer || '');
    var payload = { html: html, deviceName: dev, kind: 'thermal', paperWidth: clamp(s.paperWidth, 40, 120) };
    var copies = clamp(s.copies, 1, 5);
    if (copies > 1) payload.copies = copies;
    try {
      return Promise.resolve(window.electronAPI.restPrint(payload)).then(function (r) {
        return (r && r.ok !== false) ? { ok: true } : { ok: false, error: (r && r.error) || 'print failed' };
      }).catch(function (e) { return { ok: false, error: (e && e.message) || String(e) }; });
    } catch (e) {
      return Promise.resolve({ ok: false, error: (e && e.message) || String(e) });
    }
  }

  function printSale(inv, res) {
    return printHtml(buildReceiptHtml(inv, res, saved), saved.printer, saved);
  }

  /* ---------- enable / disable ---------- */

  function isEnabled() { return !!saved.enabled; }

  function paintToggle() {
    var btn = $('salesThermalBtn');
    if (btn) btn.classList.toggle('is-on', !!saved.enabled);
    var flag = $('salesThermalFlag');
    if (flag) flag.textContent = saved.enabled ? 'ON' : 'OFF';
  }

  function setEnabled(on) {
    saved.enabled = !!on;
    persist();
    paintToggle();
    tpToast(saved.enabled ? T('thermal.enabledToast', 'تم تفعيل الطباعة الحرارية') : T('thermal.disabledToast', 'تم إيقاف الطباعة الحرارية'),
      saved.enabled ? 'ok' : 'warn');
  }
  function toggle() { setEnabled(!saved.enabled); }

  /* ---------- small toast ---------- */

  var toastTimer = 0;
  function tpToast(msg, kind) {
    var el = $('tpToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tpToast';
      el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100050;padding:11px 20px;' +
        'border-radius:8px;font-size:13px;font-weight:700;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);transition:opacity .2s;direction:rtl';
      document.body.appendChild(el);
    }
    el.style.background = kind === 'err' ? '#e53935' : (kind === 'warn' ? '#e65100' : '#1a7f37');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, 2200);
  }

  /* ---------- settings panel ---------- */

  var built = false;
  var draft = Object.assign({}, saved);
  var statusTimer = 0;

  function lbl(key, fb) { return '<span data-tp-lbl="' + key + '">' + fb + '</span>'; }

  function buildPanel() {
    if (built) return;
    built = true;

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay tp-overlay';
    overlay.id = 'tpOverlay';
    overlay.style.display = 'none';
    overlay.innerHTML =
      '<div class="modal tp-modal" role="dialog" aria-modal="true">' +
        '<div class="modal-header">' +
          '<h3><span class="tp-header-icon"><i class="fas fa-receipt"></i></span> ' + lbl('title', 'إعدادات الطابعة الحرارية') + '</h3>' +
          '<button class="modal-close" id="tpClose" type="button">&times;</button>' +
        '</div>' +
        '<div class="modal-body tp-body">' +
          '<div class="tp-hint"><i class="fas fa-lightbulb"></i><span data-tp-lbl="hint">اضبط الخيارات ثم اضغط «طباعة تجريبية» لرؤية النتيجة فورًا. عند الوصول إلى الشكل المطلوب اضغط «حفظ التغييرات» لتبقى محفوظة على هذا الجهاز.</span></div>' +
          '<div class="tp-cols">' +
            '<div>' +
              '<div class="tp-section">' +
                '<div class="tp-section-title"><i class="fas fa-print"></i>' + lbl('printerSec', 'الطابعة') + '</div>' +
                '<label class="tp-field"><span data-tp-lbl="printer">الطابعة</span>' +
                  '<select class="tp-select" id="tpPrinter"></select></label>' +
                '<div style="display:flex;gap:8px;margin-top:10px">' +
                  '<button class="btn btn-sm" id="tpReloadPrinters" type="button" title="تحديث القائمة"><i class="fas fa-rotate"></i></button>' +
                  '<button class="btn tp-btn-test" id="tpTest" type="button" style="flex:1"><i class="fas fa-vial"></i> ' + lbl('test', 'طباعة تجريبية') + '</button>' +
                '</div>' +
                '<div class="tp-status" id="tpPrinterMsg" style="margin-top:8px"></div>' +
              '</div>' +
              '<div class="tp-section" style="margin-top:12px">' +
                '<div class="tp-section-title"><i class="fas fa-scroll"></i>' + lbl('paperSec', 'الورق والهوامش') + '</div>' +
                '<div class="tp-grid">' +
                  '<label class="tp-field"><span data-tp-lbl="paper">حجم الورقة</span>' +
                    '<select class="tp-select" id="tpPaper">' +
                      '<option value="58">58 mm</option><option value="80">80 mm</option>' +
                      '<option value="custom" data-tp-lbl="paperCustom">مخصّص</option>' +
                    '</select></label>' +
                  '<label class="tp-field"><span data-tp-lbl="paperWidth">عرض الورقة (ملم)</span>' +
                    '<input type="number" class="tp-input" id="tpPaperW" min="40" max="120" step="1"></label>' +
                '</div>' +
                '<div class="tp-grid" style="margin-top:10px">' +
                  '<label class="tp-field"><span data-tp-lbl="marginTop">الهامش الأعلى</span><input type="number" class="tp-input" id="tpMT" min="0" max="20" step="0.5"></label>' +
                  '<label class="tp-field"><span data-tp-lbl="marginBottom">الهامش الأسفل</span><input type="number" class="tp-input" id="tpMB" min="0" max="20" step="0.5"></label>' +
                  '<label class="tp-field"><span data-tp-lbl="marginRight">الهامش الأيمن</span><input type="number" class="tp-input" id="tpMR" min="0" max="20" step="0.5"></label>' +
                  '<label class="tp-field"><span data-tp-lbl="marginLeft">الهامش الأيسر</span><input type="number" class="tp-input" id="tpML" min="0" max="20" step="0.5"></label>' +
                '</div>' +
              '</div>' +
              '<div class="tp-section" style="margin-top:12px">' +
                '<div class="tp-section-title"><i class="fas fa-font"></i>' + lbl('fontSec', 'الخط') + '</div>' +
                '<div class="tp-grid">' +
                  '<label class="tp-field"><span data-tp-lbl="fontFamily">نوع الخط</span>' +
                    '<select class="tp-select" id="tpFont">' +
                      '<option value="mono" data-tp-lbl="fontMono">أحادي المسافة</option>' +
                      '<option value="sans" data-tp-lbl="fontSans">بدون زخرفة</option>' +
                      '<option value="serif" data-tp-lbl="fontSerif">مزخرف</option>' +
                    '</select></label>' +
                  '<label class="tp-field"><span data-tp-lbl="fontWeight">سمك الخط</span>' +
                    '<select class="tp-select" id="tpWeight">' +
                      '<option value="normal" data-tp-lbl="weightNormal">عادي</option>' +
                      '<option value="bold" data-tp-lbl="weightBold">عريض</option>' +
                      '<option value="900" data-tp-lbl="weightBlack">أسود ثقيل</option>' +
                    '</select></label>' +
                  '<label class="tp-field"><span data-tp-lbl="fontSize">حجم الخط</span><input type="number" class="tp-input" id="tpFontSize" min="7" max="24" step="0.5"></label>' +
                  '<label class="tp-field"><span data-tp-lbl="lineHeight">تباعد الأسطر</span><input type="number" class="tp-input" id="tpLH" min="1" max="2.4" step="0.05"></label>' +
                '</div>' +
              '</div>' +
              '<div class="tp-section" style="margin-top:12px">' +
                '<div class="tp-section-title"><i class="fas fa-sliders"></i>' + lbl('layoutSec', 'التخطيط') + '</div>' +
                '<div class="tp-grid">' +
                  '<label class="tp-field"><span data-tp-lbl="rotation">تدوير</span>' +
                    '<select class="tp-select" id="tpRot"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>' +
                  '<label class="tp-field"><span data-tp-lbl="scale">حجم الطباعة (%)</span><input type="number" class="tp-input" id="tpScale" min="50" max="200" step="5"></label>' +
                  '<label class="tp-field"><span data-tp-lbl="copies">عدد النسخ</span><input type="number" class="tp-input" id="tpCopies" min="1" max="5" step="1"></label>' +
                  '<label class="tp-field"><span data-tp-lbl="direction">اتجاه النص</span>' +
                    '<select class="tp-select" id="tpDir"><option value="rtl">عربي (RTL)</option><option value="ltr">LTR</option></select></label>' +
                '</div>' +
              '</div>' +
              '<div class="tp-section" style="margin-top:12px">' +
                '<div class="tp-section-title"><i class="fas fa-list-check"></i>' + lbl('contentSec', 'المحتوى') + '</div>' +
                '<label class="tp-check"><input type="checkbox" id="tpShowStore">' + lbl('showStore', 'إظهار اسم المحل') + '</label>' +
                '<label class="tp-check"><input type="checkbox" id="tpShowAddress">' + lbl('showAddress', 'إظهار العنوان والهاتف') + '</label>' +
                '<label class="tp-check"><input type="checkbox" id="tpShowDate">' + lbl('showDateTime', 'إظهار التاريخ والوقت') + '</label>' +
                '<label class="tp-check"><input type="checkbox" id="tpShowFooter">' + lbl('showFooter', 'إظهار سطر الشكر') + '</label>' +
                '<label class="tp-field" style="margin-top:10px"><span data-tp-lbl="footerText">نص سطر الشكر</span>' +
                  '<input type="text" class="tp-input" id="tpFooterText" dir="auto" placeholder="شكرًا لزيارتكم"></label>' +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="tp-preview-wrap">' +
                '<div class="tp-preview-title"><i class="fas fa-eye"></i>' + lbl('preview', 'معاينة مباشرة') + '</div>' +
                '<div class="tp-stage"><iframe id="tpPreviewFrame" title="preview"></iframe></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="modal-footer tp-footer">' +
          '<span class="tp-status" id="tpStatus"></span>' +
          '<div class="tp-actions">' +
            '<button class="btn tp-reset" id="tpReset" type="button"><i class="fas fa-rotate-left"></i> ' + lbl('reset', 'إعادة الضبط') + '</button>' +
            '<button class="btn btn-primary tp-save" id="tpSave" type="button" disabled><i class="fas fa-check"></i> ' + lbl('save', 'حفظ التغييرات') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    $('tpClose').addEventListener('click', closeSettings);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeSettings(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.style.display !== 'none') { e.stopPropagation(); closeSettings(); }
    });

    $('tpSave').addEventListener('click', saveSettings);
    $('tpReset').addEventListener('click', resetSettings);
    $('tpReloadPrinters').addEventListener('click', function () { loadPrinterOptions(true); });
    $('tpTest').addEventListener('click', function () { testPrint(); });

    // Any control change → live draft + preview + dirty flag.
    Array.prototype.forEach.call(
      overlay.querySelectorAll('input, select'),
      function (el) { el.addEventListener('input', onControlInput); el.addEventListener('change', onControlInput); }
    );
    $('tpPaper').addEventListener('change', function () {
      if (this.value !== 'custom') { $('tpPaperW').value = this.value; }
      onControlInput();
    });
  }

  function refreshLabels() {
    if (!built) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-tp-lbl]'), function (el) {
      var k = el.getAttribute('data-tp-lbl');
      el.textContent = T('thermal.' + k, el.textContent);
    });
    var sel = $('tpPrinter');
    if (sel && sel.options.length && sel.options[0].value === '') {
      sel.options[0].textContent = T('thermal.printerDefault', 'الطابعة الافتراضية');
    }
    paintToggle();
  }

  /* ---------- printer list ---------- */

  function loadPrinterOptions(keepMsg) {
    var sel = $('tpPrinter');
    if (!sel) return;
    sel.innerHTML = '<option value="">' + esc(T('thermal.printerDefault', 'الطابعة الافتراضية')) + '</option>';
    var msg = $('tpPrinterMsg');
    if (msg && !keepMsg) { msg.className = 'tp-status'; msg.textContent = ''; }
    listPrinters().then(function (list) {
      list.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.name;
        o.textContent = (p.displayName || p.name) + (p.isDefault ? ' ✓' : '');
        sel.appendChild(o);
      });
      sel.value = draft.printer || '';
      if (msg) {
        if (!list.length) { msg.className = 'tp-status warn'; msg.textContent = T('thermal.noPrinters', 'لا توجد طابعات متاحة الآن'); }
        else { msg.className = 'tp-status'; msg.textContent = ''; }
      }
    });
  }

  /* ---------- draft <-> inputs ---------- */

  function readInputs() {
    draft.paperWidth = clamp($('tpPaperW').value, 40, 120);
    draft.marginTop = clamp($('tpMT').value, 0, 20);
    draft.marginBottom = clamp($('tpMB').value, 0, 20);
    draft.marginRight = clamp($('tpMR').value, 0, 20);
    draft.marginLeft = clamp($('tpML').value, 0, 20);
    draft.fontFamily = $('tpFont').value;
    draft.fontWeight = $('tpWeight').value;
    draft.fontSize = clamp($('tpFontSize').value, 7, 24);
    draft.lineHeight = clamp($('tpLH').value, 1, 2.4);
    draft.rotation = clamp($('tpRot').value, 0, 359);
    draft.scale = clamp($('tpScale').value, 50, 200);
    draft.copies = clamp($('tpCopies').value, 1, 5);
    draft.direction = $('tpDir').value;
    draft.showStore = $('tpShowStore').checked;
    draft.showAddress = $('tpShowAddress').checked;
    draft.showDateTime = $('tpShowDate').checked;
    draft.showFooter = $('tpShowFooter').checked;
    draft.footerText = $('tpFooterText').value;
    draft.printer = $('tpPrinter').value || '';
  }

  function writeInputs() {
    $('tpPaperW').value = draft.paperWidth;
    var pw = num(draft.paperWidth);
    $('tpPaper').value = (pw === 58 || pw === 80) ? String(pw) : 'custom';
    $('tpMT').value = draft.marginTop;
    $('tpMB').value = draft.marginBottom;
    $('tpMR').value = draft.marginRight;
    $('tpML').value = draft.marginLeft;
    $('tpFont').value = draft.fontFamily;
    $('tpWeight').value = draft.fontWeight;
    $('tpFontSize').value = draft.fontSize;
    $('tpLH').value = draft.lineHeight;
    $('tpRot').value = String(clamp(draft.rotation, 0, 359));
    $('tpScale').value = draft.scale;
    $('tpCopies').value = draft.copies;
    $('tpDir').value = draft.direction;
    $('tpShowStore').checked = !!draft.showStore;
    $('tpShowAddress').checked = !!draft.showAddress;
    $('tpShowDate').checked = !!draft.showDateTime;
    $('tpShowFooter').checked = !!draft.showFooter;
    $('tpFooterText').value = draft.footerText || '';
    var sel = $('tpPrinter');
    if (sel) sel.value = draft.printer || '';
  }

  function onControlInput() {
    readInputs();
    renderPreview();
    refreshDirty();
  }

  /* ---------- live preview ---------- */

  var SAMPLE = {
    inv: { createdAt: 0, invoiceNumber: 'FACT-DEMO' },
    res: {
      totalAmount: 3200,
      items: [
        { name: 'فلتر زيت BOSCH', qty: 2, price: 800, total: 1600, originalPrice: 900 },
        { name: 'فلتر هواء MANN', qty: 1, price: 1600, total: 1600, originalPrice: 1700 }
      ]
    }
  };

  function renderPreview() {
    var frame = $('tpPreviewFrame');
    if (!frame) return;
    var html = buildReceiptHtml(SAMPLE.inv, SAMPLE.res, draft);
    var wmm = clamp(draft.paperWidth, 40, 120);
    var px = Math.round(wmm * (96 / 25.4));
    frame.style.width = px + 'px';
    frame.style.height = '420px';
    try { frame.srcdoc = html; }
    catch (e) { try { frame.contentWindow.document.open(); frame.contentWindow.document.write(html); frame.contentWindow.document.close(); } catch (e2) {} }
  }

  /* ---------- dirty / status ---------- */

  function isDirty() {
    return Object.keys(DEFAULTS).some(function (k) { return draft[k] !== saved[k]; });
  }

  function refreshDirty(flash) {
    var save = $('tpSave');
    var st = $('tpStatus');
    if (!save) return;
    save.disabled = !isDirty();
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = 0; }
    if (flash === 'saved') {
      st.className = 'tp-status ok';
      st.innerHTML = '<i class="fas fa-circle-check"></i> ' + esc(T('thermal.saved', 'تم حفظ الإعدادات على هذا الجهاز'));
      statusTimer = setTimeout(function () { refreshDirty(); }, 2600);
    } else if (isDirty()) {
      st.className = 'tp-status warn';
      st.innerHTML = '<i class="fas fa-circle-exclamation"></i> ' + esc(T('thermal.dirty', 'تغييرات غير محفوظة'));
    } else {
      st.className = 'tp-status';
      st.textContent = '';
    }
  }

  function saveSettings() {
    if (!isDirty()) return;
    readInputs();
    saved = Object.assign({}, draft);
    persist();
    paintToggle();
    refreshDirty('saved');
  }

  function resetSettings() {
    draft = Object.assign({}, DEFAULTS, { enabled: saved.enabled });
    writeInputs();
    renderPreview();
    refreshDirty();
  }

  /* ---------- test print ---------- */

  function testPrint() {
    readInputs();
    var st = $('tpPrinterMsg');
    if (st) { st.className = 'tp-status'; st.textContent = T('thermal.printing', 'جاري الإرسال إلى الطابعة…'); }
    var html = buildReceiptHtml(SAMPLE.inv, SAMPLE.res, draft);
    printHtml(html, draft.printer, draft).then(function (r) {
      if (r && r.ok) {
        if (st) { st.className = 'tp-status ok'; st.innerHTML = '<i class="fas fa-circle-check"></i> ' + esc(T('thermal.testOk', 'تم إرسال الوصل إلى الطابعة ✅')); }
      } else if (r && r.fallback) {
        if (st) { st.className = 'tp-status warn'; st.textContent = T('thermal.noElectron', 'الطباعة الحرارية المباشرة متاحة داخل تطبيق الحاسوب فقط — تم فتح نافذة الطباعة العادية.'); }
      } else {
        if (st) { st.className = 'tp-status err'; st.textContent = T('thermal.testFail', 'فشل الطباعة: ') + ((r && r.error) || ''); }
      }
    });
  }

  /* ---------- open / close ---------- */

  function openSettings() {
    buildPanel();
    refreshLabels();
    draft = Object.assign({}, saved);
    writeInputs();
    loadPrinterOptions();
    renderPreview();
    refreshDirty();
    $('tpOverlay').style.display = 'flex';
  }

  function closeSettings() {
    var ov = $('tpOverlay');
    if (!ov || ov.style.display === 'none') return;
    draft = Object.assign({}, saved); // discard unsaved trials
    ov.style.display = 'none';
  }

  /* ---------- boot ---------- */

  function init() {
    paintToggle();
    if (built) refreshLabels();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.ThermalPrint = {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    toggle: toggle,
    openSettings: openSettings,
    closeSettings: closeSettings,
    listPrinters: listPrinters,
    buildReceiptHtml: buildReceiptHtml,
    printSale: printSale,
    printHtml: printHtml,
    toast: tpToast,
    refreshLabels: refreshLabels,
    paintToggle: paintToggle,
    current: function () { return Object.assign({}, saved); },
    defaults: function () { return Object.assign({}, DEFAULTS); },
    key: TP_KEY
  };
  window.ThermalPrintToggleFromHeader = toggle;
  window.ThermalPrintOpenSettings = openSettings;
})();
