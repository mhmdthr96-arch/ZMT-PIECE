// ============================================================================
// ZMT PIECE — شريط الأوامر في صفحة البيع: الماسح + البحث الذكي + الدفع
// Run: node renderer/tests/sales-command-bar-verify.js
//
// يشغّل sales.html المشحونة وpages/sales.js الحقيقية فوق DOM مصغّر، ويثبت:
//   • الحقل salesBarcodeScan هو الماسح والبحث معاً (لا يوجد salesSearch منفصل).
//   • الكتابة تُرشّح الشبكة، وEnter يضيف الباركود أو الاسم الفريد.
//   • الاسم الملتبس لا يضيف شيئاً، ويُبقي النص ويعرض «عدة نتائج».
//   • F داخل الحقل لا يفرّغ السلة، وخارجه يفرّغها.
//   • كتلة الدفع داخل شريط الأوامر أعلى الصفحة، والمجاميع تبقى أسفل السلة.
//   • الدفع مخفي والسلة فارغة، ويظهر بعد إضافة أول سطر.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { doc, parseInto } = require('./dom-lite.js');

const base = path.join(__dirname, '..', '..') + path.sep;
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (c, m) => c ? ok(m) : bad(m);
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

// ------------------------------------------------------------- shipped page --
const salesHtml = read('renderer/pages/sales.html');
(function () {
  const body = /<body[^>]*>([\s\S]*)$/i.exec(salesHtml);
  parseInto(body ? body[1] : salesHtml, doc.body);
}());

