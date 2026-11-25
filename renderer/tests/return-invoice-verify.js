// ============================================================
// ZMT PIECE — return invoice (FACTURE DE RETOUR) verifier
// Run: node renderer/tests/return-invoice-verify.js
//
// Covers:
//   • renderer/js/return-invoice.js (the shared French builder/printer)
//   • one consolidated return invoice per original invoice
//   • snapshot pricing, legacy fallback, grouping by product+price+date
//   • the screen-only «ملاحظة مرتجع» note never reaching the printed original
//   • the returns page action + the invoice card/detail actions
//   • i18n keys present in all four languages
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
console.log('اختبار فاتورة الإرجاع (FACTURE DE RETOUR)');
console.log('============================================');

const riSrc = read('renderer/js/return-invoice.js');
const invoicesJs = read('renderer/js/pages/invoices.js');
const returnsJs = read('renderer/js/pages/returns.js');
const indexHtml = read('renderer/index.html');
const appJs = read('renderer/js/app.js');
const css = read('renderer/css/main.css');
const saleCore = read('renderer/js/sale-core.js');
const custDetail = read('renderer/js/pages/customer-detail.js');

// ---------- 1. loading & static shape ----------
console.log('\n--- 1. التحميل والبنية ---');
check(fs.existsSync(path.join(base, 'renderer/js/return-invoice.js')), 'ملف return-invoice.js موجود');
{
  const iRI = indexHtml.indexOf('js/return-invoice.js');
  const iBarcode = indexHtml.indexOf('js/barcode-print.js');
  check(iRI > 0, 'index.html يُحمّل return-invoice.js');
  check(iRI > iBarcode, 'يُحمّل بعد barcode-print.js (بيانات الطباعة جاهزة)');
}
check(has(riSrc, 'FACTURE DE RETOUR'), 'العنوان الفرنسي FACTURE DE RETOUR');
check(has(riSrc, "'RET-'"), 'ترقيم RET-<رقم الفاتورة>');
check(has(riSrc, 'TOTAL RETOURNÉ'), 'سطر TOTAL RETOURNÉ');
for (const label of ['Désignation', 'Date retour', 'Prix unitaire', 'Total', 'Client', 'Cachet']) {
  check(has(riSrc, label), 'عمود/حقل فرنسي: ' + label);
}
check(has(riSrc, 'window.ReturnInvoice') || has(riSrc, 'root.ReturnInvoice'), 'وحدة ReturnInvoice مُصدَّرة');
for (const fn of ['hasReturns', 'returnsFor', 'numberFor', 'buildHTML', 'print']) {
  check(has(riSrc, fn + ':'), 'واجهة ReturnInvoice.' + fn);
}
check(has(riSrc, 'isBundleComponent'), 'يدعم مرتجعات مكوّنات الباقة');

// ---------- 2. behavioural: build the document in a sandbox ----------
console.log('\n--- 2. بناء المستند وسلوكه ---');
const DAY = 86400000;
const T1 = new Date(2024, 0, 10, 9, 30).getTime(); // 10 Jan 2024
const T2 = new Date(2024, 0, 12, 14, 0).getTime(); // 12 Jan 2024

