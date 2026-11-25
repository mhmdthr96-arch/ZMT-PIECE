// ============================================================
// ZMT PIECE — Supplier payment amount colour verifier
// Run: node renderer/tests/payment-amount-color-verify.js
//
// Confirmed boundaries: empty/0 = no colour, (0,5000] green,
// (5000,50000) yellow, [50000,500000) orange, [500000,∞) red.
// Only #sdPayAmount (the «تسجيل دفعة للمورد» modal) is coloured.
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
console.log('اختبار ألوان مبلغ دفعة المورد');
console.log('============================================');

const js = read('renderer/js/pages/supplier-detail.js');
const html = read('renderer/pages/supplier-detail.html');
const css = read('renderer/css/main.css');

/* --------------------------------------------- 1) static wiring -------- */
section('1) ربط الحقل');
check(html.includes('class="form-input no-spinner sd-pay-amount" id="sdPayAmount"'), 'حقل الدفعة يحمل الصنف الجديد');
check(html.includes('oninput="updateSdPayAmountColor(this)"'), 'تحديث اللون عند كل إدخال');
eq((html.match(/updateSdPayAmountColor\(this\)/g) || []).length, 1, 'حقل واحد فقط مُلوَّن (زر إضافة دفعة)');
check(!/id="sdPayInvoiceAmount"[^>]*updateSdPayAmountColor/.test(html), 'حقل دفع الفاتورة لم يُلوَّن');
check(!/id="sdEditPayAmount"[^>]*updateSdPayAmountColor/.test(html), 'حقل تعديل الدفعة لم يُلوَّن');
check(js.includes('updateSdPayAmountColor(document.getElementById(\'sdPayAmount\'));'), 'إعادة ضبط اللون عند فتح النافذة');
for (const cls of ['pay-green', 'pay-yellow', 'pay-orange', 'pay-red']) {
  check(css.includes('.sd-pay-amount.' + cls), 'صنف CSS ' + cls);
  check(css.includes('html[data-theme="dark"] .sd-pay-amount.' + cls), 'نسخة الوضع الداكن ' + cls);
}

/* --------------------------------------------- 2) real function -------- */
section('2) الحدود الفاصلة (الدالة الحقيقية)');
const sandbox = {
  console, localStorage: { getItem() { return null; }, setItem() {} },
  document: {
    getElementById() { return null; },
    head: { appendChild() {} },
    createElement() { return { style: {}, setAttribute() {} }; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
  },
  setTimeout, clearTimeout, setInterval, clearInterval,
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(js, sandbox, { filename: 'supplier-detail.js' });

const tier = sandbox.sdPayAmountTier;
const cases = [
  ['', ''], [null, ''], ['0', ''], ['0.00', ''], ['   ', ''], ['-5', ''], ['abc', ''],
  ['1', 'pay-green'], ['5000', 'pay-green'], ['5000.00', 'pay-green'],
  ['5000.01', 'pay-yellow'], ['12000', 'pay-yellow'], ['49999.99', 'pay-yellow'],
  ['50000', 'pay-orange'], ['123456', 'pay-orange'], ['499999.99', 'pay-orange'],
  ['500000', 'pay-red'], ['750000', 'pay-red'], ['1 000 000', 'pay-red'],
];
for (const [input, expected] of cases) eq(tier(input), expected, 'المبلغ ' + JSON.stringify(input));

/* --------------------------------------------- 3) DOM behaviour -------- */
section('3) تطبيق الأصناف على العنصر');
function fakeInput() {
  const classes = new Set();
  return {
    value: '',
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      contains(c) { return classes.has(c); },
      list() { return [...classes]; },
    },
  };
}
const input = fakeInput();
input.value = '50000';
sandbox.updateSdPayAmountColor(input);
eq(input.classList.list().join(','), 'pay-orange', '50000 ⇒ برتقالي فقط');
input.value = '500000';
sandbox.updateSdPayAmountColor(input);
eq(input.classList.list().join(','), 'pay-red', '500000 ⇒ أحمر فقط (يُزال البرتقالي)');
input.value = '';
sandbox.updateSdPayAmountColor(input);
eq(input.classList.list().length, 0, 'إفراغ الحقل ⇒ بلا لون');
input.value = '0';
sandbox.updateSdPayAmountColor(input);
eq(input.classList.list().length, 0, 'الصفر ⇒ بلا لون');

console.log('\n============================================');
console.log('PASS=' + pass + '  FAIL=' + fail);
console.log('============================================');
process.exit(fail ? 1 : 0);