// ------------------------------------------------------------- dictionary ----
const appSrc = read('renderer/js/app.js');
const msg = (key) => {
  const m = new RegExp(key + ":\\s*'((?:[^'\\\\]|\\\\.)*)'").exec(appSrc);
  return m ? m[1].replace(/\\'/g, "'") : key;
};
const ar = {
  scannerReady: msg('scannerReady'),
  scannerDone: msg('scannerDone'),
  scannerNotFound: msg('scannerNotFound'),
  scannerMultiple: msg('scannerMultiple'),
};
const t = (k) => {
  const key = String(k).split('.')[1];
  if (String(k).indexOf('sales.') === 0 && Object.prototype.hasOwnProperty.call(ar, key)) return ar[key];
  return String(k);
};

// ------------------------------------------------------------- app search ----
function grabAppFn(name) {
  const i = appSrc.indexOf('function ' + name + '(');
  if (i === -1) throw new Error(name + ' is not a global function in app.js');
  let depth = 0, started = false, end = i;
  for (let j = i; j < appSrc.length; j++) {
    const c = appSrc[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { end = j + 1; break; } }
  }
  return appSrc.slice(i, end);
}

// ------------------------------------------------------------- localStorage --
const store = {};
const localStorageStub = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

// ------------------------------------------------------------------ the DB ---
const products = [
  { id: 'p1', name: 'دولكس', barcode: '1111', buyPrice: 100, sellPrice: 250, quantity: 10, unit: 'piece', createdAt: 1 },
  { id: 'p2', name: 'صابون', barcode: '2222', buyPrice: 50, sellPrice: 80, quantity: 10, unit: 'piece', createdAt: 1 },
  { id: 'p3', name: 'صابون سائل', barcode: '3333', buyPrice: 80, sellPrice: 140, quantity: 10, unit: 'piece', createdAt: 1 },
  { id: 'p4', name: 'فلتر زيت', barcode: '4444', buyPrice: 200, sellPrice: 450, quantity: 10, unit: 'piece', createdAt: 1 },
];
const DB = {
  getProducts: () => products.slice(),
  getProduct: (id) => products.find((p) => p.id === id) || null,
  getProductByBarcode: (b) => products.find((p) => p.barcode === b) || null,
  getProductByPlu: () => null,
  getCustomers: () => [],
  getSuppliers: () => [],
  getMeta: () => null,
  getLowStockThreshold: () => 5,
  generateBarcode: () => 'GEN1',
};

const alerts = [];
const sandbox = {
  module: { exports: {} }, console, localStorage: localStorageStub, document: doc,
  Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
  RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map, WeakMap,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  indexedDB: null, navigator: { onLine: false },
  fetch: () => Promise.reject(new Error('no network in tests')),
  alert: (m) => alerts.push(String(m)),
  confirm: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  CustomEvent: function (name, opts) { this.type = name; this.detail = opts && opts.detail; },
  Auth: {
    isLoggedIn: () => true, getUserCode: () => 'T1', getCurrentUser: () => ({ name: 'مدير' }),
    getCompanyId: () => '', getRole: () => 'manager', getStoreName: () => 'المحل',
    isManager: () => true, canEdit: () => true, currentUserId: () => 'u1', buyPriceVisible: () => true,
  },
  t,
  DB,
  escHtml: (s) => String(s == null ? '' : s),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  debounce: (fn) => fn,
  cleanScannedCode: (v) => String(v || '').trim(),
  getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
  getPharmacyMode: () => false,
  trackPageListener: () => {},
  navigateTo: () => {},
  renderInventory: () => {},
  BRANDS: { global: [], chinese: [] },
  ExtraPrices: { fields: () => [], readInputs: () => ({}), inputsHTML: () => '', COLORS: ['#111'], MAX: 5, saveFields: () => {} },
  _currentPageId: 'sales',
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['normSearch', 'normalizeSearchText', 'searchTokens', 'productSearchScore']
  .forEach((n) => vm.runInContext(grabAppFn(n), sandbox, { filename: 'app.js#' + n }));
vm.runInContext(read('renderer/js/lib/units.js'), sandbox, { filename: 'units.js' });
vm.runInContext(read('renderer/js/purchase-core.js'), sandbox, { filename: 'purchase-core.js' });
vm.runInContext(read('renderer/js/sale-core.js'), sandbox, { filename: 'sale-core.js' });
vm.runInContext(read('renderer/js/scale-core.js'), sandbox, { filename: 'scale-core.js' });
vm.runInContext(read('renderer/js/pages/sales.js'), sandbox, { filename: 'sales.js' });

const S = sandbox;
let scan = doc.getElementById('salesBarcodeScan');
const status = doc.getElementById('salesBarcodeStatus');
const cartLen = () => S._salesCart.length;
const cartLine = (i) => S._salesCart[i];
const pay = doc.getElementById('salesPaySection');
const commandBar = doc.getElementById('salesCommandBar');

const keyEv = (key, target) => ({
  key, code: key, target, defaultPrevented: false, _stopped: false,
  preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this._stopped = true; },
});
const enter = () => S.handleSalesBarcodeScan({ key: 'Enter', preventDefault() {} });
const scanText = (text) => { scan.value = text; enter(); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
console.log('\n--- 0. الحقل الواحد وشريط الأوامر في الصفحة المشحونة ---');
check(!!scan, 'salesBarcodeScan موجود');
check(salesHtml.indexOf('id="salesSearch"') === -1, 'لا يوجد حقل بحث منفصل salesSearch');
check(!!commandBar, 'salesCommandBar موجود');
check(!!scan.closest('#salesCommandBar'), 'حقل الماسح/البحث داخل شريط الأوامر');
check(!!pay && !!pay.closest('#salesCommandBar'), 'كتلة الدفع داخل شريط الأوامر');
check(!!doc.getElementById('salesCartTotal').closest('.sales-cart-footer'), 'المجاميع تبقى في أسفل السلة');
check(!pay.closest('.sales-cart-footer'), 'كتلة الدفع لم تعد داخل أسفل السلة');
check(salesHtml.indexOf('onkeydown="handleSalesBarcodeScan(event)"') === -1 && scan.getAttribute('dir') === 'auto',
  'الماسح يوجّه النص تلقائياً ولا يربط onkeydown مزدوجاً (الربط في setup)');
const css = read('renderer/css/main.css');
check(/\.sales-layout\s*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/.test(css),
  'شبكة الصفحة تحجز صفاً لشريط الأوامر وصفاً مرناً للسلة');

console.log('\n--- 1. السلة الفارغة: الدفع مخفي ---');
eq(pay.style.display, 'none', 'كتلة الدفع مخفية قبل أول سطر');

console.log('\n--- 2. الكتابة في الماسح تُرشّح الشبكة ---');
S.setupSalesBarcode();
scan = doc.getElementById('salesBarcodeScan');
scan.value = 'زيت';
scan.fire('input');
await wait(260);
eq(S._salesSearchQuery, 'زيت', 'نص الحقل صار استعلام البحث الحيّ');
eq(scan.value, 'زيت', 'الكتابة لا تُمسح ولا تُعالَج كباركود قبل Enter');

console.log('\n--- 3. Enter: باركود مطابق يضيف مباشرة ---');
scan.value = '';
S.filterSalesProducts('');
await wait(260);
scanText('1111');
eq(cartLen(), 1, 'الباركود الموجود أضاف سطراً واحداً');
eq(cartLine(0) && cartLine(0).name, 'دولكس', 'وهو المنتج الصحيح');
eq(status.textContent, ar.scannerDone, 'والحالة تقول تم');
eq(scan.value, '', 'الحقل يُفرَّغ بعد البيع');
eq(pay.style.display, '', 'كتلة الدفع تظهر مع أول سطر');

console.log('\n--- 4. Enter: اسم فريد يضيف مباشرة ---');
scanText('فلتر زيت');
eq(cartLen(), 2, 'اسم فريد (فلتر زيت) أضاف سطراً');
eq(cartLine(1) && cartLine(1).name, 'فلتر زيت', 'وهو المنتج الصحيح');
eq(status.textContent, ar.scannerDone, 'والحالة تقول تم');

console.log('\n--- 5. Enter: اسم ملتبس لا يضيف ويطلب الاختيار ---');
const beforeAmbiguous = cartLen();
scanText('صابون');
eq(cartLen(), beforeAmbiguous, 'اسمان يطابقان «صابون»: لم يُضف أي شيء');
eq(status.textContent, ar.scannerMultiple, 'والحالة تعرض «عدة نتائج»');
eq(scan.value, 'صابون', 'النص يبقى حتى يختار الكاشير من الشبكة');
eq(S._salesSearchQuery, 'صابون', 'والشبكة مرشّحة على المطابقات');

console.log('\n--- 6. F داخل الحقل لا يفرّغ، وخارجه يفرّغ ---');
scan.value = '';
const beforeF = cartLen();
const fInside = keyEv('F', scan);
S._salesPageKeyHandler(fInside);
eq(cartLen(), beforeF, 'F داخل حقل الماسح/البحث لا يفرّغ السلة');
eq(fInside.defaultPrevented, false, 'ولا يُبتلع الحرف: يُكتب في البحث');
const fOutside = keyEv('F', doc.getElementById('salesCartItems'));
S._salesPageKeyHandler(fOutside);
eq(cartLen(), 0, 'F خارج الحقول يفرّغ السلة (كما كان)');
eq(fOutside.defaultPrevented, true, 'ويمنع الحرف من الوصول لأي مكان آخر');
eq(pay.style.display, 'none', 'وعند فراغ السلة تختفي كتلة الدفع');

console.log('\n--- 7. باركود مجهول لا يرمي ولا يضيف ---');
const beforeUnknown = cartLen();
scanText('9999');
eq(cartLen(), beforeUnknown, 'الباركود المجهول لا يضيف شيئاً');
eq(status.textContent, ar.scannerNotFound, 'والحالة تقول غير موجود');

console.log('\n============================================');
console.log((fail ? 'فشل: ' : 'كل الفحوص نجحت — ') + 'pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
}());
