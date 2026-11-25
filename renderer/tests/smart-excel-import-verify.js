// ============================================================
// ZMT PIECE — Smart Add: Excel invoice reader verifier
// Run: node renderer/tests/smart-excel-import-verify.js
//
// Guards:
//   1. .xlsx/.xls/.csv are accepted next to PDF/images;
//   2. runSmartAddInvoice reads spreadsheets through FileParsers, NOT OCR;
//   3. Arabic / French / English column titles map to name/qty/price/reference;
//   4. the resulting rows feed the existing _smartRows → openSmartEdit grid.
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
console.log('اختبار قراءة فواتير Excel في الإضافة الذكية');
console.log('============================================');

const src = read('renderer/js/pages/invoices-smart.js');

/* --------------------------------------------- 1) static wiring -------- */
section('1) ربط الملف والقارئ');
check(src.includes('.xlsx,.xlsm,.xls,.csv'), 'قائمة الملفات تقبل Excel و CSV');
check(src.includes('id="smartFile"'), 'حقل اختيار الملف ما زال موجوداً');
check(src.includes('SmartExcel.isSpreadsheet(file.name)'), 'runSmartAddInvoice يكتشف نوع الجدول');
check(src.indexOf('if (isSheet) {') < src.indexOf('var res = await InvoiceOCR.ocrFile'),
  'فرع الجدول يعمل قبل محرك OCR');
check(src.includes('await FileParsers.parseExcel(buffer)'), 'يستخدم FileParsers.parseExcel الجاهز');
check(src.includes('await FileParsers.parseCSV(buffer)'), 'ملفات CSV تمر عبر parseCSV');
check(src.includes('SmartExcel.rowsFromParsed(parsed)'), 'تحويل النتيجة إلى صفوف فاتورة');
check(src.includes('_smartRows = sheet.rows;'), 'الصفوف تُحقن في شبكة الإضافة الذكية');
check(src.includes('openSmartEdit();'), 'نفس نافذة المعاينة تُفتح بعد القراءة');
check(src.includes('var res = await InvoiceOCR.ocrFile'), 'مسار OCR الأصلي ما زال موجوداً');
check(src.includes('if (isSheet && (!window.FileParsers'), 'رسالة خاصة إن كان قارئ الجداول غير محمّل');

/* --------------------------------------------- 2) real module ---------- */
section('2) خريطة العناوين والتحويل (الوحدة الحقيقية)');
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
  AbortController: class {}, FileReader: class {},
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'invoices-smart.js' });

const X = sandbox.SmartExcel;
check(!!X, 'window.SmartExcel مُصدَّر');
eq(X.isSpreadsheet('facture.XLSX'), true, 'امتداد Excel كبير يُكتشف');
eq(X.isSpreadsheet('facture.csv'), true, 'امتداد CSV يُكتشف');
eq(X.isSpreadsheet('scan.png'), false, 'الصورة لا تُعامل كجدول');
eq(X.isSpreadsheet('scan.pdf'), false, 'PDF لا يُعامل كجدول');

eq(X.normalizeHeader('Référence'), 'reference', 'إزالة اللهجة الفرنسية');
eq(X.normalizeHeader('السّعر'), 'السعر', 'إزالة التشكيل العربي');
eq(X.normalizeHeader('Quantité'), 'quantite', 'توحيد الحروف');

function map(headers) {
  const m = X.mapHeaders(headers);
  return Object.keys(m).sort().map((k) => k + ':' + m[k]).join(',');
}
const fr = ['Référence', 'Désignation', 'Quantité', 'Prix unitaire'];
eq(map(fr), 'name:1,price:3,qty:2,reference:0', 'عناوين فرنسية واضحة');
const ar = ['المرجع', 'المنتج', 'الكمية', 'سعر الشراء'];
eq(map(ar), 'name:1,price:3,qty:2,reference:0', 'عناوين عربية واضحة');
const en = ['Reference', 'Product', 'Qty', 'Price'];
eq(map(en), 'name:1,price:3,qty:2,reference:0', 'عناوين إنجليزية واضحة');
const mixed = ['المرجع', 'Produit', 'Qté', 'السعر'];
eq(map(mixed), 'name:1,price:3,qty:2,reference:0', 'عناوين مختلطة');
check(X.mapHeaders(['Prix de vente']).sell === 0, 'سعر البيع لا يُخطأ فيُقرأ سعر شراء');
check(X.mapHeaders(['السعر الادنى']).minPrice === 0, 'السعر الأدنى يُربط بحقله');

/* --------------------------------------------- 3) rows ----------------- */
section('3) تحويل صفوف Excel إلى صفوف فاتورة');
const parsed = {
  headers: ['المرجع', 'المنتج', 'الكمية', 'السعر'],
  rows: [
    { 'المرجع': 'REF-1', 'المنتج': 'قطعة غيار', 'الكمية': '٢', 'السعر': '130,50' },
    {},
    { 'المرجع': 'REF-2', 'المنتج': 'منتج ثانٍ', 'الكمية': 3, 'السعر': '1.200,00' },
  ],
};
const out = X.rowsFromParsed(parsed);
eq(out.missing.length, 0, 'كل الأعمدة الأساسية موجودة');
eq(out.rows.length, 2, 'الصف الفارغ يُتجاهل');
eq(out.rows[0].name, 'قطعة غيار', 'اسم المنتج العربي');
eq(out.rows[0].qty, 2, 'رقم عربي هندي → 2');
eq(out.rows[0].price, 130.5, 'فاصلة فرنسية → 130.50');
eq(out.rows[0].reference, 'REF-1', 'المرجع محفوظ');
eq(out.rows[0].verified, true, 'صفوف Excel موثوقة بلا تحقق OCR');
eq(out.rows[1].qty, 3, 'كمية رقمية');
eq(out.rows[1].price, 1200, 'نقطة الآلاف + فاصلة الكسور');

const frOut = X.rowsFromParsed({
  headers: fr,
  rows: [{ 'Référence': 'F-9', 'Désignation': 'Plaquette', 'Quantité': '4', 'Prix unitaire': '15,75' }],
});
eq(frOut.rows.length, 1, 'صف فرنسي واحد');
eq(frOut.rows[0].name, 'Plaquette', 'Désignation → اسم المنتج');
eq(frOut.rows[0].price, 15.75, 'سعر فرنسي');

const missing = X.rowsFromParsed({ headers: ['ملاحظة'], rows: [{ 'ملاحظة': 'لا شيء' }] });
check(missing.missing.includes('name') && missing.missing.includes('price'), 'أعمدة مفقودة تُبلَّغ');

console.log('\n============================================');
console.log('PASS=' + pass + '  FAIL=' + fail);
console.log('============================================');
process.exit(fail ? 1 : 0);
