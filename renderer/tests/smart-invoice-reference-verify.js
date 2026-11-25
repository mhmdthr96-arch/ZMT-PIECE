// ZMT PIECE — Smart Add: matching by Réference
// Run: node renderer/tests/smart-invoice-reference-verify.js
//
// Two contracts, tested on the REAL code:
//  1. OCR — a "Num | Réference | Désignation | U.M | Qte | Prix U | Total"
//     supplier table (Bon de Livraison, Toyota OEM references) must be read by
//     the Latin printed-table lane (latinTextRows), keep its prices, and expose
//     the reference column in the row's `reference` field. The pasted-text lane
//     (parseRowsFromText) captures it too.
//  2. Smart Add — matchProduct must resolve a row to the right article by
//     reference (case / space / hyphen / slash insensitive), accept a trailing
//     "/variant" suffix only when it is unambiguous, and NEVER confuse an LH row
//     with an RH part.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dom = require('./dom-lite');

dom.El.prototype.insertAdjacentHTML = function (position, html) {
  if (position !== 'beforeend') throw new Error('unsupported position: ' + position);
  const tmp = new dom.El('div');
  dom.parseInto(String(html), tmp);
  tmp.children.slice().forEach((child) => this.appendChild(child));
};

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const near = (a, b, m, eps) => check(Math.abs(a - b) <= (eps == null ? 0.01 : eps), m + ' (got ' + a + ', want ' + b + ')');

/* ======================================================================
 * 1. OCR — the reference column of the real "BON DE LIVRAISON" table
 * ==================================================================== */
const ocrSrc = read('renderer/js/invoice-ocr.js');
const ocrBox = {
  localStorage: { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } },
  console,
  URL: { createObjectURL: () => 'x', revokeObjectURL: () => {} },
  document: { createElement: () => ({}), head: { appendChild: () => {} } },
  fetch: async () => { throw new Error('no net'); },
};
ocrBox.window = ocrBox;
vm.createContext(ocrBox);
vm.runInContext(
  ocrSrc.replace('window.InvoiceOCR = {', 'window.__pdf = { latinTextRows, parseRowsFromText, parseInvoiceText }; window.InvoiceOCR = {'),
  ocrBox, { filename: 'invoice-ocr.js' });
const P = ocrBox.__pdf;

// The visual lines pdfVisualLines() emits for the real q.pdf (header + 21 rows).
const QPDF_TEXT = [
  'Num  Réference  Désignation  U.M  Qte  Prix U  Total',
  '1  53812-0K010/TYF091LA  AILE FPI.TH VIGO 2007-09 4X2 LH  UN  2  8 750,00  17 500,00',
  '2  53811-0K010/TYF091RA  AILE FPI.TH VIGO 2007-09 4X2 RH  UN  2  8 750,00  17 500,00',
  '3  31230-71050/2  BUTEE EMBRAYAGE ORG HILUX REVO 2017/2022 DIEZ  3  16 000,00  48 000,00',
  '4  53301-35100/TYH085 NA  CAPOT FPI.TH HILUX 2002-2004  1  25 500,00  25 500,00',
  '5  53301-0K100/TYH175NA  CAPOT FPI.TH VIGO 2012  1  28 000,00  28 000,00',
  '6  61611-KK010  COTE AILE AR ORG.TH HILUX REVO 2017/2022 2CABINE LH  UN  1  52 500,00  52 500,00',
  '7  61612-KK010  COTE AILE AR ORG.TH HILUX REVO 2017/2022 2CABINE RH  1  52 500,00  52 500,00',
  '8  53876-02270/TYIF157LA  COUVRE JEU D ALLE FPI.TH AV COROLLA 2008-2009 LH  2  1 750,00  3 500,00',
  '9  53875-02270/TYIF157RA  COUVRE JEU D ALLE FPI.TH AV COROLLA 2008-2009 RH  2  1 750,00  3 500,00',
  '10  31250-0K280/1  DISQUE EMBRAYAGE ORG HILUX REVO 2017/2022  3  29 500,00  88 500,00',
  '11  52105-0K010/20/TYIB092NB  PARE CHOC AR FPI.TH VIGO 2007-2012 CHROME  2  19 500,00  39 000,00',
  '12  17-4039/212-11G4 LH  PHARE OPTIQUE CASP COROLLA 2005-2006 LH  2  7 000,00  14 000,00',
  '13  17-4039/212-11G4 RH  PHARE OPTIQUE CASP COROLLA 2005-2006 RH  2  7 000,00  14 000,00',
  '14  17-4045 LH/112-1122 LH  PHARE OPTIQUE CASP COROLLA 2008-2009 LH  2  7 800,00  15 600,00',
  '15  17-4045 RH/112-1122 RH  PHARE OPTIQUE CASP COROLLA 2008-2009 RH  2  7 800,00  15 600,00',
  '16  31210-0K280/1  PLATEAU EMBRAYAGE ORG HILUX REVO 2017/2022  3  38 500,00  115 500,00',
  '17  11-D16-D2/67002-KK020  PORTE 1ER AV NOBLE HILUX REVO 2 CABINE 2017/2022 4X4 LH  1  34 500,00  34 500,00',
  '18  11-D16-D1/67001-KK020  PORTE 1ER AV NOBLE HILUX REVO 2 CABINE 2017/2022 4X4 RH  1  34 500,00  34 500,00',
  '19  67004-KK010/TYFD383R LA  PORTE 2EME AV FPI.TH HILUX REVO 2 CABINE 4X2/4X4 2017/2022 LH  1  38 500,00  38 500,00',
  '20  67003-KK010/TYFD383R RA  PORTE 2EME AV FPI.TH HILUX REVO 2 CABINE 4X2/4X4 2017/2022 RH  1  38 500,00  38 500,00',
  '21  17201-0L030  TURBO S.M.ENNOUR VIGO D4D 2009-2015  2  33 000,00  66 000,00',
].join('\n') + '\n';

