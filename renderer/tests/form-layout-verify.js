// ============================================================================
// ZMT PIECE — ترتيب الحقول / عرض الأعمدة / النطاقات السعرية / الملء التلقائي
// Run: node renderer/tests/form-layout-verify.js
//
// Runs the REAL form-layout.js, quick-entry.js and invoices-smart.js over the
// REAL shipped markup with the shared mini-DOM. Everything here is additive:
// no database, no permissions, no printing, no sync code is exercised.
// ============================================================================
'use strict';
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
const FL_SRC = read('renderer/js/form-layout.js');
const QE_HTML = read('renderer/pages/quick-entry.html');
const QE_SRC = read('renderer/js/pages/quick-entry.js');
const SMART_SRC = read('renderer/js/pages/invoices-smart.js');
const CSS = read('renderer/css/main.css');
const INDEX = read('renderer/index.html');
const APP = read('renderer/js/app.js');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const section = (t) => console.log('\n--- ' + t + ' ---');

const EXTRAS = [{ id: 'e1', name: 'نصف جملة', color: '#e67e22' }];

/* ------------------------------------------------------------------ core -- */
const coreStore = {};
const coreDoc = dom.createDoc();
const core = {
  console, document: coreDoc, JSON, Math, String, Number, Object, Array, Boolean,
  parseFloat, parseInt, isFinite, RegExp, Error, Function, Infinity, NaN,
  setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {},
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(coreStore, k) ? coreStore[k] : null),
    setItem: (k, v) => { coreStore[k] = String(v); },
    removeItem: (k) => { delete coreStore[k]; },
  },
  t: (k) => (k === 'display.save' ? 'Save' : ''),
  ExtraPrices: { fields: () => EXTRAS },
  FV: { isVisible: () => true },
  addEventListener: () => {},
  module: { exports: {} },
};
core.window = core; core.globalThis = core;
vm.createContext(core);
vm.runInContext(FL_SRC, core, { filename: 'form-layout.js' });
const FL = core.FormLayout;

