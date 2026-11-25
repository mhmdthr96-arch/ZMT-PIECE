// ZMT PIECE — printed Latin table rows (Bon de Caisse / factures)
// Run: node renderer/tests/smart-invoice-latin-verify.js
//
// Regression for the real "Bon de Caisse" photo: the generic parser split
// "3,800.00" into 3800 + 00 and turned the client header into row 1
// (1.524 / 42 / 64.008), so six products summed to 131,193,365.008.
// parseLatinRowLine reads one printed row band at a time with money-shaped
// tokens: the last two amounts are (unit price, line total), the quantity is
// the small standalone integer before them.
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
  'window.__latin = { parseLatinRowLine, parseLatinMoney, cleanLatinName }; window.InvoiceOCR = {');
vm.runInContext(patched, sandbox, { filename: 'invoice-ocr.js' });
const L = sandbox.__latin;

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const near = (a, b, m, eps) => check(Math.abs(a - b) <= (eps == null ? 0.01 : eps), m + ' (got ' + a + ', want ' + b + ')');

// --- Money shapes ---------------------------------------------------------
const MONEY = [
  ['3,800.00', 3800],
  ['7 600.00', 7600],
  ['13.000.00', 13000], // dot read as thousands separator
  ['5800.00', 5800],
  ['102,760.00', 102760],
  ['44 760.00', 44760],
  ['1.600.00', 1600],
];
MONEY.forEach(([raw, want]) => near(L.parseLatinMoney(raw), want, 'parseLatinMoney("' + raw + '")'));

// --- The six printed rows -------------------------------------------------
const ROWS = [
  {
    line: '01 21200-58G05 THERMOSTAT NISSAN TD27 4 2 21200-58G05 NISSAN ORG 2 3,800.00 7,600.00',
    name: 'THERMOSTAT NISSAN TD27 4 2 21200-58G05 NISSAN ORG',
    qty: 2, price: 3800, total: 7600,
  },
  {
    line: '2 90363-TD03 54KWH01 ROULEMENT AV TOYOTA VIGO D4D 4*4 AISC AISC 2 3,800.00 7,600.00',
    name: 'ROULEMENT AV TOYOTA VIGO D4D 4*4 AISC AISC',
    qty: 2, price: 3800, total: 7600,
  },
  {
    line: '3 BTF0125 TEMBOUR DE FREIN NISSAN TD27 URVAN E25 BRK 2 5,800.00 11,600.00',
    name: 'TEMBOUR DE FREIN NISSAN TD27 URVAN E25 BRK',
    qty: 2, price: 5800, total: 11600,
  },
  {
    line: '4 BTF722 TEMBOUR TOY VIGO 4*2 1PCS BRK ITALY BRK 2 6,500.00 13,000.00',
    name: 'TEMBOUR TOY VIGO 4*2 1PCS BRK ITALY BRK',
    qty: 2, price: 6500, total: 13000,
  },
  {
    line: '5 BNV2631 DIS FR NISSAN HARDIBODY D1000 JEUX BRK ITALY BRK 1 7,500.00 7,500.00',
    name: 'DIS FR NISSAN HARDIBODY D1000 JEUX BRK ITALY BRK',
    qty: 1, price: 7500, total: 7500,
  },
  {
    line: '6 1885 SN/ 1888 ZN SOUPAPE TOYOTA YARIS 2008 JEUX OSVAT QUEEN 1 10,500.00 10,500.00',
    name: 'SOUPAPE TOYOTA YARIS 2008 JEUX OSVAT QUEEN',
    qty: 1, price: 10500, total: 10500,
  },
];

let sum = 0;
ROWS.forEach((row, i) => {
  const r = L.parseLatinRowLine(row.line);
  check(!!r, 'row' + (i + 1) + ' parses');
  if (!r) return;
  eq(r.name, row.name, 'row' + (i + 1) + ' name');
  eq(r.qty, row.qty, 'row' + (i + 1) + ' quantity');
  near(r.price, row.price, 'row' + (i + 1) + ' unit price');
  near(r.lineTotal, row.total, 'row' + (i + 1) + ' line total');
  eq(r.verified, true, 'row' + (i + 1) + ' verified (qty × price = total)');
  sum += r.lineTotal;
});
near(sum, 57800, 'the six rows sum to their printed line totals (57 800.00)');

// --- OCR-damaged variants -------------------------------------------------
// Unit price lost a digit, line total intact: 7 600 ÷ 2 = 3 800.
const badPrice = L.parseLatinRowLine('1 | 21200-58G05 THERMOSTAT NISSAN TD27 4 2 21200-58G05 | NISSAN os 2 2,212.00 7,600.00');
check(!!badPrice, 'misread unit price still yields a row');
near(badPrice && badPrice.price, 3800, 'unit price repaired from total ÷ quantity');
near(badPrice && badPrice.lineTotal, 7600, 'line total kept');

// Line total lost its leading digit ("11,600.00" -> "1.600.00"): relax pass
// trusts quantity × unit price.
const badTotal = L.parseLatinRowLine('3 BTF0125 TEMBOUR DE FREIN NISSAN TD27 URVAN E25 BRK 2 5,800.00 1.600.00', { relax: true });
check(!!badTotal, 'damaged line total yields a relaxed row');
near(badTotal && badTotal.lineTotal, 11600, 'line total restored from quantity × price');
eq(badTotal && badTotal.verified, false, 'repaired total is marked unverified');

// Dot read as thousands separator on both amounts.
const dotted = L.parseLatinRowLine('6 | 1885 SN: 888 ZN SOUPAPE TOYOTA YARIS 2006 JEUX OSVAT | QUEEN 1 10.500.00 10.500.00');
check(!!dotted, 'dotted amounts parse');
near(dotted && dotted.price, 10500, 'dotted unit price 10.500.00 = 10 500');
near(dotted && dotted.lineTotal, 10500, 'dotted line total 10.500.00 = 10 500');
eq(dotted && dotted.name, 'SOUPAPE TOYOTA YARIS 2006 JEUX OSVAT QUEEN', 'reference column stripped from name');

// --- Non-product lines are rejected --------------------------------------
eq(L.parseLatinRowLine('Total G : 102,760.00'), null, 'grand total line rejected');
eq(L.parseLatinRowLine('Ancien Crédit 44,760.00'), null, 'credit line rejected');
eq(L.parseLatinRowLine('Total 58,000.00'), null, 'product total line rejected');
eq(L.parseLatinRowLine('N° | Référence | Désignation | Marque | Qté | PUV | Montant'), null, 'header line rejected');
eq(L.parseLatinRowLine(''), null, 'empty line rejected');

// --- Name cleanup --------------------------------------------------------
eq(L.cleanLatinName('1 21200-58G05 THERMOSTAT NISSAN TD27'), 'THERMOSTAT NISSAN TD27', 'row number + reference removed');
eq(L.cleanLatinName('STF 722 TEMBOUR TOY VIGO'), 'TEMBOUR TOY VIGO', 'reference split by OCR removed');
eq(L.cleanLatinName('DIS FR NISSAN HARDIBODY'), 'DIS FR NISSAN HARDIBODY', 'real name prefix kept');

console.log((fail === 0 ? 'كل الفحوص نجحت' : 'فشل') + ' — pass=' + pass + ' fail=' + fail);
process.exit(fail === 0 ? 0 : 1);
