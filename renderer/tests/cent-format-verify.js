// ============================================================
// ZMT PIECE — shared ".00" cent-format toggle verifier
// Run: node renderer/tests/cent-format-verify.js
//
// Guards:
//   1. fresh install = OFF; every click is persisted in zmt_cent_format_on;
//   2. Quick Entry and Smart Add share the ONE CentFormat instance;
//   3. only money inputs are rewritten, and only on commit (blur / arrows),
//      never while the cashier is typing;
//   4. row values, totals, DB records and fmtMoney stay plain numbers;
//   5. the button turns blue while active.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createDoc, parseInto } = require('./dom-lite');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const section = (t) => console.log('\n--- ' + t + ' ---');

console.log('============================================');
console.log('اختبار زر السنتيم (.00) المشترك');
console.log('============================================');

const qeHtml = read('renderer/pages/quick-entry.html');
const qeSrc = read('renderer/js/pages/quick-entry.js');
const smartSrc = read('renderer/js/pages/invoices-smart.js');
const css = read('renderer/css/main.css');
const KEY = 'zmt_cent_format_on';

/* --------------------------------------------- 1) static wiring -------- */
section('1) الربط في الملفات المشحونة');
check(qeSrc.includes('window.CentFormat = window.CentFormat || (function () {'), ' quick-entry.js يعرّف المساعد المشترك');
check(smartSrc.includes('window.CentFormat = window.CentFormat || (function () {'), ' invoices-smart.js يستخدم نفس المساعد إن وُجد');
eq((qeSrc.match(/zmt_cent_format_on/g) || []).length, 1, 'مفتاح واحد في الإدخال السريع');
eq((smartSrc.match(/zmt_cent_format_on/g) || []).length, 1, 'نفس المفتاح في الإضافة الذكية');
check(qeHtml.includes('id="qeCentBtn"') && /qeCentBtn[\s\S]{0,200}>\.00<\/button>/.test(qeHtml), 'زر .00 موجود في شريط الإدخال السريع');
check(smartSrc.includes('id="smartCentBtn"') && /\>\.00<\/button>/.test(smartSrc), 'زر .00 موجود في شريط الإضافة الذكية');
check(css.includes('.qe-cent-btn.is-on, .smart-cent-btn.is-on') && css.includes('var(--bmw-blue-1)'),
  'الزر النشط أزرق في الوضعين');
