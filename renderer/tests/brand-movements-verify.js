// ZMT PIECE — Mark movements (حركات المارك) verifier
// Run: node renderer/tests/brand-movements-verify.js
//
// Covers the READ-ONLY mark analytics used inside the customer-movements page:
//   1. mark discovery from the free-text `mark` on each product (NOT BRANDS),
//      including case/space normalisation and the «بدون مارك» bucket,
//   2. aggregation of sales (ops + qty + value), customer returns and damaged
//      goods (supplier returns), with correct row resolution by id / barcode,
//   3. date-range filtering through the existing #pmDateFrom / #pmDateTo,
//   4. the printable report and the colour / black&white print mode,
//   5. print-mode buttons only change the preference — they never open a print
//      preview or rebuild the report,
//   6. the in-page mode switch (open / close) and the read-only guarantee:
//      collect() never mutates any DB array.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

const DICT = {
  'bm.salesCard': 'المبيعات', 'bm.opsUnit': 'عملية', 'bm.qtyShort': 'الكمية',
  'bm.returnsCard': 'المرتجعات', 'bm.damagedCard': 'السلع الفاسدة',
  'bm.productsCard': 'منتجات المارك', 'bm.invoicesShort': 'فواتير',
  'bm.reportTitle': 'تقرير حركات المارك', 'bm.generated': 'تقرير مُولَّد آلياً',
  'bm.period': 'الفترة', 'bm.allTime': 'كل الفترات',
  'bm.noMark': 'بدون مارك', 'bm.brandLabel': 'المارك',
  'invoices.printColor': 'طباعة ملوّنة', 'invoices.printBw': 'طباعة أبيض وأسود',
  'movements.print': 'طباعة', 'movements.close': 'إغلاق',
};

function makeEl(id) {
  return {
    id, value: '', innerHTML: '', placeholder: '', style: {},
    getAttribute() { return null; }, setAttribute() {},
    classList: { toggle() {}, add() {}, remove() {} },
    appendChild() {}, removeChild() {}, click() {},
  };
}

