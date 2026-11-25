// ZMT PIECE — VENTE-COMPTOIR table reader (numbers + names)
// Run: node renderer/tests/smart-invoice-vente-table-verify.js
//
// Regression for the real photo (سند 002408): the generic full-page OCR read
// only 4 broken rows in 150s. The dedicated reader crops the table (names) and
// the numeric block (amounts), reads each with psm 4, then merges them by
// vertical position. These tests lock down the arithmetic and name rules that
// make the 11 rows reconcile with the printed totals (33 223 / 188 pieces).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const src = fs.readFileSync(path.join(base, 'renderer/js/invoice-ocr.js'), 'utf8');

const sandbox = {
  localStorage: { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } },
  console,
  URL: { createObjectURL: () => 'x', revokeObjectURL: () => {} },
  document: { createElement: () => ({}), head: { appendChild: () => {} } },
  fetch: async () => { throw new Error('no net'); },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
// Expose the internals without changing the public API.
const patched = src.replace(
  'window.InvoiceOCR = {',
  'window.__vente = { venteTriple, venteNumbersFromWords, cleanVenteName, venteNameFromWords, venteNameQuality, nearestByY }; window.InvoiceOCR = {');
vm.runInContext(patched, sandbox, { filename: 'invoice-ocr.js' });
const V = sandbox.__vente;

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const near = (a, b, m, eps) => check(Math.abs(a - b) <= (eps == null ? 0.01 : eps), m + ' (got ' + a + ', want ' + b + ')');

// --- The numeric lines exactly as the English psm-4 pass reads them --------
// [printed cells left→right: total, unit price, pieces, content]
const NUMERIC_ROWS = [
  { nums: [3420, 285, 12, 12], qty: 12, price: 285 },
  // OCR padded the printed total with zeros ("4000.00" -> "400000"); the
  // reader must recover qty x price = 4000, not swap qty/price.
  { nums: [400000, 2000, 2], qty: 2, price: 2000, total: 4000 },
  // OCR padded the printed total with zeros ("6600.00" -> "660000").
  { nums: [660000, 165, 40, 40], qty: 40, price: 165, total: 6600 },
  // price cell misread ("1 5.00" for 175): derive from total ÷ pieces.
  { nums: [5600, 1, 5, 32, 32], qty: 32, price: 175 },
  // Real photo row 5: the المجموع column printed "1 890.00" but reads as
  // "7890.00". 7890 ÷ 18 is not a whole number of cents, so that total is
  // impossible; the unit price column (105.00) is trusted instead.
  { nums: [7890, 105, 18, 18], qty: 18, price: 105, total: 1890 },
  { nums: [945, 105, 9, 9], qty: 9, price: 105 },
  // price cell misread ("4200" for 42.00).
  { nums: [1008, 4200, 24, 24], qty: 24, price: 42 },
  { nums: [1680, 70, 24, 24], qty: 24, price: 70 },
  { nums: [1560, 780, 2], qty: 2, price: 780 },
  { nums: [5040, 210, 24], qty: 24, price: 210 },
  { nums: [1480, 1480, 1, 1], qty: 1, price: 1480 },
];

let sum = 0, qty = 0;
NUMERIC_ROWS.forEach((row, i) => {
  const t = V.venteTriple(row.nums);
  check(!!t, 'row' + (i + 1) + ' yields a triple');
  if (!t) return;
  eq(t.qty, row.qty, 'row' + (i + 1) + ' quantity = pieces column');
  near(t.price, row.price, 'row' + (i + 1) + ' unit price');
  near(t.total, row.total != null ? row.total : row.nums[0], 'row' + (i + 1) + ' line total = printed total');
  near(t.qty * t.price, row.total != null ? row.total : row.nums[0], 'row' + (i + 1) + ' qty × price reproduces the printed total', 0.02);
  sum += t.total;
  qty += t.qty;
});
near(sum, 33223, 'all rows sum to the printed grand total 33 223', 0.01);
eq(qty, 188, 'all rows sum to the printed pieces count 188');

// --- Word-level number parsing -------------------------------------------
const words = (list) => list.map(([text, x]) => ({ text, bbox: { x0: x, x1: x + 0.03 } }));

const spaced = V.venteNumbersFromWords(words([
  ['3', 0.101], ['420.00', 0.141], ['285.00', 0.255], ['12', 0.347], ['12', 0.42],
]));
eq(JSON.stringify(spaced), JSON.stringify([3420, 285, 12, 12]), 'thousands split "3 420.00" re-joined');

// Tesseract sometimes returns a line right-to-left, sometimes left-to-right.
const reversed = V.venteNumbersFromWords(words([
  ['5600.00', 0.129], ['1:5.00', 0.254], ['32', 0.347], ['32', 0.422],
]));
eq(JSON.stringify(reversed), JSON.stringify([5600, 1, 5, 32, 32]), 'numeric cells sorted by x, not text order');
const t4 = V.venteTriple(reversed);
eq(t4 && t4.qty, 32, 'misread price row still resolves its quantity');
near(t4 && t4.price, 175, 'misread price row derives 5600 ÷ 32 = 175');

// --- Name extraction ------------------------------------------------------
eq(V.cleanVenteName('بابو كارووو باكي صغير ق -'), 'بابو كارووو باكي صغير', 'trailing lone letter + dash removed');
eq(V.cleanVenteName('2 إهابي JAS'), 'إهابي JAS', 'leading row number removed');
eq(V.cleanVenteName('شكولة بون قولا بار بيسطائن 4 24 24 70.00'), 'شكولة بون قولا بار بيسطائن', 'column digits removed from a name');
eq(V.cleanVenteName('أشيبس برينكيلز حجم صغير12'), 'أشيبس برينكيلز حجم صغير', 'trailing digits removed');
eq(V.cleanVenteName('كاطو نيتيلا ب-ريادي'), 'كاطو نيتيلا ب-ريادي', 'inner hyphen preserved');

// Arabic reads right to left: the right-most word comes first.
const nameWords = words([
  ['تويكس', 0.815], ['باكي', 0.764], ['32ق', 0.718], ['4', 0.49],
]);
eq(V.venteNameFromWords(nameWords, 0.55), 'تويكس باكي 32ق', 'name words joined right-to-left');

// --- Row alignment --------------------------------------------------------
const lines = [{ y: 0.24, text: 'a' }, { y: 0.28, text: 'b' }, { y: 0.32, text: 'c' }];
eq(V.nearestByY(lines, 0.281, 0.02) && V.nearestByY(lines, 0.281, 0.02).text, 'b', 'nearest line matched by y');
eq(V.nearestByY(lines, 0.5, 0.02), null, 'no match when the nearest row is too far');

console.log('============================================');
if (fail) { console.log('فشل — pass=' + pass + ' fail=' + fail); process.exit(1); }
console.log('كل الفحوص نجحت — pass=' + pass + ' fail=' + fail);
