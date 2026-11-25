// ============================================================================
// ZMT PIECE — shared print mode (colour / black & white)
// ----------------------------------------------------------------------------
// One small, read-only helper used by the debt-details page, the two party
// movements pages and the brand-movements report. It does not touch any record,
// invoice, balance or permission: it only decides which CSS a print preview
// window gets. The default is ALWAYS colour, so existing behaviour is kept for
// users who never press the new buttons.
// ============================================================================
(function (root) {
  'use strict';

  var KEY = 'zmt_print_mode';

  function tr(key, fallback) {
    try {
      if (typeof root.t === 'function') {
        var v = root.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function get() {
    try {
      var v = root.localStorage && root.localStorage.getItem(KEY);
      return v === 'bw' ? 'bw' : 'color';
    } catch (e) { return 'color'; }
  }

  function set(mode) {
    var m = (mode === 'bw') ? 'bw' : 'color';
    try { if (root.localStorage) root.localStorage.setItem(KEY, m); } catch (e) {}
    return m;
  }

  function isBw(mode) { return (mode || get()) === 'bw'; }

  function label(mode) {
    return isBw(mode)
      ? tr('invoices.printBw', 'طباعة أبيض وأسود')
      : tr('invoices.printColor', 'طباعة ملوّنة');
  }

  // Neutral monochrome override. Scoped to the sheet so the dark preview bar
  // stays readable on screen, while the printed page is truly greyscale.
  function bwCss(scope) {
    var s = scope || '#pmSheet';
    return s + ',' + s + ' *{' +
        'color:#000!important;background:#fff!important;background-color:#fff!important;' +
        'border-color:#000!important;text-shadow:none!important;box-shadow:none!important;' +
        'background-image:none!important;filter:grayscale(100%)!important;' +
        '-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      s + ' table thead th,' + s + ' table tfoot td,' + s + ' .pm-sum-card,' +
      s + ' .pm-party-head,' + s + ' .pm-grand,' + s + ' .pm-age-strip,' +
      s + ' .pm-settle td,' + s + ' .bm-kpi{' +
        'background:#ececec!important;background-color:#ececec!important}';
  }

  // Same preview contract as the invoice preview: the exact sheet that reaches
  // the printer is shown on screen first, with print / close controls that
  // disappear from the paper.
  function openPreview(title, bodyHtml, opts) {
    opts = opts || {};
    var mode = opts.mode || get();
    var win = null;
    try { win = root.open('', '', 'width=900,height=700'); } catch (e) {}
    if (!win) {
      if (typeof root.alert === 'function') {
        root.alert(tr('movements.allowPopups', 'يرجى السماح بالنوافذ المنبثقة للطباعة'));
      }
      return false;
    }

    var ppRule = '@page{size:A4;margin:10mm}';
    try {
      if (root.PrintPaper && typeof root.PrintPaper.pageRule === 'function') ppRule = root.PrintPaper.pageRule(10);
    } catch (e2) {}
    var previewW = '210mm';
    try {
      if (root.PrintPaper && typeof root.PrintPaper.previewWidthCss === 'function') previewW = root.PrintPaper.previewWidthCss();
    } catch (e3) {}

    var bar = '<div class="pm-bar">' +
      '<span class="pm-bar-title">' + esc(title) + '</span>' +
      '<span class="pm-bar-mode">' + esc(label(mode)) + '</span>' +
      '<button type="button" class="pm-bar-btn pm-bar-print" onclick="window.print()">' +
        esc(tr('movements.print', 'طباعة')) + '</button>' +
      '<button type="button" class="pm-bar-btn" onclick="window.close()">' +
        esc(tr('movements.close', 'إغلاق')) + '</button>' +
      '</div>';

    var css = ppRule +
      'html,body{margin:0;padding:0;background:#fff}' +
      '.pm-bar{position:sticky;top:0;z-index:9;display:flex;align-items:center;gap:10px;padding:10px 16px;background:#263238;color:#fff}' +
      '.pm-bar-title{font-weight:700;font-size:14px;flex:1}' +
      '.pm-bar-mode{font-size:11px;font-weight:700;border:1px solid #78909c;border-radius:9px;padding:2px 9px;opacity:.9;white-space:nowrap}' +
      '.pm-bar-btn{cursor:pointer;border:1px solid #546e7a;background:#37474f;color:#fff;border-radius:4px;padding:6px 14px;font-size:13px}' +
      '.pm-bar-print{background:#1e88e5;border-color:#1e88e5;font-weight:700}' +
      '#pmSheet{background:#fff;max-width:' + previewW + ';margin:14px auto;box-shadow:0 2px 10px rgba(0,0,0,.25)}' +
      (opts.extraCss || '') +
      '@media print{.pm-bar{display:none!important}body{background:#fff}#pmSheet{max-width:none;margin:0;box-shadow:none}}' +
      (isBw(mode) ? bwCss('#pmSheet') : '');

    try {
      win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(title) +
        '</title><style>' + css + '</style></head><body>' + bar + '<div id="pmSheet">' +
        bodyHtml + '</div></body></html>');
      win.document.close();
    } catch (e4) { return false; }
    return true;
  }

  var api = {
    get: get,
    set: set,
    isBw: isBw,
    label: label,
    bwCss: bwCss,
    openPreview: openPreview,
  };
  root.PrintMode = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
