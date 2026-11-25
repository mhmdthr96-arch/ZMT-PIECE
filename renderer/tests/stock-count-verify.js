// ============================================================
// ZMT PIECE — stock count (جرد المخزون) verifier
// Run: node renderer/tests/stock-count-verify.js
//
// Covers:
//   • renderer/js/stock-count.js (the shared count engine + modal + sheet)
//   • quantity-only corrections, no expense / no sale
//   • fixed products included in the list but never in zakat valuation
//   • search ranking, diff computation, batch-update payload shape
//   • per-user session persistence (localStorage)
//   • the Zakat page button (manager-only) + i18n keys in 4 languages
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const base = path.join(__dirname, '..', '..') + path.sep;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (cond, m) => cond ? ok(m) : bad(m);
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const has = (s, n) => s.indexOf(n) !== -1;
const count = (s, n) => { let i = 0, c = 0; while ((i = s.indexOf(n, i)) !== -1) { c++; i += n.length; } return c; };

console.log('============================================');
console.log('اختبار جرد المخزون (STOCK COUNT)');
console.log('============================================');

const scSrc = read('renderer/js/stock-count.js');
const indexHtml = read('renderer/index.html');
const appJs = read('renderer/js/app.js');
const css = read('renderer/css/main.css');
const zakatHtml = read('renderer/pages/zakat.html');
const zakatJs = read('renderer/js/pages/zakat.js');

// ---------- 1. loading & static shape ----------
console.log('\n--- 1. التحميل والبنية ---');
check(fs.existsSync(path.join(base, 'renderer/js/stock-count.js')), 'ملف stock-count.js موجود');
{
  const iSC = indexHtml.indexOf('js/stock-count.js');
  const iRI = indexHtml.indexOf('js/return-invoice.js');
  check(iSC > 0, 'index.html يُحمّل stock-count.js');
  check(iSC > iRI, 'يُحمّل بعد return-invoice.js');
}
check(has(scSrc, 'root.StockCount') || has(scSrc, 'window.StockCount'), 'وحدة StockCount مُصدَّرة');
for (const fn of ['open:', 'close:', 'save:', 'printSheet:', 'addProduct:', 'addAll:', 'clear:', 'removeRow:', 'setActual:', 'buildRows:', 'computeUpdates:', 'filterProducts:', 'parseQty:', 'sessionSave:', 'sessionLoad:', 'sessionClear:', 'allowed:']) {
  check(has(scSrc, fn), 'واجهة StockCount.' + fn.replace(':', ''));
}
check(has(scSrc, 'DB.updateProductsBatch'), 'الحفظ يستخدم DB.updateProductsBatch');
check(has(scSrc, 'changes: { quantity:'), 'التغييرات تخصّ الكمية فقط (quantity)');
check(!has(scSrc, 'addPayment') && !has(scSrc, 'addInvoice') && !has(scSrc, 'addSale'), 'لا يسجّل أي مصروف/فاتورة/بيع');
check(has(scSrc, 'p.fixed === true') || has(scSrc, "fixed === true"), 'يميّز المنتجات الثابتة (fixed)');
check(has(scSrc, 'getBundles') === false, 'لا يستدعي الباقات (تأتي الحزم خارج getProducts)');

// ---------- 2. behavioural engine ----------
console.log('\n--- 2. محرّك الجرد ---');

const products = [
  { id: 'p1', name: 'Filtre à huile', barcode: '6130001', quantity: 10, sellPrice: 1500 },
  { id: 'p2', name: 'Bougie', barcode: '6130002', quantity: 4.5, sellPrice: 800, qtyDecimals: 2 },
  { id: 'p3', name: 'Service vidange', barcode: '', quantity: 0, sellPrice: 2500, fixed: true },
  { id: 'p4', name: 'Courroie', barcode: '6130004', quantity: 0, sellPrice: 3000 },
];
const productById = {};
products.forEach(p => { productById[p.id] = p; });

