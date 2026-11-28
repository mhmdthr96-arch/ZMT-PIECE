// ============================================================
// ZMT PIECE — Customer tree verifier
// Run: node renderer/tests/customer-tree-verify.js
//
// Guards the single-ledger invariant: a sub-customer is a LABEL on the
// parent's invoice/payment, never a second account and never a second
// balance movement. Also checks the settings flag, F5, printing and UI.
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

console.log('============================================');
console.log('اختبار شجرة العملاء — دفتر واحد بلا تضاعف دفعات');
console.log('============================================');

const ctSrc = read('renderer/js/customer-tree.js');
const indexHtml = read('renderer/index.html');
const settingsHtml = read('renderer/pages/settings.html');
const settingsJs = read('renderer/js/pages/settings.js');
const appJs = read('renderer/js/app.js');
const salesJs = read('renderer/js/pages/sales.js');
const salesHtml = read('renderer/pages/sales.html');
const saleCoreSrc = read('renderer/js/sale-core.js');
const invoicesJs = read('renderer/js/pages/invoices.js');
const invoicesHtml = read('renderer/pages/invoices.html');
const custDetailJs = read('renderer/js/pages/customer-detail.js');
const custDetailHtml = read('renderer/pages/customer-detail.html');
const customersJs = read('renderer/js/pages/customers.js');
const debtsJs = read('renderer/js/pages/debts.js');
const debtsHtml = read('renderer/pages/debts.html');
const pmSrc = read('renderer/js/lib/party-movements.js');
const thermalSrc = read('renderer/js/thermal-print.js');
const shortcutsSrc = read('renderer/js/shortcuts.js');
const cssSrc = read('renderer/css/main.css');

/* ------------------------------------------------ 1) static wiring -------- */
section('1) الربط الثابت والافتراضي مطفأ');
check(indexHtml.includes('src="js/customer-tree.js"'), 'الوحدة المشتركة محمّلة في index.html');
check(indexHtml.indexOf('js/customer-tree.js') < indexHtml.indexOf('js/app.js'), 'الوحدة قبل app.js');
check(settingsHtml.includes('id="settingsCustomerTree"'), 'خيار شجرة العملاء في الإعدادات');
check(settingsHtml.includes('data-i18n="settings.customerTree"'), 'عنوان الخيار مترجم');
check(settingsJs.includes("localStorage.getItem('zmt_customer_tree') === '1'"), 'القراءة: غياب المفتاح = مطفأ');
check(settingsJs.includes("localStorage.setItem('zmt_customer_tree', cTreeSaveEl && cTreeSaveEl.checked ? '1' : '0')"), 'الحفظ في saveSettings');
check(settingsJs.includes("localStorage.setItem('zmt_customer_tree', cTreeEl.checked ? '1' : '0')"), 'حفظ فوري عند تغيير المفتاح');
check(ctSrc.includes("KEY = 'zmt_customer_tree'"), 'مفتاح localStorage مشترك');
check(ctSrc.includes("typeof DB !== 'undefined'"), 'الوحدة تقرأ DB كمتغير عام (const) لا كخاصية window فقط');
check(!ctSrc.includes('return (typeof global.DB !=='), 'لم يبقَ الاعتماد على window.DB وحده');
for (const word of ['شجرة العملاء', 'Customer tree', 'Arborescence des clients', '客户树']) {
  check(appJs.includes(word), 'ترجمة: ' + word);
}
eq((appJs.match(/'customerTree\.title':/g) || []).length, 4, 'مفتاح customerTree.title في اللغات الأربع');
eq((appJs.match(/'customerTree\.printLabel':/g) || []).length, 4, 'مفتاح customerTree.printLabel في اللغات الأربع');
eq((appJs.match(/'customerTree\.saveFailed':/g) || []).length, 4, 'مفتاح customerTree.saveFailed في اللغات الأربع');
check(ctSrc.includes('function persistChildren('), 'حفظ مُتحقَّق منه في الوحدة');
check(ctSrc.includes('saved.children.length === kids.length'), 'إعادة القراءة بعد الحفظ تمنع النجاح الكاذب');
check(ctSrc.includes('function addChildEx('), 'واجهة addChildEx التفصيلية موجودة');
check(ctSrc.includes('addChildEx: addChildEx,'), 'addChildEx مُصدَّر');
check(ctSrc.includes('function selectInvoiceChild('), 'اختيار ابن الفاتورة في نافذة الدفع موجود');
check(ctSrc.includes('selectInvoiceChild: selectInvoiceChild,'), 'selectInvoiceChild مُصدَّر');
for (const code of ['disabled', 'noDB', 'noParent', 'emptyName', 'persist']) {
  check(ctSrc.includes("error: '" + code + "'"), 'رمز الخطأ: ' + code);
}
check(salesJs.includes('window.CustomerTree.addChildEx('), 'صفحة البيع تستخدم addChildEx');
check(custDetailJs.includes('window.CustomerTree.addChildEx('), 'تفاصيل العميل تستخدم addChildEx');
check(salesJs.includes("res.error === 'noParent'") && salesJs.includes("t('customerTree.saveFailed')"), 'البيع يفرّق بين غياب الأب وفشل الحفظ');
check(custDetailJs.includes("res.error === 'noParent'") && custDetailJs.includes("t('customerTree.saveFailed')"), 'تفاصيل العميل تفرّق بين غياب الأب وفشل الحفظ');
check(!salesJs.includes("if (!created) { alert(t('customerTree.nameRequired')); return; }"), 'البيع لم يعد يعرض «الاسم مطلوب» لكل فشل');

