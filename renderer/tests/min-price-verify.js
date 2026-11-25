// ============================================================================
// ZMT PIECE — «السعر الأدنى للمنتج» من الإدخال إلى البيع — فحص سلوكي دائم
// Run: node renderer/tests/min-price-verify.js
//
// القاعدة المثبَّتة: رقم موجب = حدّ بيع صارم، 0/فراغ = بلا حدّ.
// يفحص هذا الملف المسار كاملاً على الشيفرة المشحونة نفسها:
//   1) رأس جدول F1 مطابق لمساراته (بلا إزاحة) وعمود الاسم لم يتغيّر
//   2) حفظ الحدّ ودمجه في db.js (الصفر لا يمحو حدّاً)
//   3) الإدخال السريع: تعبئة من المنتج، تصفير عند فكّ الربط، وحمولة الحفظ
//   4) المخزون: الحقلان موجودان ويُقرآن ويُصفّران ويُعبّآن
//   5) الإضافة الذكية: عمود حقيقي محفوظ لا صفر ثابت
//   6) صفحة البيع: تلميح الحدّ + الإنفاذ المركزي في sale-core
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { doc, createDoc, parseInto } = require('./dom-lite.js');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (c, m) => c ? ok(m) : bad(m);
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const section = (name) => console.log('\n=== ' + name + ' ===');

function sliceBalanced(text, start, open, close) {
  let depth = 0, i = start, inStr = null, esc = false, line = false, block = false;
  for (; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return text.slice(start);
}
function grabAppFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error(name + ' is not a global function in app.js');
  const open = src.indexOf('{', src.indexOf(')', i));
  return src.slice(i, open + sliceBalanced(src, open, '{', '}').length);
}
function grabAppRange(src, startDecl, endFn) {
  const a = src.indexOf(startDecl);
  if (a === -1) throw new Error(startDecl + ' is not in app.js');
  const b = src.indexOf('function ' + endFn + '(', a);
  if (b === -1) throw new Error(endFn + ' does not follow ' + startDecl);
  const open = src.indexOf('{', src.indexOf(')', b));
  return src.slice(a, open + sliceBalanced(src, open, '{', '}').length);
}

const appSrc = read('renderer/js/app.js');
const qeHtml = read('renderer/pages/quick-entry.html');
const qeJs = read('renderer/js/pages/quick-entry.js');
const invHtml = read('renderer/pages/inventory.html');
const invJs = read('renderer/js/pages/inventory.js');
const smartJs = read('renderer/js/pages/invoices-smart.js');
const salesJs = read('renderer/js/pages/sales.js');
const saleCoreJs = read('renderer/js/sale-core.js');
const css = read('renderer/css/main.css');

// ============================================================ 1. markup ======
section('1) رأس جدول F1 مطابق لمساراته وعمود الاسم محفوظ');