let batchCalls = [];
let calcCalls = 0;
let alerts = [];
const lsStore = {};
const sandbox = {
  console, Math, Number, String, Object, Array, Date, isFinite, parseFloat, parseInt, JSON,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null),
    setItem: (k, v) => { lsStore[k] = String(v); },
    removeItem: (k) => { delete lsStore[k]; },
  },
  alert: (m) => { alerts.push(String(m)); },
  confirm: () => true,
};
sandbox.window = sandbox;
sandbox.Unit = {
  roundQty: (v) => Math.round((Number(v) || 0) * 1e6) / 1e6,
  fmtQty: (v, d) => (Number(v) || 0).toFixed(d == null ? 0 : d),
  qtyUnit: (q) => String(q),
};
sandbox.escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
sandbox.t = () => '';
sandbox.isRTL = () => true;
sandbox.toLatinDigits = (v) => String(v == null ? '' : v).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
sandbox.productSearchScore = (name, barcode, q) => {
  const n = String(name || '').toLowerCase();
  const b = String(barcode || '').toLowerCase();
  const query = String(q || '').toLowerCase().trim();
  if (!query) return 1;
  if (n.startsWith(query)) return 10;
  if (n.indexOf(query) !== -1) return 5;
  if (b.indexOf(query) !== -1) return 2;
  return 0;
};
sandbox.Auth = { isManager: () => true, getUserCode: () => 'MGR1' };
sandbox.calculateZakat = () => { calcCalls++; };
sandbox.DB = {
  getProducts: () => products,
  getProduct: (id) => productById[id] || null,
  updateProductsBatch: (updates) => { batchCalls.push(updates); return updates.map(u => productById[u.id]); },
};
vm.runInNewContext(scSrc, sandbox, { filename: 'stock-count.js' });
const SC = sandbox.StockCount;
check(!!SC, 'StockCount مُحمَّل في بيئة الاختبار');

if (SC) {
  // buildRows
  const rows = SC.buildRows(products);
  check(rows.length === 4, 'buildRows يبني سطراً لكل منتج');
  check(rows[2].fixed === true, 'المنتج الثابت (fixed) مُدرج في الجرد');
  check(rows[0].actualQty === 10, 'الكمية الفعلية تُعبّأ بكمية النظام افتراضياً');
  check(rows[0].systemQty === 10 && rows[1].systemQty === 4.5, 'كمية النظام منقولة بدقة (كسور)');

  // seed
  const seeded = SC.buildRows(products, { p1: 7 });
  check(seeded[0].actualQty === 7, 'buildRows يقبل كميات فعلية مسموقة (الجلسة)');
  check(seeded[1].actualQty === 4.5, 'الأسطر غير المسموقة تبقى على كمية النظام');

  // diff
  const r0 = SC.makeRow(products[0], 7);
  check(SC.diffOf(r0) === -3, 'diffOf يحسب الفرق (7 − 10 = −3)');
  check(SC.diffOf(SC.makeRow(products[0], 10)) === 0, 'diffOf = 0 عند التطابق');

  // computeUpdates — only differing, quantity-only
  const updates = SC.computeUpdates([SC.makeRow(products[0], 7), SC.makeRow(products[1], 4.5), SC.makeRow(products[2], 3)]);
  check(updates.length === 2, 'computeUpdates يتجاهل الأسطر المطابقة');
  check(updates[0].id === 'p1' && updates[0].changes.quantity === 7, 'تحديث p1 = 7');
  check(Object.keys(updates[0].changes).length === 1 && updates[0].changes.quantity === 7, 'التغيير يقتصر على quantity (لا سعر شراء)');
  check(updates[1].id === 'p3' && updates[1].changes.quantity === 3, 'المنتج الثابت يُصحَّح كمياً أيضاً');
  check(SC.computeUpdates(SC.buildRows(products)).length === 0, 'لا تحديثات عندما لا توجد فروق');

  // Arabic-Indic digits are accepted in the counted quantity
  check(SC.parseQty('12') === 12, 'parseQty يحلل الأرقام اللاتينية');
  check(SC.parseQty('4.5') === 4.5, 'parseQty يحلل الكسور');
  check(SC.parseQty('٧') === 7, 'parseQty يحوّل الأرقام العربية-الهندية');
  check(SC.parseQty('') === 0, 'parseQty = 0 للفراغ');

  // filterProducts
  const found = SC.filterProducts(products, 'bougie', {}, 40);
  check(found.length === 1 && found[0].id === 'p2', 'filterProducts يطابق بالاسم');
  const byBarcode = SC.filterProducts(products, '6130004', {}, 40);
  check(byBarcode.length === 1 && byBarcode[0].id === 'p4', 'filterProducts يطابق بالباركود');
  const excluded = SC.filterProducts(products, '', { p1: true, p2: true }, 40);
  check(excluded.length === 2 && !excluded.some(p => p.id === 'p1'), 'filterProducts يستثني الأسطر المضافة');
  const capped = SC.filterProducts(products, '', {}, 2);
  check(capped.length === 2, 'filterProducts يحترم حدّ العرض (limit)');
  check(SC.filterProducts(products, 'zzz-none', {}, 40).length === 0, 'filterProducts = [] بدون تطابق');

  // session persistence
  check(SC.storageKey() === 'stock_count_session_MGR1', 'مفتاح الجلسة خاص بكل مستخدم');
  SC.sessionSave([{ id: 'p1', actualQty: 7 }], 'bou');
  const loaded = SC.sessionLoad();
  check(!!loaded && loaded.rows.length === 1 && loaded.rows[0].actualQty === 7, 'الجلسة تُحفظ وتُقرأ');
  check(loaded.query === 'bou', 'استعلام البحث يُحفظ مع الجلسة');
  SC.sessionClear();
  check(SC.sessionLoad() === null, 'الجلسة تُمسح بعد الحفظ/التفريغ');

  // save() end-to-end
  batchCalls = []; calcCalls = 0; alerts = [];
  SC.addProduct('p1');
  SC.setActual('p1', 5);
  SC.save();
  check(batchCalls.length === 1, 'save يستدعي updateProductsBatch مرة واحدة');
  check(batchCalls[0].length === 1 && batchCalls[0][0].id === 'p1' && batchCalls[0][0].changes.quantity === 5, 'حمولة التحديث صحيحة (p1 → 5)');
  check(calcCalls === 1, 'save يعيد حساب الزكاة');
  check(SC.sessionLoad() === null, 'save يمسح جلسة الجرد');
  check(alerts.some(a => a.indexOf('{n}') === -1), 'رسالة الحفظ لا تُبقي العنصر {n} غير مُستبدل');

  // blank actual keeps system qty (never silently zeroes)
  SC.clear();
  SC.addProduct('p4');
  SC.setActual('p4', '');
  batchCalls = [];
  SC.save();
  check(batchCalls.length === 0, 'الكمية الفعلية الفارغة لا تُنشئ فرقاً (لا تصفير صامت)');

  // permission guard
  sandbox.Auth.isManager = () => false;
  batchCalls = []; alerts = [];
  SC.clear();
  SC.addProduct('p1');
  SC.setActual('p1', 1);
  SC.save();
  check(batchCalls.length === 0, 'غير المدير لا يستطيع الحفظ');
  check(alerts.length > 0, 'غير المدير يُنبَّه (لا صلاحية)');
  sandbox.Auth.isManager = () => true;
}

