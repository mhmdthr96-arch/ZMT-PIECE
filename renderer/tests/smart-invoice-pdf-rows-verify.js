// ZMT PIECE — PDF text layer: printed table rows must keep their own cells
// Run: node renderer/tests/smart-invoice-pdf-rows-verify.js
//
// Regression for the real "Bon Reglement" PDF (facture bendin aymen.pdf). The
// text layer prints every designation cell as two runs placed *around* the
// row's numeric baseline (e.g. 665.1 / 654.8 for the baseline at 660), so the
// old y-sorted line builder split each product in two and handed the second
// half to the next row. Result: the N° column and the reference ended up in
// the product name and every continuation line ("07", "2L/3L/5L 98-09 8PCS",
// "14/ QD32 SANS PIPES CE") was lost.
// pdfVisualLines() anchors rows on the baselines that carry the numeric cells
// and emits each row in column order, which is what the row scanners expect.
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
const patched = src.replace(
  'window.InvoiceOCR = {',
  'window.__pdf = { pdfVisualLines, latinTextRows, parseRowsFromText }; window.InvoiceOCR = {');
vm.runInContext(patched, sandbox, { filename: 'invoice-ocr.js' });
const P = sandbox.__pdf;

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const near = (a, b, m, eps) => check(Math.abs(a - b) <= (eps == null ? 0.01 : eps), m + ' (got ' + a + ', want ' + b + ')');

// --- Real geometry of facture bendin aymen.pdf (content-stream order) ------
// [y, x, text]
const ITEMS = [
  [700.7, 212.7, 'Bon Reglement N° BR 01871/2026'],
  [682.6, 144.6, 'Designation'],
  [682.6, 59.6, 'Reference'],
  [682.6, 321.8, 'Marque'],
  [682.6, 386.4, 'Qtx'],
  [682.6, 430.2, 'Prix Unitaire'],
  [682.6, 33.9, 'N°'],
  [682.6, 517.6, 'Montant'],
  [660.0, 36.5, '1'],
  [665.1, 144.6, 'GUID CULASSE COROLLA 01-13/2C'],
  [654.8, 144.6, 'S.TURBO 8PCS'],
  [660.0, 59.6, '11126-64030'],
  [660.0, 321.8, 'TOYOTA'],
  [660.0, 390.9, '1'],
  [660.0, 444.2, '1 850.00'],
  [660.0, 515.1, '1 850.00'],
  [634.5, 36.5, '2'],
  [639.7, 144.6, 'GUID CULASSE TY HILUX+VIGO'],
  [629.4, 144.6, '2L/3L/5L 98-09 8PCS'],
  [634.5, 59.6, '11122-54020/'],
  [634.5, 321.8, 'TOYOTA'],
  [634.5, 390.9, '1'],
  [634.5, 444.2, '1 500.00'],
  [634.5, 515.1, '1 500.00'],
  [613.3, 36.5, '3'],
  [613.3, 144.6, 'BENDIX TY YARIS 01-13 5V'],
  [613.3, 59.6, '28011-70020'],
  [613.3, 321.8, 'ADZ'],
  [613.3, 390.9, '1'],
  [613.3, 444.2, '1 250.00'],
  [613.3, 515.1, '1 250.00'],
  [592.1, 36.5, '4'],
  [597.3, 144.6, 'DERITE FILTRE AIRE TY COROLLA 01-'],
  [587.0, 144.6, '07'],
  [592.1, 59.6, '17880-64410'],
  [592.1, 321.8, 'TOYOTA'],
  [592.1, 390.9, '1'],
  [592.1, 444.2, '2 650.00'],
  [592.1, 515.1, '2 650.00'],
  [566.7, 36.5, '5'],
  [571.9, 144.6, 'RADIATEUR CHAUFAGE NS TD27 01-'],
  [561.5, 144.6, '14/ QD32 SANS PIPES'],
  [566.7, 59.6, 'DX13001'],
  [571.9, 321.8, 'DYNAFOR'],
  [561.5, 321.8, 'CE'],
  [566.7, 390.9, '1'],
  [566.7, 444.2, '3 850.00'],
  [566.7, 515.1, '3 850.00'],
  [541.3, 36.5, '6'],
  [546.5, 144.6, 'SILEN BLOC BARRE NS XTRAIL T30'],
  [536.1, 144.6, '01-08 2PCS'],
  [541.3, 59.6, '54613-8H318'],
  [546.5, 321.8, 'PERFECT'],
  [536.1, 321.8, 'TAILAND'],
  [541.3, 390.9, '5'],
  [541.3, 451.7, '650.00'],
  [541.3, 515.1, '3 250.00'],
  [515.9, 36.5, '7'],
  [521.1, 144.6, 'SOUFLET CREMAILLERE TY VIGO'],
  [510.7, 144.6, 'D4D 06-14 4X2/4X4 LH'],
  [515.9, 59.6, '45536-0K010+'],
  [521.1, 321.8, 'JR'],
  [510.7, 321.8, 'TAILAND'],
  [515.9, 390.9, '2'],
  [515.9, 444.2, '1 050.00'],
  [515.9, 515.1, '2 100.00'],
  [490.5, 36.5, '8'],
  [495.7, 144.6, 'SOUFLET CREMAILLERE TY VIGO'],
  [485.3, 144.6, 'D4D 06-14 4X2/4X4 RH'],
  [490.5, 59.6, '45535-0K010+'],
  [495.7, 321.8, 'JR'],
  [485.3, 321.8, 'TAILAND'],
  [490.5, 390.9, '2'],
  [490.5, 444.2, '1 050.00'],
  [490.5, 515.1, '2 100.00'],
  [456.8, 411.7, 'Total Montant Bon'],
  [456.1, 504.8, '18 550.00'],
];
const items = ITEMS.map(([y, x, str]) => ({ str, transform: [1, 0, 0, 1, x, y] }));

