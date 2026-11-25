/**
 * ZMT PIECE - اختبار المحرك المشترك للبيع (sale-core)
 *
 * يختبر هذا الملف عقدة التشغيل المشتركة التي يستخدمها سطح المكتب (sales.js)
 * والبيع عبر الهاتف (phone-sale-service.js) حتى لا يتباعد المساران أبداً:
 *   1. computeSale  — الحساب النقي (indiscriminate/sum/خصم/بروتا)
 *   2. executeSale  — التسلسل الكامل للكتابة (مخزون ← فاتورة ← دفع ← خصوم ← أرصدة ← تسوية مورد)
 *   3. allocateQty  — توزيع الكمية FIFO عبر الدفعات/الثابت
 *   4. قوائم i18n   — كل المفاتيح المستعملة موجودة في اللغات الأربع
 */

const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;
const results = [];

function assert(cond, msg) {
  if (cond) { testsPassed++; results.push(`  ok ${msg}`); }
  else { testsFailed++; results.push(`  FAIL ${msg}`); }
}
function assertEq(actual, expected, msg) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (pass) { testsPassed++; results.push(`  ok ${msg}`); }
  else { testsFailed++; results.push(`  FAIL ${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
}

// ===================================================================
// قاعدة بيانات وهمية مطابقة لعقد db.js المستعملة في المسارين
// ===================================================================
function makeDB(products, customers, suppliers) {
  const state = {
    products: products || [],
    customers: customers || [],
    suppliers: suppliers || [],
    invoices: [],
    payments: [],
    discounts: [],
    invSeq: 0,
  };
  return {
    state,
    getProducts: () => state.products,
    getProduct: (id) => state.products.find(p => p.id === id),
    getCustomer: (id) => state.customers.find(c => c.id === id),
    getCustomers: () => state.customers,
    getSuppliers: () => state.suppliers,
    saveSuppliers: (list) => { state.suppliers = list; },
    saveCustomers: (list) => { state.customers = list; },
    updateProductsBatch: (updates) => {
      for (const u of updates) {
        const p = state.products.find(x => x.id === u.id);
        if (p) p.quantity = u.changes.quantity;
      }
    },
    addInvoice: (inv) => {
      state.invSeq++;
      const rec = Object.assign({ id: 'INV' + state.invSeq, invoiceNumber: 'A-000' + state.invSeq }, inv);
      state.invoices.push(rec);
      return rec;
    },
    addPayment: (pmt) => { state.payments.push(Object.assign({ id: 'P' + (state.payments.length + 1) }, pmt)); },
    addDiscount: (d) => { state.discounts.push(d); },
    updateInvoice: (id, changes) => { const inv = state.invoices.find(x => x.id === id); if (inv) Object.assign(inv, changes); },
  };
}

const SaleCore = require('../js/sale-core.js');

console.log('============================================');
console.log('اختبار sale-core — المحرك المشترك للبيع');
console.log('============================================\n');

// ---- computeSale -----------------------------------------------------------

console.log('--- computeSale: حساب نقي ---');
{
  const db = makeDB([
    { id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 100 },
    { id: 'a2', name: 'OIL', barcode: '200', quantity: 5, buyPrice: 50, createdAt: 200 },
  ]);
  const res = SaleCore.computeSale(db, {
    lines: [
      { entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 2, price: 150 }], lineDiscount: 0 },
      { entries: [{ productId: 'a2', name: 'OIL', barcode: '200', qty: 1, price: 90 }], lineDiscount: 0 },
    ],
    customerDiscountPct: 0,
    extraDiscount: 0,
  });
  assertEq(res.ok, true, 'ok');
  assertEq(res.subTotal, 390, 'المجموع قبل الخصم 390');
  assertEq(res.totalAmount, 390, 'الإجمالي النهائي 390');
  assertEq(res.custDiscAmount, 0, 'لا خصم عميل');
  assertEq(res.extraDiscAmount, 0, 'لا خصم إضافي');
  assertEq(res.totalProfit, (150 - 100) * 2 + (90 - 50), 'الربح الإجمالي');
  assertEq(res.invoiceItems.length, 2, 'بندان في الفاتورة');
  assertEq(res.productUpdates.length, 2, 'تحديثان للمخزون');
}

console.log('--- computeSale: خصم عميل % + خصم إضافي محدود ---');
{
  const db = makeDB([
    { id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 100 },
  ]);
  const res = SaleCore.computeSale(db, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 10, price: 150 }], lineDiscount: 0 }],
    customerDiscountPct: 10,
    extraDiscount: 5000,
  });
  assertEq(res.subTotal, 1500, 'المجموع 1500');
  assertEq(res.custDiscAmount, 150, 'خصم عميل 10% = 150');
  assertEq(res.afterCustDisc, 1350, 'بعد خصم العميل');
  assertEq(res.extraDiscAmount, 1350, 'الخصم الإضافي محدود إلى الإجمالي (1350)');
  assertEq(res.totalAmount, 0, 'الإجمالي صفر');
  // البروتا: كل الخصم على البند الوحيد
  assertEq(res.invoiceItems[0].price, 0, 'السعر النهائي الصافي صفر');
}

console.log('--- computeSale: بروتا الخصم عبر عدة بنود ---');
{
  const db = makeDB([
    { id: 'a1', name: 'X', barcode: '1', quantity: 10, createdAt: 1 },
    { id: 'a2', name: 'Y', barcode: '2', quantity: 10, createdAt: 2 },
  ]);
  const res = SaleCore.computeSale(db, {
    lines: [
      { entries: [{ productId: 'a1', name: 'X', barcode: '1', qty: 1, price: 100 }], lineDiscount: 0 },
      { entries: [{ productId: 'a2', name: 'Y', barcode: '2', qty: 1, price: 300 }], lineDiscount: 0 },
    ],
    customerDiscountPct: 10,
    extraDiscount: 20,
  });
  assertEq(res.subTotal, 400, 'المجموع 400');
  assertEq(res.custDiscAmount, 40, 'خصم عميل 40');
  assertEq(res.totalLineDiscount, 0, 'لا خصم خطوط');
  assertEq(res.totalAmount, 340, 'الإجمالي 400-40-20');
  // بند X يستحق 1/4 من خصم العميل، بند Y يستحق 3/4
  assertEq(res.invoiceItems[0].discount, 10 + 5, 'خصم بند X = 10 عميل + 5 إضافي');
  assertEq(res.invoiceItems[1].discount, 30 + 15, 'خصم بند Y = 30 عميل + 15 إضافي');
  assertEq(res.invoiceItems[0].price, 85, 'سعر X الصافي 85');
  assertEq(res.invoiceItems[1].price, 255, 'سعر Y الصافي 255');
}

console.log('--- computeSale: فشل STOCK ---');
{
  const db = makeDB([
    { id: 'a1', name: 'BRK', barcode: '100', quantity: 2, createdAt: 1 },
  ]);
  const res = SaleCore.computeSale(db, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 5, price: 150 }], lineDiscount: 0 }],
  });
  assertEq(res.ok, false, 'فشل');
  assertEq(res.error.code, 'STOCK', 'رمز STOCK');
  assertEq(res.error.available, 2, 'المتوفر 2');
  assertEq(res.error.qty, 5, 'المطلوب 5');
}

// ---- executeSale -----------------------------------------------------------

console.log('\n--- executeSale: بيع كاش كامل لعميل ---');
{
  const db = makeDB(
    [{ id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 1 }],
    [{ id: 'c1', name: 'أحمد', balance: 0 }],
    []
  );
  const res = SaleCore.executeSale(db, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 2, price: 150 }], lineDiscount: 0 }],
    customerId: 'c1',
    pay: { method: 'cash', total: 300 },
    seller: 'أحمد (u1)',
    sellerDevice: 'phone-1',
  }, {});
  assertEq(res.ok, true, 'نجاح');
  assertEq(res.invoice.items.length, 1, 'بند واحد بالفاتورة');
  assertEq(res.invoice.customerId, 'c1', 'معرّف العميل');
  assertEq(res.invoice.seller, 'أحمد (u1)', 'البائع مسجّل');
  assertEq(res.invoice.sellerDevice, 'phone-1', 'جهاز البيع مسجّل');
  assertEq(res.remaining, 0, 'لا باقي');
  assertEq(db.state.products[0].quantity, 8, 'المخزون 10-2');
  assertEq(db.state.payments.length, 1, 'دفعة واحدة');
  assertEq(db.state.payments[0].method, 'cash', 'طريقة الدفع كاش');
  assertEq(db.state.customers[0].balance, 0, 'رصيد العميل بلا تغيير (دفع كامل)');
}

console.log('--- executeSale: note للفاتورة (تمرير/تقليم/تجاهل) ---');
{
  const db = makeDB(
    [{ id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 1 }],
    [{ id: 'c1', name: 'أحمد', balance: 0 }],
    []
  );
  const longNote = 'طاولة 5 — من: نادل' + 'x'.repeat(320);
  const res = SaleCore.executeSale(db, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 1, price: 150 }], lineDiscount: 0 }],
    customerId: 'c1',
    pay: { method: 'cash', total: 150 },
    note: '   طاولة 5 — من: نادل   ',
  }, {});
  assertEq(res.invoice.note, 'طاولة 5 — من: نادل', 'note مقطّع من الطرفين');
  assertEq(db.state.invoices[0].note, 'طاولة 5 — من: نادل', 'note مخزّن في الفاتورة');

  const db2 = makeDB(
    [{ id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 1 }],
    [{ id: 'c1', name: 'أحمد', balance: 0 }],
    []
  );
  const res2 = SaleCore.executeSale(db2, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 1, price: 150 }], lineDiscount: 0 }],
    customerId: 'c1',
    pay: { method: 'cash', total: 150 },
    note: longNote,
  }, {});
  assertEq(res2.invoice.note.length, 300, 'note مقطوعة إلى 300 محرفًا');

  const db3 = makeDB(
    [{ id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 1 }],
    [{ id: 'c1', name: 'أحمد', balance: 0 }],
    []
  );
  const res3 = SaleCore.executeSale(db3, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 1, price: 150 }], lineDiscount: 0 }],
    customerId: 'c1',
    pay: { method: 'cash', total: 150 },
  }, {});
  assertEq(res3.invoice.note, undefined, 'لا note = بلا ملاحظة');
}

console.log('--- executeSale: بيع جزئي مع رصيد ---');
{
  const db = makeDB(
    [{ id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 1 }],
    [{ id: 'c1', name: 'أحمد', balance: -200 }],
    []
  );
  const res = SaleCore.executeSale(db, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 2, price: 150 }], lineDiscount: 0 }],
    customerId: 'c1',
    pay: { method: 'ccp', total: 100 },
    creditUsed: 200,
  }, {});
  assertEq(res.ok, true, 'نجاح');
  assertEq(res.creditUsed, 200, 'رصيد 200 (≤ الإجمالي 300)');
  assertEq(res.remaining, 0, '300-100-200 = 0');
  assertEq(db.state.payments[0].method, 'ccp', 'دفع ccp');
  assertEq(db.state.customers[0].balance, 0, 'الرصيد -200 + (300-100) = 0 بعد استهلاك الرصيد');
  assertEq(db.state.discounts.length, 0, 'لا خصوم مسجلة');
}

console.log('--- executeSale: خصومات عميل/إضافي/خطوط تُسجَّل ---');
{
  const db = makeDB(
    [{ id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 1 }],
    [{ id: 'c1', name: 'أحمد', balance: 0 }],
    []
  );
  const res = SaleCore.executeSale(db, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 2, price: 150 }], lineDiscount: 50 }],
    customerId: 'c1',
    customerDiscountPct: 10,
    extraDiscount: 30,
    pay: { method: 'cash', total: 190 },
  }, {});
  // 300 - 30(عميل) - 30(إضافي) - 50(خط) = 190
  assertEq(res.totalAmount, 190, 'الإجمالي 190');
  assertEq(db.state.discounts.length, 3, 'ثلاثة سجلات خصم');
  const types = db.state.discounts.map(d => d.type).sort();
  assertEq(types, ['Remise client', 'Remise ligne', 'Remise manuelle'], 'أنواع الخصومات الافتراضية');
  assertEq(db.state.discounts[0].amount, 30, 'خصم العميل 30');
}

console.log('--- executeSale: دفع أكبر من الإجمالي (PAID_EXCEEDS) ---');
{
  const db = makeDB(
    [{ id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 1 }],
    [{ id: 'c1', name: 'أحمد', balance: 0 }],
    []
  );
  const res = SaleCore.executeSale(db, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 1, price: 150 }], lineDiscount: 0 }],
    pay: { method: 'cash', total: 500 },
  }, {});
  assertEq(res.ok, false, 'فشل');
  assertEq(res.error.code, 'PAID_EXCEEDS', 'رمز PAID_EXCEEDS');
  assertEq(db.state.invoices.length, 0, 'لا فاتورة أُنشئت');
}

console.log('--- executeSale: بيع لمورد (sup_sale) بتسوية رصيد ---');
{
  const db = makeDB(
    [{ id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 1 }],
    [],
    [{ id: 's1', name: 'شركة السلام', balance: 1000 }]
  );
  const res = SaleCore.executeSale(db, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 2, price: 150 }], lineDiscount: 0 }],
    supMode: true,
    supplierId: 's1',
    customerDiscountPct: 0,
    pay: { method: 'cash', total: 0 },
  }, {});
  assertEq(res.ok, true, 'نجاح');
  assertEq(res.invoice.type, 'sup_sale', 'نوع الفاتورة sup_sale');
  assertEq(db.state.suppliers[0].balance, 700, 'رصيد المورد 1000-300');
  assertEq(res.invoice.supExpense, 300, 'مصروف مورد 300');
  assertEq(res.invoice.supNetDue, 0, 'لا دين جديد (كان الرصيد يكفي)');
  assertEq(res.invoice.supDebtBefore, 1000, 'الديون قبل 1000');
  assertEq(db.state.payments.length, 1, 'دفعة مصروف مورد');
  assertEq(db.state.payments[0].isSupSaleExpense, true, 'علامة مصروف البيع للمورد');
  assertEq(db.state.discounts.length, 0, 'لا خصومات في supSale');
}

console.log('--- executeSale: sup_sale بدين جديد (رصيد غير كافٍ) ---');
{
  const db = makeDB(
    [{ id: 'a1', name: 'BRK', barcode: '100', quantity: 10, buyPrice: 100, createdAt: 1 }],
    [],
    [{ id: 's1', name: 'شركة السلام', balance: 100 }]
  );
  const res = SaleCore.executeSale(db, {
    lines: [{ entries: [{ productId: 'a1', name: 'BRK', barcode: '100', qty: 4, price: 300 }], lineDiscount: 0 }],
    supMode: true,
    supplierId: 's1',
    pay: { method: 'cash', total: 0 },
  }, {});
  assertEq(res.totalAmount, 1200, 'الإجمالي 1200');
  assertEq(res.invoice.supExpense, 100, 'المصروف محصور بالدين السابق 100');
  assertEq(res.invoice.supNetDue, 1100, 'الدين الجديد 1100');
  assertEq(db.state.suppliers[0].balance, -1100, 'رصيد المورد 100-1200');
}

// ---- allocateQty -----------------------------------------------------------

console.log('\n--- allocateQty: توزيع FIFO عبر الدفعات ---');
{
  const db = makeDB([
    { id: 'a1', name: 'Z', barcode: '77', quantity: 5, buyPrice: 10, createdAt: 100 },
    { id: 'a2', name: 'Z', barcode: '77', quantity: 3, buyPrice: 11, createdAt: 200 },
  ]);
  const r = SaleCore.allocateQty(db, { name: 'Z', barcode: '77', qty: 6, price: 150 });
  assertEq(r.entries.length, 2, 'دُفعتان');
  assertEq(r.entries[0].productId, 'a1', 'الأقدم أولاً (a1)');
  assertEq(r.entries[0].qty, 5, 'a1 يغطي 5');
  assertEq(r.entries[1].qty, 1, 'a2 يغطي 1');
  assertEq(r.shortQty, 0, 'لا نقص');
  assertEq(r.baseTotal, 6 * 150, 'المجموع 900');

  const r2 = SaleCore.allocateQty(db, { name: 'Z', barcode: '77', qty: 10, price: 150 });
  assertEq(r2.qty, 8, 'الكامل 8');
  assertEq(r2.shortQty, 2, 'نقص 2');
  assertEq(r2.recordCount, 2, 'عداد الدفعات');
}

console.log('--- allocateQty: منتج غير محدود (fixed) ---');
{
  const db = makeDB([
    { id: 'f1', name: 'FLAT', barcode: '1', quantity: 0, fixed: true, createdAt: 1 },
  ]);
  const r = SaleCore.allocateQty(db, { name: 'FLAT', barcode: '1', qty: 999, price: 50 });
  assertEq(r.qty, 999, 'غير محدود يغطي الكمية');
  assertEq(r.anyFixed, true, 'رصد fixed');
  assertEq(r.shortQty, 0, 'لا نقص');
}

console.log('--- allocateQty: بحث بالمعرّف ---');
{
  const db = makeDB([
    { id: 'x1', name: 'A', barcode: '1', quantity: 4, createdAt: 1 },
  ]);
  const r = SaleCore.allocateQty(db, { productId: 'x1', qty: 2, price: 9 });
  assertEq(r.entries[0].productId, 'x1', 'حسب productId');
  assertEq(r.qty, 2, 'الكمية 2');
}

// ---- i18n ------------------------------------------------------------------

console.log('\n--- i18n: المفاتيح في اللغات الأربع ---');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '..', 'js', 'phone-sale-service.js'), 'utf8');
  const used = [...new Set(Array.from(service.matchAll(/t\('([^']+)'\)/g), m => m[1]))];
  assert(used.length >= 7, `الخدمة تستعمل ${used.length} مفاتيح`);
  for (const key of used) {
    const short = key.split('.').pop();
    const count = (src.match(new RegExp('\\b' + short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:', 'g')) || []).length;
    assert(count >= 4, `مفتاح ${key} موجود في اللغات الأربع (${count})`);
  }
  const psaleKeys = ['psaleCard', 'psaleDesc', 'psaleEnable', 'psaleEnabled', 'psaleDisabled', 'psaleRunning', 'psalePaused', 'psaleStep1', 'psaleStep2', 'psaleStep3', 'psaleStep4', 'scannerSell', 'scannerSellTitle'];
  for (const k of psaleKeys) {
    const count = (src.match(new RegExp('\\b' + k + '\\s*:', 'g')) || []).length;
    assert(count >= 4, `connection.${k} في اللغات الأربع (${count})`);
  }
}

// ===================================================================
// النتائج النهائية
// ===================================================================
console.log('\n============================================');
console.log('النتائج النهائية');
console.log('============================================');
results.forEach(r => console.log(r));
console.log(`\nنجح: ${testsPassed}  فشل: ${testsFailed}  المجموع: ${testsPassed + testsFailed}`);
console.log('============================================\n');

if (testsFailed > 0) process.exit(1);