const customers = [{ id: 'c1', name: 'Ahmed Benali', phone: '0550112233', address: 'Alger', nif: 'NIF-99' }];
const products = {
  p1: { id: 'p1', name: 'Filtre à huile', unit: 'piece' },
  p2: { id: 'p2', name: 'Bougie', unit: 'piece' },
  p3: { id: 'p3', name: 'Courroie', unit: 'piece' },
};
const invoices = {
  'inv-1': {
    id: 'inv-1', invoiceNumber: 'F-2024-001', type: 'customer', customerId: 'c1', createdAt: T1,
    totalAmount: 6200,
    items: [
      { productId: 'p1', name: 'Filtre à huile', qty: 2, price: 1500, unit: 'piece' },
      { productId: 'p2', name: 'Bougie', qty: 4, price: 800, unit: 'piece' },
    ],
  },
  // Legacy invoice used for the fallback path (returns without a snapshot).
  'inv-2': {
    id: 'inv-2', invoiceNumber: 'F-2024-002', type: 'customer', customerId: 'c1', createdAt: T1,
    totalAmount: 1500,
    items: [{ productId: 'p3', name: 'Courroie', qty: 3, price: 500, unit: 'piece' }],
  },
  'inv-3': { id: 'inv-3', invoiceNumber: 'F-2024-003', type: 'customer', createdAt: T1, items: [] },
};
const returns = [
  // p1, day 1 — one return.
  { id: 'r1', invoiceId: 'inv-1', productId: 'p1', productName: 'Filtre à huile', qty: 1, price: 1500, total: 1500, reason: 'عيب مصنع', createdAt: T1 },
  // p2, day 1 — two identical returns that must merge into one line.
  { id: 'r2', invoiceId: 'inv-1', productId: 'p2', productName: 'Bougie', qty: 2, price: 800, total: 1600, reason: 'تعديل فاتورة', createdAt: T1 },
  { id: 'r4', invoiceId: 'inv-1', productId: 'p2', productName: 'Bougie', qty: 1, price: 800, total: 800, reason: 'تعديل فاتورة', createdAt: T1 + 3600000 },
  // p1 again on day 2 — same product+price, different date: must stay separate.
  { id: 'r3', invoiceId: 'inv-1', productId: 'p1', productName: 'Filtre à huile', qty: 1, price: 1500, total: 1500, reason: 'عيب مصنع', createdAt: T2 },
  // legacy row without price/total — falls back to the invoice line price.
  { id: 'r5', invoiceId: 'inv-2', productId: 'p3', productName: 'Courroie', qty: 2, reason: 'تعديل فاتورة', createdAt: T1 },
];

const db = {
  getReturns: () => returns.map(r => Object.assign({}, r)),
  getInvoice: (id) => invoices[id] || null,
  getProduct: (id) => products[id] || null,
  getCustomers: () => customers,
  getSuppliers: () => [],
};

