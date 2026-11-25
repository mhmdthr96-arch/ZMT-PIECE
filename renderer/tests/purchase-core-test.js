// ============================================================
// ZMT PIECE — purchase discounts & real cost (feature 5)
// Run: node renderer/tests/purchase-core-test.js
//
// Behavioural + static checks for:
//   • product discount THEN global discount (100 → 95 → 85.50)
//   • percentage and fixed-DA global discounts
//   • proportional allocation of a fixed amount + last-line remainder
//   • real cost helpers (productRealCost / itemCost)
//   • purchase UI/confirm wiring, smart split by real cost, print exclusion
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const base = path.join(__dirname, '..', '..') + path.sep;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (cond, m) => cond ? ok(m) : bad(m);
const eq = (a, b, m) => check(Math.abs(a - b) < 1e-9, m + ' (got ' + a + ', want ' + b + ')');
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const has = (s, n) => s.indexOf(n) !== -1;

const sandbox = { module: { exports: {} }, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('renderer/js/purchase-core.js'), sandbox);
const PC = sandbox.PurchaseCore || sandbox.module.exports;

console.log('\n--- 1. المسار 100 → 95 → 85.50 ---');
{
  const r = PC.compute([{ qty: 1, buyPrice: 100, purchaseDiscountPct: 5 }], 'percent', 10);
  eq(r.lines[0].productDiscount, 5, 'خصم المنتج = 5');
  eq(r.lines[0].afterProduct, 95, 'بعد خصم المنتج = 95');
  eq(r.lines[0].globalDiscount, 9.5, 'خصم الفاتورة = 9.50');
  eq(r.lines[0].realBuyPrice, 85.5, 'التكلفة الحقيقية = 85.50');
  eq(r.total, 85.5, 'إجمالي الفاتورة = 85.50');
  eq(r.globalDiscountAmount, 9.5, 'إجمالي خصم الفاتورة = 9.50');
  eq(r.subtotal, 95, 'الصافي قبل خصم الفاتورة = 95');
}

console.log('\n--- 2. الكمية تضرب التكلفة الحقيقية ---');
{
  const r = PC.compute([{ qty: 4, buyPrice: 100, purchaseDiscountPct: 5 }], 'percent', 10);
  eq(r.lines[0].realBuyPrice, 85.5, 'سعر الوحدة الحقيقي ثابت مع الكمية');
  eq(r.lines[0].realTotal, 342, 'تكلفة السطر = 4 × 85.50');
  eq(r.total, 342, 'الإجمالي = 342');
}

console.log('\n--- 3. نسبة افتراضية عند غياب الوضع ---');
{
  const r = PC.compute([{ qty: 1, buyPrice: 200 }], undefined, 25);
  check(r.mode === 'percent', 'الوضع الافتراضي نسبة مئوية');
  eq(r.total, 150, '200 − 25% = 150');
}

console.log('\n--- 4. خصم مبلغ ثابت موزّع بالتناسب ---');
{
  const items = [
    { qty: 1, buyPrice: 100 },
    { qty: 1, buyPrice: 300 },
  ];
  const r = PC.compute(items, 'amount', 40);
  eq(r.subtotal, 400, 'الصافي 400');
  eq(r.lines[0].globalDiscount, 10, 'السطر الأول 10 (25%)');
  eq(r.lines[1].globalDiscount, 30, 'السطر الثاني 30 (75%)');
  eq(r.globalDiscountAmount, 40, 'مجموع الخصم = 40 بالضبط');
  eq(r.total, 360, 'الإجمالي = 360');
}

console.log('\n--- 5. باقي التقريب على السطر الأخير ---');
{
  const items = [
    { qty: 1, buyPrice: 10 },
    { qty: 1, buyPrice: 10 },
    { qty: 1, buyPrice: 10 },
  ];
  const r = PC.compute(items, 'amount', 10);
  const sum = r.lines.reduce((s, l) => s + l.globalDiscount, 0);
  eq(sum, 10, 'مجموع التوزيع = 10 مهما كان التقريب');
  eq(r.lines[0].globalDiscount, 3.33, 'السطر 1 = 3.33');
  eq(r.lines[1].globalDiscount, 3.33, 'السطر 2 = 3.33');
  eq(r.lines[2].globalDiscount, 3.34, 'السطر الأخير يستوعب الباقي = 3.34');
  eq(r.total, 20, 'الإجمالي = 20');
}

console.log('\n--- 6. حدود الخصم ---');
{
  const r1 = PC.compute([{ qty: 1, buyPrice: 100 }], 'amount', 999);
  eq(r1.total, 0, 'المبلغ الثابت لا يتجاوز الصافي');
  const r2 = PC.compute([{ qty: 1, buyPrice: 100 }], 'percent', 150);
  eq(r2.total, 0, 'النسبة تُقصّ عند 100%');
  const r3 = PC.compute([{ qty: 1, buyPrice: 100, purchaseDiscountPct: -5 }], 'percent', -10);
  eq(r3.total, 100, 'القيم السالبة تُهمَل');
}