const generic = P.parseRowsFromText(QPDF_TEXT) || [];
const latin = P.latinTextRows(QPDF_TEXT, generic);
check(!!latin, 'the Latin printed-table lane reads the supplier table (was null before)');
if (latin) {
  eq(latin.length, 21, 'all 21 product rows are read');
  near(latin.reduce((s, r) => s + r.qty * r.price, 0), 762700, 'rows reconcile with the printed total (762 700,00)');
  const REF = {
    0: '53812-0K010/TYF091LA', 1: '53811-0K010/TYF091RA', 2: '31230-71050/2',
    3: '53301-35100/TYH085', 5: '61611-KK010', 6: '61612-KK010',
    11: '17-4039/212-11G4', 20: '17201-0L030',
  };
  Object.keys(REF).forEach((i) => eq(latin[+i] && latin[+i].reference, REF[i], 'row ' + (+i + 1) + ' reference'));
  near(latin[3].price, 25500, 'row 4 unit price 25 500,00 (not the trailing "500")');
  near(latin[5].price, 52500, 'row 6 unit price 52 500,00 (not the trailing "500")');
  latin.forEach((r, i) => {
    check(!/^\d/.test(r.name), 'row ' + (i + 1) + ' name does not start with a digit');
    check(r.name.indexOf(r.reference) < 0, 'row ' + (i + 1) + ' name holds no reference');
  });
}

// The pasted-text lane (parseInvoiceText) reuses the printed-table reader, so
// pasting the same table into the manual box gives the same 21 clean rows.
const pasted = P.parseInvoiceText(QPDF_TEXT) || [];
eq(pasted.length, 21, 'pasted-text lane uses the printed-table reader (21 rows)');
near(pasted.reduce((s, r) => s + r.qty * r.price, 0), 762700, 'pasted rows keep the exact total');
if (pasted[0]) eq(pasted[0].reference, '53812-0K010/TYF091LA', 'pasted row 1 reference captured');
if (pasted[2]) eq(pasted[2].reference, '31230-71050/2', 'pasted row 3 reference captured');

/* ======================================================================
 * 2. Smart Add — matchProduct by reference
 * ==================================================================== */
