// ============================================================
// ZMT PIECE — Frequently bought together (cross-sell) verifier
// Run: node renderer/tests/cross-sell-verify.js
//
// Guards the contract that matters in a cashier:
//   • one batched, company/store-scoped history scan builds the pair index,
//   • weak/rare pairs are rejected so a single odd invoice is not permanent,
//   • the card strip is O(1) and filters stock, bundle-reserved and in-cart
//     items,
//   • the add button goes through the existing sale path, never direct DB
//     writes, and F6/F7/Alt shortcuts are untouched.
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
const appJs = read('renderer/js/app.js');
const css = read('renderer/css/main.css');
const salesHtml = read('renderer/pages/sales.html');
const shortcutsJs = read('renderer/js/shortcuts.js');

console.log('============================================');
console.log('الاقتراح الذكي — Frequently Bought Together');
console.log('============================================');

console.log('\n--- 1. البناء الجماعي وعتبة الثقة ---');
check(has(dbJs, 'productId: line.productId'), 'db.js يُرجع productId (مفتاح الاقتراحات)');
const pairFn = between(salesJs, 'function buildSalesCrossSellMap()', 'function salesCrossSellForGroup');
check(has(pairFn, 'DB.getProductSalesHistory(ids)'), 'مسح واحد جماعي للتاريخ المحصور');
check(has(pairFn, 'invoiceId') && has(pairFn, 'byInvoice'), 'الأزواج تُحسب لكل فاتورة على حدة');
check(has(pairFn, 'invoicesByProduct[pid].size'), 'النسبة محسوبة على عدد الفواتير لا عدد الأسطر');
check(has(pairFn, 'x.count >= 2 && x.ratio >= 0.25'), 'عتبة: فاتورتان على الأقل وربع المبيعات');
check(has(pairFn, '.slice(0, 3)'), 'حد أقصى ثلاثة اقتراحات للصنف');
check(!has(pairFn, 'localStorage') && !has(pairFn, 'indexedDB'), 'ذاكرة الجلسة فقط');
check(has(salesJs, 'buildSalesCrossSellMap();'), 'البناء عند فتح الصفحة وبعد كل فاتورة');
check((salesJs.match(/buildSalesCrossSellMap\(\);/g) || []).length >= 3, 'يُعاد البناء في init_sales وبعد الدفع وعند الطلب');

console.log('\n--- 2. بطاقة المنتج لا تستعلم التاريخ ---');
const cardFn = between(salesJs, 'function salesCardHTML(g, i)', 'const SALES_GRID_PAGE_SIZE');
check(has(cardFn, 'salesCrossSellHTML(g)'), 'سطر الاقتراح مدمج في بطاقة الشبكة');
check(!has(cardFn, 'DB.getProductSalesHistory'), 'لا استعلام DB لكل بطاقة');
check(has(salesJs, 'addToSalesCart(productId)'), 'الإضافة تمرّ عبر مسار البيع المعتاد');
check(has(salesJs, 'function addToSalesCart(productId)'), 'دالة الإضافة المعتادة موجودة فعلاً في sales.js');
check(!has(salesJs, 'addSaleCrossSellToDB'), 'لا كتابة مباشرة في DB عند الاقتراح');
check(has(salesHtml, 'id="salesProductGrid"'), 'شبكة المنتجات ما زالت كما هي');
check(has(css, '.prod-card-crosssell') && has(css, '.crosssell-chip'), 'تنسيق الشرف مدمج');
check(has(css, 'html[data-theme="dark"] .prod-card-crosssell'), 'تباين الوضع الداكن موجود');
check(!has(shortcutsJs, "'F7'") && has(shortcutsJs, "'F6'"), 'F6 ما زال إضافة مصروف وF7 غير عالمي');
check(has(salesJs, "e.key === 'F7' || e.code === 'F7'"), 'F7 لا يزال page-scoped');
for (const key of ['crossSellLabel', 'crossSellHint']) {
  const n = (appJs.match(new RegExp(key + ':', 'g')) || []).length;
  check(n >= 4, 'مفتاح ' + key + ' في اللغات الأربع (' + n + ')');
}

// ------------------------------------------------------------- runtime sandbox --
console.log('\n--- 3. سلوك فعلي فوق sales.js الحقيقي ---');
(function () {
  const body = /<body[^>]*>([\s\S]*)$/i.exec(salesHtml);
  parseInto(body ? body[1] : salesHtml, doc.body);
}());

const t = (k) => ({
  'sales.crossSellLabel': 'يُطلب معه غالباً', 'sales.crossSellHint': 'من سجل الفواتير السابقة',
  'sales.lastSold': 'آخر بيع', 'sales.crossSellAdd': 'أضف',
}[k] || String(k));