(function () {
  const headBlock = /<div class="qe-grid-head">([\s\S]*?)<\/div>\s*<div id="qeRows">/.exec(qeHtml);
  check(!!headBlock, 'كتلة رأس جدول F1 قابلة للقراءة');
  const cols = (headBlock[1].match(/<div class="qe-col/g) || []).length;

  const grid = /\.qe-grid-head, \.qe-row \{[^}]*grid-template-columns:([^;]+);[^}]*min-width:\s*(\d+)px/.exec(css);
  check(!!grid, 'قاعدة شبكة F1 ما زالت معلنة في main.css');
  const tracks = grid[1].trim().split(/\s+/);
  eq(cols, tracks.length, 'عدد خلايا الرأس = عدد مسارات الشبكة');
  const sum = tracks.reduce((s, tk) => s + (parseInt(tk, 10) || 0), 0);
  eq(sum, Number(grid[2]), 'min-width = مجموع المسارات (لا اقتطاع لعمود)');

  // طلب صاحب المتجر: أسماء المنتجات طويلة، فلا يتغيّر مقاس عمود الاسم.
  // العمود الأول صار رقم السطر (40px)، فيأتي اسم المنتج ثانياً بمقاسه 185px.
  eq(tracks[0], '40px', 'عمود رقم السطر يتصدّر الشبكة بـ40px');
  eq(tracks[1], '185px', 'عمود اسم المنتج بقي 185px كما هو');

  // الترتيب الفيزيائي يجب أن يطابق ترتيب الصف المرسوم في quick-entry.js.
  const at = (k) => qeHtml.indexOf('data-i18n="' + k + '"');
  check(at('quickEntry.buyPrice') < at('quickEntry.purchaseDiscount'), 'الخصم بعد سعر الشراء في الرأس');
  check(at('quickEntry.purchaseDiscount') < at('quickEntry.sellPrice'), 'وسعر البيع بعد الخصم');
  check(at('quickEntry.reference') < at('quickEntry.plu') && at('quickEntry.plu') < at('quickEntry.barcode'), 'PLU بين المرجع والباركود');
  check(at('quickEntry.mark') < at('quickEntry.minPrice') && at('quickEntry.minPrice') < at('quickEntry.storageLocation'), 'السعر الأدنى بين المارك ومكان التخزين');

  // أصناف الإظهار/الإخفاء تغطي الرأس والصف معاً.
  ['qe-col-disc', 'qe-col-plu', 'qe-col-minprice', 'fv-minPrice'].forEach((cls) => {
    check(headBlock[1].indexOf(cls) !== -1, 'رأس F1 يحمل الصنف ' + cls);
  });
  check(qeJs.indexOf('qe-col-minprice') !== -1, 'صف F1 يحمل خلية السعر الأدنى');
  check(/body\.fv-hide-minPrice\s+\.qe-col-minprice/.test(css), 'إخفاء الحقل يخفي عمود F1');
  check(/body\.fv-hide-minPrice\s+\.fv-minPrice/.test(css), 'إخفاء الحقل يخفي بقية الحقول');
}());

section('2) حقول المخزون: موجودة ومربوطة بالشفرة');
(function () {
  ['invMinPrice', 'invDirectMinPrice'].forEach((id) => {
    const wrap = new RegExp('<div class="form-group fv-minPrice">[\\s\\S]{0,400}?id="' + id + '"').exec(invHtml);
    check(!!wrap, 'inventory.html يغلّف #' + id + ' بصنف fv-minPrice');
    const tag = new RegExp('<input[^>]*id="' + id + '"[^>]*>').exec(invHtml);
    check(!!tag, 'inventory.html فيه #' + id);
    if (!tag) return;
    check(/data-i18n-placeholder="quickEntry\.minPricePlaceholder"/.test(tag[0]), id + ' له تلميح «0 = بدون حد» مترجم');
  });
  check(/getElementById\('invMinPrice'\)/.test(invJs), 'inventory.js يقرأ invMinPrice');
  check(/getElementById\('invDirectMinPrice'\)/.test(invJs), 'inventory.js يقرأ invDirectMinPrice');
  check(/minDirectEl\.value = '0'/.test(invJs), 'نموذج الإضافة المباشرة يصفّر الحدّ');
  check(/minEl\.value = '0'/.test(invJs), 'نموذج إضافة المنتج يصفّر الحدّ');
  check(/minEl\.value = String\(Math\.max\(0, parseFloat\(p\.minPrice\) \|\| 0\)\)/.test(invJs), 'اختيار منتج موجود يعبّئ حدّه');
}());

// ============================================================ 3. db.js ======
section('3) db.js الحقيقي: الحفظ والدمج');
(function () {
  const store = {};
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const dbDoc = createDoc();
  const body = /<body[^>]*>([\s\S]*)$/i.exec(invHtml);
  parseInto(body ? body[1] : invHtml, dbDoc.body);

  const box = {
    module: { exports: {} }, console, localStorage: ls, document: dbDoc,
    Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
    RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map, WeakMap,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    indexedDB: null, navigator: { onLine: false },
    fetch: () => Promise.reject(new Error('no network in tests')),
    alert: () => {}, confirm: () => true,
    addEventListener: () => {}, removeEventListener: () => {},
    CustomEvent: function (name, opts) { this.type = name; this.detail = opts && opts.detail; },
    Auth: {
      isLoggedIn: () => false, getUserCode: () => '', getCurrentUser: () => null,
      getCompanyId: () => '', getRole: () => 'manager', getStoreName: () => '',
      isManager: () => true, canEdit: () => true, currentUserId: () => 'u1', buyPriceVisible: () => true,
    },
    t: (k) => k,
    escHtml: (s) => String(s == null ? '' : s),
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    normSearch: (s) => String(s || ''),
    productSearchScore: () => 1,
    debounce: (fn) => fn,
    getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
    getPharmacyMode: () => false,
    trackPageListener: () => {}, navigateTo: () => {}, renderInventory: () => {},
    BRANDS: { global: [], chinese: [] },
    ExtraPrices: { fields: () => [], readInputs: () => ({}), inputsHTML: () => '', COLORS: ['#111'], MAX: 5, saveFields: () => {}, fillInputs: () => {} },
    cleanScannedCode: (v) => String(v || '').trim(),
  };
  box.window = box; box.self = box; box.globalThis = box;
  vm.createContext(box);

  ['normBarcode', 'canonBarcode', 'normalizeSearchText', 'searchTokens', 'productSearchScore',
    'cleanScannedCode', 'normSearch'].forEach((n) => {
    vm.runInContext(grabAppFn(appSrc, n), box, { filename: 'app.js#' + n });
  });
  vm.runInContext(grabAppRange(appSrc, 'function _mapChars(', 'barcodeVariants'), box, { filename: 'app.js#barcode helpers' });
  vm.runInContext(read('renderer/js/lib/units.js'), box, { filename: 'units.js' });
  vm.runInContext(read('renderer/js/purchase-core.js'), box, { filename: 'purchase-core.js' });
  vm.runInContext(saleCoreJs, box, { filename: 'sale-core.js' });
  vm.runInContext(read('renderer/js/db.js'), box, { filename: 'db.js' });
  vm.runInContext(invJs, box, { filename: 'inventory.js' });

  const DB = vm.runInContext('DB', box);
  const SaleCore = vm.runInContext('SaleCore', box);
  check(!!DB && typeof DB.addOrMergeProduct === 'function', 'DB الحقيقي محمّل في العزل');
  check(!!SaleCore && typeof SaleCore.computeSale === 'function', 'SaleCore الحقيقي محمّل في العزل');

  // --- a new product keeps its floor -------------------------------------
  const made = DB.addOrMergeProduct({
    name: 'دولكس', barcode: '9100001', buyPrice: 100, sellPrice: 200,
    wholesalePrice: 180, quantity: 40, minPrice: 150,
  });
  eq(made.ok, true, 'إنشاء منتج بحدّ أدنى ينجح');
  eq(made.product.minPrice, 150, 'الحدّ محفوظ على المنتج الجديد');

  // --- a merge with 0 must NOT wipe the stored floor ---------------------
  const wipe = DB.addOrMergeProduct({
    name: 'دولكس', barcode: '9100001', buyPrice: 100, sellPrice: 200,
    wholesalePrice: 180, quantity: 5, minPrice: 0,
  });
  eq(wipe.merged, true, 'نفس الهوية والسعر ⇒ دمج في سطر واحد');
  eq(DB.getProduct(made.product.id).minPrice, 150, 'الدمج بصفر لا يمحو الحدّ المحفوظ');

  // --- an explicit positive floor travels with the merge ------------------
  DB.addOrMergeProduct({
    name: 'دولكس', barcode: '9100001', buyPrice: 100, sellPrice: 200,
    wholesalePrice: 180, quantity: 2, minPrice: 170,
  });
  eq(DB.getProduct(made.product.id).minPrice, 170, 'الدمج برقم موجب يحدّث الحدّ');
  eq(DB.getProduct(made.product.id).quantity, 47, 'والكميات بقيت مجمّعة كما هي');

  // --- no floor means no limit, not a zero-price floor --------------------
  const open = DB.addOrMergeProduct({ name: 'بلا حد', barcode: '9100002', buyPrice: 10, sellPrice: 20, quantity: 9 });
  eq(Math.max(0, parseFloat(open.product.minPrice) || 0), 0, 'غياب الحدّ = بلا حدّ');

  // --- the engine itself refuses to sell under the floor -----------------
  (function () {
    const res = SaleCore.computeSale(DB, {
      lines: [{ entries: [{ productId: made.product.id, qty: 2, price: 50 }], lineDiscount: 0 }],
      customerDiscountPct: 0,
      extraDiscount: 0,
    });
    eq(res.ok, true, 'computeSale يقبل البيع');
    eq(res.invoiceItems[0].originalPrice, 170, 'سعر الوحدة يُرفع إلى الحدّ قبل أي خصم');
    eq(res.invoiceItems[0].total, 340, 'والإجمالي محسوب على السعر المرفوع');
  }());

  // --- a free line (no product) is never touched -------------------------
  (function () {
    const res = SaleCore.computeSale(DB, {
      lines: [{ entries: [{ name: 'سطر حر', qty: 1, price: 5 }], lineDiscount: 0 }],
    });
    eq(res.invoiceItems[0].total, 5, 'السطر الحر بلا منتج لا يخضع لأي حدّ');
  }());

  // --- inventory form: reset + prefill use the real inputs ---------------
  (function () {
    // The mini DOM has no <option> list for an empty <select>; unit filling is
    // irrelevant here, so neutralise it and exercise the min-price logic only.
    vm.runInContext('Unit.fillSelect = function () {};', box);
    const minEl = dbDoc.getElementById('invMinPrice');
    check(!!minEl, 'نموذج المخزون يعرض #invMinPrice فعلاً');
    minEl.value = '77';
    box.resetInvForm();
    eq(minEl.value, '0', 'resetInvForm يصفّر السعر الأدنى');

    box.fillInvFromProduct(made.product.id);
    eq(minEl.value, '170', 'اختيار منتج يعبّئ حدّه في النموذج');
  }());

  // ======================================================== 4. quick-entry ==
  section('4) الإدخال السريع الحقيقي: تعبئة، تصفير، وحمولة حفظ');

  const qeDoc = createDoc();
  (function () {
    const b = /<body[^>]*>([\s\S]*)$/i.exec(qeHtml);
    parseInto(b ? b[1] : qeHtml, qeDoc.body);
  }());
  const qeBag = {};
  const qeLS = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(qeBag, k) ? qeBag[k] : null),
    setItem: (k, v) => { qeBag[k] = String(v); },
    removeItem: (k) => { delete qeBag[k]; },
  };
  const qeBox = {
    module: { exports: {} }, console, localStorage: qeLS, document: qeDoc,
    Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
    RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map, WeakMap,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    indexedDB: null, navigator: { onLine: false },
    fetch: () => Promise.reject(new Error('no network in tests')),
    alert: () => {}, confirm: () => true,
    addEventListener: () => {}, removeEventListener: () => {},
    CustomEvent: function (name, opts) { this.type = name; this.detail = opts && opts.detail; },
    Auth: {
      isLoggedIn: () => true, getUserCode: () => 'T1', getCurrentUser: () => ({ name: 'مدير' }),
      getCompanyId: () => '', getRole: () => 'manager', getStoreName: () => 'المحل',
      isManager: () => true, canEdit: () => true, canView: () => true,
      currentUserId: () => 'u1', buyPriceVisible: () => true,
    },
    t: (k) => k,
    escHtml: (s) => String(s == null ? '' : s),
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    debounce: (fn) => fn,
    getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
    getPharmacyMode: () => false,
    navigateTo: () => {}, renderInventory: () => {},
    BRANDS: { global: [], chinese: [] },
    ExtraPrices: { fields: () => [], readInputs: () => ({}), inputsHTML: () => '', COLORS: ['#111'], MAX: 5, saveFields: () => {} },
    trackPageListener: () => {}, _currentPageId: 'quick-entry',
  };
  qeBox.window = qeBox; qeBox.self = qeBox; qeBox.globalThis = qeBox;
  vm.createContext(qeBox);
  ['normBarcode', 'canonBarcode', 'normalizeSearchText', 'searchTokens', 'productSearchScore',
    'cleanScannedCode', 'normSearch'].forEach((n) => {
    vm.runInContext(grabAppFn(appSrc, n), qeBox, { filename: 'app.js#' + n });
  });
  vm.runInContext(grabAppRange(appSrc, 'function _mapChars(', 'barcodeVariants'), qeBox, { filename: 'app.js#barcode helpers' });
  vm.runInContext(read('renderer/js/lib/units.js'), qeBox, { filename: 'units.js' });
  vm.runInContext(read('renderer/js/purchase-core.js'), qeBox, { filename: 'purchase-core.js' });
  vm.runInContext(saleCoreJs, qeBox, { filename: 'sale-core.js' });
  vm.runInContext(read('renderer/js/db.js'), qeBox, { filename: 'db.js' });
  vm.runInContext(qeJs, qeBox, { filename: 'quick-entry.js' });

  const QDB = vm.runInContext('DB', qeBox);
  const QE = qeBox.QE;
  check(!!QE && typeof QE.selectProduct === 'function', 'نافذة F1 الحقيقية محمّلة');

  const target = QDB.addProduct({
    name: 'منتج بحدّ', barcode: '9200001', buyPrice: 100, sellPrice: 200,
    wholesalePrice: 190, quantity: 25, unit: 'piece', minPrice: 160,
  });

  QE.open();
  const firstRow = qeDoc.querySelector('.qe-row');
  check(!!firstRow, 'F1 يرسم سطراً عند الفتح');
  const uid = Number(firstRow.dataset.uid);

  QE.selectProduct(uid, target.id);
  const minInput = qeDoc.getElementById('qeMinPrice_' + uid);
  check(!!minInput, 'سطر F1 يعرض حقل السعر الأدنى');
  eq(String(minInput.value), '160', 'اختيار منتج يعبّئ الحدّ المحفوظ في الحقل');

  minInput.value = '175';
  QE.setField(uid, 'minPrice', minInput.value);
  QE.setNewMode(uid);
  eq(String(minInput.value), '0', 'فكّ الربط بمنتج جديد يصفّر الحدّ (لا يورّثه)');

  // The save payload the operator's typed value travels through.
  check(/minPrice: Math\.max\(0, parseFloat\(row\.minPrice\) \|\| 0\),/.test(qeJs),
    'حمولة إنشاء منتج جديد تحمل السعر الأدنى');
  check(/row\.minPrice = Math\.max\(0, parseFloat\(p\.minPrice\) \|\| 0\)/.test(qeJs),
    'اختيار منتج موجود ينسخ حدّه إلى السطر');
  check(/setVal\('minPrice', row\.minPrice \|\| 0\)/.test(qeJs),
    'تحديث حقول السطر يشمل السعر الأدنى');
  check(/var QE_COLS = \[[^\]]*'minPrice'/.test(qeJs), 'مسار أسهم F1 يعبر عمود السعر الأدنى');
}());