const products = [
  { id: 'p1', name: 'AILE FPI.TH VIGO 2007-09 4X2 LH', reference: '53812-0K010/TYF091LA', quantity: 10, buyPrice: 8750 },
  { id: 'p2', name: 'AILE FPI.TH VIGO 2007-09 4X2 RH', reference: '53811-0K010/TYF091RA', quantity: 10, buyPrice: 8750 },
  { id: 'p3', name: 'BUTEE EMBRAYAGE ORG HILUX REVO', reference: '31230-71050', quantity: 3, buyPrice: 16000 },
  { id: 'p4', name: 'COTE AILE AR ORG.TH LH', reference: '61611-KK010', quantity: 1, buyPrice: 52500 },
  { id: 'p5', name: 'COTE AILE AR ORG.TH RH', reference: '61612-KK010', quantity: 1, buyPrice: 52500 },
  { id: 'p6', name: 'PORTE GAUCHE', reference: '99999-AAA/LH', quantity: 5, buyPrice: 100 },
  { id: 'p7', name: 'PORTE DROITE', reference: '99999-AAA/RH', quantity: 5, buyPrice: 100 },
];
const detailsCalls = [];
const store = {};
const sandbox = {
  console,
  document: dom.createDoc(),
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  Date, Math, JSON, String, Number, parseFloat, parseInt, isFinite,
  setTimeout, clearTimeout, setInterval, clearInterval,
  AbortController: global.AbortController,
  escHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  normSearch: (s) => String(s || '').toLowerCase().trim(),
  productSearchScore: () => 0,
  alert: () => {},
  filterInvoices: () => {},
  isRTL: () => true,
  showProductDetails: (id) => { detailsCalls.push(id); },
  FV: { toggle: () => {} },
  ExtraPrices: { fields: () => [] },
  DB: {
    getProducts: () => products,
    getProduct: (id) => products.find((p) => p.id === id) || null,
    getProductByBarcode: () => null,
    getSuppliers: () => [],
    getLowStockThreshold: () => 5,
  },
  InvoiceOCR: { ocrFile: async () => ({ rows: [], rawText: '' }), parseRowsFromText: () => [] },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('renderer/js/pages/invoices-smart.js'), sandbox, { filename: 'invoices-smart.js' });

const ROWS = [
  { name: 'AILE FPI.TH VIGO 4X2 LH', reference: '53812-0K010/TYF091LA', qty: 2, price: 8750 }, // exact -> p1
  { name: 'AILE FPI.TH VIGO 4X2 RH', reference: '53811-0K010/TYF091RA', qty: 2, price: 8750 }, // exact -> p2
  { name: 'BUTEE EMBRAYAGE', reference: '31230-71050/2', qty: 3, price: 16000 },               // /variant -> p3
  { name: 'COTE AILE LH', reference: '61611-KK010', qty: 1, price: 52500 },                     // exact -> p4
  { name: 'COTE AILE RH', reference: '61612-KK010', qty: 1, price: 52500 },                     // exact -> p5
  { name: 'SPACED REF', reference: '53812 0K010 TYF091LA', qty: 2, price: 8750 },               // normalised -> p1
  { name: 'INCONNU XYZ', reference: '61613-KK010', qty: 1, price: 100 },                        // 1 char off -> none
  { name: 'PORTE AMBIGUE', reference: '99999-AAA', qty: 1, price: 100 },                        // 2 variants -> none
];
const WANT = ['p1', 'p2', 'p3', 'p4', 'p5', 'p1', null, null];

(async function main() {
  sandbox.openSmartAddInvoice();
  const doc = sandbox.document;
  doc.getElementById('smartFile').files = [{ name: 'bon.pdf', type: 'application/pdf' }];
  sandbox.InvoiceOCR = { ocrFile: async () => ({ rows: ROWS, rawText: '' }), parseRowsFromText: () => [] };
  await sandbox.runSmartAddInvoice();
  await new Promise((resolve) => setTimeout(resolve, 260));

  WANT.forEach((want, i) => {
    detailsCalls.length = 0;
    sandbox.smartShowProduct(i);
    const got = detailsCalls.length ? detailsCalls[0] : null;
    eq(got, want, 'row ' + (i + 1) + ' resolves to ' + (want || 'no product'));
  });

  // LH/RH safety spelled out: the LH row must never resolve to the RH part.
  detailsCalls.length = 0;
  sandbox.smartShowProduct(3);
  check(detailsCalls[0] !== 'p5', 'an LH reference never lands on the RH part');

  console.log('\n============================================');
  if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
  else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