// --- 1. Visual lines: header, then one line per product -------------------
const lines = P.pdfVisualLines(items);
eq(lines[0], 'Bon Reglement N° BR 01871/2026', 'invoice title stays its own line');
eq(lines[1], 'N°  Reference  Designation  Marque  Qtx  Prix Unitaire  Montant', 'table header stays its own line');
check(/^1 {2}11126-64030 {2}GUID CULASSE COROLLA 01-13\/2C S\.TURBO 8PCS {2}TOYOTA {2}1 {2}1 850\.00 {2}1 850\.00$/.test(lines[2]),
  'row 1 in column order (N° Reference Designation Marque Qtx PUV Montant) — got ' + JSON.stringify(lines[2]));
eq(lines.length, 11, 'title + header + 8 products + footer');
eq(lines[lines.length - 1], 'Total Montant Bon  18 550.00', 'footer stays after the products');

// Wrapped cells keep their hyphen (same column), never across columns.
check(lines[5].indexOf('DERITE FILTRE AIRE TY COROLLA 01-07  TOYOTA') > 0, 'wrapped "01-" + "07" re-joined inside the name — got ' + JSON.stringify(lines[5]));
check(lines[6].indexOf('TD27 01-14/ QD32 SANS PIPES') > 0, 'wrapped "01-" + "14/ QD32" re-joined inside the name — got ' + JSON.stringify(lines[6]));
check(lines[3].indexOf('11122-54020/  GUID') > 0, 'reference ending with "/" is not glued to the name — got ' + JSON.stringify(lines[3]));

// --- 2. The row scanners turn those lines into the 8 real products -------
const text = lines.join('\n') + '\n';
const generic = P.parseRowsFromText(text) || [];
check(generic.length > 0, 'generic lane still returns rows (Smart Add would skip the Latin lane otherwise)');
const rows = P.latinTextRows(text, generic);
check(!!rows, 'Latin lane returns rows');
const WANT = [
  { name: 'GUID CULASSE COROLLA 01-13/2C S.TURBO 8PCS TOYOTA', qty: 1, price: 1850, total: 1850 },
  { name: 'GUID CULASSE TY HILUX+VIGO 2L/3L/5L 98-09 8PCS TOYOTA', qty: 1, price: 1500, total: 1500 },
  { name: 'BENDIX TY YARIS 01-13 5V ADZ', qty: 1, price: 1250, total: 1250 },
  { name: 'DERITE FILTRE AIRE TY COROLLA 01-07 TOYOTA', qty: 1, price: 2650, total: 2650 },
  { name: 'RADIATEUR CHAUFAGE NS TD27 01-14/ QD32 SANS PIPES DYNAFOR CE', qty: 1, price: 3850, total: 3850 },
  { name: 'SILEN BLOC BARRE NS XTRAIL T30 01-08 2PCS PERFECT TAILAND', qty: 5, price: 650, total: 3250 },
  { name: 'SOUFLET CREMAILLERE TY VIGO D4D 06-14 4X2/4X4 LH JR TAILAND', qty: 2, price: 1050, total: 2100 },
  { name: 'SOUFLET CREMAILLERE TY VIGO D4D 06-14 4X2/4X4 RH JR TAILAND', qty: 2, price: 1050, total: 2100 },
];
eq(rows ? rows.length : -1, WANT.length, 'all 8 products found');
(WANT || []).forEach((w, i) => {
  const r = rows && rows[i];
  if (!r) { check(false, 'row' + (i + 1) + ' missing'); return; }
  eq(r.name, w.name, 'row' + (i + 1) + ' name');
  eq(r.qty, w.qty, 'row' + (i + 1) + ' quantity');
  near(r.price, w.price, 'row' + (i + 1) + ' unit price');
  near(r.lineTotal, w.total, 'row' + (i + 1) + ' line total');
  eq(r.verified, true, 'row' + (i + 1) + ' quantity × price = printed total');
});
near((rows || []).reduce((s, r) => s + r.qty * r.price, 0), 18550, 'rows reconcile with the printed Total Montant Bon');

// No N° column / reference digits may leak into a name.
(rows || []).forEach((r, i) => {
  check(!/^\d/.test(r.name), 'row' + (i + 1) + ' name does not start with a number');
  check(r.name.indexOf('11126-64030') < 0 && r.name.indexOf('45536-0K010+') < 0, 'row' + (i + 1) + ' name holds no reference');
});

// --- 3. Pages without a table keep the plain visual lines ----------------
const plain = P.pdfVisualLines([
  { str: 'ZMT PIECE', transform: [1, 0, 0, 1, 40, 700] },
  { str: 'Adresse : Alger', transform: [1, 0, 0, 1, 40, 680] },
  { str: 'Tél : 0555', transform: [1, 0, 0, 1, 40, 660] },
]);
eq(plain.join(' | '), 'ZMT PIECE | Adresse : Alger | Tél : 0555', 'non-table page keeps plain visual lines');

// A single numeric baseline is not a table grid: no row anchoring.
const single = P.pdfVisualLines([
  { str: 'Facture 2026', transform: [1, 0, 0, 1, 40, 700] },
  { str: 'Total 5 000.00', transform: [1, 0, 0, 1, 40, 680] },
]);
eq(single.join(' | '), 'Facture 2026 | Total 5 000.00', 'one numeric line alone keeps plain order');

console.log((fail === 0 ? 'كل الفحوص نجحت' : 'فشل') + ' — pass=' + pass + ' fail=' + fail);
process.exit(fail === 0 ? 0 : 1);