// ============================================================ 5. smart ======
section('5) الإضافة الذكية: عمود حقيقي يُحفظ');
(function () {
  // 3.1.6: the grid emits one column model (track + label + visibility key per
  // column) instead of a literal track string and a literal header array, so
  // that a column hidden by the field-visibility settings leaves no header or
  // track behind. These checks read that model; the rendered result — every
  // cell under its own header — is proven behaviourally by
  // smart-grid-field-visibility-verify.js.
  // The column model is now generated from the shared FormLayout order; the
  // defaults below still live in smartColumns() and are overridable by the
  // layout panel without changing this contract.
  check(/whole: \{ label: 'جملة'[^}]*\},\s*minPrice: \{ label: 'السعر الأدنى'/.test(smartJs),
    'ترتيب أعمدة الشبكة الذكية يتضمن السعر الأدنى بعد الجملة');
  check(/name: \{ label: 'المنتج', track: 'minmax\(260px,2fr\)'/.test(smartJs) && /minPrice: \{ label: 'السعر الأدنى', track: '90px'/.test(smartJs),
    'مسار ثابت للسعر الأدنى في الشبكة الذكية (والاسم يبقى minmax 260px)');
  check(/minPrice:\s*\{\s*label: 'السعر الأدنى'/.test(smartJs), 'رأس الشبكة الذكية يعنون العمود الجديد');
  check(/data-col="minPrice" data-row=/.test(smartJs), 'كل صف ذكي يرسم حقل السعر الأدنى');
  check(/\['qty', 'price', 'sell', 'whole', 'minPrice'\]/.test(smartJs), 'تحديث الصف يعامل الحدّ كرقم');
  check(/minPrice: \(parseFloat\(r\.minPrice\) \|\| parseFloat\(p\.minPrice\) \|\| 0\)/.test(smartJs),
    'المنتج الموجود يأخذ القيمة المكتوبة أو المخزونة');
  check(/minPrice: Math\.max\(0, parseFloat\(r\.minPrice\) \|\| 0\)/.test(smartJs),
    'المنتج الجديد يأخذ القيمة المكتوبة بدل صفر ثابت');
  check(/qty: 1, price: 0, sell: '', whole: '', minPrice: 0/.test(smartJs), 'الصف الذكي الجديد يبدأ بلا حدّ');
  ['fv-plu', 'fv-reference', 'fv-country', 'fv-mark', 'fv-minPrice'].forEach((cls) => {
    check(smartJs.indexOf(cls) !== -1, 'أزرار إظهار/إخفاء الحقول تعمل في الشبكة الذكية (' + cls + ')');
  });
}());

// ============================================================ 6. sales ======
section('6) صفحة البيع: الحدّ مرئي ومفروض');
(function () {
  check(/const floor = salesLineMinPrice\(line\)/.test(salesJs), 'بطاقة السطر تحسب الحدّ الفعلي');
  check(/sc-minprice-note/.test(salesJs), 'بطاقة السطر تعرض تلميح السعر الأدنى');
  check(/function salesFlashFloor\(idx\)/.test(salesJs), 'محاولة النزول تحت الحدّ تُظهر تنبيهاً بصرياً');
  check(/Math\.max\(minPrice, v\)/.test(salesJs), 'سعر السطر يُثبَّت على الحدّ ولا ينزل تحته');
  check(/Math\.max\(salesLineMinPrice\(line\), salesPriceForRecord\(r, line\.mode\)\)/.test(salesJs),
    'توزيع الدفعات يفرض الحدّ على كل دفعة');
  check(/\.sc-minprice-note\s*\{/.test(css), 'main.css ينسّق تلميح الحدّ');
  check(/const floorOf = \(entry\) =>/.test(saleCoreJs), 'محرك البيع المركزي يطبّق الحدّ بنفسه');
  check(/floor > num\(e\.price\) \? Object\.assign\(\{\}, e, \{ price: floor \}\) : e/.test(saleCoreJs),
    'المحرك يرفع سعر الوحدة إلى الحدّ قبل الخصومات');
}());

// ============================================================ summary ======
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