// ---------- 3. Zakat page integration ----------
console.log('\n--- 3. تكامل صفحة الزكاة ---');
check(has(zakatHtml, 'id="zkStockCountBtn"'), 'زر جرد المخزون في صفحة الزكاة');
check(has(zakatHtml, 'StockCount.open()'), 'الزر يستدعي StockCount.open');
check(has(zakatHtml, 'data-i18n="zakat.countBtn"'), 'الزر يستخدم مفتاح الترجمة zakat.countBtn');
check(has(zakatHtml, '>جرد المخزون<'), 'نص الزر «جرد المخزون»');
{
  const iCount = zakatHtml.indexOf('zkStockCountBtn');
  const iPrint = zakatHtml.indexOf('printZakatReport()');
  check(iCount > 0 && iPrint > iCount, 'الزر يسبق زر طباعة التقرير');
}
check(has(zakatJs, 'function zkToggleStockCountBtn('), 'zakat.js يُبدّل ظهور زر الجرد');
check(has(zakatJs, 'Auth.isManager()'), 'إظهار الزر للمدير فقط');
check(has(zakatJs, 'zkToggleStockCountBtn()'), 'يُستدعى داخل init_zakat');
check(has(zakatJs, 'window.zkToggleStockCountBtn'), 'الدالة مُصدَّرة عالمياً');

// ---------- 4. i18n keys (4 languages) ----------
console.log('\n--- 4. مفاتيح الترجمة ---');
const langCount = (key) => count(appJs, key);
for (const key of ['countBtn:', 'countSub:', 'countSearch:', 'countAddAll:', 'countClear:', 'countColProduct:', 'countColSystem:', 'countColActual:', 'countColDiff:', 'countSave:', 'countPrint:', 'countSaved:', 'countNoChanges:', 'countConfirm:', 'countNoPermission:', 'countFixedNote:', 'countSheetTitle:', 'countSign:']) {
  check(langCount(key) >= 4, 'المفتاح ' + key + ' في اللغات الأربع (' + langCount(key) + ')');
}
check(has(appJs, "'جرد المخزون'"), 'الترجمة العربية للزر');
check(has(appJs, "'Stock Count'"), 'الترجمة الإنجليزية');
check(has(appJs, "'Inventaire'"), 'الترجمة الفرنسية');
check(has(appJs, "'库存盘点'"), 'الترجمة الصينية');

// ---------- 5. styles ----------
console.log('\n--- 5. الأنماط ---');
for (const cls of ['.sc-toolbar', '.sc-results', '.sc-table-wrap', '.sc-input', '.sc-diff-pos', '.sc-diff-neg', '.sc-fixed-tag', '.sc-summary']) {
  check(has(css, cls), 'نمط ' + cls + ' موجود');
}

console.log('\n============================================');
console.log(`النتيجة: ${pass} نجاح، ${fail} فشل`);
console.log('============================================');
process.exit(fail === 0 ? 0 : 1);
