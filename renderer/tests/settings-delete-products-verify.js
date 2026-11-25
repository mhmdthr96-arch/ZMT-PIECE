// ============================================================
// ZMT PIECE — «Delete products only» verifier
// Run: node renderer/tests/settings-delete-products-verify.js
//
// Guards the promise made in the settings UI: after a password-confirmed
// deletion, ONLY catalogue products disappear. Invoices (including their
// item-name snapshots), customers, suppliers, balances, payments, vouchers,
// returns and settings are never read or written by the deletion core.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const section = (t) => console.log('\n--- ' + t + ' ---');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = src.indexOf('\n}', start);
  return end < 0 ? src.slice(start) : src.slice(start, end + 2);
}

console.log('============================================');
console.log('اختبار حذف المنتجات فقط — كلمة مرور وحماية البيانات');
console.log('============================================');

const settingsHtml = read('renderer/pages/settings.html');
const settingsJs = read('renderer/js/pages/settings.js');
const appJs = read('renderer/js/app.js');
const cssSrc = read('renderer/css/main.css');
const dbSrc = read('renderer/js/db.js');
const coreSrc = extractFn(settingsJs, 'settingsDeleteAllProductsOnly');
const confirmSrc = extractFn(settingsJs, 'settingsConfirmDeleteProducts');

/* ------------------------------------------- 1) static wiring ------------ */
section('1) الربط الثابت والنافذة');
for (const id of ['settingsDeleteProductsBtn', 'settingsDeleteProductsModal',
                  'settingsDeleteProductsPass', 'settingsDeleteProductsResult']) {
  check(settingsHtml.includes('id="' + id + '"'), 'عنصر ' + id + ' موجود');
}
check(settingsHtml.includes('onclick="settingsOpenDeleteProductsModal()"'), 'الزر يفتح النافذة');
check(settingsHtml.includes('onclick="settingsConfirmDeleteProducts()"'), 'زر تأكيد الحذف');
check(settingsHtml.includes('onclick="settingsCloseDeleteProductsModal()"'), 'زر/أيقونة الإلغاء تغلق النافذة');
check(settingsHtml.includes('id="settingsDeleteProductsPass"') && /id="settingsDeleteProductsPass"[^>]*type="password"|type="password"[^>]*id="settingsDeleteProductsPass"/.test(settingsHtml),
  'حقل كلمة المرور من نوع password');
check(settingsHtml.includes('data-i18n="settings.deleteProductsKeep"'), 'تحذير «ما يبقى محفوظاً» ظاهر للمستخدم');
check(settingsHtml.includes('class="card settings-danger-card"'), 'بطاقة تحذير بصرية منفصلة');
check(cssSrc.includes('.settings-danger-card'), 'تنسيق البطاقة الخطرة');
const ini = settingsJs.indexOf('function init_settings()');
const provider = settingsJs.indexOf('const PROVIDER_INFO');
check(ini >= 0 && provider > ini && settingsJs.indexOf('settingsInitDeleteProducts();', ini) > ini &&
      settingsJs.indexOf('settingsInitDeleteProducts();', ini) < provider,
  'settingsInitDeleteProducts() تُستدعى من init_settings()');
check(settingsJs.includes('function settingsInitDeleteProducts()'), 'تهيئة تُفرغ كلمة المرور عند الفتح والإلغاء');
check(settingsJs.includes('function settingsCloseDeleteProductsModal()'), 'الإلغاء دالة مستقلة');
check((settingsHtml.match(/onclick="settingsCloseDeleteProductsModal\(\)"/g) || []).length >= 2,
  'زرا الإلغاء (الأيقونة + إلغاء) كلاهما يغلق دون حذف');

/* --------------------------------------- 2) password / manager ---------- */
section('2) كلمة مرور المتجر ثم قاعدة المدير');
check(confirmSrc.includes('Auth.getStorePassword()'), 'تُستخدم كلمة مرور المتجر الحالية');
check(confirmSrc.includes('typed !== existing'), 'المقارنة صارمة بالكلمة المدخلة');
check(confirmSrc.includes('Auth.isManager()'), 'غياب كلمة المرور: المدير فقط');
check(confirmSrc.includes("t('settings.deleteProductsWrong')"), 'كلمة خاطئة: رسالة ولا حذف');
check(confirmSrc.includes("t('settings.deleteProductsManagerOnly')"), 'غير مدير بلا كلمة مرور: رسالة ولا حذف');
check(confirmSrc.includes('settingsDeleteAllProductsOnly('), 'الحذف يمر حصراً عبر الدالة الآمنة');
check(confirmSrc.indexOf("t('settings.deleteProductsWrong')") < confirmSrc.indexOf('settingsDeleteAllProductsOnly(') &&
      confirmSrc.indexOf("t('settings.deleteProductsManagerOnly')") < confirmSrc.indexOf('settingsDeleteAllProductsOnly('),
  'فحص كلمة المرور قبل أي حذف');
check(confirmSrc.includes("replace('{count}', count)"), 'رسالة النجاح تعرض العدد');
const keys = [
  'settings.deleteProductsCard', 'settings.deleteProductsTitle', 'settings.deleteProductsBtn',
  'settings.deleteProductsHint', 'settings.deleteProductsKeep', 'settings.deleteProductsPassword',
  'settings.deleteProductsConfirm', 'settings.deleteProductsWrong', 'settings.deleteProductsManagerOnly',
  'settings.deleteProductsEmpty', 'settings.deleteProductsDone', 'settings.deleteProductsFailed',
];
for (const k of keys) eq((appJs.match(new RegExp("'" + k.replace(/\./g, '\\.') + "':", 'g')) || []).length, 4, 'ترجمة ' + k + ' في اللغات الأربع');

