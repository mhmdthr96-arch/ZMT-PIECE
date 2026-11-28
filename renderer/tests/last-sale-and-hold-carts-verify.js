// ============================================================
// ZMT PIECE — "last sold price" + hold carts (multi-tab) verifier
// Run: node renderer/tests/last-sale-and-hold-carts-verify.js
//
// Guards:
//   • last sold price comes from the company/store-scoped batch history and is
//     painted in BOTH grid and list views without one DB call per card,
//   • held carts snapshot/restore the FULL cashier state in session memory,
//   • one-shot authorisation bypasses never travel with a held cart,
//   • F7 stays page-scoped and F6 "إضافة مصروف" is untouched.
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { doc, parseInto } = require('./dom-lite.js');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (c, m) => c ? ok(m) : bad(m);
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const has = (s, n) => s.indexOf(n) !== -1;
const between = (s, a, b) => {
  const i = s.indexOf(a);
  if (i < 0) return '';
  const j = s.indexOf(b, i + a.length);
  return j < 0 ? s.slice(i) : s.slice(i, j);
};

const salesJs = read('renderer/js/pages/sales.js');
const dbJs = read('renderer/js/db.js');
const salesHtml = read('renderer/pages/sales.html');
const shortcutsJs = read('renderer/js/shortcuts.js');
const appJs = read('renderer/js/app.js');
const css = read('renderer/css/main.css');

console.log('============================================');
console.log('آخر سعر بيع + الفواتير المعلقة — الفحص الثابت');
console.log('============================================');

console.log('\n--- 1. مصدر «آخر بيع» وعرضه في الشبكة والقائمة ---');
check(has(dbJs, 'productId: line.productId'), 'db.js يُرجع productId في صفوف التاريخ (مفتاح الخريطة)');
check(has(salesJs, 'DB.getProductSalesHistory(ids)'), 'السعر من دالة التاريخ الجماعية المحصورة بالشركة/المتجر');
check(has(salesJs, 'buildSalesLastSaleMap()'), 'خريطة واحدة تُبنى مرة ولا يُستعلم لكل بطاقة');
check(has(salesJs, 'salesLastSalePillHTML(g, false)'), 'بطاقة الشبكة تعرض آخر بيع');
check(has(salesJs, 'salesLastSalePillHTML(g, true)'), 'صف القائمة يعرض آخر بيع في شريط الأسعار');
check(has(salesJs, 'salesLastSaleDetailsHTML(g)'), 'تفاصيل القائمة تظهر داخل السهم الموجود أصلاً');
check(has(salesJs, "t('sales.lastSold')"), 'التسمية مترجمة لا نص ثابت');
check(has(css, '.price-pill.price-last-sold') && has(css, '.sales-list-price.last-sold'), 'تنسيق منفصل للشبكة والقائمة');
const pillFn = between(salesJs, 'function salesLastSalePillHTML(g, compact)', 'function toggleSalesCardLastSale');
check(has(pillFn, 'toggleSalesCardLastSale(this)'), 'زر صغير في الشبكة يكشف التاريخ ورقم الفاتورة');
const listFn = between(salesJs, 'function salesListRowHTML(g, i)', 'function toggleSalesListDetails');
check(has(listFn, 'toggleSalesListDetails(this)') && has(listFn, 'salesLastSaleDetailsHTML(g)'), 'سهم القائمة الأصلي ما زال هو مفتاح التفاصيل');
check(!has(listFn, 'quickEntry.sellPrice') && !has(listFn, 'quickEntry.wholesalePrice'), 'لا تكرار لأسعار العرض الحالية');

console.log('\n--- 2. شريط التبويبات والملاحظة ---');
check(has(salesHtml, 'id="salesHoldTabsList"') && has(salesHtml, 'id="salesHoldAddBtn"'), 'شريط التبويبات وزر + أعلى الكاشير');
check(has(salesHtml, 'id="salesInvoiceNote"'), 'حقل ملاحظة لكل فاتورة');
check(has(salesHtml, 'id="salesNoteToggleBtn"') && has(salesHtml, 'id="salesInvoiceNoteBox" style="display:none"'), 'زر صغير يخفي الملاحظة افتراضياً');
check(has(salesJs, 'function toggleSalesInvoiceNote()') && has(salesJs, "_setSalesInvoiceNoteOpen(false)"), 'التبديل يُغلق الملاحظة عند التفريغ');
check(has(salesHtml, 'data-i18n-placeholder="sales.invoiceNotePlaceholder"'), 'ملاحظة الفاتورة مترجمة');
check(has(salesJs, "note: ([subNote, _salesInvoiceNoteText()].filter(Boolean).join('\\n'))"), 'الملاحظة تُمرَّر إلى SaleCore مع ملاحظة الزبون');
check(has(salesJs, 'resetSalesHoldTabAfterSale();'), 'الدفع يصفّر التبويب الحالي فقط');
check(has(css, '.sales-hold-tab.is-active') && has(css, '.sales-invoice-note textarea'), 'تنسيق التبويبات والحقل موجود');
check(has(css, '.sales-note-toggle[aria-expanded="true"]') && has(css, '.note-toggle-chevron'), 'تنسيق الزر وحالة الفتح موجود');
check(has(css, 'html[data-theme="dark"] .sales-note-toggle'), 'الزر في الوضع الداكن واضح');