console.log('\n--- 7. تكلفة المنتج والدفعات ---');
{
  eq(PC.productRealCost({ buyPrice: 100, purchaseDiscountPct: 5, realBuyPrice: 85.5 }), 85.5, 'realBuyPrice المخزّن هو التكلفة');
  eq(PC.productRealCost({ buyPrice: 100, purchaseDiscountPct: 5 }), 95, 'بدون realBuyPrice يُطبّق خصم المنتج');
  eq(PC.productRealCost({ buyPrice: 100 }), 100, 'منتج قديم = سعر الشراء');
  eq(PC.itemCost({ costPrice: 80 }, { buyPrice: 100, realBuyPrice: 85.5 }), 80, 'لقطة البيع أولاً');
  eq(PC.itemCost({ realBuyPrice: 85.5 }, null), 85.5, 'ثم تكلفة سطر الشراء');
  eq(PC.itemCost({}, { buyPrice: 100, realBuyPrice: 85.5 }), 85.5, 'ثم تكلفة المنتج الحقيقية');
}

console.log('\n--- 8. واجهة فاتورة الشراء ---');
{
  const html = read('renderer/pages/invoices.html');
  check(has(html, 'id="purItemDisc"'), 'حقل «خصم الشراء %» في نموذج الشراء');
  check(has(html, 'id="purDiscModePct"') && has(html, 'id="purDiscModeAmt"'), 'زرّا الوضع % و DA');
  check(has(html, 'id="purDiscValue"'), 'حقل قيمة خصم الفاتورة');
  check(has(html, 'class="pur-disc-mode is-active" id="purDiscModePct"'), 'النسبة هي الافتراضي');
  check(has(html, 'id="purRevealBtn"'), 'زر كشف i');
  check(has(html, 'class="form-group pur-sensitive"'), 'التكلفة الحقيقية مخفية افتراضياً');

  const js = read('renderer/js/pages/invoices.js');
  check(has(js, "_purDiscountMode = 'percent'"), 'الوضع الافتراضي نسبة');
  check(has(js, 'PurchaseCore.compute(_purCart'), 'الحساب يتم عبر المحرك المشترك');
  check(has(js, 'realBuyPrice,'), 'تخزين التكلفة الحقيقية للوحدة');
  check(has(js, 'purchaseDiscountPct: item.purchaseDiscountPct || 0'), 'تمرير خصم المنتج إلى المخزون');
  check(has(js, 'purchaseDiscountMode: computed.mode'), 'حفظ وضع خصم الفاتورة');
  check(has(js, 'purchaseDiscountAmount: computed.globalDiscountAmount'), 'حفظ مبلغ خصم الفاتورة');
  check(has(js, "case 'KeyI'") || has(js, "e.code !== 'KeyI'"), 'مفتاح i مرتبط بالكشف');
}

console.log('\n--- 9. الفصل الذكي والتكلفة في الأرباح ---');
{
  const db = read('renderer/js/db.js');
  check(has(db, '_realCostOf(same) === _realCostOf(item)'), 'الفصل الذكي يقارن التكلفة الحقيقية');
  check(has(db, 'purchaseDiscountPct) || 0) === (parseFloat(item.purchaseDiscountPct)'), 'الفصل يقارن نسبة خصم المنتج');
  check(has(db, 'changes.realBuyPrice = _realCostOf(same)'), 'ترقية الصفوف القديمة بـ realBuyPrice');
  const core = read('renderer/js/sale-core.js');
  check(has(core, 'PurchaseCore.productRealCost(prod)'), 'لقطة البيع تستخدم التكلفة الحقيقية');
  const reports = read('renderer/js/pages/reports.js');
  check(has(reports, 'PurchaseCore.itemCost(line, prod)'), 'تقارير الأرباح تستخدم التكلفة الحقيقية');
  const net = read('renderer/js/pages/net-account.js');
  check(has(net, 'PurchaseCore.itemCost(it, prod)'), 'صافي الحساب يستخدم التكلفة الحقيقية');
  const cust = read('renderer/js/pages/customer-detail.js');
  check(has(cust, 'PurchaseCore.itemCost(item, prod)'), 'أرباح العميل تستخدم التكلفة الحقيقية');
}

console.log('\n--- 10. الطبع لا يُظهر التكلفة الحقيقية ويكشف الخصم عند الطلب فقط ---');
{
  const js = read('renderer/js/pages/invoices.js');
  check(has(js, 'inv-buy-sensitive inv-print-hide'), 'كتلة الخصم تحمل inv-print-hide');
  check(has(js, "querySelectorAll('.inv-print-hide, .inv-screen-only')"), 'كل نسخ الطبع تُنظّف العناصر المخفية');
  check(has(js, "querySelectorAll('.inv-print-only')"), 'نسخة الطبع تُظهر بديل الورق المخفي');
  check(has(js, 'Remise produits') && has(js, "printBasis === 'net'"), 'أسطر الخصم تُطبع مع نسخة «بعد الخصم» فقط');
  check(has(js, 'realBuyPrice') && has(js, 'inv-buy-reveal'), 'التكلفة الحقيقية تُكشف بمفتاح i فقط');
  const printFn = js.slice(js.indexOf('function buildInvoicePrintDocHTML'));
  check(has(printFn, 'stripInvPrintHidden(raw)'), 'بناء نسخة الطبع يزيل العناصر الحساسة');
}

console.log('\n============================================');
if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
else console.log('فشل ' + fail + ' من ' + (pass + fail));
console.log('============================================');
process.exit(fail === 0 ? 0 : 1);