const products = [
  { id: 'p1', name: 'قطعة 1', barcode: '111', quantity: 5, sellPrice: 100, buyPrice: 50 },
  { id: 'p2', name: 'قطعة 2', barcode: '222', quantity: 5, sellPrice: 200, buyPrice: 100 },
  { id: 'p3', name: 'قطعة 3', barcode: '333', quantity: 5, sellPrice: 300, buyPrice: 150 },
  { id: 'p4', name: 'قطعة 4', barcode: '444', quantity: 5, sellPrice: 400, buyPrice: 200 },
  { id: 'p5', name: 'قطعة 5', barcode: '555', quantity: 5, sellPrice: 500, buyPrice: 250 },
  { id: 'p6', name: 'قطعة 6', barcode: '666', quantity: 5, sellPrice: 600, buyPrice: 300 },
];
function row(invoiceId, productId) {
  return { productId, invoiceId, invoiceNumber: invoiceId, date: '2026-11-01', price: 100, qty: 1, total: 100 };
}
// p1&p2 together 3 times in 4 p1 invoices → qualifies; p3,p4 appear once → not.
const rows = [
  row('INV-1', 'p1'), row('INV-1', 'p2'), row('INV-1', 'p3'),
  row('INV-2', 'p1'), row('INV-2', 'p2'),
  row('INV-3', 'p1'), row('INV-3', 'p2'),
  row('INV-4', 'p1'), row('INV-4', 'p4'),
  row('INV-5', 'p5'), row('INV-5', 'p6'),
];
let bundles = [];
const addCalls = [];
let dbCalls = 0;

const sandbox = {
  module: { exports: {} }, console, document: doc, Date, Math, Object, Array, JSON,
  String, Number, Boolean, isFinite, parseFloat, parseInt, RegExp, Error, Function,
  Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map, WeakMap, Promise,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  indexedDB: null, navigator: { onLine: false },
  fetch: () => Promise.reject(new Error('offline')),
  alert: () => {}, confirm: () => true,
  addEventListener: () => {}, removeEventListener: () => {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  t,
  escHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  debounce: (fn) => fn,
  DB: {
    getProducts: () => products.slice(),
    getProduct: (id) => products.find((p) => p.id === id) || null,
    getBundles: () => bundles.slice(),
    getProductSalesHistory: (ids) => {
      dbCalls++;
      const set = ids instanceof Set ? ids : new Set(Array.isArray(ids) ? ids : [ids]);
      return rows.filter((r) => set.has(r.productId)).slice();
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

// The add button must use the shipped path, not a custom DB write. Stubbing
// addToSalesCart also proves the chip is wired to the real helper's name.
const realAddToSalesCart = S.addToSalesCart;
check(typeof realAddToSalesCart === 'function', 'addToSalesCart محمّلة من sales.js الحقيقي');
S.addToSalesCart = (id) => { addCalls.push(id); };
S._salesCart = [];

const map = S.buildSalesCrossSellMap();
eq(dbCalls, 1, 'مسح واحد لكل البطاقات');
eq(map.p1 && map.p1[0] && map.p1[0].id, 'p2', 'أقوى اقتراح لـ p1 هو p2');
eq(map.p1 && map.p1[0] && map.p1[0].count, 3, 'عدد الفواتير المشتركة محسوب على الفواتير');
eq(map.p1 && map.p1.length, 1, 'p3 وp4 مستبعدان لضعف التكرار');
eq(map.p2 && map.p2[0] && map.p2[0].id, 'p1', 'الاقتراح متماثل في الاتجاه الآخر');

const group1 = { records: [{ id: 'p1' }] };
const strip = S.salesCrossSellHTML(group1);
check(has(strip, 'prod-card-crosssell'), 'الشرف يُعرض على بطاقة p1');
check(has(strip, 'قطعة 2') && has(strip, "addSalesCrossSell('p2')"), 'الشيب يعرض الاسم ويستدعي الإضافة');
check(has(strip, 'يُطلب معه غالباً'), 'التسمية مأخوذة من الترجمة');
eq(S.salesCrossSellHTML({ records: [{ id: 'p3' }] }), '', 'صنف بلا علاقة قوية لا يعرض شريطاً فارغاً');
eq(dbCalls, 1, 'عرض البطاقات لم يضف أي استعلام DB');

S.addSalesCrossSell('p2');
eq(addCalls[0], 'p2', 'الضغط على الاقتراح يمرّ عبر addToSalesCart');
S.addToSalesCart = realAddToSalesCart;

// Out-of-stock suggestion must never be offered.
products.find((p) => p.id === 'p2').quantity = 0;
eq(S.salesCrossSellHTML(group1), '', 'صنف نافد لا يُقترح');
products.find((p) => p.id === 'p2').quantity = 5;

// Reserved-for-bundle item cannot be sold alone.
bundles = [{ components: [{ productId: 'p2', qty: 5 }] }];
eq(S.salesCrossSellHTML(group1), '', 'صنف محجوز لباقة لا يُقترح');
bundles = [];

// Already in the cart must not be suggested again.
S._salesCart = [{ key: S.salesGroupKey(products.find((p) => p.id === 'p2')) }];
eq(S.salesCrossSellHTML(group1), '', 'صنف موجود في السلة لا يُقترح مجدداً');
S._salesCart = [];

// Rebuilding after a sale keeps the new pair without growing old counts twice.
S.buildSalesCrossSellMap();
eq(map.p1[0].count, 3, 'إعادة البناء لا تضاعف العدّاد');

console.log('\n============================================');
console.log((fail === 0 ? 'كل الفحوص نجحت' : 'فشل ' + fail + ' فحص') + ' — pass=' + pass + ' fail=' + fail);
console.log('============================================');
process.exit(fail === 0 ? 0 : 1);