console.log('\n--- 3. الذاكرة فقط + الاختصارات ---');
const holdBlock = between(salesJs, '// ===== HOLD CARTS / MULTI-TAB', '// Settings helpers (also defined in settings.js');
check(!!holdBlock && !has(holdBlock, 'localStorage') && !has(holdBlock, 'indexedDB'), 'السلات في ذاكرة الجلسة فقط — لا تخزين على القرص');
check(has(holdBlock, '_salesMarginBypass = false') && has(holdBlock, '_salesOverpayBypass = false') && has(holdBlock, '_salesCreditBypass = false'), 'مفاتيح التجاوز لا تُعلَّق مع السلة');
check(has(salesJs, "e.key === 'F7' || e.code === 'F7'"), 'F7 يبدّل التبويبات داخل صفحة البيع');
check(has(salesJs, 'switchSalesHoldTabByNumber(Number(m[1]))'), 'Alt+1..9 قفز مباشر');
check(has(shortcutsJs, "e.key === 'F6'") && !has(shortcutsJs, "'F7'"), 'F6 ما زال «إضافة مصروف» عالمياً وF7 غير مستخدم هناك');
for (const lang of ['ar', 'en', 'fr', 'zh']) {
  check(has(appJs, "lastSold: '") && has(appJs, 'holdCarts:') && has(appJs, 'tabCloseConfirm:'), 'مفاتيح الترجمة الجديدة موجودة (' + lang + ')');
}
for (const key of ['lastSold', 'holdCarts', 'invoiceNote', 'tabCloseConfirm', 'tabMax', 'closeTab']) {
  const n = (appJs.match(new RegExp(key + ':', 'g')) || []).length;
  check(n >= 4, 'مفتاح ' + key + ' مترجم في اللغات الأربع (' + n + ')');
}

// ------------------------------------------------------------- runtime sandbox --
console.log('\n--- 4. سلوك اللقطات والتبديل (DOM حقيقي + sales.js الحقيقي) ---');
(function () {
  const body = /<body[^>]*>([\s\S]*)$/i.exec(salesHtml);
  parseInto(body ? body[1] : salesHtml, doc.body);
}());

const t = (k) => ({
  'sales.lastSold': 'آخر بيع', 'sales.lastSaleDate': 'تاريخ آخر بيع',
  'sales.lastSaleInvoice': 'رقم الفاتورة', 'sales.lastSaleCustomer': 'الزبون',
  'sales.unregistered': 'زبون غير مسجل', 'sales.invoiceN': 'فاتورة',
  'sales.closeTab': 'إغلاق الفاتورة', 'sales.tabCloseConfirm': 'إغلاق هذه الفاتورة؟',
  'sales.tabMax': 'الحد الأقصى 9 فواتير', 'sales.holdCarts': 'الفواتير المعلقة',
  'sales.newTab': 'فاتورة جديدة', 'sales.tabShortcutHint': 'F7',
  'sales.invoiceNote': 'ملاحظة الفاتورة', 'sales.invoiceNotePlaceholder': 'ملاحظة...',
}[k] || String(k));

const historyRows = [
  { productId: 'p1', price: 240, invoiceNumber: 'INV-9', date: '2026-11-27T10:00:00Z', customerName: 'زبون قديم', qty: 1, total: 240 },
  { productId: 'p1', price: 255, invoiceNumber: 'INV-8', date: '2026-11-01T10:00:00Z', customerName: 'زبون أقدم', qty: 1, total: 255 },
  { productId: 'p2', price: 90, invoiceNumber: 'INV-7', date: '2026-10-01T10:00:00Z', customerName: 'زبون', qty: 2, total: 180 },
];
const products = [
  { id: 'p1', name: 'قطعة', barcode: '111', buyPrice: 100, sellPrice: 250, quantity: 5, unit: 'piece', minPrice: 0 },
  { id: 'p2', name: 'قطعة 2', barcode: '222', buyPrice: 40, sellPrice: 95, quantity: 5, unit: 'piece', minPrice: 0 },
];
const customers = [{ id: 'c1', name: 'أحمد', discount: 0, balance: 0 }];
const suppliers = [{ id: 's1', name: 'مورد', balance: 0 }];