/* -------------------------------------------------------- static contract -- */
section('0) الأسلاك الثابتة (markup / CSS / i18n)');
check(INDEX.indexOf('js/form-layout.js') > INDEX.indexOf('js/field-visibility.js'), 'الوحدة محمّلة بعد field-visibility.js');
check(QE_HTML.indexOf('id="qeLayoutBtn"') > 0 && QE_HTML.indexOf('id="qeAutoBtn"') > 0, 'زرّا الإعدادات والملء في الإدخال السريع');
check(SMART_SRC.indexOf('id="smartLayoutBtn"') > 0 && SMART_SRC.indexOf('id="smartAutoBtn"') > 0, 'زرّا الإعدادات والملء في الإضافة الذكية');
const header = QE_HTML.slice(QE_HTML.indexOf('qe-grid-head'), QE_HTML.indexOf('id="qeRows"'));
check((header.match(/data-col="/g) || []).length === 20, 'كل خلية في رأس الإدخال السريع تحمل data-col');
check(/--qe-cols/.test(CSS) && /grid-template-columns:\s*var\(--qe-cols/.test(CSS), 'شبكة CSS تقرأ المسارات المولّدة');
check(/\.fl-locked-price/.test(CSS) && /\.fl-auto-price/.test(CSS), 'تمييز الخلية المثبَّتة والمملوءة آلياً');
check(APP.indexOf('window.FormLayout.refreshLabels()') > 0, 'إعادة ترجمة اللغة تشمل اللوحة الجديدة');
(['ar', 'en', 'fr', 'zh']).forEach((lang) => {
  const at = APP.indexOf(lang + ': {', APP.indexOf('Form layout (F1 + Smart Add)'));
  const chunk = APP.slice(at, at + 3000);
  check(chunk.indexOf('tabOrder:') > 0 && chunk.indexOf('autoFillBtn:') > 0, 'ترجمة ' + lang + ' كاملة');
});

/* ------------------------------------------------------------ core rules -- */
section('1) الافتراضات والحساب العشري الدقيق');
eq(FL.defaults().autoFill.enabled, false, 'الملء التلقائي موقّف افتراضياً');
eq(FL.applyPercent(109.2, 0), '109.2', '109.2 تبقى 109.2 بلا تقريب');
eq(FL.applyPercent(109.2, 10), '120.12', 'نسبة مئوية عشرية بلا ضجيج عائم');
eq(FL.applyPercent(100, 12.5), '112.5', '12.5% = 112.5');
eq(FL.applyPercent(99.99, 0), '99.99', 'قيمة بفاصلتين محفوظة كما هي');
eq(FL.applyPercent(100, -200), '0', 'السعر لا يصبح سالباً');

section('2) نطاقات متلاحقة بلا فجوات ولا تداخل');
FL.setLive({ autoFill: { enabled: true, bands: [
  { min: 0, pcts: { sell: 10, whole: 5 } },
  { min: 100, pcts: { sell: 20, whole: 10 } },
  { min: 200, pcts: { sell: 30, whole: 15 } },
] } });
const bands = FL.bands();
eq(bands.length, 3, 'ثلاثة نطاقات');
eq(bands[0].min, 0, 'أول نطاق يبدأ من 0');
eq(FL.bandFor(99.99, bands).pcts.sell, 10, 'آخر قيمة قبل 100 في النطاق الأول');
eq(FL.bandFor(100, bands).pcts.sell, 20, '100 في النطاق الثاني بلا فجوة');
eq(FL.bandFor(199.99, bands).pcts.sell, 20, '199.99 في النطاق الثاني');
eq(FL.bandFor(200, bands).pcts.sell, 30, '200 في النطاق الثالث');
eq(FL.bandFor(999999, bands).pcts.sell, 30, 'النطاق الأخير مفتوح إلى ما لا نهاية');
FL.setLive({ autoFill: { bands: [{ min: 150, pcts: {} }, { min: 50, pcts: {} }] } });
eq(FL.bands()[0].min, 0, 'تصحيح أول نطاق إلى 0');
eq(FL.bands()[1].min, 50, 'أول نطاق يُجبر على 0 وما بعده يبقى متصاعداً بلا فجوة');

section('3) ملء الفراغات فقط — اليدوي يثبّت خليته');
FL.setLive({ autoFill: { enabled: true, bands: [
  { min: 0, pcts: { sell: 10, whole: 5, 'extra:e1': 2 } },
  { min: 200, pcts: { sell: 30, whole: 15, 'extra:e1': 4 } },
] } });
const row = { sell: '', whole: '', extras: {} };
const st = FL.priceState(row);
const targets = () => [
  { key: 'sell', value: row.sell, set: (v) => { row.sell = v; } },
  { key: 'whole', value: row.whole, set: (v) => { row.whole = v; } },
  { key: 'extra:e1', value: row.extras.e1, set: (v) => { row.extras.e1 = v; } },
];
eq(FL.fillRow(100, st, targets(), 'toggle'), 3, 'يملأ البيع والجملة وكل سعر إضافي');
eq(row.sell, '110', 'بيع = 110');
eq(row.whole, '105', 'جملة = 105');
eq(row.extras.e1, '102', 'سعر إضافي = 102');
row.sell = '700';
FL.lockPrice(st, 'sell');
FL.fillRow(200, st, targets(), 'buy');
eq(row.sell, '700', 'السعر المكتوب يدوياً لا يُلمس عند تغيير الشراء');
eq(row.whole, '230', 'الخلايا غير المثبّتة تُعاد حسابها من سعر الشراء الجديد');
eq(row.extras.e1, '208', 'السعر الإضافي يُعاد حسابه أيضاً');
const untouched = { sell: '333', whole: '222' };
const st2 = FL.priceState(untouched);
eq(FL.fillRow(100, st2, [
  { key: 'sell', value: untouched.sell, set: (v) => { untouched.sell = v; } },
  { key: 'whole', value: untouched.whole, set: (v) => { untouched.whole = v; } },
], 'toggle'), 0, 'زر التشغيل لا يكتب فوق خلايا مملوءة');
eq(untouched.sell, '333', 'قيمة بشرية محفوظة');

section('4) ترتيب مشترك — # والحذف ثابتان — الحقول المخفية تحتفظ بمكانها');
const saved = FL.save({
  order: ['del', 'product', 'idx', 'sell', 'ghost', 'extra:e1'],
  widths: { 'quick-entry': { product: 9999, qty: 1 }, 'smart-add': {} },
  autoFill: { enabled: false, bands: [] },
});
eq(saved.order[0], 'idx', '# دائماً أولاً');
eq(saved.order[saved.order.length - 1], 'del', 'الحذف دائماً أخيراً');
check(saved.order.indexOf('extra:e1') > 0, 'السعر الإضافي داخل الترتيب');
check(saved.order.indexOf('ghost') < 0, 'مفتاح مجهول يُستبعد');
check(saved.order.indexOf('minPrice') > 0, 'حقل FV المخفي يُضاف تلقائياً ولا يُحذف من الترتيب');
eq(core.FV.isVisible('minPrice'), true, 'FV يبقى متاحاً');

section('5) عرض الأعمدة — مستقل لكل شاشة، محصور، مع إعادة ضبط');
FL.setLive({ widths: { 'quick-entry': { product: 9999, qty: 1 }, 'smart-add': { name: 9999 } } });
eq(FL.widthFor('quick-entry', 'product'), 600, 'الحد الأقصى 600px');
eq(FL.widthFor('quick-entry', 'qty'), 48, 'الحد الأدنى 48px');
eq(FL.widthFor('smart-add', 'name'), 260, 'تغيير عرض F1 لا يغيّر الإضافة الذكية');
eq(FL.widthFor('smart-add', 'qty'), 90, 'عرض الإضافة الذكية الافتراضي باقٍ');
const smartCols = FL.orderFor('smart-add');
eq(smartCols[0], 'idx', 'orderFor يعيد مفاتيح الإضافة الذكية الأصلية');
check(smartCols.indexOf('name') > 0 && smartCols.indexOf('price') > 0, 'product→name و buy→price');
const tracks = FL.tracksFor('smart-add', smartCols, { amountOff: true });
check(tracks.split(' ').indexOf('0px') >= 0, 'عمود المبلغ المخفي ينهار إلى صفر');

section('6) لوحة الإعدادات — الأسهم، السحب منطقياً، النطاقات، الحفظ');
FL.setLive({ autoFill: { bands: [
  { min: 0, pcts: {} }, { min: 100, pcts: {} }, { min: 200, pcts: {} },
] } });
FL.open('smart-add');
check(FL.current().order[0] === 'idx', 'المعاينة تبدأ بالترتيب المحفوظ');
const qtyBefore = FL.current().order.indexOf('qty');
FL.uiMoveField('qty', 1);
eq(FL.current().order.indexOf('qty'), qtyBefore + 1, '↑↓ ينقل الحقل');
FL.uiMoveField('idx', 1);
eq(FL.current().order[0], 'idx', '# لا يتحرك');
FL.uiMoveTo('qty', 'mark');
eq(FL.current().order.indexOf('qty') + 1, FL.current().order.indexOf('mark'), 'السحب إلى حقل يضعه قبله');
FL.uiWidthPage('quick-entry');
FL.uiSetWidth('buy', '999', 'num');
eq(FL.current().widths['quick-entry'].buy, 480, 'الحقل العدد محصور');
FL.uiResetWidth('buy');
eq(FL.current().widths['quick-entry'].buy, 88, '↺ يعيد عرض الحقل الافتراضي');
FL.uiSetBandMin(1, '999');
eq(FL.current().autoFill.bands[1].min, 199.99, 'الحد الأعلى مشتق من الحد التالي بلا تداخل');
FL.uiAddBand();
eq(FL.current().autoFill.bands.length, 4, 'إضافة نطاق');
FL.uiRemoveBand(0);
eq(FL.current().autoFill.bands.length, 4, 'لا يمكن حذف النطاق الأول');
FL.uiToggleAuto();
FL.uiSave();
eq(FL.load().autoFill.enabled, true, 'الحفظ يبقى بعد إغلاق اللوحة');
check(coreStore.zmt_form_layout && coreStore.zmt_form_layout.indexOf('"order"') > 0, 'الإعدادات مكتوبة في localStorage');
FL.reset();
eq(FL.load().autoFill.enabled, false, 'إعادة الضبط تعيد الملء إلى موقوف');

/* ------------------------------------------------------- Quick Entry live -- */
section('7) الإدخال السريع — ملء، تثبيت، ترتيب أسطر، مسارات الشبكة');
function qeHarness() {
  const doc = dom.createDoc();
  dom.parseInto(QE_HTML, doc.body);
  const store = {};
  const sandbox = {
    console, document: doc, Date, Math, Object, Array, JSON, String, Number, Boolean,
    isFinite, parseFloat, parseInt, RegExp, Error, Function, Infinity, NaN, Set, Map,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    alert: () => {},
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    DB: {
      getSuppliers: () => [], getProducts: () => [], getProduct: () => null,
      getProductByBarcode: () => null, generateBarcode: () => 'GEN1',
      findProductsByPlu: () => [], logAudit: () => {}, getMeta: () => null,
      getLowStockThreshold: () => 5,
    },
    normSearch: (s) => String(s || '').toLowerCase(),
    productSearchScore: () => 0,
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
    getPharmacyMode: () => false,
    buildBrandSelectOptions: () => '<option value="">—</option>',
    BRANDS: { global: [], chinese: [] },
    navigateTo: () => {}, trackPageListener: () => {}, _currentPageId: 'quick-entry',
    showProductDetails: () => {},
    ExtraPrices: { fields: () => EXTRAS, readInputs: () => ({}), inputsHTML: (scope) =>
      '<div class="extra-price-grid">' + EXTRAS.map((f) =>
        '<div class="extra-price-field"><input data-extra-scope="' + scope + '" data-extra-price-id="' + f.id + '" value="0"></div>').join('') + '</div>' },
    FV: { apply: () => {}, isVisible: () => true },
    t: (k) => k,
    addEventListener: () => {}, dispatchEvent: () => true,
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('renderer/js/lib/units.js'), sandbox, { filename: 'units.js' });
  vm.runInContext(read('renderer/js/purchase-core.js'), sandbox, { filename: 'purchase-core.js' });
  vm.runInContext(read('renderer/js/field-visibility.js'), sandbox, { filename: 'field-visibility.js' });
  vm.runInContext(FL_SRC, sandbox, { filename: 'form-layout.js' });
  vm.runInContext(QE_SRC, sandbox, { filename: 'quick-entry.js' });
  return { doc, sandbox, store, QE: sandbox.QE, FL: sandbox.FormLayout };
}
const qh = qeHarness();
qh.FL.reset();
qh.QE.open();
qh.QE.setField(1, 'buy', 100);
eq(qh.sandbox.document.getElementById('qeSell_1').value, '0', 'الملء موقوف → لا يُكتب شيء');
qh.QE.toggleAutoFill();
eq(qh.sandbox.document.getElementById('qeAutoBtn').getAttribute('aria-pressed'), 'true', 'زر الملء يعلن حالته');
eq(qh.store.zmt_form_layout && JSON.parse(qh.store.zmt_form_layout).autoFill.enabled, true, 'التفعيل محفوظ');
qh.QE.addRow();
qh.QE.setField(2, 'buy', 200);
eq(qh.sandbox.document.getElementById('qeSell_2').value, '200', 'سطر جديد يُملأ من النطاق الأول (افتراضي 0%)');
// نطاق حقيقي لاختبار الحساب داخل الصفحة
qh.FL.setLive({ autoFill: { bands: [{ min: 0, pcts: { sell: 10, whole: 5, 'extra:e1': 2 } }] } });
qh.QE.addRow();
qh.QE.setField(3, 'buy', 109.2);
eq(qh.sandbox.document.getElementById('qeSell_3').value, '120.12', 'الملء داخل الصفحة يحافظ على العشرية');
const qeSell3 = qh.sandbox.document.getElementById('qeSell_3');
qeSell3.value = '700';                       // as the browser does before oninput
qh.QE.setField(3, 'sell', '700');
qh.QE.setField(3, 'buy', 200);
eq(qeSell3.value, '700', 'تحرير بيع يدويًا يثبّت الخلية');
eq(qh.sandbox.document.getElementById('qeWhole_3').value, '210', 'الجملة وحدها تُعاد حسابها');
check(qh.sandbox.document.getElementById('qeRow_3').querySelector('.qe-locked-price') != null, 'خلية البيع المثبّتة موسومة');
const names = qh.QE._rows().map((r) => r.uid);
qh.QE.moveRow(3, -1);
eq(qh.QE._rows().map((r) => r.uid).join(','), [names[0], names[2], names[1]].join(','), '↓↑ يغيّر ترتيب الصفوف في البيانات');
eq(qh.sandbox.document.getElementById('qeRows').children[1].getAttribute('data-uid'), String(names[2]), 'DOM يتبع ترتيب الصفوف');
const wrap = qh.sandbox.document.querySelector('.qe-grid-wrap');
qh.FL.setLive({ widths: { 'quick-entry': { buy: 300 } } });
check(wrap.style.getPropertyValue('--qe-cols').indexOf('300px') >= 0, 'تغيير العرض يعيد توليد مسارات الشبكة');
qh.QE.toggleAmount();
check(wrap.style.getPropertyValue('--qe-cols').indexOf('0px') >= 0, 'إخفاء المبلغ يُقفل مساره');

/* ---------------------------------------------------------- Smart Add live -- */
section('8) الإضافة الذكية — أعمدة، ملء، تثبيت، ترتيب داخل undo/redo');
function smartHarness() {
  const doc = dom.createDoc();
  const store = {};
  const sandbox = {
    console, document: doc, localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    setTimeout, clearTimeout, Date, Math, JSON, String, Number, parseFloat, parseInt, isFinite,
    escHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    normSearch: (s) => String(s || '').toLowerCase().trim(),
    productSearchScore: () => 0,
    alert: () => {}, filterInvoices: () => {}, isRTL: () => true,
    showProductDetails: () => {},
    FV: { toggle: () => {}, isVisible: () => true, apply: () => {} },
    ExtraPrices: { fields: () => EXTRAS },
    InvoiceOCR: { getEngine: () => '', saveEngine: () => {}, getKeys: () => [], saveKeys: () => {}, ocrFile: async () => ({ rows: [], rawText: '' }) },
    DB: {
      getProducts: () => [], getProduct: () => null, getSuppliers: () => [],
      generateBarcode: () => 'BC1', getLowStockThreshold: () => 5,
      addOrMergeProduct: () => ({ id: 'p1' }), addInvoice: (i) => Object.assign({}, i, { id: 'inv1' }),
    },
    t: (k) => k, addEventListener: () => {}, dispatchEvent: () => true,
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(FL_SRC, sandbox, { filename: 'form-layout.js' });
  vm.runInContext(SMART_SRC, sandbox, { filename: 'invoices-smart.js' });
  return { doc, sandbox, store, FL: sandbox.FormLayout };
}
const sh = smartHarness();
sh.FL.reset();
sh.FL.setLive({ autoFill: { enabled: true, bands: [{ min: 0, pcts: { sell: 10, whole: 5, 'extra:e1': 2 } }] } });
sh.sandbox.openSmartEdit();
sh.sandbox.addSmartRow();
sh.sandbox.updateSmartRow(0, 'price', 100);
eq(sh.doc.querySelector('[data-col="sell"][data-row="0"]').value, '110', 'سعر البيع يُملأ من سعر الشراء');
eq(sh.doc.querySelector('[data-col="extra:e1"][data-row="0"]').value, '102', 'السعر الإضافي يُملأ أيضاً');
const smartSell0 = sh.doc.querySelector('[data-col="sell"][data-row="0"]');
smartSell0.value = '700';                    // as the browser does before onchange
sh.sandbox.updateSmartRow(0, 'sell', '700');
sh.sandbox.updateSmartRow(0, 'price', 200);
eq(smartSell0.value, '700', 'البيع اليدوي مثبّت');
eq(sh.doc.querySelector('[data-col="whole"][data-row="0"]').value, '210', 'الجملة تُحدَّث وحدها');
sh.sandbox.closeSmartEdit();
sh.sandbox.openSmartEdit();
['أ', 'ب', 'ج'].forEach((n) => {
  sh.sandbox.addSmartRow();
  const i = sh.doc.querySelectorAll('[data-col="name"][data-row]').length - 1;
  sh.sandbox.updateSmartRow(i, 'name', n);
});
const rowNames = () => Array.prototype.slice.call(sh.doc.querySelectorAll('[data-col="name"][data-row]'))
  .filter((el) => el.tag === 'input').map((el) => el.value).join(',');
sh.sandbox.smartToggleAmount();      // re-render so inputs mirror the row data
const beforeMove = rowNames();
sh.sandbox.smartMoveRow(2, -1);
check(rowNames() !== beforeMove, '↑↓ يغيّر ترتيب أسطر الإضافة الذكية');
const afterMove = rowNames();
sh.sandbox.smartUndo();
eq(rowNames(), beforeMove, 'ترتيب الأسطر داخل undo');
sh.sandbox.smartRedo();
eq(rowNames(), afterMove, 'ترتيب الأسطر داخل redo');
sh.FL.setLive({ order: sh.FL.defaults().order.slice().sort((a, b) => (a === 'mark' ? -1 : (b === 'mark' ? 1 : 0))) });
const heads = Array.prototype.slice.call(sh.doc.getElementById('smartGrid').children)
  .slice(0, sh.FL.orderFor('smart-add').length).map((el) => el.textContent);
check(heads.indexOf('مارك') >= 0, 'عمود مارك ما زال موجوداً بعد تغيير الترتيب');
check(sh.doc.getElementById('smartAutoBtn').getAttribute('aria-pressed') === 'true', 'زر الملء يعكس الحالة المحفوظة');

console.log('\n' + (fail ? 'FAILED' : 'OK') + ' — pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
