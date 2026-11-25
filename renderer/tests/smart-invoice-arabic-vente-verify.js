// ZMT PIECE — Arabic VENTE-COMPTOIR invoice (golden from a real photo)
// Run: node renderer/tests/smart-invoice-arabic-vente-verify.js
//
// Regression: a handwritten-style Arabic counter invoice (11 products,
// boxes/content/pieces columns) was misread as "GAG 12 25 01 01/" with
// fractional quantities (2.541) and year-like prices (2026), and the summary
// boxes became product rows. The parser must now use the Arabic header,
// the pieces column, and the printed totals (33223 / 188 / 9) as anchors.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

const src = read('renderer/js/invoice-ocr.js');
const sandbox = {
  localStorage: { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } },
  console, URL: { createObjectURL: () => 'x', revokeObjectURL: () => {} },
  document: { createElement: () => ({}), head: { appendChild: () => {} } },
  fetch: async () => { throw new Error('no net'); },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'invoice-ocr.js' });
const OCR = sandbox.InvoiceOCR;

// The invoice from the photo: سند 002408, 01/08/2026, الوادي.
const EXPECT = [
  { name: 'شيبس برينكيز حجم صغير', qty: 12, price: 285 },
  { name: 'هابي كيدز 30', qty: 2, price: 2000 },
  { name: 'مارس 40', qty: 40, price: 165 },
  { name: 'شكولة تويكس باكي 32', qty: 32, price: 175 },
  { name: 'كندر ماكسي 18 حبة', qty: 18, price: 105 },
  { name: 'كندر كونتري T9', qty: 9, price: 105 },
  { name: 'بون قولا كوكاو صفراء', qty: 24, price: 42 },
  { name: 'شكولة بون قولا', qty: 24, price: 70 },
  { name: 'بابو كاروو باكي صغير 24', qty: 2, price: 780 },
  { name: 'شكونه بونتي 24', qty: 24, price: 210 },
  { name: 'كاطو نيتيلا', qty: 1, price: 1480 },
];

// Row-wise OCR (visual left→right order, as in the photo). Spaced thousands
// for the money columns, exactly like the printed "3 420.00".
const rowWise = [
  'VENTE-COMPTOIR : الزبون : الهاتف : العنوان',
  'سند رقم: 002408',
  'الوادي ، التاريخ : 01/08/2026 12:25:01',
  'الرقم الصنف العلب المحتوى القطع سعر الوحدة المجموع',
  '1 شيبس برينكيز حجم صغير 1 12 12 285.00 3 420.00',
  '2 هابي كيدز 30 2 2 000.00 4 000.00',
  '3 مارس 40 1 40 40 165.00 6 600.00',
  '4 شكولة تويكس باكي 32 1 32 32 175.00 5 600.00',
  '5 كندر ماكسي 18 حبة 1 18 18 105.00 1 890.00',
  '6 كندر كونتري T9 1 9 9 105.00 945.00',
  '7 بون قولا كوكاو صفراء 1 24 24 42.00 1 008.00',
  '8 شكولة بون قولا 1 24 24 70.00 1 680.00',
  '9 بابو كاروو باكي صغير 24 2 780.00 1 560.00',
  '10 شكونه بونتي 24 1 24 24 210.00 5 040.00',
  '11 كاطو نيتيلا 1 1 1 1 480.00 1 480.00',
  'مبلغ الوصل : 33 223.00',
  'عدد العلب 9',
  'عدد القطع 188',
  'الدين القديم : 0.00 مبلغ الوصل : 33 223.00 المبلغ المدفوع : 33 223.00 الدين الجديد : 0.00',
  'عزيزي الزبون تأكد من سلعتك عند التسليم و قبل المغادرة',
].join('\n');

