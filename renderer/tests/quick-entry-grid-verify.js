// ============================================================================
// ZMT PIECE — الإدخال السريع (F1): ترقيم الأسطر، ألوان الصفوف، عمود مبلغ
// المشتريات، وفتح بطاقة المنتج من رقم السطر.
// Run: node renderer/tests/quick-entry-grid-verify.js
//
// يشغّل quick-entry.js الحقيقية فوق quick-entry.html المشحونة نفسها (DOM مصغّر
// من dom-lite)، فما يُقرأ من معرّفات هو ما يراه الصندوق فعلاً. القواعد المثبَّتة:
//   • كل سطر مرقَّم 1,2,3… قبل اسم المنتج، والترقيم يُعاد بعد الحذف.
//   • برتقالي = منتج غير موجود (سيُنشأ)، أخضر = موجود، أحمر = كميته صفر/تحت
//     حدّ التنبيه، والسطر الفارغ بلا لون.
//   • عمود «مبلغ المشتريات» = الكمية × سعر الشراء، مخفي افتراضياً، ويُظهره زر
//     واحد في الشريط، ويُحفظ الاختيار في هذا الجهاز.
//   • الضغط على رقم سطر منتج موجود يفتح بطاقة المنتج للجميع (بلا صلاحية).
//   • حقل مخفي في الإدخال السريع (مثل PLU) يحمل صنف CSS نفسه الذي تُخفيه
//     قاعدة fv-hide-*، فتتبع الإضافة الذكية نفس الإخفاء.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createDoc, parseInto } = require('./dom-lite');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (c, m) => c ? ok(m) : bad(m);
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

console.log('============================================================');
console.log('الإدخال السريع (F1): ترقيم + ألوان + مبلغ المشتريات + بطاقة المنتج');
console.log('============================================================');

const qeHtmlSrc = read('renderer/pages/quick-entry.html');
const qeJsSrc = read('renderer/js/pages/quick-entry.js');
const cssSrc = read('renderer/css/main.css');
const appSrc = read('renderer/js/app.js');