/* -------------------------- 3) deletion core is product-only ------------- */
section('3) نواة الحذف: المنتجات فقط');
check(coreSrc.length > 0, 'تم العثور على settingsDeleteAllProductsOnly');
const called = Array.from(coreSrc.matchAll(/\bD\.([A-Za-z_$][\w$]*)\s*\(/g)).map(m => m[1]);
eq(Array.from(new Set(called)).sort().join(','), 'deleteProduct,getProducts', 'لا استدعاءات DB أخرى غير getProducts/deleteProduct');
const coreBody = coreSrc.slice(coreSrc.indexOf('{') + 1).replace(/'[^']*'/g, "''");
check(!/invoices|payments|customers|suppliers|vouchers|returns|settings|saveCustomers|saveInvoices|logAudit/i.test(coreBody),
  'لا إشارة لأي مجموعة بيانات أخرى داخل النواة');
check(dbSrc.includes('deleteProduct(id) {'), 'DB.deleteProduct موجود');
check(/deleteProduct\(id\)\s*\{[\s\S]{0,700}?_cache\.products\.splice\(idx, 1\)/.test(dbSrc), 'deleteProduct يحذف صف المنتج فقط');

function makeDB(state) {
  const calls = [];
  return {
    calls,
    state,
    getProducts() { calls.push('getProducts'); return state.products; },
    deleteProduct(id) {
      calls.push('deleteProduct');
      const i = state.products.findIndex(p => p.id === id);
      if (i === -1) return false;
      state.products.splice(i, 1);
      return true;
    },
  };
}
function runCore(D) {
  const sandbox = { console: { warn() {} }, window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(coreSrc + '\nthis.__fn = settingsDeleteAllProductsOnly;', sandbox);
  return sandbox.__fn(D);
}
function makeState() {
  return {
    products: [{ id: 'p1', name: 'Product One' }, { id: 'p2', name: 'Product Two' }],
    invoices: [{ id: 'I1', customerId: 'A', supplierId: 'S', items: [{ productId: 'p1', name: 'Product One', qty: 2 }], totalAmount: 200 }],
    customers: [{ id: 'A', name: 'Parent A', balance: 150, totalPurchases: 200 }],
    suppliers: [{ id: 'S', name: 'Supplier S', balance: 80 }],
    payments: [{ id: 'P1', invoiceId: 'I1', customerId: 'A', amount: 50 }],
    vouchers: [{ id: 'V1', customerId: 'A', amount: 20 }],
    returns: [{ id: 'R1', productId: 'p1', name: 'Product One', qty: 1 }],
    settings: { currency: 'DZD' },
  };
}

{
  const state = makeState();
  const snapshot = JSON.stringify({
    invoices: state.invoices, customers: state.customers, suppliers: state.suppliers,
    payments: state.payments, vouchers: state.vouchers, returns: state.returns, settings: state.settings,
  });
  const D = makeDB(state);
  eq(runCore(D), 2, 'حُذف منتجان');
  eq(state.products.length, 0, 'الكتالوج فارغ');
  eq(D.calls.filter(c => c === 'getProducts').length, 1, 'getProducts مرة واحدة');
  eq(D.calls.filter(c => c === 'deleteProduct').length, 2, 'deleteProduct لكل منتج');
  eq(JSON.stringify({
    invoices: state.invoices, customers: state.customers, suppliers: state.suppliers,
    payments: state.payments, vouchers: state.vouchers, returns: state.returns, settings: state.settings,
  }), snapshot, 'الفواتير/العملاء/الموردين/الدفعات/السندات/المرتجعات/الإعدادات لم تتغير');
  eq(state.invoices[0].items[0].name, 'Product One', 'اسم المنتج داخل الفاتورة بقي كما هو');
  eq(state.invoices[0].customerId, 'A', 'customerId في الفاتورة بقي كما هو');
  eq(state.customers[0].balance, 150, 'رصيد العميل بقي كما هو');
  eq(state.suppliers[0].balance, 80, 'رصيد المورد بقي كما هو');
}
{
  // A failing product must not be counted, and must not abort the rest.
  const state = makeState();
  const D = makeDB(state);
  D.deleteProduct = (id) => { D.calls.push('deleteProduct'); if (id === 'p1') throw new Error('locked'); state.products = state.products.filter(p => p.id !== id); return true; };
  eq(runCore(D), 1, 'منتج فاشل لا يُحصى كنجاح');
  eq(state.invoices.length, 1, 'الفاتورة باقية حتى عند فشل حذف منتج');
}
{
  eq(runCore(null), -1, 'غياب DB: لا حذف');
  eq(runCore({ getProducts: () => ({}) }), -1, 'غياب deleteProduct: لا حذف');
  eq(runCore({ getProducts: () => 'bad', deleteProduct: () => true }), -1, 'قائمة غير صحيحة: لا حذف');
  const calls = [];
  runCore({ getProducts: () => { calls.push('getProducts'); return []; }, deleteProduct: () => { calls.push('deleteProduct'); return true; } });
  eq(calls.join(','), 'getProducts', 'قائمة فارغة: لا استدعاء حذف');
}

console.log('\n============================================');
console.log('PASS ' + pass + '  FAIL ' + fail + '  TOTAL ' + (pass + fail));
console.log('============================================');
process.exit(fail ? 1 : 0);