const rows = OCR.parseRowsFromText(rowWise);
eq(rows.length, 11, 'VENTE invoice: exactly the 11 products (no date/summary rows)');
EXPECT.forEach((e, i) => {
  const r = rows[i];
  eq(r && r.name, e.name, 'VENTE row' + (i + 1) + ' name (no row-number / boxes pollution)');
  eq(r && r.qty, e.qty, 'VENTE row' + (i + 1) + ' qty = pieces column');
  eq(r && r.price, e.price, 'VENTE row' + (i + 1) + ' unit price (spaced thousands)');
  eq(r && r.verified, true, 'VENTE row' + (i + 1) + ' arithmetic verified');
});
if (rows.length === 11) {
  const sum = rows.reduce((s, r) => s + r.qty * r.price, 0);
  eq(sum, 33223, 'VENTE rows sum = printed مبلغ الوصل 33223');
  const qtySum = rows.reduce((s, r) => s + r.qty, 0);
  eq(qtySum, 188, 'VENTE qty sum = printed عدد القطع 188');
  check(rows.every((r) => Number.isInteger(r.qty)), 'no fractional quantities (no 2.541)');
  check(rows.every((r) => r.price !== 2026 && r.qty !== 2026), 'no year-like prices');
}

// Same invoice without the two empty columns for rows 2 and 9 (boxes/content
// blank) — already covered above, but also with the header split per line
// and the summary removed, the rows must survive headerless.
const headerless = rowWise
  .split('\n')
  .filter((l) => !/الرقم الصنف|مبلغ الوصل|عدد العلب|عدد القطع|الدين|عزيزي|VENTE|سند|التاريخ/.test(l))
  .join('\n');
const rowsHL = OCR.parseRowsFromText(headerless);
eq(rowsHL.length, 11, 'VENTE headerless: still 11 products');
if (rowsHL.length === 11) {
  eq(rowsHL[0].qty, 12, 'VENTE headerless row1 qty');
  eq(rowsHL[0].price, 285, 'VENTE headerless row1 price');
  eq(rowsHL[10].price, 1480, 'VENTE headerless row11 price (1 480 spaced thousands)');
}

// Fully reversed RTL output (total first): still arithmetic-checked.
const reversed = [
  'المجموع سعر الوحدة القطع المحتوى العلب الصنف الرقم',
  '3 420.00 285.00 12 12 1 شيبس برينكيز حجم صغير 1',
  '4 000.00 2 000.00 2 هابي كيدز 30 2',
  '1 480.00 1 480.00 1 1 1 كاطو نيتيلا 11',
].join('\n');
const rowsRev = OCR.parseRowsFromText(reversed);
eq(rowsRev.length, 3, 'VENTE reversed RTL: 3 products');
if (rowsRev.length === 3) {
  eq(rowsRev[0].qty, 12, 'VENTE reversed row1 qty');
  eq(rowsRev[0].price, 285, 'VENTE reversed row1 price');
  eq(rowsRev[2].qty, 1, 'VENTE reversed row3 qty');
  eq(rowsRev[2].price, 1480, 'VENTE reversed row3 price');
}

// The exact garbage the old engine produced must never become rows.
const garbage = [
  'VENTE-COMPTOIR : الزبون',
  'الرقم الصنف العلب المحتوى القطع سعر الوحدة المجموع',
  'GAG 12 25 01 01/',
  'fe 2.75 4',
  'EE Se nn ie 0.103 223',
  'del fle 0.049 223',
  'sal dal 0.843 223',
  'مبلغ الوصل : 33 223.00',
].join('\n');
const rowsGarbage = OCR.parseRowsFromText(garbage);
check(rowsGarbage.every((r) => !/GAG|del fle|sal dal/i.test(r.name)), 'old OCR garbage never becomes products');
check(rowsGarbage.every((r) => Number.isInteger(r.qty) && r.qty !== 2026), 'no fractional/year quantities from garbage');

