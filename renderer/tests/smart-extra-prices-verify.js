// ZMT PIECE — Smart Add extra sale prices verify
// Run: node renderer/tests/smart-extra-prices-verify.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dom = require('./dom-lite');
// dom-lite has no insertAdjacentHTML; add the one operation the grid uses.
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

const store = {};
const products = [];
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  document: dom.createDoc(),
  setTimeout,
  clearTimeout,
  Date,
  Math,
  JSON,
  String,
  Number,
  parseFloat,
  parseInt,
  isFinite,
  escHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  normSearch: (s) => String(s || '').toLowerCase().trim(),
  productSearchScore: () => 0,
  alert: () => {},
  filterInvoices: () => {},
  InvoiceOCR: { getEngine: () => 'tesseract', saveEngine: () => {}, getKeys: () => [], saveKeys: () => {}, ocrFile: async () => ({ rows: [], rawText: '' }) },
  FV: { toggle: () => {} },
  DB: {
    getProducts: () => products,
    getProductByBarcode: () => null,
    getProduct: (id) => products.find((p) => p.id === id) || null,
    getSuppliers: () => [],
    generateBarcode: () => 'BC1',
    addOrMergeProduct: (item) => {
      products.push(Object.assign({}, item, { id: 'p' + (products.length + 1) }));
      return { ok: true, product: products[products.length - 1] };
    },
    addInvoice: (inv) => Object.assign({}, inv, { id: 'inv1' }),
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// Load the real ExtraPrices module into the same sandbox.
vm.runInContext(read('renderer/js/extra-prices.js'), sandbox, { filename: 'extra-prices.js' });
const EP = sandbox.ExtraPrices;
store[EP.KEY] = '';
const field = EP.addField('نصف جملة', '#6f42c1').fields[0];
check(field && field.id, 'extra field created');

vm.runInContext(read('renderer/js/pages/invoices-smart.js'), sandbox, { filename: 'invoices-smart.js' });
sandbox.openSmartEdit();
sandbox.addSmartRow();
const grid = sandbox.document.getElementById('smartGrid');
const gridHtml = grid.innerHTML;
check(gridHtml.includes('نصف جملة'), 'extra field header appears in smart preview grid');
const extraInput = grid.querySelector('[data-col="extra:' + field.id + '"]');
check(!!extraInput, 'extra price input cell is rendered');
eq(extraInput && extraInput.value, '', 'extra price input starts empty for the user');

sandbox.updateSmartExtraRow(0, field.id, '321');
sandbox.openSmartEdit();
const reRendered = sandbox.document.getElementById('smartGrid').querySelector('[data-col="extra:' + field.id + '"]');
check(reRendered && reRendered.value === '321', 'extra price update survives rendering');

sandbox.updateSmartRow(0, 'name', 'زيت');
sandbox.updateSmartRow(0, 'qty', '2');
sandbox.updateSmartRow(0, 'price', '100');
// Live total: qty change alone must refresh the visible total, not only price.
sandbox.updateSmartRow(0, 'price', '150');
const totalAfterPrice = sandbox.document.getElementById('smartTotal').textContent;
check(String(totalAfterPrice).includes('300'), 'total refreshes on buy-price change (2x150=300, got ' + totalAfterPrice + ')');
sandbox.updateSmartRow(0, 'qty', '3');
const totalAfterQty = sandbox.document.getElementById('smartTotal').textContent;
check(String(totalAfterQty).includes('450'), 'total refreshes on quantity change (3x150=450, got ' + totalAfterQty + ')');
sandbox.updateSmartRow(0, 'qty', '2');
sandbox.updateSmartRow(0, 'price', '100');
sandbox.updateSmartExtraRow(0, field.id, '150');
sandbox.confirmSmartEdit();
check(products.length === 1 && products[0].extraPrices && Number(products[0].extraPrices[field.id]) === 150,
  'confirm writes extra price field to the product');

console.log('\n============================================');
if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
