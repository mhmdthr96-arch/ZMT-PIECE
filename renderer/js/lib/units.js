// ============================================================
// ZMT PIECE — Measurement units & decimal quantities
// ------------------------------------------------------------
// ONE source of truth for:
//   • the unit a product is sold in (piece / kg / g / m / cm / L / custom)
//   • parsing, rounding and formatting quantities
//   • the global "show the unit on invoices" switch
//
// WHY A CODE, NOT A LABEL: an invoice printed in French must say "Kg"
// while the same invoice opened in Arabic says "كغ". The database stores
// `unit: 'kg'` (plus `unitLabel` only for the free-text "other" case) and
// the label is resolved at print time in the current language.
//
// WHY A SNAPSHOT: every invoice line stores its own `unit` + `unitLabel`.
// Editing a product's unit later therefore never rewrites history.
//
// DECIMALS: quantities are accepted up to 6 decimal places (0.000001) and
// rounded on every write so 0.1 + 0.2 never becomes 0.30000000000000004.
// Money is rounded to 2 decimals, like every other amount in the app.
// ============================================================
(function () {
  'use strict';

  var CODES = ['piece', 'kg', 'g', 'm', 'cm', 'L', 'custom'];
  var DEFAULT_CODE = 'piece';
  var DECIMALS = 6;
  var SHOW_KEY = 'zmt_inv_show_unit';

  // Full names (product forms / dropdowns) — ar / fr / en / zh.
  var NAMES = {
    piece:  { ar: 'قطعة',       fr: 'Pièce',       en: 'Piece',      zh: '件' },
    kg:     { ar: 'كيلوغرام',   fr: 'Kilogramme',  en: 'Kilogram',   zh: '千克' },
    g:      { ar: 'غرام',       fr: 'Gramme',      en: 'Gram',       zh: '克' },
    m:      { ar: 'متر',        fr: 'Mètre',       en: 'Metre',      zh: '米' },
    cm:     { ar: 'سنتيمتر',    fr: 'Centimètre',  en: 'Centimetre', zh: '厘米' },
    L:      { ar: 'لتر',        fr: 'Litre',       en: 'Litre',      zh: '升' },
    custom: { ar: 'أخرى',       fr: 'Autre',       en: 'Other',      zh: '其他' }
  };

  // Compact names for invoices / thermal receipts where space is gold.
  var SHORT = {
    piece:  { ar: 'قطعة', fr: 'Pièce', en: 'Piece', zh: '件' },
    kg:     { ar: 'كغ',   fr: 'Kg',    en: 'Kg',    zh: '千克' },
    g:      { ar: 'غ',    fr: 'g',     en: 'g',     zh: '克' },
    m:      { ar: 'م',    fr: 'm',     en: 'm',     zh: '米' },
    cm:     { ar: 'سم',   fr: 'cm',    en: 'cm',    zh: '厘米' },
    L:      { ar: 'ل',    fr: 'L',     en: 'L',     zh: '升' },
    custom: { ar: '',     fr: '',      en: '',      zh: '' }
  };

  var EXTRA = {
    ar: { label: 'الوحدة', customPlaceholder: 'اسم الوحدة', showUnit: 'إظهار الوحدة في الفاتورة', showUnitOn: 'الوحدة ظاهرة في الفواتير', showUnitOff: 'الوحدة مخفية من الفواتير', allColumns: 'كل الأعمدة', details: 'تفاصيل' },
    fr: { label: 'Unité', customPlaceholder: "Nom de l'unité", showUnit: 'Afficher l\'unité sur la facture', showUnitOn: 'Unité affichée sur les factures', showUnitOff: 'Unité masquée des factures', allColumns: 'Toutes les colonnes', details: 'Détails' },
    en: { label: 'Unit', customPlaceholder: 'Unit name', showUnit: 'Show the unit on invoices', showUnitOn: 'Unit shown on invoices', showUnitOff: 'Unit hidden from invoices', allColumns: 'All columns', details: 'Details' },
    zh: { label: '单位', customPlaceholder: '单位名称', showUnit: '在发票上显示单位', showUnitOn: '单位已在发票上显示', showUnitOff: '单位已从发票上隐藏', allColumns: '所有列', details: '详情' }
  };

  function curLang() {
    var l = window.__lang;
    return (l === 'fr' || l === 'en' || l === 'zh') ? l : 'ar';
  }

  function T(key, fb) {
    try {
      var v = (typeof window.t === 'function') ? window.t(key) : '';
      return v || fb || '';
    } catch (e) { return fb || ''; }
  }

  function normalize(code) {
    var c = String(code == null ? '' : code).trim();
    return CODES.indexOf(c) !== -1 ? c : DEFAULT_CODE;
  }

  function isCustom(code) { return normalize(code) === 'custom'; }

  // Full, translated name of a unit code.
  function name(code) {
    var c = normalize(code);
    var table = NAMES[c] || NAMES[DEFAULT_CODE];
    return table[curLang()] || table.ar;
  }

  // Compact name used on documents; a custom unit falls back to its own label.
  function short(code, customLabel) {
    var c = normalize(code);
    if (c === 'custom') {
      var t = String(customLabel == null ? '' : customLabel).trim();
      return t || (NAMES.custom[curLang()] || NAMES.custom.ar);
    }
    var table = SHORT[c] || SHORT[DEFAULT_CODE];
    return table[curLang()] || table.ar;
  }

  // Label of a product / invoice line: custom units keep their typed text.
  function label(obj) {
    if (!obj) return short(DEFAULT_CODE);
    return short(obj.unit, obj.unitLabel);
  }

  // ---------- numbers ----------

  // Lenient decimal parser: Arabic-Indic digits, comma as decimal separator,
  // spaces / currency letters ignored, only the first dot kept.
  function parse(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return 0;
    s = s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function (d) {
      var c = d.charCodeAt(0);
      return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660);
    });
    s = s.replace(/\u066B/g, '.').replace(/\u066C/g, '').replace(/,/g, '.');
    s = s.replace(/[^0-9.]/g, '');
    var i = s.indexOf('.');
    if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function roundQty(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    var f = Math.pow(10, DECIMALS);
    return Math.round(v * f) / f;
  }

  function roundMoney(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.round(v * 100) / 100;
  }

  // 1.000000 -> "1"  0.500000 -> "0.5"  0.010000 -> "0.01"  0.00006 -> "0.00006"
  function fmtQty(n) {
    var v = roundQty(n);
    var s = v.toFixed(DECIMALS);
    s = s.replace(/\.?0+$/, '');
    return (s === '' || s === '-0' || s === '-') ? '0' : s;
  }

  // The + / − stepper follows the last decimal place the user actually typed:
  // 1 -> 1  0.25 -> 0.01  0.001 -> 0.001  0.00006 -> 0.00001
  function step(qty) {
    var v = Math.abs(roundQty(qty));
    var s = fmtQty(v);
    var i = s.indexOf('.');
    if (i === -1) return 1;
    var dec = s.length - i - 1;
    if (dec < 1) return 1;
    if (dec > DECIMALS) dec = DECIMALS;
    return Math.pow(10, -dec);
  }

  // price × qty, money-rounded. Never negative.
  function lineTotal(price, qty) {
    var p = Number(price) || 0;
    var q = roundQty(qty);
    return roundMoney(p * q);
  }

  // ---------- "show the unit on invoices" switch ----------
  // Default ON: old invoices (no unit stored) read as "piece" and still show it.
  function showInInvoice() {
    try {
      var raw = localStorage.getItem(SHOW_KEY);
      return raw === null ? true : raw === '1';
    } catch (e) { return true; }
  }

  function setShowInInvoice(on) {
    try { localStorage.setItem(SHOW_KEY, on ? '1' : '0'); } catch (e) {}
    return showInInvoice();
  }

  function toggleShowInInvoice() { return setShowInInvoice(!showInInvoice()); }

  // Quantity + unit for any document. When the switch is off (or there is no
  // quantity) only the formatted number is returned.
  function qtyUnit(qty, obj) {
    var n = fmtQty(qty);
    if (!showInInvoice()) return n;
    var u = label(obj);
    return u ? (n + ' ' + u) : n;
  }

  // ---------- product / line helpers ----------

  // Ensures a product carries a valid unit (never rewrites an existing one).
  function applyToProduct(prod) {
    if (!prod || typeof prod !== 'object') return prod;
    prod.unit = normalize(prod.unit);
    if (prod.unit !== 'custom') delete prod.unitLabel;
    return prod;
  }

  // Snapshot copied onto an invoice line at sale time.
  function snapshot(prod) {
    var code = normalize(prod && prod.unit);
    var out = { unit: code };
    if (code === 'custom') {
      var t = String((prod && prod.unitLabel) || '').trim();
      if (t) out.unitLabel = t;
    }
    return out;
  }

  // <option> list for product forms.
  function optionsHTML(selected) {
    var sel = normalize(selected);
    return CODES.map(function (c) {
      return '<option value="' + c + '"' + (c === sel ? ' selected' : '') + '>' + esc(name(c)) + '</option>';
    }).join('');
  }

  // ---------- <select> wiring (shared by every product form) ----------
  // Fills a unit <select> in the current language and shows/hides the free-text
  // input used by the \"custom\" option.
  function fillSelect(selRef, value, customRef) {
    var sel = typeof selRef === 'string' ? document.getElementById(selRef) : selRef;
    var custom = typeof customRef === 'string' ? document.getElementById(customRef) : customRef;
    if (!sel) return;
    var lang = curLang();
    if (!sel.options.length || sel.dataset.lang !== lang) {
      sel.innerHTML = optionsHTML(value || DEFAULT_CODE);
      sel.dataset.lang = lang;
    }
    sel.value = normalize(value);
    if (custom) {
      custom.style.display = sel.value === 'custom' ? '' : 'none';
      if (sel.value !== 'custom') custom.value = '';
    }
  }

  function syncCustom(selRef, customRef) {
    var sel = typeof selRef === 'string' ? document.getElementById(selRef) : selRef;
    var custom = typeof customRef === 'string' ? document.getElementById(customRef) : customRef;
    if (!sel || !custom) return;
    var isCustom = sel.value === 'custom';
    custom.style.display = isCustom ? '' : 'none';
    if (isCustom) setTimeout(function () { custom.focus(); }, 0);
    else custom.value = '';
  }

  function readSelect(selRef, customRef) {
    var sel = typeof selRef === 'string' ? document.getElementById(selRef) : selRef;
    var custom = typeof customRef === 'string' ? document.getElementById(customRef) : customRef;
    var code = normalize(sel && sel.value);
    if (code !== 'custom') return { unit: code };
    var typed = String((custom && custom.value) || '').trim();
    return { unit: 'custom', unitLabel: typed || name('custom') };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function extra(key) {
    var tab = EXTRA[curLang()] || EXTRA.ar;
    return tab[key] || (EXTRA.ar[key] || '');
  }

  window.Unit = {
    CODES: CODES.slice(),
    DEFAULT: DEFAULT_CODE,
    DECIMALS: DECIMALS,
    SHOW_KEY: SHOW_KEY,
    normalize: normalize,
    isCustom: isCustom,
    name: name,
    short: short,
    label: label,
    parse: parse,
    roundQty: roundQty,
    roundMoney: roundMoney,
    fmtQty: fmtQty,
    step: step,
    lineTotal: lineTotal,
    showInInvoice: showInInvoice,
    setShowInInvoice: setShowInInvoice,
    toggleShowInInvoice: toggleShowInInvoice,
    qtyUnit: qtyUnit,
    applyToProduct: applyToProduct,
    snapshot: snapshot,
    optionsHTML: optionsHTML,
    fillSelect: fillSelect,
    syncCustom: syncCustom,
    readSelect: readSelect,
    esc: esc,
    text: extra
  };
})();