function makeEnv() {
  // p1/p2 are the SAME mark despite the different case — this is the free-text
  // mark a user types while adding a product. p4 has no mark at all.
  const products = [
    { id: 'p1', name: 'منتج واحد', barcode: 'BC1', mark: 'ZMT' },
    { id: 'p2', name: 'منتج اثنان', barcode: 'BC2', mark: 'zmt' },
    { id: 'p3', name: 'منتج آخر', barcode: 'BC3', mark: 'أخرى' },
    { id: 'p4', name: 'منتج بلا مارك', barcode: 'BC4', mark: '   ' },
  ];
  const invoices = [
    { id: 'i1', type: 'customer', createdAt: new Date('2024-01-15').getTime(), invoiceNumber: 'F1',
      items: [{ productId: 'p1', qty: 2, total: 200 }, { productId: 'p2', qty: 1, price: 50, total: 50 }] },
    { id: 'i2', type: 'customer', createdAt: new Date('2024-03-15').getTime(), invoiceNumber: 'F2',
      items: [{ barcode: 'BC1', qty: 3, total: 300 }] },
    { id: 'i3', type: 'customer', createdAt: new Date('2023-12-01').getTime(), invoiceNumber: 'F3',
      items: [{ productId: 'p1', qty: 100, total: 10000 }] },
    { id: 'pay1', type: 'payment', createdAt: new Date('2024-04-01').getTime(),
      items: [{ productId: 'p1', qty: 99, total: 9900 }] },
  ];
  const returns = [
    { id: 'r1', productId: 'p1', qty: 1, total: 100, createdAt: new Date('2024-01-20').getTime() },
  ];
  const supplierReturns = [
    { id: 'd1', productId: 'p1', qty: 2, amount: 150, status: 'pending', createdAt: new Date('2024-01-25').getTime() },
    { id: 'd2', productId: 'p2', qty: 1, price: 30, status: 'returned', createdAt: new Date('2024-02-25').getTime() },
  ];

  const elements = {};
  const doc = {
    getElementById(id) { return elements[id] || (elements[id] = makeEl(id)); },
    querySelector() { return makeEl('q'); },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl(tag); },
    body: { appendChild() {}, removeChild() {} },
  };

  let printed = '';
  let openCount = 0;
  let dbVersion = 1;
  const sandbox = {
    console, Date, Math, JSON, String, Number, Object, Array,
    parseFloat, parseInt, isFinite,
    document: doc,
    // Deliberately present but WRONG: the old implementation used BRANDS.
    BRANDS: { global: [{ id: 'b1', name: 'ماركة元年', kind: 'قطع غيار' }], chinese: [] },
    localStorage: (function () {
      const store = {};
      return {
        getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem(k, v) { store[k] = String(v); },
      };
    }()),
    t: (k) => DICT[k] || '',
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    getStoreInfo: () => ({ name: 'متجر الاختبار', address: 'الجزائر', phone: '0770' }),
    alert() {},
    open() {
      openCount++;
      const w = { document: { write(h) { printed += h; }, close() {} }, close() {} };
      return w;
    },
    Blob: function () {}, URL: { createObjectURL: () => 'blob:x' },
    DB: {
      dataVersion: () => dbVersion,
      getProducts: () => products,
      getInvoices: () => invoices,
      getReturns: () => returns,
      getSupplierReturns: () => supplierReturns,
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  // The real engine routes its refresh into the mark view; emulate that here.
  sandbox.PartyMovements = {
    refresh() { if (sandbox.BrandMovements) sandbox.BrandMovements.render(); },
    setPrintMode() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(read('renderer/js/lib/print-mode.js'), sandbox, { filename: 'print-mode.js' });
  vm.runInContext(read('renderer/js/lib/brand-movements.js'), sandbox, { filename: 'brand-movements.js' });
  return {
    env: sandbox, elements, getPrinted: () => printed, getOpenCount: () => openCount,
    bumpVersion: () => { dbVersion++; },
    products, invoices, returns, supplierReturns,
  };
}

// ======================================================== discovery / setup ===
{
  const { env } = makeEnv();
  const marks = env.BrandMovements.listMarks();
  eq(marks.length, 3, 'marks come from product.mark, not from BRANDS');
  check(marks.some((m) => m.id === 'zmt'), 'normalised mark id zmt is present');
  check(!marks.some((m) => m.id === 'b1'), 'the BRANDS id b1 is NOT listed');
  const zmt = marks.find((m) => m.id === 'zmt');
  eq(zmt.name, 'ZMT', 'the first spelling typed by the user is displayed');
  eq(zmt.count, 2, 'ZMT and zmt are one mark with two products');
  eq(marks[marks.length - 1].id, '__none__', 'empty marks are grouped last');
  eq(marks[marks.length - 1].name, 'بدون مارك', 'the empty mark bucket has a translated label');
  eq(env.BrandMovements.productsForMark('zmt').length, 2, 'mark zmt owns two products');
  eq(env.BrandMovements.productsForMark('أخرى').length, 1, 'mark أخرى owns one product');
  eq(env.BrandMovements.productsForMark('__none__').length, 1, 'the no-mark bucket owns one product');
  eq(env.BrandMovements.productsForMark('missing').length, 0, 'unknown mark owns nothing');
  // Legacy aliases still resolve against mark data.
  eq(env.BrandMovements.listBrands().length, 3, 'legacy listBrands() alias uses mark data');
  eq(env.BrandMovements.productsFor({ id: 'zmt' }).length, 2, 'legacy productsFor() alias uses mark data');
}

// ================================================ cache follows dataVersion ===
{
  const { env, products, bumpVersion } = makeEnv();
  eq(env.BrandMovements.listMarks().length, 3, 'initial mark list is cached');
  products.push({ id: 'p5', name: 'منتج جديد', barcode: 'BC5', mark: 'جديد' });
  eq(env.BrandMovements.listMarks().length, 3, 'unchanged DB version keeps the cached list');
  bumpVersion();
  eq(env.BrandMovements.listMarks().length, 4, 'a DB version bump refreshes the mark list');
}

// ============================================================== aggregation ===
{
  const { env, products, invoices, returns, supplierReturns } = makeEnv();
  const before = JSON.stringify({ products, invoices, returns, supplierReturns });
  const data = env.BrandMovements.collect('zmt');

  eq(data.products.length, 2, 'only products carrying mark zmt appear in the report');
  eq(data.mark.id, 'zmt', 'the report carries the selected mark');
  const p1 = data.products.find((r) => r.id === 'p1');
  const p2 = data.products.find((r) => r.id === 'p2');
  eq(p1.sales.ops, 3, 'p1 sales count is 3 operations');
  eq(p1.sales.qty, 105, 'p1 sales quantity sums 2 + 3 + 100');
  eq(p1.sales.value, 10500, 'p1 sales value sums 200 + 300 + 10000');
  eq(p1.returns.ops, 1, 'p1 has one customer return');
  eq(p1.returns.value, 100, 'customer return value is taken from getReturns');
  eq(p1.damaged.ops, 1, 'p1 has one damaged-goods row');
  eq(p1.damaged.value, 150, 'damaged value is taken from getSupplierReturns (amount)');
  eq(p1.damagedPending, 1, 'a pending supplier return is counted as pending');
  eq(p2.damaged.ops, 1, 'p2 has one damaged-goods row');
  eq(p2.damaged.value, 30, 'damaged value falls back to price * qty');
  eq(p2.damagedReturned, 1, 'a returned supplier return is counted separately');

  eq(data.totals.sales.ops, 4, 'total sales operations = 3 (p1) + 1 (p2)');
  eq(data.totals.sales.qty, 106, 'total sales quantity');
  eq(data.totals.sales.value, 10550, 'total sales value');
  eq(data.totals.returns.value, 100, 'total customer returns value');
  eq(data.totals.damaged.value, 180, 'total damaged value (150 + 30)');
  eq(data.totals.invoices, 3, 'payment-only invoice is excluded from sale count');
  eq(data.totals.productCount, 2, 'product count is reported');

  const after = JSON.stringify({ products, invoices, returns, supplierReturns });
  check(before === after, 'collect() never mutates the DB arrays (read-only)');

  const none = env.BrandMovements.collect('__none__');
  eq(none.mark.name, 'بدون مارك', 'the no-mark group is reportable on its own');
  eq(none.products.length, 1, 'the no-mark group contains only mark-less products');
  eq(none.totals.sales.ops, 0, 'a mark-less product has no sales attributed to a mark');
}

// ============================================================ date filtering ===
{
  const { env } = makeEnv();
  env.BrandMovements.state.from = '2024-02-01';
  env.BrandMovements.state.to = '2024-12-31';
  const data = env.BrandMovements.collect('zmt');
  eq(data.totals.sales.ops, 1, 'range keeps only the March invoice');
  eq(data.totals.sales.value, 300, 'range sales value');
  eq(data.totals.returns.ops, 0, 'January return is outside the range');
  eq(data.totals.damaged.ops, 1, 'range keeps only the February damaged row');
  eq(data.totals.damaged.value, 30, 'range damaged value');
  check(data.rangeLabel.indexOf('2024-02-01') !== -1, 'range label carries the selected period');
}

// ===================================================== printable + mode ======
{
  const { env, getPrinted, getOpenCount } = makeEnv();
  const data = env.BrandMovements.collect('zmt');
  const html = env.BrandMovements.reportHTML(data);
  check(html.indexOf('متجر الاختبار') !== -1, 'report shows the store name');
  check(html.indexOf('تقرير حركات المارك') !== -1, 'report shows the mark-movements title');
  check(html.indexOf('ZMT') !== -1, 'report shows the selected mark name');
  check(html.indexOf('3 / 105 /') !== -1, 'sales are shown as ops / qty / value');
  check(html.indexOf('DA10500.00') !== -1, 'sales value is printed with money formatting');
  check(html.indexOf('onclick=') === -1, 'printed report has no in-page click handlers');

  eq(env.BrandMovements.printMode(), 'color', 'default print mode is colour');
  env.BrandMovements.state.markId = 'zmt';
  const opensBeforeModeClick = getOpenCount();
  env.bmPrintBw();
  eq(env.BrandMovements.printMode(), 'bw', 'mode can be switched to black & white');
  eq(env.PrintMode.get(), 'bw', 'the shared print mode is updated too');
  eq(getOpenCount(), opensBeforeModeClick, 'switching mode never opens a print preview');
  env.BrandMovements.showReport();
  const printed = getPrinted();
  check(printed.indexOf('window.print()') !== -1, 'print preview offers a print button');
  check(printed.indexOf('filter:grayscale(100%)') !== -1, 'black & white preview applies greyscale CSS');
  check(printed.indexOf('@page') !== -1, 'preview sets the A4 page rule');
  check(printed.indexOf('متجر الاختبار') !== -1, 'preview carries the store name');
  eq(getOpenCount(), opensBeforeModeClick + 1, 'only the actual report button opens one preview');
}

// =============================================== in-page mode + read-only =====
{
  const { env, elements, getOpenCount } = makeEnv();
  check(env.BrandMovements.isActive() === false, 'mark mode starts inactive');
  env.bmOpen();
  check(env.BrandMovements.isActive() === true, 'bmOpen activates the mark mode');
  eq(env.BrandMovements.state.markId, 'zmt', 'the mark with the most products is selected first');
  check(elements['pmList'].innerHTML.indexOf('bm-panel') !== -1, 'the view renders inside #pmList');
  check(elements['pmChips'].innerHTML === '', 'the party chips are cleared while mark mode is active');
  check(elements['pmChartWrap'].style.display === 'none', 'the party chart is hidden in mark mode');
  check(elements['pmList'].innerHTML.indexOf('bmMarkSelect') !== -1, 'the selector is bound to the mark handler');
  check(elements['pmList'].innerHTML.indexOf('بدون مارك') !== -1, 'the no-mark group is offered in the selector');

  const htmlBeforeModeClick = elements['pmList'].innerHTML;
  const opensBeforeModeClick = getOpenCount();
  env.bmPrintColor();
  check(elements['pmList'].innerHTML === htmlBeforeModeClick, 'mode click does not rebuild the panel');
  eq(getOpenCount(), opensBeforeModeClick, 'mode click does not print');

  env.BrandMovements.onMarkChange('__none__');
  check(elements['pmList'].innerHTML.indexOf('منتج بلا مارك') !== -1, 'selecting the no-mark group shows its products');
  env.BrandMovements.onMarkChange('zmt');
  env.bmToggleProduct('p1');
  check(elements['pmList'].innerHTML.indexOf('bm-detail-title') !== -1, 'a product row expands to its operations');
  env.bmQuickRange('today');
  check(!!env.BrandMovements.state.from, 'the Today quick range sets the start date');
  env.bmQuickRange('all');
  check(env.BrandMovements.state.from === '', 'the All quick range clears the period');
  env.bmClose();
  check(env.BrandMovements.isActive() === false, 'bmClose restores the normal party ledger');
}

console.log('\n============================================');
console.log((fail === 0 ? 'PASS' : 'FAIL') + ' — pass=' + pass + ' fail=' + fail);
console.log('============================================');