// Summary total leaking as a product ("مسد" + total) must be dropped.
const leaked = [
  'الرقم الصنف العلب المحتوى القطع سعر الوحدة المجموع',
  '1 شيبس برينكيز حجم صغير 1 12 12 285.00 3 420.00',
  'مبلغ الوصل : 33 223.00',
  'مسد',
  'مسد 5 33223',
  '33223',
].join('\n');
const rowsLeaked = OCR.parseRowsFromText(leaked);
eq(rowsLeaked.length, 1, 'leaked summary total is not a product');
if (rowsLeaked.length === 1) {
  eq(rowsLeaked[0].qty, 12, 'leaked-summary surviving row qty');
  eq(rowsLeaked[0].price, 285, 'leaked-summary surviving row price');
}

// Exact raw OCR text from the user's photo (2026-11-07). Digit misreads are
// preserved on purpose: the parser must recover every row it can from this
// text alone and never invent fractional/year quantities.
const userRaw = [
  'VENTE-COMPTOIR : الزبون',
  'سند رقم:002408',
  'الواديء 12:25:01-01/08/2026 :التاريخ',
  'الرقم الت On العلب | المحتوى]| القطع | سعر الوحدةالمجموع',
  'a) | شهبص Sa حجم صكير 4 | 12 | 12 | 295.0030',
  '| 2 أهابي كيدز 2ق 330 2 ]2000.00 |4000.00',
  '| * أمارس GAD 1 | 40 | 40 | 165.00 |660000',
  '4 أشكولة تويكس باكي 332 1 32 32 175.00 600.005',
  'ا 5 أكندر ماكسي 18حبة 4 | 18 18 1600 01',
  '& |19 كندر كونتري .9 9 105.00 945.00 ,9ار',
  '7 |أبون قولا كوكاو صفراء 4 | 2 | 24 | 4200 | ا0',
  '8 |إشكولة بون قولا بار بيسطاش aes 1 NS 24 = 70.00',
  'seh] * كارووو باكي صغير 24 ee eeeإن',
  '0 | شكودة بونتي .24 د 4 | 24 24 | 2040.00—',
  'الل أكاطو نيتيلا ب-ريادي 1 1 1 ]1480.00 | 1480.001',
  'مبلغ الوصل : 33 223.00',
  'عدد القطع 188 المبلغ المدفوع : 223.0033',
  'الدين الجديد :0.00',
].join('\n');
const rowsUser = OCR.parseRowsFromText(userRaw);
eq(rowsUser.length, 9, 'user raw text: 9 recoverable products (2 need numeric retry)');
const userExpect = [
  [12, 295.003], [2, 2000], [40, 165], [32, 175], [18, 16],
  [9, 105], [24, 42], [24, 70], [1, 1480],
];
userExpect.forEach((e, i) => {
  const r = rowsUser[i];
  eq(r && r.qty, e[0], 'user raw row' + (i + 1) + ' qty');
  check(r && Math.abs((r.price || 0) - e[1]) < 0.01, 'user raw row' + (i + 1) + ' price (got ' + (r && r.price) + ')');
});
check(rowsUser.every((r) => Number.isInteger(r.qty)), 'user raw: all quantities integer');
check(rowsUser.every((r) => r.qty * r.price <= 33223 * 1.05), 'user raw: no line exceeds the printed total');

// OCR must try the bundled Arabic data (offline) — no cloud, no CDN.
check(/ara\+eng/.test(src), 'OCR candidates include bundled ara+eng (offline)');
check(!/vision\.googleapis\.com/.test(src), 'no Google Vision endpoint in OCR source');
check(!/cdn\.jsdelivr\.net/.test(src), 'no CDN fallback — OCR runs fully offline');

// Preview grid must offer copy buttons (rows + raw text) for diagnosis.
const smartSrc = read('renderer/js/pages/invoices-smart.js');
check(/copySmartRows/.test(smartSrc), 'preview has a copy-rows button');
check(/copySmartRaw/.test(smartSrc), 'preview has a copy-raw-text button');
check(/navigator\.clipboard/.test(smartSrc), 'copy uses clipboard with fallback');

console.log('\n============================================');
if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