function makeSandbox() {
  const store = {};
  const sandbox = {
    console, Math, Number, String, Object, Array, Date, isFinite, parseFloat, parseInt, Promise, JSON,
    localStorage: { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    alert: () => {},
  };
  sandbox.window = sandbox;
  sandbox.Unit = {
    roundQty: (v) => Math.round((Number(v) || 0) * 1e6) / 1e6,
    qtyUnit: (q, o) => String(q) + 'u',
  };
  sandbox.fmtMoney = (v) => (Number(v) || 0).toFixed(2);
  sandbox.escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  sandbox.t = () => '';
  sandbox.getPrintInfo = () => ({ name: 'ZMT PIECE', address: 'Alger', phone: '0550000000', nif: 'NIF-1', rcc: 'RC-1' });
  sandbox.DB = db;
  vm.runInNewContext(riSrc, sandbox, { filename: 'return-invoice.js' });
  return sandbox.ReturnInvoice;
}

const RI = makeSandbox();
check(!!RI, 'ReturnInvoice مُحمَّل في بيئة الاختبار');

if (RI) {
  check(RI.hasReturns('inv-1') === true, 'hasReturns يكتشف المرتجعات');
  check(RI.hasReturns('inv-3') === false, 'hasReturns = false بدون مرتجعات');
  check(RI.hasReturns('') === false, 'hasReturns يتحمل المعرّف الفارغ');
  check(RI.returnsFor('inv-1').length === 4, 'returnsFor يجمع مرتجعات الفاتورة');
  check(RI.returnsFor('inv-3').length === 0, 'returnsFor = [] بدون مرتجعات');
  check(RI.numberFor(invoices['inv-1']) === 'RET-F-2024-001', 'numberFor = RET-<رقم الفاتورة>');

  check(RI.buildHTML('inv-3') === '', 'buildHTML = \'\' بدون مرتجعات');
  check(RI.buildHTML('does-not-exist') === '', 'buildHTML = \'\' لفاتورة غير موجودة');

  const html = RI.buildHTML('inv-1');
  check(!!html, 'buildHTML يبني مستند فاتورة الإرجاع');
  check(has(html, 'FACTURE DE RETOUR'), 'المستند يحمل العنوان الفرنسي');
  check(has(html, 'RET-F-2024-001'), 'المستند يحمل رقم RET-');
  check(has(html, 'N° F-2024-001'), 'المستند يشير إلى الفاتورة الأصلية');
  check(has(html, 'Ahmed Benali'), 'المستند يحمل اسم العميل');
  check(has(html, 'Filtre à huile') && has(html, 'Bougie'), 'المستند يحمل أصناف المرتجع');
  check(has(html, 'عيب مصنع'), 'المستند يحمل سبب الإرجاع');
  check(has(html, 'TOTAL RETOURNÉ'), 'المستند يحمل سطر الإجمالي');
  check(has(html, 'Date retour'), 'المستند يحمل عمود تاريخ الإرجاع');
  check(has(html, '2024'), 'المستند يحمل سنة الإرجاع');

  // 1500 (p1 day1) + 2400 (p2 merged) + 1500 (p1 day2) = 5400
  check(has(html, '5400.00 DA'), 'إجمالي الإرجاع = 5400.00 DA (مطابق للمبالغ المخصومة)');
  check(has(html, '2400.00 DA'), 'السطور المتطابقة دُمجت (2+1 = 3 وحدات = 2400)');

  // 3 lines: p1@day1, p2@day1(merged), p1@day2
  const rowMarker = 'border:1px solid #eee;font-size:12px;color:#333;vertical-align:top';
  check(count(html, rowMarker) === 3, 'ثلاثة سطور: تواريخ مختلفة تبقى منفصلة (' + count(html, rowMarker) + ')');

  // Legacy fallback: no snapshot -> invoice line price (500) × 2 = 1000
  const html2 = RI.buildHTML('inv-2');
  check(has(html2, 'Courroie'), 'المستند الاحتياطي يحمل الصنف');
  check(has(html2, '1000.00 DA'), 'السعر الاحتياطي من سطر الفاتورة (500 × 2 = 1000)');
  check(has(html2, 'RET-F-2024-002'), 'رقم الإرجاع الاحتياطي صحيح');

  check(typeof RI.print === 'function', 'print متاح');
}

// ---------- 3. invoice UI integration (static) ----------
console.log('\n--- 3. تكامل واجهة الفواتير ---');
check(has(invoicesJs, 'function _invHasReturns('), '_invHasReturns موجود');
check(has(invoicesJs, "'return', t('invoices.printReturnInvoice')"), 'زر الإرجاع في إجراءات البطاقة');
check(has(invoicesJs, "case 'return':"), 'معالج أيقونة الإرجاع');
check(has(invoicesJs, "action === 'return'"), 'invCardAction يعالج إجراء الإرجاع');
check(has(invoicesJs, 'inv-card-ctx-return-wrap'), 'عنصر قائمة السياق للمرتجع');
check(has(invoicesJs, '_invHasReturns(inv.id) ?') || has(invoicesJs, 'inv-return-badge'), 'شارة «ملاحظة مرتجع» على البطاقة');
check(has(invoicesJs, "t('invoices.returnNote')"), 'شارة/ملاحظة المرتجع تستخدم مفتاح الترجمة');
check(has(invoicesJs, 'function _injectReturnInvoiceFooterButton('), 'زر الإرجاع في تذييل التفاصيل');
check(has(invoicesJs, '_injectReturnInvoiceFooterButton(inv)'), 'يُستدعى داخل showInvDetail');
check(has(invoicesJs, 'window.ReturnInvoice.print(inv.id)'), 'التذييل يطبع فاتورة الإرجاع');
{
  // The note must be screen-only and must be stripped from printed originals.
  const noteIdx = invoicesJs.indexOf('inv-return-note');
  const hideIdx = invoicesJs.lastIndexOf('inv-print-hide', noteIdx);
  check(noteIdx > 0 && hideIdx > 0 && (noteIdx - hideIdx) < 400, 'ملاحظة المرتجع تحمل inv-print-hide (لا تُطبع على الأصل)');
  check(has(invoicesJs, ".inv-print-hide, .inv-screen-only"), 'stripInvPrintHidden يزيل الملاحظات الخاصة بالشاشة');
  check(has(invoicesJs, "footer.innerHTML = `<button class=\"btn\" onclick=\"closeInvDetail()\">${t('common.close')}</button>${returnBtn}"), 'زر الإرجاع في العرض للقراءة فقط');
}

// ---------- 4. returns page ----------
console.log('\n--- 4. صفحة المرتجعات ---');
check(has(returnsJs, 'function printReturnInvoice('), 'دالة printReturnInvoice في صفحة المرتجعات');
check(has(returnsJs, 'RI.print(invoiceId)'), 'تستدعي ReturnInvoice.print');
check(has(returnsJs, 'function _returnInvoiceNumber('), 'تعرض رقم الفاتورة الحقيقي');
check(has(returnsJs, "DB.getInvoice(invoiceId)"), 'تُحلّ رقم الفاتورة من المخزن');
check(has(returnsJs, "t('returns.printReturnInvoice')"), 'زر «طباعة فاتورة إرجاع» على البطاقة');

// ---------- 5. i18n keys (4 languages) ----------
console.log('\n--- 5. مفاتيح الترجمة ---');
const langCount = (key) => count(appJs, key);
for (const key of ['printReturnInvoice:', 'returnNote:', 'returnNoteHint:', 'noReturns:', 'invoiceMissing:']) {
  check(langCount(key) >= 4, 'المفتاح ' + key + ' في اللغات الأربع (' + langCount(key) + ')');
}
check(count(appJs, 'returnInvoice: {') >= 4, 'قسم returnInvoice في اللغات الأربع');
check(has(appJs, "'طباعة فاتورة إرجاع'"), 'الترجمة العربية لزر الإرجاع');
check(has(appJs, "'ملاحظة مرتجع'"), 'الترجمة العربية لملاحظة المرتجع');

// ---------- 6. snapshot pricing written at return time ----------
console.log('\n--- 6. تسجيل السعر مع المرتجع ---');
check(has(saleCore, 'price: qty > 0 ? value / qty : 0') && has(saleCore, 'total: value'), 'مكوّنات الباقة تسجل price/total');
{
  const idx = invoicesJs.indexOf("reason: 'تعديل فاتورة (نقص كمية)'");
  const before = invoicesJs.slice(Math.max(0, idx - 500), idx);
  check(has(before, 'price: returnUnit') && has(before, 'total: returnUnit * returnQty'), 'تعديل الفاتورة يسجل price/total');
}
{
  const idx = custDetail.indexOf("reason: t('customers.returnReason')");
  const before = custDetail.slice(Math.max(0, idx - 400), idx);
  check(has(before, 'price: returnUnit') && has(before, 'total: returnUnit * returnQty'), 'customer-detail يسجل price/total');
}

// ---------- 7. styles ----------
console.log('\n--- 7. الأنماط ---');
check(has(css, '.inv-return-note'), 'نمط .inv-return-note موجود');
check(has(css, '.inv-return-badge'), 'نمط .inv-return-badge موجود');
check(has(css, '.inv-print-hide { display: none !important; }'), 'إخفاء عناصر الشاشة عند الطباعة');

console.log('\n============================================');
console.log(`النتيجة: ${pass} نجاح، ${fail} فشل`);
console.log('============================================');
process.exit(fail === 0 ? 0 : 1);
