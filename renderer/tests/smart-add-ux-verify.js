// ZMT PIECE — Smart Add: right-click details + reference/mark dropdowns + undo/redo
// Run: node renderer/tests/smart-add-ux-verify.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dom = require('./dom-lite');

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
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

const products = [
  { id: 'p1', name: 'زيت مائدة 5L', barcode: '6130000000017', reference: 'REF-Z5', mark: 'ZMT', countryOfOrigin: 'DZ', buyPrice: 900, quantity: 10 },
  { id: 'p2', name: 'زيت مائدة 1L', barcode: '6130000000024', reference: 'REF-Z1', mark: 'ZMT', countryOfOrigin: 'DZ', buyPrice: 200, quantity: 10 },
  { id: 'p3', name: 'سكر أبيض 1كغ', barcode: '6130000000031', reference: 'REF-S1', mark: 'SUC', countryOfOrigin: 'DZ', buyPrice: 120, quantity: 10 },
];
const detailsCalls = [];
const store = {};
const sandbox = {
  console,
  document: dom.createDoc(),
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  setTimeout, clearTimeout, Date, Math, JSON, String, Number, parseFloat, parseInt, isFinite,
  escHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  normSearch: (s) => String(s || '').toLowerCase().trim(),
  productSearchScore: (name, barcode, q, mark, reference, country) => {
    const nq = String(q || '').toLowerCase().trim();
    if (!nq) return 1;
    const hay = [name, barcode, mark, reference, country].map((x) => String(x || '').toLowerCase());
    const toks = nq.split(/\s+/).filter(Boolean);
    let s = 0;
    for (const t of toks) {
      let hit = 0;
      hay.forEach((h, idx) => { if (h.indexOf(t) !== -1) hit = Math.max(hit, idx === 0 ? 4 : 2); });
      if (!hit) return 0;
      s += hit;
    }
    return s;
  },
  alert: () => {},
  filterInvoices: () => {},
  isRTL: () => true,
  showProductDetails: (id) => { detailsCalls.push(id); },
  FV: { toggle: () => {}, isVisible: () => true, apply: () => {} },
  ExtraPrices: { fields: () => [] },
  InvoiceOCR: { getEngine: () => 'tesseract', saveEngine: () => {}, getKeys: () => [], saveKeys: () => {}, ocrFile: async () => ({ rows: [], rawText: '' }), parseRowsFromText: () => [] },
  DB: {
    getProducts: () => products,
    getProductByBarcode: () => null,
    getProduct: (id) => products.find((p) => p.id === id) || null,
    getSuppliers: () => [],
    generateBarcode: () => 'BC1',
    getLowStockThreshold: () => 5,
    addOrMergeProduct: (item) => { products.push(Object.assign({}, item, { id: 'p' + (products.length + 1) })); return { ok: true, product: products[products.length - 1] }; },
    addInvoice: (inv) => Object.assign({}, inv, { id: 'inv1' }),
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('renderer/js/pages/invoices-smart.js'), sandbox, { filename: 'invoices-smart.js' });

const doc = sandbox.document;
const boxN = (i) => doc.getElementById('smartNameResults_' + i);
const boxR = (i) => doc.getElementById('smartRefResults_' + i);
const boxM = (i) => doc.getElementById('smartMarkResults_' + i);
const fieldVal = (col, i) => {
  const el = doc.querySelector('[data-col="' + col + '"][data-row="' + i + '"]');
  return el ? el.value : null;
};
const reset = () => { sandbox.closeSmartEdit(); };

(async function main() {
  // ---------- right-click on a name dropdown item -> product details -------
  detailsCalls.length = 0;
  reset();
  sandbox.openSmartEdit();
  sandbox.addSmartRow();
  sandbox.updateSmartRow(0, 'name', 'زيت');
  sandbox.smartNameFocus(0, 'زيت');
  check(boxN(0).style.display === 'block', 'name dropdown opens');
  sandbox.smartCtxProduct({ preventDefault: () => {} }, 'p1');
  check(detailsCalls.indexOf('p1') >= 0, 'right-click handler calls showProductDetails with the product id');

  // ---------- reference dropdown -----------------------------------------
  reset();
  sandbox.openSmartEdit();
  sandbox.addSmartRow();
  sandbox.smartRefFocus(0, '');
  check(boxR(0).style.display === 'block', 'reference dropdown opens on focus');
  check(String(boxR(0).textContent).indexOf('REF-Z5') >= 0, 'reference dropdown lists existing references');
  sandbox.smartPickRef(0, 'REF-Z5');
  eq(fieldVal('reference', 0), 'REF-Z5', 'picking a reference fills the reference field');
  eq(fieldVal('barcode', 0), '', 'picking a reference does NOT auto-fill the barcode (fill field only)');
  reset();
  sandbox.openSmartEdit();
  sandbox.addSmartRow();
  sandbox.smartRefInput(0, 'NEW-REF');
  eq(fieldVal('reference', 0), 'NEW-REF', 'typing a new reference keeps the typed value');

  // ---------- mark dropdown ----------------------------------------------
  reset();
  sandbox.openSmartEdit();
  sandbox.addSmartRow();
  sandbox.smartMarkFocus(0, '');
  check(boxM(0).style.display === 'block', 'mark dropdown opens on focus');
  check(String(boxM(0).textContent).indexOf('ZMT') >= 0, 'mark dropdown lists existing marks');
  sandbox.smartPickMark(0, 'SUC');
  eq(fieldVal('mark', 0), 'SUC', 'picking a mark fills the mark field');

  // ---------- undo / redo ------------------------------------------------
  const grid = () => doc.getElementById('smartGrid');
  const rowCount = () => {
    const g = grid();
    const t = String(g.style.gridTemplateColumns || '').trim().split(/\s+/).filter(Boolean).length || 1;
    return (g.children.length / t) - 1;
  };

  reset();
  sandbox.openSmartEdit(); // 0 rows
  const undoBtn0 = doc.getElementById('smartUndoBtn');
  check(!!undoBtn0 && undoBtn0.disabled === true, 'undo disabled with a single initial snapshot');
  sandbox.addSmartRow(); // 1 row
  eq(rowCount(), 1, 'one row present after addSmartRow');
  sandbox.smartUndo();
  eq(rowCount(), 0, 'undo removes the added row');
  sandbox.smartRedo();
  eq(rowCount(), 1, 'redo restores the removed row');

  // edit a character then undo restores it
  reset();
  sandbox.openSmartEdit();
  sandbox.addSmartRow();
  sandbox.smartNameInput(0, 'a');
  eq(fieldVal('name', 0), 'a', 'name input updates the row');
  sandbox.smartUndo();
  eq(fieldVal('name', 0), '', 'undo restores the previous name value');
  sandbox.smartRedo();
  eq(fieldVal('name', 0), 'a', 'redo reapplies the edit');

  // remove row then undo restores it
  reset();
  sandbox.openSmartEdit();
  sandbox.addSmartRow();
  sandbox.updateSmartRow(0, 'name', 'زيت');
  sandbox.removeSmartRow(0);
  eq(rowCount(), 0, 'row removed');
  sandbox.smartUndo();
  eq(rowCount(), 1, 'undo restores the removed row');
  check(String(fieldVal('name', 0)).indexOf('زيت') >= 0, 'restored row keeps its name');

  console.log('\n' + (fail ? 'FAILED' : 'OK') + ' — pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
