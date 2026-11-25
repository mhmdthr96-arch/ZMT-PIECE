// ZMT PIECE — Smart Add invoice formats verify (FR first, 4 columns)
// Run: node renderer/tests/smart-invoice-formats-verify.js
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

check(OCR && typeof OCR.parseRowsFromText === 'function', 'parser is exported');

// ---- 4-column FR matrix: Total is always the last column; the other three
// ---- (name / qty / unit price) appear in all six possible orders.
const PRODUCTS = [
  { name: 'Audit de sécurité', qty: 1, price: 500, total: 500 },
  { name: 'Formation équipe IT', qty: 2, price: 300, total: 600 },
  { name: 'Maintenance serveur', qty: 3, price: 150, total: 450 },
];
const money = (v) => v.toFixed(2).replace('.', ',') + ' €';
const LABEL = { name: 'Désignation', qty: 'Quantité', price: 'Prix unitaire HT', total: 'Total HT' };
const PERMS = [
  ['name', 'qty', 'price'],
  ['qty', 'name', 'price'],
  ['name', 'price', 'qty'],
  ['price', 'name', 'qty'],
  ['qty', 'price', 'name'],
  ['price', 'qty', 'name'],
];

function checkRows(rows, expect, label) {
  eq(rows.length, expect.length, label + ': row count');
  if (rows.length !== expect.length) return;
  expect.forEach((e, i) => {
    eq(rows[i].name, e.name, label + ' row' + (i + 1) + ' name');
    eq(rows[i].qty, e.qty, label + ' row' + (i + 1) + ' qty');
    eq(rows[i].price, e.price, label + ' row' + (i + 1) + ' price');
  });
}

function verifyInvoice(text, expect, label) {
  checkRows(OCR.parseRowsFromText(text), expect, label);
}

const FOOTER = ['Sous-total HT : 1 550,00 €', 'TVA (20 %) : 310,00 €', 'Total TTC : 1 860,00 €'];
const PREAMBLE = ['FACTURE', 'MARIANNE GIRARD', 'Client', 'Thierry Bonnet'];

for (const perm of PERMS) {
  const order = perm.concat(['total']);
  const tag = order.join('>');
  const header = order.map((r) => LABEL[r]).join(' ');
  const cell = (p, r) => (r === 'name' ? p.name : r === 'qty' ? String(p.qty) : r === 'price' ? money(p.price) : money(p.total));
  const body = PRODUCTS.map((p) => order.map((r) => cell(p, r)).join(' '));

  // Shape 1: header inline, one row per line.
  verifyInvoice(PREAMBLE.concat([header], body, FOOTER).join('\n'), PRODUCTS, 'FR row-per-line ' + tag);
  // Shape 2: header split into one label per line.
  verifyInvoice(PREAMBLE.concat(order.map((r) => LABEL[r]), body, FOOTER).join('\n'), PRODUCTS, 'FR split-header ' + tag);
  // Shape 3: header missing entirely (must still group by arithmetic).
  verifyInvoice(PREAMBLE.concat(body, FOOTER).join('\n'), PRODUCTS, 'FR no-header ' + tag);
  // Shape 4: column-wise OCR (each column emitted as its own block).
  const cols = order.map((r) => PRODUCTS.map((p) => cell(p, r)).join('\n'));
  verifyInvoice(PREAMBLE.concat([header], cols, FOOTER).join('\n'), PRODUCTS, 'FR column-wise ' + tag);
}

// FR headers with Arabic product names (mixed-script invoices).
const AR_PRODUCTS = [
  { name: 'زيت المحرك', qty: 2, price: 1000, total: 2000 },
  { name: 'فلتر الهواء', qty: 5, price: 350, total: 1750 },
  { name: 'بطارية سيارة', qty: 1, price: 4500, total: 4500 },
];
for (const perm of PERMS) {
  const order = perm.concat(['total']);
  const header = order.map((r) => LABEL[r]).join(' ');
  const cell = (p, r) => (r === 'name' ? p.name : r === 'qty' ? String(p.qty) : r === 'price' ? money(p.price) : money(p.total));
  const body = AR_PRODUCTS.map((p) => order.map((r) => cell(p, r)).join(' '));
  verifyInvoice(PREAMBLE.concat([header], body, ['Total TTC : 8 250,00 €']).join('\n'), AR_PRODUCTS, 'FR header + AR names ' + order.join('>'));
}

// Arabic-Indic digits in quantities (mixed digit shapes inside the same invoice).
const mixedDigits = [
  'Désignation Quantité Prix unitaire HT Total HT',
  'زيت المحرك ٢ 1 000,00 € 2 000,00 €',
  'فلتر الهواء ٥ 350,00 € 1 750,00 €',
  'Total TTC : 3 750,00 €',
].join('\n');
checkRows(OCR.parseRowsFromText(mixedDigits), [
  { name: 'زيت المحرك', qty: 2, price: 1000 },
  { name: 'فلتر الهواء', qty: 5, price: 350 },
], 'FR header + Arabic-Indic qty digits');

console.log('\n============================================');
if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