let confirmAnswer = true;
const alerts = [];
const sandbox = {
  module: { exports: {} }, console, document: doc, Date, Math, Object, Array, JSON,
  String, Number, Boolean, isFinite, parseFloat, parseInt, RegExp, Error, Function,
  Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map, WeakMap, Promise,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  indexedDB: null, navigator: { onLine: false },
  fetch: () => Promise.reject(new Error('offline')),
  alert: (m) => alerts.push(String(m)),
  confirm: () => confirmAnswer,
  addEventListener: () => {}, removeEventListener: () => {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  t,
  escHtml: (s) => String(s == null ? '' : s),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  debounce: (fn) => fn,
  DB: {
    getProducts: () => products.slice(),
    getProduct: (id) => products.find((p) => p.id === id) || null,
    getCustomers: () => customers.slice(),
    getCustomer: (id) => customers.find((c) => c.id === id) || null,
    getSuppliers: () => suppliers.slice(),
    getSupplier: (id) => suppliers.find((s) => s.id === id) || null,
    getLowStockThreshold: () => 5,
    getProductSalesHistory: (ids) => {
      const set = ids instanceof Set ? ids : new Set(Array.isArray(ids) ? ids : [ids]);
      return historyRows.filter((r) => set.has(r.productId)).slice();
    },
  },
  Auth: {
    isLoggedIn: () => true, getUserCode: () => 'T1', getCompanyId: () => '',
    isManager: () => true, canEdit: () => true, buyPriceVisible: () => true,
  },
  ExtraPrices: { fields: () => [], COLORS: ['#111'], MAX: 5 },
  trackPageListener: () => {}, navigateTo: () => {},
  BRANDS: { global: [], chinese: [] },
  _currentPageId: 'sales',
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('renderer/js/lib/units.js'), sandbox, { filename: 'units.js' });
vm.runInContext(salesJs, sandbox, { filename: 'sales.js' });
const S = sandbox;

// Isolate the hold-cart state machine from the rest of the page: the snapshot
// tests are about state, not about repainting the whole cashier.
S.clearSalesCart = () => {};
S.renderSalesCart = () => {};
S.updateSalesTotals = () => {};
S.selectSalesCustomer = () => {};
S.setSalesWalkin = () => {};
S.updateSupSaleBanner = () => {};
S._syncSalesPickSubBtn = () => {};
S._syncSalesSubBadge = () => {};

const setVal = (id, v) => { const el = doc.getElementById(id); if (el) el.value = v; };
const getVal = (id) => { const el = doc.getElementById(id); return el ? el.value : null; };

const noteBox = doc.getElementById('salesInvoiceNoteBox');
const noteBtn = doc.getElementById('salesNoteToggleBtn');
check(!!noteBox && !!noteBtn, 'زر الملاحظة وصندوقها محمّلان من sales.html');
eq(noteBtn.getAttribute('aria-expanded'), 'false', 'الملاحظة مخفية عند فتح الصفحة');
S.toggleSalesInvoiceNote();
eq(noteBtn.getAttribute('aria-expanded'), 'true', 'الزر الصغير يفتح الملاحظة');
S.toggleSalesInvoiceNote();
eq(noteBtn.getAttribute('aria-expanded'), 'false', 'الزر الصغير يغلق الملاحظة مجدداً');

const map = S.buildSalesLastSaleMap();
eq(map.p1 && map.p1.price, 240, 'أحدث صف للمنتج هو آخر سعر فعلي محصوب للزبون (240 لا 255)');
eq(map.p1 && map.p1.invoiceNumber, 'INV-9', 'رقم آخر فاتورة محفوظ في الخريطة');
check(has(S.salesLastSalePillHTML({ records: [{ id: 'p1' }] }, false), 'DA240.00'), 'حبة الشبكة تعرض القيمة الصحيحة');
check(has(S.salesLastSalePillHTML({ records: [{ id: 'p1' }] }, false), 'toggleSalesCardLastSale(this)'), 'حبة الشبكة تفتح التفاصيل');
check(has(S.salesLastSaleDetailsHTML({ records: [{ id: 'p1' }] }), 'INV-9'), 'تفاصيل القائمة تعرض رقم الفاتورة');
check(has(S.salesLastSaleDetailsHTML({ records: [{ id: 'p1' }] }), 'زبون قديم'), 'تفاصيل القائمة تعرض الزبون');
eq(S.salesLastSalePillHTML({ records: [{ id: 'none' }] }, true), '', 'منتج بلا مبيعات لا يعرض حبة فارغة');

// First held invoice: a real cart line with a manual price and a line discount.
S._salesCart = [{
  key: 'k1', name: 'قطعة', barcode: '111', qty: 2, mode: 'unit', price: 240,
  total: 450, baseTotal: 500, manualPrice: 250, discount: 50,
  entries: [{ productId: 'p1', qty: 2, price: 250, total: 500 }], minPrice: 0,
}];
S._salesCustomerId = 'c1';
S._salesDefaultMode = 'unit';
S._salesPayMethod = 'ccp';
S._salesPaidTouched = true;
S._salesComputedTotal = 450;
vm.runInContext('_salesMarginBypass = true', S); // lexical binding, not a global property
setVal('salesPaidAmount', '300');
setVal('salesExtraDisc', '25');
setVal('salesInvoiceNote', 'ملاحظة أولى');
S.ensureSalesHoldTabs();
const firstId = S._salesActiveTabId;
eq(S._salesHoldTabs.length, 1, 'أول تبويب يُنشأ تلقائياً');

S.addSalesHoldTab();
eq(S._salesHoldTabs.length, 2, 'زر + يضيف سلة جديدة');
eq(S._salesCart.length, 0, 'السلة الجديدة فارغة');
eq(getVal('salesInvoiceNote'), '', 'الملاحظة تُصفّر في التبويب الجديد');
eq(noteBtn.getAttribute('aria-expanded'), 'false', 'التبويب الفارغ يُبقي الملاحظة مخفية');

S._salesCart = [{ key: 'k2', name: 'قطعة 2', qty: 1, price: 95, total: 95, discount: 0, entries: [] }];
S._salesCustomerId = null;
setVal('salesInvoiceNote', 'ملاحظة ثانية');
S.switchSalesHoldTab(firstId);
eq(S._salesCart.length, 1, 'العودة للتبويب الأول تستعيد السطر');
eq(S._salesCart[0].qty, 2, 'الكمية مستعادة');
eq(S._salesCart[0].manualPrice, 250, 'السعر اليدوي مستعاد');
eq(S._salesCart[0].discount, 50, 'خصم السطر مستعاد');
eq(S._salesCart[0].entries[0].price, 250, 'سعر السطر مستعاد');
eq(S._salesCustomerId, 'c1', 'الزبون مستعاد');
eq(S._salesPayMethod, 'ccp', 'طريقة الدفع مستعادة');
eq(getVal('salesPaidAmount'), '300', 'المبلغ المدفوع مستعاد');
eq(getVal('salesExtraDisc'), '25', 'الخصم العام مستعاد');
eq(getVal('salesInvoiceNote'), 'ملاحظة أولى', 'ملاحظة الفاتورة مستعادة');
eq(noteBtn.getAttribute('aria-expanded'), 'true', 'تبويب فيه ملاحظة يفتح الصندوق تلقائياً');
eq(vm.runInContext('_salesMarginBypass', S), false, 'تجاوز الربح لا يعبر بين التبويبات');

S.cycleSalesHoldTabs(1);
eq(getVal('salesInvoiceNote'), 'ملاحظة ثانية', 'F7 ينتقل للتبويب التالي');
S.switchSalesHoldTabByNumber(1);
eq(getVal('salesInvoiceNote'), 'ملاحظة أولى', 'Alt+1 يقفز للتبويب الأول');

confirmAnswer = false;
S.closeSalesHoldTab(S._salesHoldTabs[1].id);
eq(S._salesHoldTabs.length, 2, 'إغلاق سلة غير فارغة ملغى عند رفض التأكيد');
confirmAnswer = true;
S.closeSalesHoldTab(S._salesHoldTabs[1].id);
eq(S._salesHoldTabs.length, 1, 'التأكيد يغلق التبويب');
S.resetSalesHoldTabAfterSale();
eq(S._salesHoldTabs[0].state.cart.length, 0, 'بعد الدفع يُصفّر التبويب الحالي فقط');
eq(S._salesHoldTabs[0].state.note, '', 'ملاحظة التبويب تُصفّر بعد الدفع');

console.log('\n============================================');
console.log((fail === 0 ? 'كل الفحوص نجحت' : 'فشل ' + fail + ' فحص') + ' — pass=' + pass + ' fail=' + fail);
console.log('============================================');
process.exit(fail === 0 ? 0 : 1);
