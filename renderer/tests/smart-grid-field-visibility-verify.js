// ZMT PIECE — Smart-add preview grid vs field visibility
// Run: node renderer/tests/smart-grid-field-visibility-verify.js
//
// The preview is one flat CSS grid: header labels first, then every cell of
// every row. The optional columns (PLU, reference, country, mark, min price)
// carried the fv-* classes that `body.fv-hide-*` rules display:none, while
// their headers and grid tracks did not — so hiding one field slid every
// following value into the neighbouring column (names in the quantity field,
// prices in the barcode field). The reader never showed this because the
// columns still line up when nothing is hidden.
//
// These checks load the REAL field-visibility.js and the REAL page script, so
// what is asserted is what the app renders: the track count, the header labels
// and the per-row cells must always agree, hidden columns must disappear from
// all three, and the value in column k must belong to the header of column k.
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
const detailsCalls = [];
const winListeners = {};
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  document: dom.createDoc(),
  setTimeout, clearTimeout, Date, Math, JSON, String, Number, parseFloat, parseInt, isFinite,
  CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
  // A real window event bus: the field-visibility module announces every change
  // with a CustomEvent, and the Smart grid must re-render when it hears one.
  addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener: (t, fn) => { const l = winListeners[t] || []; const i = l.indexOf(fn); if (i !== -1) l.splice(i, 1); },
  dispatchEvent: (ev) => { const t = ev && ev.type; (winListeners[t] || []).forEach((fn) => fn(ev)); return true; },
  escHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  normSearch: (s) => String(s || '').toLowerCase().trim(),
  productSearchScore: () => 0,
  alert: () => {},
  filterInvoices: () => {},
  isRTL: () => true,
  // Item 5: clicking a row number opens the product card for existing articles.
  showProductDetails: (id) => { detailsCalls.push(id); },
  InvoiceOCR: { getEngine: () => 'tesseract', saveEngine: () => {}, getKeys: () => [], saveKeys: () => {}, ocrFile: async () => ({ rows: [], rawText: '' }), parseRowsFromText: () => [] },
  DB: {
    getProducts: () => products,
    getProductByBarcode: () => null,
    getProduct: (id) => products.find((p) => p.id === id) || null,
    getSuppliers: () => [],
    generateBarcode: () => 'BC1',
    // Low-stock threshold used by the red row state (default 5 in the app).
    getLowStockThreshold: () => 5,
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

// The real per-device field visibility module (it owns body.fv-hide-* classes).
vm.runInContext(read('renderer/js/field-visibility.js'), sandbox, { filename: 'field-visibility.js' });
check(sandbox.FV && typeof sandbox.FV.set === 'function', 'field-visibility module loaded');

vm.runInContext(read('renderer/js/pages/invoices-smart.js'), sandbox, { filename: 'invoices-smart.js' });

const OPTIONAL = {
  minPrice: { fv: 'minPrice', label: 'السعر الأدنى', col: 'minPrice' },
  reference: { fv: 'reference', label: 'المرجع', col: 'reference' },
  plu: { fv: 'plu', label: 'PLU', col: 'plu' },
  country: { fv: 'country', label: 'بلد', col: 'countryOfOrigin' },
  mark: { fv: 'mark', label: 'مارك', col: 'mark' },
};
const ALWAYS = [
  { key: 'idx', label: '#' },
  { key: 'name', label: 'المنتج' },
  { key: 'qty', label: 'الكمية' },
  { key: 'price', label: 'شراء' },
  { key: 'sell', label: 'بيع' },
  { key: 'whole', label: 'جملة' },
  { key: 'barcode', label: 'الباركود' },
];

function grid() { return sandbox.document.getElementById('smartGrid'); }
function tracks() {
  return String(grid().style.gridTemplateColumns || '').trim().split(/\s+/).filter(Boolean);
}
function render() {
  sandbox.openSmartEdit();
  return grid();
}
// Header labels are the leading <div>s with no data-col of their own.
function headerLabels(g, t) {
  return g.children.slice(0, t).map((c) => String(c.textContent).trim());
}
function rowCells(g, t, rowCount) {
  const out = [];
  for (let r = 0; r < rowCount; r++) out.push(g.children.slice(t + r * t, t + (r + 1) * t));
  return out;
}

sandbox.openSmartEdit();
sandbox.addSmartRow();
sandbox.updateSmartRow(0, 'name', 'زيت مائدة');
sandbox.updateSmartRow(0, 'qty', '12');
sandbox.updateSmartRow(0, 'price', '285');
sandbox.updateSmartRow(0, 'plu', '4242');
sandbox.updateSmartRow(0, 'reference', 'REF-9');
sandbox.updateSmartRow(0, 'countryOfOrigin', 'DZ');
sandbox.updateSmartRow(0, 'mark', 'MARK-1');
sandbox.updateSmartRow(0, 'minPrice', '300');
sandbox.updateSmartRow(0, 'barcode', '6130000000017');

// ---------- everything visible (the default device) ------------------------
{
  const g = render();
  const t = tracks().length;
  eq(t, 13, 'the row number plus all twelve columns are laid out when nothing is hidden');
  eq(headerLabels(g, t).join('|'),
    ['#', 'المنتج', 'الكمية', 'شراء', 'بيع', 'جملة', 'السعر الأدنى', 'الباركود', 'المرجع', 'PLU', 'بلد', 'مارك', ''].join('|'),
    'header labels follow the column model');
  eq(g.children.length, t * 2, 'grid holds exactly one header row plus one product row');
  const cells = rowCells(g, t, 1)[0];
  eq(cells.map((c) => c.getAttribute('data-col') || (c.classList.contains('smart-name-wrap') ? 'name' : '?')).join(','),
    'idx,name,qty,price,sell,whole,minPrice,barcode,reference,plu,countryOfOrigin,mark,?',
    'each cell sits under its own header');
}

// ---------- each optional field hidden alone -------------------------------
Object.keys(OPTIONAL).forEach((id) => {
  const spec = OPTIONAL[id];
  sandbox.FV.set(spec.fv, false);
  eq(sandbox.document.body.classList.contains('fv-hide-' + spec.fv), true, 'body class fv-hide-' + spec.fv + ' is set');
  const g = render();
  const t = tracks().length;
  eq(t, 12, 'hiding ' + id + ' removes exactly one grid track');
  const heads = headerLabels(g, t);
  check(heads.indexOf(spec.label) < 0, 'hiding ' + id + ' removes its header label too');
  eq(g.children.length, t * 2, 'hiding ' + id + ': header row and every product row use the same column count');
  const cells = rowCells(g, t, 1)[0];
  check(!cells.some((c) => c.getAttribute('data-col') === spec.col), 'hiding ' + id + ' leaves no ' + id + ' input behind');
  // The values must stay under their own headers: the shifted grid used to put
  // the barcode under the reference header and so on.
  const byCol = {};
  cells.forEach((c) => {
    const key = c.getAttribute('data-col') || (c.classList.contains('smart-name-wrap') ? 'name' : 'del');
    byCol[key] = c;
  });
  eq(byCol.qty && byCol.qty.value, '12', id + ' hidden: quantity still in the quantity column');
  eq(byCol.price && byCol.price.value, '285', id + ' hidden: buy price still in the buy column');
  const qtyHeaderIndex = heads.indexOf('الكمية');
  eq(cells[qtyHeaderIndex] && (cells[qtyHeaderIndex].getAttribute('data-col')), 'qty',
    id + ' hidden: the cell under «الكمية» is the quantity input');
  const nameHeaderIndex = heads.indexOf('المنتج');
  eq(cells[nameHeaderIndex] && cells[nameHeaderIndex].classList.contains('smart-name-wrap'), true,
    id + ' hidden: the cell under «المنتج» is the name input');
  sandbox.FV.set(spec.fv, true);
});

// ---------- all of them hidden at once ------------------------------------
{
  Object.keys(OPTIONAL).forEach((id) => sandbox.FV.set(OPTIONAL[id].fv, false));
  const g = render();
  const t = tracks().length;
  eq(t, 8, 'all five optional fields hidden leaves the row number, the six fixed columns and the delete button');
  eq(headerLabels(g, t).join('|'), ALWAYS.map((c) => c.label).concat(['']).join('|'), 'only the fixed headers remain');
  eq(g.children.length, t * 2, 'no column is rendered without a track to sit in');
  const cells = rowCells(g, t, 1)[0];
  eq(cells.map((c) => c.getAttribute('data-col') || (c.classList.contains('smart-name-wrap') ? 'name' : '?')).join(','),
    'idx,name,qty,price,sell,whole,barcode,?', 'the surviving cells keep their order');
  Object.keys(OPTIONAL).forEach((id) => sandbox.FV.set(OPTIONAL[id].fv, true));
}

// ---------- the data survives a visibility change --------------------------
{
  sandbox.FV.set('plu', false);
  render();
  sandbox.FV.set('plu', true);
  const g = render();
  const t = tracks().length;
  const cells = rowCells(g, t, 1)[0];
  const plu = cells.find((c) => c.getAttribute('data-col') === 'plu');
  eq(plu && plu.value, '4242', 'hiding and showing PLU again keeps the typed value');
}

// ---------- keyboard navigation must not reach a hidden column -------------
{
  sandbox.FV.set('reference', false);
  const g = render();
  const barcode = g.querySelector('[data-col="barcode"][data-row="0"]');
  check(!!barcode, 'barcode cell is rendered while the reference is hidden');
  if (barcode) {
    barcode.focus();
    sandbox.smartKeydown({ key: 'ArrowLeft', target: barcode, preventDefault() {} });
    const active = sandbox.document._activeElement;
    const landedOn = active && active.getAttribute('data-col');
    eq(landedOn, 'plu', 'ArrowLeft from the barcode skips the hidden reference column and lands on PLU');
  }
  sandbox.FV.set('reference', true);
}

// ---------- item 1: a hide made in Quick Entry reaches this grid live --------
{
  sandbox.FV.set('plu', true);
  sandbox.openSmartEdit();
  let t = tracks().length;
  check(headerLabels(grid(), t).indexOf('PLU') >= 0, 'PLU column is present before the Quick-Entry hide');
  // Exactly what the Quick-Entry window does: flip the shared field-visibility
  // state. No explicit render here — the grid must repaint from the event, so a
  // field hidden in Quick Entry also disappears from Smart Add.
  sandbox.FV.set('plu', false);
  t = tracks().length;
  check(headerLabels(grid(), t).indexOf('PLU') < 0,
    'hiding PLU elsewhere removes its Smart-Add header without a manual render');
  check(!grid().querySelector('[data-col="plu"]'),
    'hiding PLU elsewhere removes its Smart-Add input too');
  sandbox.FV.set('plu', true);
}

// ---------- item 3: rows are numbered 1,2,3… before the product name --------
{
  sandbox.openSmartEdit();
  sandbox.addSmartRow();
  sandbox.addSmartRow();
  const g = grid();
  const t = tracks().length;
  const idxOf = (r) => {
    const cell = g.children[t + r * t];
    const num = cell ? (cell.querySelector('.smart-idx-num') || cell) : null;
    return num ? String(num.textContent).trim() : null;
  };
  eq(idxOf(0), '1', 'the first row is numbered 1');
  eq(idxOf(1), '2', 'the second row is numbered 2');
  eq(idxOf(2), '3', 'the third row is numbered 3');
  eq(g.children[t].getAttribute('data-col'), 'idx', 'the row number leads the line, before المنتج');
}

// ---------- item 4: three-state row colouring -------------------------------
{
  // An existing product with healthy stock -> green.
  products.push({ id: 'pOk', name: 'منتج متوفر', quantity: 40, buyPrice: 100 });
  // An existing product below the low-stock threshold (5) -> red.
  products.push({ id: 'pLow', name: 'منتج منخفض', quantity: 2, buyPrice: 100 });
  sandbox.openSmartEdit();
  const g = grid();
  const t = tracks().length;
  const rowCellsOf = (r) => g.children.slice(t + r * t, t + (r + 1) * t);
  const stateOf = (r) => {
    const cs = rowCellsOf(r);
    if (cs.every((c) => c.classList.contains('smart-row-ok'))) return 'ok';
    if (cs.every((c) => c.classList.contains('smart-row-low'))) return 'low';
    if (cs.every((c) => c.classList.contains('smart-row-new'))) return 'new';
    return '';
  };

  sandbox.smartPickProduct(0, 'pOk');
  eq(stateOf(0), 'ok', 'an existing product with stock paints its whole row green');
  sandbox.smartPickProduct(0, 'pLow');
  eq(stateOf(0), 'low', 'an existing product below the threshold paints its whole row red');
  sandbox.updateSmartRow(1, 'name', 'اسم لا يطابق أي منتج');
  eq(stateOf(1), 'new', 'a name that matches no product paints its whole row orange');
  sandbox.updateSmartRow(2, 'name', '');
  eq(stateOf(2), '', 'an empty row carries no colour');
}

// ---------- item 5: the row number opens the product card -------------------
{
  sandbox.openSmartEdit();
  detailsCalls.length = 0;
  sandbox.smartShowProduct(0); // row 0 is tied to pLow
  eq(detailsCalls.join(','), 'pLow', 'clicking the number of an existing row opens its product card');
  detailsCalls.length = 0;
  sandbox.smartShowProduct(2); // empty row
  eq(detailsCalls.length, 0, 'clicking the number of an empty/new row opens nothing');
}

// ---------- item 2: the purchase-amount column (الكمية × سعر الشراء) ---------
{
  sandbox.openSmartEdit();
  let t = tracks().length;
  check(headerLabels(grid(), t).indexOf('مبلغ المشتريات') < 0, 'the amount column is hidden by default');
  check(!store['zmt_show_purchase_amount'], 'the default state is remembered as hidden');
  sandbox.smartToggleAmount();
  const g = grid();
  t = tracks().length;
  const heads = headerLabels(g, t);
  check(heads.indexOf('مبلغ المشتريات') >= 0, 'the button reveals the amount header');
  eq(heads.indexOf('مبلغ المشتريات'), heads.indexOf('شراء') + 1, 'the amount stands right after the buy-price column');
  eq(store['zmt_show_purchase_amount'], '1', 'the choice is persisted per machine');
  const amountCell = rowCells(g, t, 1)[0].find((c) => c.getAttribute('data-col') === 'amount');
  check(!!amountCell, 'every row paints an amount cell');
  eq(amountCell && amountCell.textContent, 'DA3420.00', 'the amount is qty × buy price');
  sandbox.smartToggleAmount();
  eq(tracks().length, t - 1, 'pressing the button again hides the amount column');
}

console.log('\n============================================');
if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
