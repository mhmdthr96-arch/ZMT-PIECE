// ZMT PIECE — Smart Add progress / feedback verify
// Run: node renderer/tests/smart-add-progress-verify.js
//
// Proves the UI contract that was missing in 3.1.x: the moment "قراءة الفاتورة"
// is pressed the user sees a spinner + live stage, the button is disabled,
// double-clicks are ignored, cancellation is wired, and every failure ends with
// a visible message instead of silence.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dom = require('./dom-lite');

// dom-lite has no insertAdjacentHTML; the preview grid only uses this one call.
dom.El.prototype.insertAdjacentHTML = function (position, html) {
  if (position !== 'beforeend') throw new Error('unsupported position: ' + position);
  const tmp = new dom.El('div');
  dom.parseInto(String(html), tmp);
  tmp.children.slice().forEach((child) => this.appendChild(child));
};

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };

const alerts = [];
const sandbox = {
  console,
  document: dom.createDoc(),
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  Date, Math, JSON, String, Number, parseFloat, parseInt, isFinite,
  setTimeout, clearTimeout, setInterval, clearInterval,
  AbortController: global.AbortController,
  escHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  normSearch: (s) => String(s || '').toLowerCase().trim(),
  productSearchScore: () => 0,
  alert: (m) => { alerts.push(String(m)); },
  filterInvoices: () => {},
  FV: { toggle: () => {} },
  DB: {
    getProducts: () => [],
    getSuppliers: () => [],
    getProduct: () => null,
    getProductByBarcode: () => null,
  },
  ExtraPrices: { fields: () => [] },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('renderer/js/pages/invoices-smart.js'), sandbox, { filename: 'invoices-smart.js' });

const doc = sandbox.document;
const el = (id) => doc.getElementById(id);
const visible = (id) => { const e = el(id); return !!e && e.style.display !== 'none'; };
const text = (id) => { const e = el(id); return e ? e.textContent : ''; };

(async function main() {
  // ---- modal shell ----
  sandbox.openSmartAddInvoice();
  check(!!el('smartAddModal'), 'Smart Add modal is created');
  check(!!el('smartProgress'), 'a dedicated progress container exists');
  check(!!doc.querySelector('#smartProgress .smart-spinner'), 'a real spinner element exists in the progress panel');
  check(!!el('smartProgressBar') && !!el('smartProgressPct'), 'progress bar and percentage are present');
  check(!!el('smartCancelBtn'), 'a cancel button is present');
  check(!!el('smartRunBtn'), 'the run button has a stable id');
  const modalHtml = el('smartAddModal').innerHTML;
  check(modalHtml.includes('بدون إنترنت'), 'the modal states that reading is fully offline');
  check(!/Google|google/i.test(modalHtml), 'the cloud engine option was removed from the modal');

  // ---- missing file: explicit message, no silent return ----
  sandbox.InvoiceOCR = { ocrFile: async () => { throw new Error('must not run'); }, parseRowsFromText: () => [] };
  await sandbox.runSmartAddInvoice();
  check(visible('smartError'), 'pressing read without a file shows an inline error');
  check(text('smartError').includes('اختر'), 'the missing-file message is explicit');
  check(!visible('smartProgress'), 'no fake progress is shown when no file was chosen');

  // ---- slow read: spinner first, live progress, double-click guard, cancel ----
  let calls = 0, resolveOcr = null, seenOpts = null;
  sandbox.InvoiceOCR = {
    ocrFile: async (file, opts) => {
      calls += 1;
      seenOpts = opts;
      opts.onProgress({ message: 'اختبار — قراءة الصفحة 1', progress: 0.4, rows: 2 });
      return await new Promise((resolve) => { resolveOcr = resolve; });
    },
    parseRowsFromText: () => [],
  };
  el('smartFile').files = [{ name: 'facture.pdf', type: 'application/pdf' }];
  sandbox.resetSmartAddStatus();
  const firstRun = sandbox.runSmartAddInvoice();
  check(visible('smartProgress'), 'progress panel appears as soon as reading starts');
  check(text('smartProgressText').includes('قراءة'), 'the live OCR stage is displayed');
  check(text('smartProgressPct') === '40%', 'determinate progress is displayed as a percentage');
  check(el('smartRunBtn').disabled === true, 'run button is disabled while reading');
  check(el('smartAddModal').getAttribute('aria-busy') === 'true', 'modal is announced as busy');
  sandbox.runSmartAddInvoice();
  await Promise.resolve();
  check(calls === 1, 'a double click cannot start a second read');
  check(!!(seenOpts && seenOpts.signal) && typeof seenOpts.signal.aborted === 'boolean',
    'an AbortSignal is passed to ocrFile');
  sandbox.cancelSmartAddInvoice();
  check(text('smartProgressText').includes('إلغاء'), 'cancel updates the status immediately');
  resolveOcr({ rows: [], rawText: 'texte lu', reason: 'no-table' });
  await firstRun;
  check(visible('smartError'), 'a read with no product ends with a visible message');
  check(text('smartError').includes('لم يتم التعرف'), 'no-product message is clear');
  check(!!el('smartRawText'), 'the raw text stays available for manual parsing');
  check(el('smartRunBtn').disabled === false, 'run button is re-enabled after the read');
  check(el('smartAddModal').getAttribute('aria-busy') === null, 'busy flag is cleared afterwards');

  // ---- engine failure: specific, actionable message ----
  sandbox.InvoiceOCR = {
    ocrFile: async () => { const e = new Error('watchdog'); e.code = 'timeout'; throw e; },
    parseRowsFromText: () => [],
  };
  sandbox.resetSmartAddStatus();
  await sandbox.runSmartAddInvoice();
  check(visible('smartError') && text('smartError').includes('استغرق'), 'timeout produces a specific message');
  check(el('smartRunBtn').disabled === false, 'button is re-enabled after a failed read');
  check(!visible('smartProgress'), 'progress panel is hidden after a failure');

  // ---- changing the file clears the previous error ----
  sandbox.resetSmartAddStatus();
  check(!visible('smartError'), 'choosing another file clears the previous error');

  // ---- success: rows open the editable preview ----
  sandbox.InvoiceOCR = {
    ocrFile: async () => ({ rows: [{ name: 'منتج تجريبي', qty: 2, price: 10 }], rawText: '' }),
    parseRowsFromText: () => [],
  };
  sandbox.resetSmartAddStatus();
  await sandbox.runSmartAddInvoice();
  await new Promise((resolve) => setTimeout(resolve, 260));
  check(el('smartEditModal').style.display === 'flex', 'a successful read opens the editable preview');
  check(el('smartGrid').innerHTML.includes('منتج تجريبي'), 'read rows appear in the preview grid');
  check(el('smartAddModal').style.display === 'none', 'the read modal closes after success');

  console.log('\n============================================');
  if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
  else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