// ---------------------------------------------------------- 0. الواجهة مشحونة --
console.log('\n--- 0. ما في الصفحة المشحونة فعلاً ---');
const has = (needle, m) => check(qeHtmlSrc.indexOf(needle) !== -1, m);
has('class="qe-col qe-col-idx"', 'خلية رقم السطر تتصدّر رأس الجدول');
check(/class="qe-col qe-col-amount"(?:\s+data-col="amount")?\s+data-i18n="quickEntry\.purchaseAmount"/.test(qeHtmlSrc), 'عمود «مبلغ المشتريات» في الرأس');
has('id="qeAmountBtn"', 'زر «إظهار مبلغ المشتريات» في الشريط');
has('onclick="QE.toggleAmount()"', 'الزر يستدعي الدالة المصدَّرة نفسها');
// العمود يقف مباشرة بعد «سعر الشراء».
const buyAt = qeHtmlSrc.indexOf('data-i18n="quickEntry.buyPrice"');
const amountAt = qeHtmlSrc.indexOf('data-i18n="quickEntry.purchaseAmount"');
check(buyAt !== -1 && amountAt !== -1 && amountAt > buyAt, 'العمود يأتي بعد «سعر الشراء» مباشرة');
check(qeJsSrc.indexOf('qe-col-amount') !== -1, 'الصف يرسم خلية المبلغ');
check(/\.qe-col-amount\s*\{/.test(cssSrc), 'تنسيق .qe-col-amount معرَّف');
check(/body\.fv-hide-plu\s+\.qe-col-plu/.test(cssSrc), 'قاعدة إخفاء PLU تستهدف خلية رأس الإدخال السريع');

// الترجمة في اللغات الأربع داخل قاموس app.js المشحون
const dictLines = appSrc.split(/\r?\n/).filter((l) => l.indexOf("'quickEntry.") !== -1).join('\n');
for (const k of ['purchaseAmount', 'purchaseAmountBtn', 'hidePurchaseAmount', 'productInfo']) {
  const hits = (dictLines.match(new RegExp("'quickEntry\\." + k + "'", 'g')) || []).length;
  eq(hits, 4, 'المفتاح quickEntry.' + k + ' موجود في اللغات الأربع');
}

// ------------------------------------------------------------------ the DOM ---
function freshDoc() {
  const d = createDoc();
  parseInto(qeHtmlSrc, d.body);
  return d;
}

// ------------------------------------------------------------------ the DB ----
function makeHarness(opts) {
  const o = opts || {};
  const doc = o.doc || freshDoc();
  const alerts = [];
  const detailsCalls = [];
  const products = o.products || [];
  const byId = {};
  products.forEach((p) => { byId[p.id] = p; });
  const store = {};
  const DB = {
    getSuppliers: () => [],
    getProducts: () => products,
    getProduct: (id) => byId[id] || null,
    getProductByBarcode: (b) => products.find((p) => p.barcode === b) || null,
    generateBarcode: () => 'GEN1',
    findProductsByPlu: () => [],
    logAudit: () => {},
    getMeta: () => null,
    // حدّ التنبيه الافتراضي في التطبيق = 5.
    getLowStockThreshold: () => (o.threshold == null ? 5 : o.threshold),
  };
  const sandbox = {
    console, document: doc, DB,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    alert: (m) => alerts.push(String(m)),
    // Item 5: بطاقة المنتج تُفتح للجميع بلا صلاحية.
    showProductDetails: (id) => { detailsCalls.push(id); },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
    RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map,
    normSearch: (s) => String(s == null ? '' : s).toLowerCase(),
    productSearchScore: () => 0,
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
    getPharmacyMode: () => false,
    buildBrandSelectOptions: () => '<option value="">—</option>',
    BRANDS: { global: [], chinese: [] },
    navigateTo: () => {},
    trackPageListener: () => {},
    _currentPageId: 'quick-entry',
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  vm.createContext(sandbox);
  vm.runInContext(read('renderer/js/lib/units.js'), sandbox, { filename: 'units.js' });
  vm.runInContext(read('renderer/js/purchase-core.js'), sandbox, { filename: 'purchase-core.js' });
  // The real per-device field-visibility module (owns body.fv-hide-* classes).
  vm.runInContext(read('renderer/js/field-visibility.js'), sandbox, { filename: 'field-visibility.js' });
  vm.runInContext(qeJsSrc, sandbox, { filename: 'quick-entry.js' });
  return { doc, sandbox, DB, alerts, detailsCalls, products, store, QE: sandbox.QE };
}

const idxText = (H, uid) => {
  const el = H.doc.querySelector('#qeRow_' + uid + ' .qe-idx');
  return el ? String(el.textContent).trim() : null;
};
const rowClasses = (H, uid) => {
  const el = H.doc.getElementById('qeRow_' + uid);
  return el ? String(el.className) : '';
};
const hasState = (H, uid, state) => rowClasses(H, uid).split(/\s+/).indexOf('qe-row-' + state) !== -1;

console.log('\n--- 1. ترقيم الأسطر: 1,2,3… ثم إعادة الترقيم بعد الحذف ---');
{
  const H = makeHarness({ products: [] });
  H.QE.open();
  eq(idxText(H, 1), '1', 'الفتح يعطي سطراً واحداً مرقَّماً 1');
  H.QE.addRow();
  eq(idxText(H, 2), '2', 'السطر الثاني مرقَّم 2');
  H.QE.addRow();
  eq(idxText(H, 3), '3', 'السطر الثالث مرقَّم 3');
  H.QE.deleteRow(2);
  eq(idxText(H, 1), '1', 'بعد حذف الوسط يبقى الأول 1');
  eq(idxText(H, 3), '2', 'والسطر الذي بعده يعاد ترقيمه 2');
}

console.log('\n--- 2. ألوان الصفوف: برتقالي/أخضر/أحمر، والفارغ بلا لون ---');
{
  const H = makeHarness({
    products: [
      { id: 'pOk', name: 'منتج متوفر', quantity: 40, buyPrice: 100, unit: 'piece' },
      { id: 'pLow', name: 'منتج منخفض', quantity: 2, buyPrice: 100, unit: 'piece' },
      { id: 'pZero', name: 'منتج نافد', quantity: 0, buyPrice: 100, unit: 'piece' },
    ],
  });
  H.QE.open();
  check(!hasState(H, 1, 'new') && !hasState(H, 1, 'ok') && !hasState(H, 1, 'low'),
    'السطر الفارغ بلا لون');
  H.QE.selectProduct(1, 'pOk');
  check(hasState(H, 1, 'ok'), 'منتج موجود بكمية صحية → أخضر');
  H.QE.selectProduct(1, 'pLow');
  check(hasState(H, 1, 'low'), 'منتج موجود تحت حدّ التنبيه → أحمر');
  H.QE.selectProduct(1, 'pZero');
  check(hasState(H, 1, 'low'), 'منتج موجود بكمية صفر → أحمر');
  H.QE.addRow();
  H.QE.onProductInput(2, 'اسم لا يطابق أي منتج');
  check(hasState(H, 2, 'new'), 'اسم غير مطابق → برتقالي');
  // كتابة اسم يطابق منتجاً موجوداً بالحرف تعيد الأخضر.
  H.QE.onProductInput(2, 'منتج متوفر');
  check(hasState(H, 2, 'ok'), 'اسم مطابق لمنتج موجود → أخضر');
}

console.log('\n--- 3. عمود مبلغ المشتريات (الكمية × سعر الشراء) ---');
{
  const H = makeHarness({ products: [] });
  H.QE.open();
  check(!H.doc.body.classList.contains('qe-show-amount'), 'العمود مخفي افتراضياً');
  H.QE.setField(1, 'qty', '12');
  H.QE.setField(1, 'buy', '285');
  H.QE.updateTotal();
  const amt = H.doc.getElementById('qeAmount_1');
  eq(amt && String(amt.textContent), 'DA3420.00', 'الخلية = الكمية × سعر الشراء');
  H.QE.toggleAmount();
  check(H.doc.body.classList.contains('qe-show-amount'), 'الزر يُظهر العمود');
  eq(H.store['zmt_show_purchase_amount'], '1', 'الاختيار محفوظ في هذا الجهاز');
  const btn = H.doc.getElementById('qeAmountBtn');
  eq(btn.getAttribute('aria-pressed'), 'true', 'الزر يعلن حالته المضغوطة');
  H.QE.toggleAmount();
  check(!H.doc.body.classList.contains('qe-show-amount'), 'الضغط مرة أخرى يخفي العمود');
  eq(H.store['zmt_show_purchase_amount'], '0', 'الاختيار المخفي محفوظ أيضاً');
}

console.log('\n--- 4. رقم السطر يفتح بطاقة المنتج (للجميع) ---');
{
  const H = makeHarness({ products: [{ id: 'p1', name: 'زيت', quantity: 30, unit: 'piece' }] });
  H.QE.open();
  H.QE.selectProduct(1, 'p1');
  H.detailsCalls.length = 0;
  H.QE.showRowProduct(1);
  eq(H.detailsCalls.join(','), 'p1', 'الضغط على رقم سطر منتج موجود يفتح بطاقته');
  H.QE.addRow();
  H.detailsCalls.length = 0;
  H.QE.showRowProduct(2);
  eq(H.detailsCalls.length, 0, 'سطر جديد بلا منتج لا يفتح بطاقة');
}

console.log('\n--- 5. حقل مخفي في الإدخال السريع يتبع نفس قاعدة الإخفاء ---');
{
  const H = makeHarness({ products: [] });
  H.QE.open();
  // نفس ما يفعله زر FV: إخفاء PLU. الخلية تحمل qe-col-plu وقاعدة CSS تُخفيها،
  // والإضافة الذكية تقرأ نفس الحالة من field-visibility المشترك.
  H.sandbox.FV.set('plu', false);
  check(H.doc.body.classList.contains('fv-hide-plu'), 'إخفاء PLU يضيف الصنف على body');
  const pluHead = H.doc.querySelector('.qe-col-plu');
  check(!!pluHead, 'خلية رأس PLU تحمل الصنف الذي تستهدفه قاعدة الإخفاء');
  H.sandbox.FV.set('plu', true);
  check(!H.doc.body.classList.contains('fv-hide-plu'), 'إظهار PLU يزيل الصنف');
}

console.log('\n============================================================');
console.log((fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
console.log('============================================================');
process.exit(fail === 0 ? 0 : 1);