/* --------------------------------------------- 2) module behaviour ------- */
section('2) سلوك الوحدة (الميزة مطفأة ثم مفعّلة)');
function makeSandbox(on) {
  const store = {};
  if (on) store.zmt_customer_tree = '1';
  const sandbox = {
    console,
    localStorage: { getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setItem(k, v) { store[k] = String(v); } },
    Date, Math, JSON, Uint8Array,
    setTimeout, clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function makeDB() {
  const state = {
    customers: [{ id: 'A', name: 'Parent A', balance: 0, children: [] }],
    invoices: [], payments: [], seq: 0,
  };
  return {
    state,
    getProduct: (id) => state.products.find(p => p.id === id),
    getCustomers: () => state.customers,
    getCustomer: (id) => state.customers.find(c => c.id === id),
    saveCustomers: (list) => { state.customers = list; },
    updateCustomer: (id, changes) => {
      const c = state.customers.find(x => x.id === id);
      if (c) Object.assign(c, changes);
      return c;
    },
    addInvoice: (inv) => {
      const rec = Object.assign({ id: 'I' + (++state.seq) }, inv);
      state.invoices.push(rec);
      return rec;
    },
    getInvoicePaidAmount: (id) => state.payments.filter(p => p.invoiceId === id).reduce((s, p) => s + p.amount, 0),
    addPayment: (p) => { state.payments.push(Object.assign({ id: 'P' + (state.payments.length + 1) }, p)); },
  };
}

function loadTree(sandbox, DB) {
  sandbox.DB = DB;
  vm.runInContext(ctSrc, sandbox, { filename: 'customer-tree.js' });
  return sandbox.CustomerTree;
}

{
  const s = makeSandbox(false);
  const DB = makeDB();
  const T = loadTree(s, DB);
  check(T && typeof T.enabled === 'function', 'الوحدة تُصدّر CustomerTree');
  eq(T.enabled(), false, 'الافتراضي مطفأ');
  eq(T.childrenOf('A').length, 0, 'مطفأة: لا أبناء');
  eq(T.addChild('A', { name: 'C' }), null, 'مطفأة: لا إنشاء وسم');
  eq(Object.keys(T.metaFor({ id: 'x', name: 'C' })).length, 0, 'مطفأة: لا وسم في الكائنات');
  eq(T.noteFor({ id: 'x', name: 'C' }, { name: 'A' }), '', 'مطفأة: لا ملاحظة فرنسية');
  eq(DB.state.customers[0].children.length, 0, 'مطفأة: لم يُلمس سجل العميل');
}
{
  const s = makeSandbox(true);
  const DB = makeDB();
  const T = loadTree(s, DB);
  eq(T.enabled(), true, 'مفعّلة');
  eq(T.addChild('A', { name: '   ' }), null, 'الاسم الإجباري يمنع الحفظ');
  const c = T.addChild('A', { name: '  C  ', phone: '0555', address: 'Alger' });
  check(!!c && c.name === 'C', 'تم إنشاء الاسم بعد تقليمه');
  eq(DB.state.customers[0].children.length, 1, 'الابن يُحفظ داخل العميل A');
  eq(DB.state.customers.length, 1, 'لم يُنشأ عميل جديد للابن');
  const n = T.addChild('A', { name: 'N' });
  const d = T.addChild('A', { name: 'D' });
  eq(T.childrenOf('A').length, 3, 'مستوى واحد: C/N/D');
  // Nested children are deliberately dropped: one level only.
  DB.state.customers[0].children[0].children = [{ id: 'G', name: 'Grandchild' }];
  eq(T.childrenOf('A').filter(k => k.name === 'Grandchild').length, 0, 'لا أجيال متداخلة');
  const found = T.findChild(c.id);
  eq(found.parentId, 'A', 'findChild يعيد الأب');
  eq(found.name, 'C', 'findChild يعيد الاسم');
  const meta = T.metaFor(c, DB.getCustomer('A'));
  eq(meta.subCustomerId, c.id, 'وسم subCustomerId');
  eq(meta.subCustomerName, 'C', 'وسم subCustomerName');
  eq(meta.parentCustomerName, 'Parent A', 'وسم parentCustomerName');
  eq(T.noteFor(c, DB.getCustomer('A')), 'Cette facture est destinée à C, envoyée par Parent A.', 'الجملة الفرنسية');
  check(T.noteFor(c, DB.getCustomer('A')).endsWith('.'), 'الجملة تنتهي بنقطة');
  // Child debt derived from unpaid invoices only, never from separate sums.
  const i1 = DB.addInvoice({ customerId: 'A', subCustomerId: c.id, type: 'customer', totalAmount: 1000, paidAmount: 0 });
  const i2 = DB.addInvoice({ customerId: 'A', subCustomerId: n.id, type: 'customer', totalAmount: 500, paidAmount: 0 });
  DB.addInvoice({ customerId: 'A', type: 'payment', subCustomerId: c.id, totalAmount: 100 }); // voucher ignored
  eq(T.childRawDebt(DB.state.invoices, c.id, DB), 1000, 'دين الابن من فواتيره غير المدفوعة فقط');
  DB.state.payments.push({ invoiceId: i1.id, amount: 400 });
  eq(T.childRawDebt(DB.state.invoices, c.id, DB), 600, 'دفعة جزئية تنقص دين الابن');
  DB.getCustomer('A').balance = 900;
  const debts = T.childDebts(DB.getCustomer('A'), [c, n, d], DB.state.invoices, DB);
  eq(Math.round((debts[c.id] + debts[n.id] + debts[d.id]) * 100) / 100, 900, 'مجموع ديون الأبناء لا يتجاوز رصيد الأب');
  DB.getCustomer('A').balance = 0;
  const settled = T.childDebts(DB.getCustomer('A'), [c, n, d], DB.state.invoices, DB);
  eq(settled[c.id], 0, 'تسوية A تُخفي دين C تلقائياً');
  eq(settled[n.id], 0, 'تسوية A تُخفي دين N تلقائياً');
  eq(T.removeChild('A', c.id), true, 'إزالة الوسم');
  eq(DB.state.customers[0].children.length, 2, 'أُزيل الوسم فقط');
  eq(DB.state.invoices.filter(x => x.subCustomerId === c.id && x.type === 'customer').length, 1, 'فاتورة الابن بقيت محفوظة');
  eq(DB.state.invoices.filter(x => x.subCustomerId === c.id).length, 2, 'سند قبض الابن بقي محفوظاً');
  const sel = { value: n.id, innerHTML: '' };
  const kids = T.childrenOf('A');
  check(kids.length === 2, 'بقيا N و D');
}

/* -------------------------- 2b) verified save + definite errors ---------- */
section('2b) حفظ مُتحقَّق منه ورسائل خطأ محددة (إصلاح F5)');
{
  const s = makeSandbox(true);
  const DB = makeDB();
  const T = loadTree(s, DB);
  let r = T.addChildEx('A', { name: '   ' });
  eq(r.ok, false, 'addChildEx: الاسم الفارغ يُرفض');
  eq(r.error, 'emptyName', 'addChildEx: رمز الاسم الفارغ');
  r = T.addChildEx('MISSING', { name: 'C' });
  eq(r.ok, false, 'addChildEx: الأب المفقود يُرفض');
  eq(r.error, 'noParent', 'addChildEx: رمز الأب المفقود');
  r = T.addChildEx('A', { name: '  C  ', phone: '0555' });
  eq(r.ok, true, 'addChildEx: حفظ ناجح');
  eq(r.child.name, 'C', 'addChildEx: الابن المُعاد');
  eq(DB.state.customers[0].children.length, 1, 'addChildEx: الوسم كُتب فعلاً');
}
{
  const s = makeSandbox(true);
  const T = loadTree(s, null);
  eq(T.addChildEx('A', { name: 'C' }).error, 'noDB', 'addChildEx بلا قاعدة بيانات');
}
{
  const s = makeSandbox(false);
  const DB = makeDB();
  const T = loadTree(s, DB);
  eq(T.addChildEx('A', { name: 'C' }).error, 'disabled', 'addChildEx والميزة مطفأة');
}
{
  // updateCustomer returns null without writing and saveCustomers throws:
  // the old code reported success here; now every path reports 'persist'.
  const s = makeSandbox(true);
  s.console = { warn() {}, log() {}, error() {} }; // expected failure: keep output clean
  const state = { customers: [{ id: 'A', name: 'A', children: [] }] };
  const DB = {
    getCustomers: () => state.customers,
    getCustomer: (id) => state.customers.find(c => c.id === id),
    updateCustomer: () => null,
    saveCustomers: () => { throw new Error('IDB down'); },
  };
  const T = loadTree(s, DB);
  const r = T.addChildEx('A', { name: 'C' });
  eq(r.ok, false, 'فشل الحفظ لا يُبلَّغ كنجاح');
  eq(r.error, 'persist', 'addChildEx: رمز فشل الحفظ');
  eq(state.customers[0].children.length, 0, 'لم يُكتب وسم عند الفشل');
  eq(T.addChild('A', { name: 'C' }), null, 'الواجهة القديمة تُعيد null عند الفشل');
  eq(T.updateChild('A', 'x', { name: 'C' }), null, 'تعديل الابن يفشل صراحةً');
  eq(T.removeChild('A', 'x'), false, 'إزالة الابن تفشل صراحةً');
}
{
  // saveCustomers fallback when updateCustomer is unavailable.
  const s = makeSandbox(true);
  const state = { customers: [{ id: 'A', name: 'A', children: [] }] };
  const DB = {
    getCustomers: () => state.customers,
    getCustomer: (id) => state.customers.find(c => c.id === id),
    saveCustomers: (list) => { state.customers = list; },
  };
  const T = loadTree(s, DB);
  const r = T.addChildEx('A', { name: 'C' });
  eq(r.ok, true, 'بديل saveCustomers يعمل عند غياب updateCustomer');
  eq(state.customers[0].children.length, 1, 'saveCustomers كتب الوسم فعلاً');
}
{
  // A hidden by a stale scope in getCustomers() is still found via getCustomer().
  const s = makeSandbox(true);
  const state = { customers: [{ id: 'A', name: 'A', children: [] }] };
  const DB = {
    getCustomers: () => [],
    getCustomer: (id) => state.customers.find(c => c.id === id),
    updateCustomer: (id, changes) => { Object.assign(state.customers[0], changes); return state.customers[0]; },
    saveCustomers: () => {},
  };
  const T = loadTree(s, DB);
  const r = T.addChildEx('A', { name: 'C' });
  eq(r.ok, true, 'getCustomer fallback يجد الأب المُفلتر');
  eq(state.customers[0].children.length, 1, 'الحفظ نجح مع الأب المُفلتر');
}
{
  // A payment opened from an existing invoice must start on that child.
  const s = makeSandbox(true);
  const DB = makeDB();
  const T = loadTree(s, DB);
  const c = T.addChild('A', { name: 'C' });
  const n = T.addChild('A', { name: 'N' });
  const sel = { value: 'stale', innerHTML: '' };
  T.fillSelect(sel, 'A', tNone());
  eq(sel.value, '', 'fillSelect يبدأ بـ«بدون زبون تابع» للسندات العامة');
  eq(T.selectInvoiceChild(sel, { subCustomerId: c.id }, 'A'), c.id, 'فاتورة C تُحدد C في نافذة الدفع');
  eq(sel.value, c.id, 'الاختيار الفعلي للمؤشر يساوي C');
  T.selectInvoiceChild(sel, { subCustomerName: 'N' }, 'A');
  eq(sel.value, n.id, 'فاتورة قديمة باسم الابن فقط تُحدد الابن الصحيح');
  T.selectInvoiceChild(sel, { subCustomerId: 'removed', subCustomerName: 'Gone' }, 'A');
  eq(sel.value, '', 'وسم محذوف لا يُحدد اسماً غير موجود');
  T.selectInvoiceChild(sel, { subCustomerId: c.id }, 'A');
  const off = makeSandbox(false);
  const TOff = loadTree(off, makeDB());
  eq(TOff.selectInvoiceChild({ value: 'x' }, { subCustomerId: c.id }, 'A'), '', 'الميزة مطفأة: لا تحديد');
}
function tNone() { return 'بدون زبون تابع'; }

{
  // Exact browser shape: db.js declares top-level `const DB`, a global LEXICAL
  // binding that never becomes window.DB. The old window-only lookup produced
  // «noDB» in the real app although this same DB worked everywhere else.
  const s = makeSandbox(true);
  const stub = makeDB();
  s.__DBStub = stub;
  vm.runInContext('const DB = this.__DBStub;', s, { filename: 'db.js' });
  check(s.DB === undefined, 'DB المعرَّف بـ const ليس خاصية window (محاكاة المتصفح)');
  vm.runInContext(ctSrc, s, { filename: 'customer-tree.js' });
  const T = s.CustomerTree;
  const r = T.addChildEx('A', { name: 'C' });
  eq(r.ok, true, 'إصلاح noDB: الوحدة تجد DB في شكل المتصفح الحقيقي');
  eq(r.error, undefined, 'لا رمز خطأ بعد الإصلاح');
  eq(stub.state.customers[0].children.length, 1, 'الحفظ نجح فعلاً في شكل المتصفح');
}

/* ---------------------------------------- 3) single-ledger sale ---------- */
section('3) البيع: فاتورة واحدة ودين واحد على الأب');
{
  const sandbox = makeSandbox(true);
  const DB = makeDB();
  DB.state.products = [{ id: 'p1', name: 'P', barcode: '1', quantity: 10, buyPrice: 10, createdAt: 1 }];
  DB.updateProductsBatch = (updates) => { updates.forEach(u => { const p = DB.state.products.find(x => x.id === u.id); if (p) p.quantity = u.changes.quantity; }); };
  DB.getSuppliers = () => [];
  DB.saveSuppliers = () => {};
  DB.addDiscount = () => {};
  const T = loadTree(sandbox, DB);
  const child = T.addChild('A', { name: 'C' });
  const meta = T.metaFor(child, DB.getCustomer('A'));
  const note = T.noteFor(child, DB.getCustomer('A'));
  const oldWindow = global.window;
  global.window = { CustomerTree: T, localStorage: sandbox.localStorage };
  try {
    const SaleCore = require('../js/sale-core.js');
    const res = SaleCore.executeSale(DB, {
      lines: [{ entries: [{ productId: 'p1', name: 'P', barcode: '1', qty: 2, price: 100 }], lineDiscount: 0 }],
      customerId: 'A',
      subCustomer: child,
      note,
      pay: { method: 'cash', total: 50 },
    }, { fullPayment: 'كامل', partialPayment: 'جزئي' });
    eq(res.ok, true, 'نجح البيع');
    const inv = res.invoice;
    eq(inv.customerId, 'A', 'customerId يبقى الأب A');
    eq(inv.subCustomerId, child.id, 'فاتورة موسومة بالابن');
    eq(inv.subCustomerName, 'C', 'نسخة تاريخية لاسم الابن في الفاتورة');
    eq(inv.parentCustomerName, 'Parent A', 'نسخة تاريخية لاسم الأب');
    eq(inv.note, note, 'الملاحظة الفرنسية محفوظة في الفاتورة');
    eq(DB.state.payments.length, 1, 'دفعة واحدة فقط');
    eq(DB.state.payments[0].customerId, 'A', 'الدفعة على الأب، لا على C');
    eq(DB.state.payments[0].subCustomerName, 'C', 'الدفعة موسومة بالابن عرضاً فقط');
    eq(DB.state.customers.length, 1, 'لا حساب للابن');
    eq(DB.state.customers[0].balance, 150, 'الدين 200-50 = 150 مرة واحدة على A');
    eq(DB.state.customers[0].id, 'A', 'صاحب الرصيد هو A');
    check(!('children' in inv) && !('payments' in inv), 'لا حقول مالية إضافية في الفاتورة');
  } finally {
    global.window = oldWindow;
  }
}
{
  // Flag OFF with a stale subCustomer: sale-core must ignore it entirely.
  const sandbox = makeSandbox(false);
  const DB = makeDB();
  DB.state.products = [{ id: 'p1', name: 'P', barcode: '1', quantity: 10, buyPrice: 10, createdAt: 1 }];
  DB.updateProductsBatch = () => {};
  DB.getSuppliers = () => []; DB.saveSuppliers = () => {}; DB.addDiscount = () => {};
  loadTree(sandbox, DB);
  const oldWindow = global.window;
  global.window = { CustomerTree: sandbox.CustomerTree, localStorage: sandbox.localStorage };
  try {
    const SaleCore = require('../js/sale-core.js');
    const res = SaleCore.executeSale(DB, {
      lines: [{ entries: [{ productId: 'p1', name: 'P', barcode: '1', qty: 1, price: 100 }], lineDiscount: 0 }],
      customerId: 'A',
      subCustomer: { id: 'stale', name: 'C' },
      pay: { method: 'cash', total: 100 },
    }, {});
    eq(res.ok, true, 'الميزة مطفأة: البيع يتم');
    eq(res.invoice.subCustomerId, undefined, 'مطفأة: لا وسم في الفاتورة');
    eq(DB.state.payments[0].subCustomerId, undefined, 'مطفأة: لا وسم في الدفعة');
  } finally { global.window = oldWindow; }
}

/* ------------------------------------- 4) F5 and checkout wiring --------- */
section('4) F5 وربط البيع');
check(salesJs.includes("if (e.key === 'F5' || e.code === 'F5')"), 'F5 داخل معالج صفحة البيع');
check(salesJs.indexOf("e.key === 'F5'") < salesJs.indexOf('const inScanField'), 'F5 قبل حاجز الحقول (يعمل أثناء المسح)');
check(salesJs.includes('openSalesSubCustomerModal();'), 'F5 يفتح نافذة الشجرة');
check(salesJs.includes("alert(t('customerTree.noParent'))"), 'F5 بلا عميل: رسالة توضيحية');
check(salesJs.includes('var _salesSubCustomerId = null;'), 'حالة الابن منفصلة عن _salesCustomerId');
check(!/F5/.test(shortcutsSrc.replace(/2F5/g, '')), 'لا ربط F5 عامّ يلغي التحديث في بقية الصفحات');
check(salesJs.includes('subCustomer: subCustomer,'), 'الابن يُمرَّر إلى SaleCore');
check(salesJs.includes("note: ([subNote, _salesInvoiceNoteText()].filter(Boolean).join('\\n')) || undefined,"), 'الملاحظة الفرنسية تُمرَّر إلى SaleCore أولاً');
check(salesJs.includes("filter(Boolean).join('\\n')) || undefined"), 'ملاحظة فاتورة فارغة لا تضيف سطراً ولا تغيّر السلوك السابق');
for (const fn of ['setSalesWalkin()', 'clearSalesCustomer()', 'openSupSaleMode()', 'selectSalesCustomer(id)', 'confirmSalesTransfer()']) {
  const i = salesJs.indexOf('function ' + fn);
  check(i >= 0 && salesJs.indexOf('_resetSalesSubCustomer();', i) > i && salesJs.indexOf('_resetSalesSubCustomer();', i) < i + 400,
    'تصفير الابن في ' + fn);
}
check(salesJs.includes('chosen.parentId) === String(_salesCustomerId)'), 'حاجز أخير: الابن يجب أن يتبع الأب الحالي');
check(salesHtml.includes('id="salesSubCustomerModal"'), 'نافذة اختيار الابن موجودة');
check(salesHtml.includes('id="sscName"'), 'حقل الاسم الإجباري');
check(salesHtml.includes('id="sscPhone"') && salesHtml.includes('id="sscAddress"'), 'الهاتف والعنوان اختياريان');
check(salesJs.includes("if (!name) {"), 'تحقق من الاسم قبل الحفظ');
check(saleCoreSrc.includes('...subMeta,') && saleCoreSrc.includes('...payMeta,'), 'SaleCore يضيف الوسوم فقط');
check(!/customerId:\s*subMeta/.test(saleCoreSrc), 'لا customerId من الابن');
check(saleCoreSrc.includes('customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + (totalAmount - paidAmount)'), 'كتابة الرصيد الأصلية واحدة');
eq((saleCoreSrc.match(/DB\.addPayment\(pmt\)/g) || []).length, 1, 'استدعاء addPayment واحد في SaleCore');
eq((saleCoreSrc.match(/DB\.saveCustomers\(customers\)/g) || []).length, 1, 'حفظ رصيد واحد في SaleCore');

/* ---------------------------------- 5) payments / vouchers tagging ------- */
section('5) الدفعات وسندات القبض');
check(invoicesHtml.includes('id="payInvSubCustomer"'), 'اختيار الابن في سند القبض');
check(invoicesHtml.includes('id="invPaySubCustomer"'), 'اختيار الابن في دفع الفاتورة');
check(custDetailHtml.includes('id="cdPaySubCustomer"'), 'اختيار الابن في دفع فاتورة تفاصيل العميل');
check(debtsHtml.includes('id="debtPaySubCustomer"'), 'اختيار الابن في صفحة الديون');
for (const [src, name] of [[invoicesJs, 'invoices.js'], [custDetailJs, 'customer-detail.js'], [debtsJs, 'debts.js']]) {
  check(src.includes('metaFromSelect('), name + ': يقرأ وسم الابن');
  check(src.includes('...ctMeta,'), name + ': يضيف الوسم دون تغيير customerId');
}
for (const [src, name] of [[invoicesJs, 'invoices.js'], [custDetailJs, 'customer-detail.js'], [debtsJs, 'debts.js']]) {
  check(src.includes('selectInvoiceChild(ctSel, inv,'), name + ': نافذة الدفع تفتح على ابن الفاتورة');
}
check(custDetailJs.includes('inv.subCustomerName || inv.subCustomerId'), 'تفاصيل فاتورة العميل تعرض اسم الابن');
check(custDetailJs.includes('class="ct-tree-note"'), 'شارة الابن داخل تفاصيل الفاتورة منسّقة');
check(invoicesJs.includes("type: 'payment',") && invoicesJs.includes("{ payment: true }"), 'سند القبض ما زال حركة واحدة');
check(!/customerId:\s*ctMeta/.test(invoicesJs + custDetailJs + debtsJs), 'لا عميل بـ ctMeta');

/* --------------------------------------------- 6) printing --------------- */
section('6) اسم الابن في الفاتورة عند الطباعة');
check(salesJs.includes('inv.subCustomerName || inv.subCustomerId'), 'معاينة البيع تعرض الاسم');
check(salesJs.includes("t('customerTree.printLabel')"), 'عنوان Client secondaire في الطباعة');
check(salesJs.indexOf('Customer tree: historical sub-customer snapshot') < salesJs.indexOf('<!-- Items Table -->'), 'السطر داخل منطقة الطباعة قبل جدول المواد');
check(invoicesJs.includes('inv.subCustomerName || inv.subCustomerId'), 'بطاقة الفاتورة تعرض الاسم');
check(invoicesJs.includes('class="ct-tree-note"'), 'تفاصيل/طباعة الفاتورة تعرض الاسم');
check(thermalSrc.includes('Client secondaire:'), 'الورقة الحرارية تعرض الاسم');
check(ctSrc.includes("noteFor"), 'الجملة الفرنسية مولّدة مركزياً');

/* -------------------------------------------------- 7) UI surfaces ------- */
section('7) واجهات العملاء والحركات');
check(customersJs.includes("navigateToCustomer('${c.id}', 'children')"), 'زر الزبائن التابعون في قائمة العملاء');
check(custDetailHtml.includes('id="cdSubCustomersModal"'), 'نافذة الزبائن التابعين في تفاصيل العميل');
check(custDetailHtml.includes('id="cdSubCustomersBtn"'), 'زر الزبائن التابعين في تفاصيل العميل');
check(custDetailJs.includes('function renderCdSubCustomers()'), 'عرض فواتير/ديون/دفعات الابن');
check(custDetailJs.includes('function cdConfirmChildVoucher('), 'سند قبض للابن بدفتر الأب');
check(custDetailJs.includes('function cdRemoveSubCustomer('), 'إزالة الوسم مع بقاء السجل');
check(pmSrc.includes('subCustomerName: inv.subCustomerName'), 'حركة الفاتورة تحمل وسم العرض');
check(pmSrc.includes('subCustomerName: p.subCustomerName'), 'حركة الدفعة تحمل وسم العرض');
check(pmSrc.includes('pmp-ct-chip'), 'شارة الابن في سطر الحركة');
check(pmSrc.includes('pmp-ct-badge'), 'شارة الأبناء في بطاقة العميل');
eq((pmSrc.match(/subCustomerName:/g) || []).length, 2, 'حقل العرض فقط في حركتين (Invoice + Payment)');
check(pmSrc.includes("subCustomerName: inv.subCustomerName || ''") && pmSrc.includes("subCustomerName: p.subCustomerName || ''"), 'لا قيمة مالية للابن في الحركة');
check(cssSrc.includes('.ct-pick-row.is-picked'), 'تنسيق نافذة الاختيار');
check(cssSrc.includes('.ct-tree-note'), 'تنسيق سطر الطباعة');

console.log('\n============================================');
console.log('PASS ' + pass + '  FAIL ' + fail + '  TOTAL ' + (pass + fail));
console.log('============================================');
process.exit(fail ? 1 : 0);