check(qeSrc.includes("grid.addEventListener('focusout'"), 'الإدخال السريع يضبط عند فقدان التركيز');
check(smartSrc.includes("cont.addEventListener('focusout'"), 'الإضافة الذكية تضبط عند فقدان التركيز');
check(!/addEventListener\('input'[\s\S]{0,300}CentFormat\.format/.test(qeSrc), 'لا تنسيق أثناء كل ضغطة مفتاح');
check(!/addEventListener\('input'[\s\S]{0,300}CentFormat\.format/.test(smartSrc), 'ولا تنسيق أثناء الكتابة في الشبكة الذكية');
check(qeSrc.includes('stripCentFormatting()') && smartSrc.includes('stripSmartCent()'), 'إيقاف الزر يُعيد العرض العادي');

/* --------------------------------------------- 2) harness -------------- */
function makeHarness(seed) {
  const doc = createDoc();
  parseInto(qeHtml, doc.body);
  const store = Object.assign({}, seed || {});
  const writes = { invoices: 0, payments: 0, suppliers: 0, products: 0 };
  const suppliers = [];
  const DB = {
    getSuppliers: () => suppliers,
    saveSuppliers: () => { writes.suppliers++; },
    getProducts: () => [],
    getProduct: () => null,
    getProductByBarcode: () => null,
    addOrMergeProduct: () => { writes.products++; return { ok: true, product: {} }; },
    updateProduct: () => ({ ok: true }),
    addInvoice: () => { writes.invoices++; return {}; },
    addPayment: () => { writes.payments++; return {}; },
    generateBarcode: () => 'GEN1',
    findProductsByPlu: () => [],
    logAudit: () => {},
    getMeta: () => null,
    getLowStockThreshold: () => 5,
  };
  const sandbox = {
    console, document: doc, DB,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    t: (k) => String(k), alert: () => {}, confirm: () => true, prompt: () => null,
    escHtml: (s) => String(s == null ? '' : s),
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
    navigateTo: () => {}, trackPageListener: () => {}, _currentPageId: 'quick-entry',
    FV: { apply: () => {}, isVisible: () => true, toggle: () => {} },
    AbortController: class {}, FileReader: class {},
    ExtraPrices: { fields: () => [], readInputs: () => ({}), inputsHTML: () => '' },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(read('renderer/js/lib/units.js'), sandbox, { filename: 'units.js' });
  vm.runInContext(read('renderer/js/purchase-core.js'), sandbox, { filename: 'purchase-core.js' });
  vm.runInContext(qeSrc, sandbox, { filename: 'quick-entry.js' });
  const cfBeforeSmart = sandbox.CentFormat;
  vm.runInContext(smartSrc, sandbox, { filename: 'invoices-smart.js' });
  return { doc, sandbox, store, writes, QE: sandbox.QE, CF: sandbox.CentFormat, cfBeforeSmart };
}

/* --------------------------------------------- 3) preference ----------- */
section('2) الإعداد الافتراضي والحفظ');
{
  const H = makeHarness();
  const CF = H.CF;
  eq(CF.key, KEY, 'المفتاح المشترك');
  eq(CF.enabled(), false, 'تثبيت جديد ⇒ الزر مطفأ');
  eq(CF.display('3'), '3', 'والمبالغ تظهر كما كُتبت');
  eq(CF.format('3'), '3.00', 'تنسيق عدد صحيح');
  eq(CF.format('3.5'), '3.50', 'تنسيق كسر');
  eq(CF.format('٣'), '3.00', 'أرقام عربية هندية');
  eq(CF.format('1,5'), '1.50', 'فاصلة عشرية');
  eq(CF.format(''), '', 'الفراغ يبقى فراغاً');
  eq(CF.format('abc'), '', 'نص غير رقمي لا يُنسّق');
  eq(CF.format(0), '0.00', 'الصفر يظهر 0.00 عند التفعيل');

  CF.set(true);
  eq(H.store[KEY], '1', 'التفعيل يُحفظ في localStorage');
  eq(CF.enabled(), true, 'الزر مفعّل بعد الحفظ');
  eq(CF.display('3'), '3.00', 'العرض يضيف .00');
  eq(CF.display(''), '', 'والفراغ لا يصبح 0.00');

  const reloaded = makeHarness(H.store);
  eq(reloaded.CF.enabled(), true, 'إعادة فتح البرنامج تحفظ الاختيار');
  check(reloaded.cfBeforeSmart === reloaded.CF, 'المساعد واحد بين الصفحتين (الأول هو الذي يفوز)');
  reloaded.sandbox.smartToggleCent();
  eq(reloaded.store[KEY], '0', 'زر الإضافة الذكية يكتب على نفس المفتاح');
  eq(reloaded.CF.enabled(), false, 'ويُطفئ الزر في الإدخال السريع أيضاً');

  CF.set(false);
  eq(H.store[KEY], '0', 'الإيقاف يُحفظ بدوره');
  eq(CF.display('3'), '3', 'والعرض يعود عادياً');
  const odd = makeHarness({ [KEY]: 'true' });
  eq(odd.CF.enabled(), false, 'قيمة غير "1" لا تُفعّل الزر');
}

/* --------------------------------------------- 4) quick entry ---------- */
section('3) الإدخال السريع: حقول الأموال فقط بلا تعديل القيم');
{
  const H = makeHarness();
  H.sandbox.init_quick_entry();
  H.QE.addRow();
  const uid = H.QE._rows()[0].uid;
  H.QE.setField(uid, 'qty', '2');
  H.QE.setField(uid, 'buy', '3');
  H.QE.setField(uid, 'sell', '4.5');

  const input = (col) => H.doc.querySelector('#qeRows input[data-col="' + col + '"]');
  const qty = input('qty'), buy = input('buy'), sell = input('sell');
  check(!!buy && !!sell && !!qty, 'حقول الكمية والشراء والبيع موجودة فعلاً');
  qty.value = '2'; buy.value = '3'; sell.value = '4.5';
  const extra = H.doc.createElement('input');
  extra.setAttribute('data-extra-price-id', 'extra1'); extra.value = '7';
  H.doc.querySelector('.qe-col-extras').appendChild(extra);
  const paid = H.doc.getElementById('qePaidAmount');

  const rowsBefore = JSON.stringify(H.QE._rows());
  const totalsBefore = JSON.stringify(H.QE.computeTotals());
  H.QE.toggleCent();

  eq(buy.value, '3.00', 'سعر الشراء يُعرض 3.00');
  eq(sell.value, '4.50', 'سعر البيع يُعرض 4.50');
  eq(extra.value, '7.00', 'سعر إضافي يُعرض 7.00');
  eq(paid.value, '0.00', 'حقل المدفوع يُعرض 0.00');
  eq(qty.value, '2', 'الكمية لا تلمسها التنسيق');
  eq(JSON.stringify(H.QE._rows()), rowsBefore, 'قيم الصفوف الداخلية لم تتغير');
  eq(JSON.stringify(H.QE.computeTotals()), totalsBefore, 'الحسابات لم تتغير');
  eq(H.writes.invoices + H.writes.payments + H.writes.suppliers + H.writes.products, 0, 'لا كتابة في القاعدة عند التبديل');

  const btn = H.doc.getElementById('qeCentBtn');
  check(btn.classList.contains('is-on'), 'الزر يأخذ الصنف الأزرق عند التفعيل');
  eq(btn.getAttribute('aria-pressed'), 'true', 'حالة الوصول aria-pressed=true');

  // Typing never reformats; committing with blur does.
  sell.value = '6'; sell.fire('input');
  eq(sell.value, '6', 'أثناء الكتابة يبقى الرقم كما كُتب');
  sell.fire('focusout');
  eq(sell.value, '6.00', 'عند مغادرة الحقل يضبط فوراً');
  buy.value = '9'; buy.fire('focusout');
  eq(buy.value, '9.00', 'حقل آخر يُضبط عند الالتزام');

  H.QE.toggleCent();
  eq(buy.value, '9', 'إيقاف الزر يُعيد العرض العادي');
  eq(paid.value, '0', 'والمبلغ المدفوع يعود 0');
  eq(btn.getAttribute('aria-pressed'), 'false', 'حالة الزر بعد الإيقاف');
  check(!btn.classList.contains('is-on'), 'الصنف الأزرق يُزال عند الإيقاف');
}

/* --------------------------------------------- 5) smart add ----------- */
section('4) الإضافة الذكية: نفس السلوك');
{
  const H = makeHarness();
  // Open the real modal so its grid listener (bindSmartGridDrag) is attached.
  H.sandbox.openSmartEdit();
  const grid = H.doc.getElementById('smartGrid');
  function addInput(col, value) {
    const i = H.doc.createElement('input');
    i.setAttribute('data-col', col); i.setAttribute('data-row', '0'); i.value = value;
    grid.appendChild(i); return i;
  }
  const price = addInput('price', '12'), qty = addInput('qty', '2');
  const sell = addInput('sell', '13.5'), name = addInput('name', 'منتج');
  const paid = H.doc.getElementById('smartPaid');

  H.sandbox.smartToggleCent();
  eq(H.store[KEY], '1', 'تفعيل الإضافة الذكية يحفظ الإعداد');
  eq(price.value, '12.00', 'سعر الشراء في الشبكة الذكية');
  eq(sell.value, '13.50', 'سعر البيع في الشبكة الذكية');
  eq(qty.value, '2', 'الكمية لم تُلمس');
  eq(name.value, 'منتج', 'اسم المنتج لم يُلمس');
  eq(paid.value, '0.00', 'المدفوع في الشبكة الذكية');

  price.value = '15'; price.fire('focusout');
  eq(price.value, '15.00', 'الضبط عند مغادرة حقل الشبكة الذكية');

  H.sandbox.smartToggleCent();
  eq(price.value, '15', 'إيقاف الزر في الشبكة الذكية يُعيد العرض');
  eq(paid.value, '0', 'والمبلغ المدفوع يعود عادياً');
}

console.log('\n============================================');
console.log('PASS=' + pass + '  FAIL=' + fail);
console.log('============================================');
process.exit(fail ? 1 : 0);
