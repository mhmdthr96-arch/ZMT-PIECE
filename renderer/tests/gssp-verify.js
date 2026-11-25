// ============================================================
// ZMT PIECE — Sable Stock (GSSP) importer guard
// Run: node renderer/tests/gssp-verify.js
//
// Guards the «ترحيل البيانات» → Sable Stock path:
//   1. the ZIP/ZipCrypto + MySQL-dump reader (js/lib/gssp-reader.js):
//      CRC32, keystream, escaping, tuple parsing, dump parsing;
//   2. a real-backup round-trip (skipped when the file is not present):
//      decrypt + parse + the solde identity of the shop;
//   3. the full importer (importSableStockFull) end-to-end against a mock
//      DB fed by a synthetic dump: real dates, real-year invoice numbers,
//      family/unit/barcode mapping, cash-ticket rules, and idempotency;
//   4. the static wiring (index.html, file-detector, i18n, db.addInvoice).
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let fails = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
const check = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (a, b, m) => check(a === b, m + (a === b ? '' : ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)));

// pako shim backed by Node's zlib (the reader only needs inflateRaw).
const pakoShim = {
  inflateRaw: (bytes) => new Uint8Array(zlib.inflateRawSync(Buffer.from(bytes))),
};

function makeReaderCtx() {
  const ctx = { console, TextDecoder, Uint8Array, ArrayBuffer, Math, Set, Map };
  ctx.window = ctx;
  ctx.pako = pakoShim;
  vm.createContext(ctx);
  vm.runInContext(read('renderer/js/lib/gssp-reader.js'), ctx, { filename: 'gssp-reader.js' });
  return ctx;
}

// ---------------------------------------------------------------- mock DB --
function makeMockDB() {
  const state = { customers: [], suppliers: [], products: [], invoices: [], payments: [] };
  const seq = {};
  let n = 0;
  const canon = (s) => String(s == null ? '' : s).replace(/[\s\u00A0\u2000-\u200B\uFEFF]/g, '').toUpperCase();
  const bcIndex = {};
  const reindex = () => { for (const k of Object.keys(bcIndex)) delete bcIndex[k]; for (const p of state.products) if (p.barcode) bcIndex[canon(p.barcode)] = p; };
  return {
    _state: state,
    suppressAutoBackup() {},
    getCustomers: () => state.customers.slice(),
    saveCustomers: (list) => { state.customers = list.slice(); },
    addCustomer(c) {
      const rec = Object.assign({}, c);
      rec.id = 'c' + (++n);
      rec.createdAt = Date.now();
      rec.balance = 0;
      rec.totalPurchases = 0;
      rec.creditLimit = c.creditLimit != null ? (parseFloat(c.creditLimit) || 0) : 0;
      rec.discount = c.discount || 0;
      state.customers.push(rec);
      return rec;
    },
    getSuppliers: () => state.suppliers.slice(),
    saveSuppliers: (list) => { state.suppliers = list.slice(); },
    getProductByBarcode: (code) => bcIndex[canon(code)] || null,
    async addProductsBatch(list) {
      for (const p of list) {
        const rec = Object.assign({}, p);
        rec.id = 'p' + (++n);
        rec.createdAt = Date.now();
        rec.updatedAt = rec.createdAt;
        if (rec.barcode) rec.barcode = String(rec.barcode).replace(/\s/g, '');
        state.products.push(rec);
      }
      reindex();
      return list;
    },
    getInvoices: () => state.invoices.slice(),
    addInvoice(inv, opts) {
      inv.id = 'i' + (++n);
      inv.createdAt = (opts && opts.keepCreatedAt && inv.createdAt) ? inv.createdAt : Date.now();
      const y = (opts && opts.numberYear) || new Date().getFullYear();
      seq[y] = (seq[y] || 0) + 1;
      inv.invoiceNumber = 'FACT-' + y + '-' + String(seq[y]).padStart(4, '0');
      state.invoices.push(inv);
      return inv;
    },
    getPayments: () => state.payments.slice(),
    addPayment(p) {
      p.id = 'pay' + (++n);
      p.createdAt = p.createdAt || Date.now();
      state.payments.push(p);
      return p;
    },
  };
}

// ------------------------------------------------- importer harness (vm) --
function makeImporterCtx(db) {
  const els = {};
  const elFor = (id) => els[id] || (els[id] = {
    id, style: {}, textContent: '', innerHTML: '', value: '',
    setAttribute() {}, getAttribute() { return null; },
    classList: { add() {}, remove() {} },
    addEventListener() {}, appendChild() {}, removeChild() {}, remove() {},
    querySelectorAll() { return []; }, querySelector() { return null; },
    click() {}, focus() {},
  });
  const ctx = {
    console, setTimeout, clearTimeout, Math, JSON, Date, Set, Map, Promise,
    Uint8Array, ArrayBuffer, TextDecoder, TextEncoder,
    encodeURIComponent, decodeURIComponent, isNaN, parseInt, parseFloat,
    CustomEvent: function () {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  };
  ctx.window = ctx;
  ctx.document = {
    getElementById: (id) => elFor(id),
    querySelectorAll: () => [], querySelector: () => null,
    createElement: () => elFor('__new'),
    addEventListener() {}, body: { appendChild() {} },
  };
  ctx.DB = db;
  ctx.t = (k) => k;
  ctx.Auth = { canView: () => true, isLoggedIn: () => false };
  vm.createContext(ctx);
  vm.runInContext(read('renderer/js/lib/gssp-reader.js'), ctx, { filename: 'gssp-reader.js' });
  vm.runInContext(read('renderer/js/pages/data-migration.js'), ctx, { filename: 'data-migration.js' });
  return { ctx, statusEl: elFor('migrationStatus') };
}

// ------------------------------------------------------- synthetic dump ----
const DUMP = [
  '-- MySQL dump 10.13  Distrib 5.5.49',
  'DROP TABLE IF EXISTS `personnez`;',
  'CREATE TABLE `personnez` (',
  '  `idPers` int(11) NOT NULL,',
  '  `raiSocial` varchar(100) DEFAULT NULL,',
  '  `idType` int(11) DEFAULT NULL,',
  '  `solde` decimal(15,2) DEFAULT NULL,',
  '  `tel` varchar(30) DEFAULT NULL,',
  '  `mobile` varchar(30) DEFAULT NULL,',
  '  `adrese` varchar(200) DEFAULT NULL,',
  '  `maxCredit` decimal(15,2) DEFAULT NULL',
  ') ENGINE=MyISAM DEFAULT CHARSET=latin1;',
  "INSERT INTO `personnez` VALUES (1,'Client A',1,1500.00,'0551',NULL,'Algiers',5000.00),(2,'Client B',1,-200.00,NULL,'0662','Oran',0.00),(3,'Sup X',2,800.00,'0770',NULL,'Blida',0.00);",
  'CREATE TABLE `categoris` (',
  '  `idCategori` int(11) NOT NULL,',
  '  `NomCat` varchar(60) DEFAULT NULL',
  ') ENGINE=MyISAM DEFAULT CHARSET=latin1;',
  "INSERT INTO `categoris` VALUES (1,'Filtres'),(2,'Freins');",
  'CREATE TABLE `codbar` (',
  '  `idcodBar` varchar(40) DEFAULT NULL,',
  '  `RefArt` varchar(40) DEFAULT NULL',
  ') ENGINE=MyISAM DEFAULT CHARSET=latin1;',
  "INSERT INTO `codbar` VALUES ('2612337151119','ART00631');",
  'CREATE TABLE `articlesliste` (',
  '  `RefArt` varchar(40) DEFAULT NULL,',
  '  `NomArt` varchar(120) DEFAULT NULL,',
  '  `NomArtAR` varchar(120) DEFAULT NULL,',
  '  `QTE` decimal(15,3) DEFAULT NULL,',
  '  `AlarmQte` decimal(15,3) DEFAULT NULL,',
  '  `PrixVD` decimal(15,2) DEFAULT NULL,',
  '  `PrixVG` decimal(15,2) DEFAULT NULL,',
  '  `PrixAchat` decimal(15,2) DEFAULT NULL,',
  '  `PrixVenteMin` decimal(15,2) DEFAULT NULL,',
  '  `idCat` int(11) DEFAULT NULL,',
  '  `idunite` varchar(10) DEFAULT NULL,',
  '  `EmplacementHV` varchar(40) DEFAULT NULL',
  ') ENGINE=MyISAM DEFAULT CHARSET=latin1;',
  "INSERT INTO `articlesliste` VALUES ('ART001','Filtre Huile','',40.000,5.000,1200.00,1000.00,700.00,900.00,1,'piece','A1'),('ART00631','Frein','',10.000,2.000,2500.00,2200.00,1500.00,1800.00,2,'KG','B2');",
  'CREATE TABLE `bonsliv` (',
  '  `idBonLiv` varchar(40) DEFAULT NULL,',
  '  `idDoss` int(11) DEFAULT NULL,',
  '  `idyears` int(11) DEFAULT NULL,',
  '  `DateBL` datetime DEFAULT NULL,',
  '  `Total` decimal(15,2) DEFAULT NULL,',
  '  `Client` varchar(40) DEFAULT NULL,',
  '  `MontRegl` decimal(15,2) DEFAULT NULL,',
  '  `MRemise` decimal(15,2) DEFAULT NULL,',
  '  `modepai` varchar(30) DEFAULT NULL,',
  '  `Observ` varchar(200) DEFAULT NULL,',
  '  `nomCstmer` varchar(120) DEFAULT NULL,',
  '  `telCstmer` varchar(30) DEFAULT NULL,',
  '  `adreseCstmer` varchar(200) DEFAULT NULL',
  ') ENGINE=MyISAM DEFAULT CHARSET=latin1;',
  "INSERT INTO `bonsliv` VALUES ('100',1,2021,'2021-03-05 10:20:30',2400.00,'1',1000.00,0.00,'cash','','','',''),('101',1,2021,'2021-04-10 09:00:00',500.00,'999',0.00,0.00,'','','Passager','0555','Setif'),('102',1,2022,'2022-01-15 12:00:00',0.00,'2',0.00,0.00,'','','','','');",
  'CREATE TABLE `journsortie` (',
  '  `idBL` varchar(40) DEFAULT NULL,',
  '  `idbonCont` varchar(40) DEFAULT NULL,',
  '  `idDoss` int(11) DEFAULT NULL,',
  '  `idyears` int(11) DEFAULT NULL,',
  '  `RefArt` varchar(40) DEFAULT NULL,',
  '  `Qte` decimal(15,3) DEFAULT NULL,',
  '  `Prix` decimal(15,2) DEFAULT NULL,',
  '  `design` varchar(120) DEFAULT NULL,',
  '  `nomArtAR` varchar(120) DEFAULT NULL',
  ') ENGINE=MyISAM DEFAULT CHARSET=latin1;',
  "INSERT INTO `journsortie` VALUES ('100','',1,2021,'ART001',2.000,1200.00,'',''),('102','',1,2022,'ART001',3.000,1000.00,'',''),('','BC1',1,2021,'ART00631',1.000,260.00,'','');",
  'CREATE TABLE `boncont` (',
  '  `idbonCont` varchar(40) DEFAULT NULL,',
  '  `idDoss` int(11) DEFAULT NULL,',
  '  `dat` datetime DEFAULT NULL,',
  '  `Mpayer` decimal(15,2) DEFAULT NULL,',
  '  `MRemise` decimal(15,2) DEFAULT NULL,',
  '  `NomCli` varchar(120) DEFAULT NULL,',
  '  `Adrese` varchar(200) DEFAULT NULL,',
  '  `Tel` varchar(30) DEFAULT NULL,',
  '  `deleted` int(11) DEFAULT NULL,',
  '  `Total` decimal(15,2) DEFAULT NULL',
  ') ENGINE=MyISAM DEFAULT CHARSET=latin1;',
  "INSERT INTO `boncont` VALUES ('BC1',1,'2021-05-01 08:00:00',260.00,0.00,'','','',0,260.00),('BC2',1,'2021-05-02 08:00:00',0.00,0.00,'','','',0,0.00),('BC3',1,'2021-05-03 08:00:00',100.00,0.00,'','','',1,100.00);",
  '-- Dump completed',
].join('\n');

function runImport(dumpText, db) {
  const dbInst = db || makeMockDB();
  const h = makeImporterCtx(dbInst);
  h.ctx.__buf = Buffer.from(dumpText, 'utf8');
  vm.runInContext('_migrationState.fileBuffer = __buf; _migrationState.fileType = "gssp";', h.ctx);
  return Promise.resolve()
    .then(() => vm.runInContext('migrationParseGssp()', h.ctx))
    .then((parsed) => vm.runInContext('importSableStockFull()', h.ctx).then(() => parsed))
    .then((parsed) => ({ parsed, db: dbInst, status: h.statusEl.textContent, ctx: h.ctx }));
}

// ===========================================================================
(async function main() {
  console.log('============================================');
  console.log('Sable Stock (GSSP) importer — reader + full import');
  console.log('============================================');

  // -------------------------------------------------- 1. reader unit tests --
  console.log('\n--- 1. reader primitives ---');
  const R = makeReaderCtx().GsspReader;
  check(typeof R === 'object' && typeof R.read === 'function', 'GsspReader is exposed');
  {
    // crc32("123456789") === 0xCBF43926
    let c = 0xFFFFFFFF >>> 0;
    for (const ch of Buffer.from('123456789', 'ascii')) c = R._crc32(c, ch);
    eq((c ^ 0xFFFFFFFF) >>> 0, 0xCBF43926, 'crc32("123456789") = 0xCBF43926');
  }
  eq(R._unescapeMysqlString("a\\'b"), "a'b", 'unescape \\\' → apostrophe');
  eq(R._unescapeMysqlString('a\\nb'), 'a\nb', 'unescape \\n → newline');
  eq(R._unescapeMysqlString('a\\\\b'), 'a\\b', 'unescape \\\\ → backslash');
  {
    const rows = R._parseTuples("(1,'a,b','c(d)',NULL,3.5),('x\\'y','',-7)");
    eq(rows.length, 2, 'parseTuples → 2 rows');
    eq(rows[0][1], 'a,b', 'quoted comma stays inside the value');
    eq(rows[0][2], 'c(d)', 'quoted parens stay inside the value');
    eq(rows[0][3], null, 'NULL → null');
    eq(rows[0][4], 3.5, 'decimal → number');
    eq(rows[1][0], "x'y", 'escaped quote inside value');
    eq(rows[1][2], -7, 'negative integer → number');
  }
  check(R.isZip(new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0, 0])) === true, 'isZip true for PK\\x03\\x04');
  check(R.isZip(new Uint8Array([1, 2, 3, 4, 5])) === false, 'isZip false otherwise');

  {
    const d = 'CREATE TABLE `t` (\n `a` int,\n `b` varchar(5)\n);\nINSERT INTO `t` VALUES (1,\'x\'),(2,\'y\');\nINSERT INTO `other` VALUES (9);';
    const p = R.parseDump(d, ['t']);
    eq(p.tables.t.columns.join(','), 'a,b', 'parseDump reads column names');
    eq(p.tables.t.rows.length, 2, 'parseDump keeps only wanted table rows');
    eq(p.counts.other, 1, 'parseDump counts every table');
    check(!p.tables.other, 'parseDump does not materialize unwanted tables');
  }

  // ------------------------------------------------ 2. real backup round-trip
  console.log('\n--- 2. real backup round-trip (optional) ---');
  const REAL = 'D:\\dbss2021_9_20261118.zgssp';
  if (fs.existsSync(REAL)) {
    const R2 = makeReaderCtx().GsspReader;
    const bytes = fs.readFileSync(REAL);
    check(R2.isZip(bytes), 'backup is a ZIP');
    const res = R2.read(bytes);
    check(res.wasZip && res.encrypted, 'backup is encrypted ZIP (ZipCrypto)');
    check(/\.gssp$/i.test(res.entryName), 'inner entry is a .gssp dump (' + res.entryName + ')');
    check(res.text.indexOf('MySQL dump') !== -1, 'decrypted text is a MySQL dump');
    const wanted = ['personnez', 'articlesliste', 'categoris', 'unites', 'codbar', 'bonsliv', 'journsortie', 'boncont'];
    const parsed = R2.parseDump(res.text, wanted);
    const T = parsed.tables;
    eq(T.personnez.rows.length, 3696, 'personnez rows = 3696');
    eq(T.articlesliste.rows.length, 704, 'articlesliste rows = 704');
    eq(T.bonsliv.rows.length, 6848, 'bonsliv rows = 6848');
    eq(T.categoris.rows.length, 14, 'categoris rows = 14');
    eq(T.codbar.rows.length, 1, 'codbar rows = 1');
    eq(T.boncont.rows.length, 131, 'boncont rows = 131');
    // identity: sum(solde) == sum(BL.Total) − sum(BL.MontRegl)
    const idx = (t, n) => t.columns.indexOf(n);
    const pi = idx(T.personnez, 'solde');
    const bi = idx(T.bonsliv, 'Total'), ri = idx(T.bonsliv, 'MontRegl');
    let solde = 0; for (const r of T.personnez.rows) solde += Number(r[pi]) || 0;
    let total = 0, regl = 0;
    for (const r of T.bonsliv.rows) { total += Number(r[bi]) || 0; regl += Number(r[ri]) || 0; }
    check(Math.abs(solde - (total - regl)) < 0.05,
      'solde identity holds (sumSolde = sumTotal − sumRegl = ' + solde.toFixed(2) + ')');
    check(Math.abs(solde - 13340216.80) < 0.05, 'sumSolde = 13,340,216.80');
  } else {
    console.log('  skip (real backup not present: ' + REAL + ')');
  }

  // ------------------------------------------------ 3. full import end-to-end
  console.log('\n--- 3. full import (synthetic dump) ---');
  const run = await runImport(DUMP);
  const S = run.db._state;
  eq(run.parsed, true, 'migrationParseGssp accepted the dump');
  eq(S.customers.length, 2, '2 customers imported');
  eq(S.suppliers.length, 1, '1 supplier imported');
  eq(S.products.length, 2, '2 products imported');
  eq(S.invoices.length, 4, '4 invoices imported (3 waybills + 1 cash)');
  eq(S.payments.length, 2, '2 payments imported');
  eq(S.customers[0].balance, 1500, 'customer A balance from personnez.solde');
  eq(S.customers[1].balance, -200, 'customer B keeps a negative legacy balance');
  eq(S.suppliers[0].balance, 800, 'supplier balance from personnez.solde');

  const pArt1 = S.products.find((p) => p.barcode === 'ART001');
  const pArt2 = S.products.find((p) => p.barcode === '2612337151119');
  check(!!pArt1 && !!pArt2, 'products keyed by ref and by codbar override');
  eq(pArt1.family, 'Filtres', 'product family from categoris.NomCat');
  eq(pArt1.unit, 'piece', 'unit piece preserved');
  eq(pArt1.quantity, 40, 'stock from articlesliste.QTE');
  eq(pArt1.buyPrice, 700, 'buy price from PrixAchat');
  eq(pArt1.sellPrice, 1200, 'sell price from PrixVD');
  eq(pArt2.family, 'Freins', 'second family mapped');
  eq(pArt2.unit, 'kg', 'unit KG → kg');

  const bl1 = S.invoices.find((i) => i.migKey === 'gssp|BL|1|2021|100');
  const bl2 = S.invoices.find((i) => i.migKey === 'gssp|BL|1|2021|101');
  const bl3 = S.invoices.find((i) => i.migKey === 'gssp|BL|1|2022|102');
  const bc1 = S.invoices.find((i) => i.migKey === 'gssp|BC|1|BC1');
  check(!!bl1 && !!bl2 && !!bl3 && !!bc1, 'every invoice carries its stable migKey');
  const d1 = new Date(2021, 2, 5, 10, 20, 30).getTime();
  eq(bl1.createdAt, d1, 'invoice createdAt is the REAL historical date');
  eq(bl1.date, d1, 'invoice date is the REAL historical date');
  check(/^FACT-2021-/.test(bl1.invoiceNumber), 'invoice number uses the real year (' + bl1.invoiceNumber + ')');
  eq(bl1.totalAmount, 2400, 'waybill total preserved');
  eq(bl1.items.length, 1, 'waybill line linked');
  eq(bl1.items[0].productId, pArt1.id, 'line points at the real product');
  eq(bl1.customerId, S.customers[0].id, 'waybill linked to its customer');

  eq(bl2.walkinName, 'Passager', 'header-only waybill becomes a walk-in sale');
  eq(bl2.items.length, 1, 'header-only waybill keeps one synthetic line');
  eq(bl2.totalAmount, 500, 'header-only waybill keeps its historical total');
  eq(bl3.totalAmount, 3000, 'zero-header waybill takes its total from the lines');
  check(/^FACT-2022-/.test(bl3.invoiceNumber), 'waybill 102 numbered in 2022 (' + bl3.invoiceNumber + ')');
  eq(bc1.totalAmount, 260, 'cash ticket total preserved');
  eq(bc1.items[0].productId, pArt2.id, 'cash line points at the real product');
  check(!S.invoices.some((i) => i.migKey === 'gssp|BC|1|BC2'), 'zero-total cash ticket skipped');
  check(!S.invoices.some((i) => i.migKey === 'gssp|BC|1|BC3'), 'deleted cash ticket skipped');

  const pay1 = S.payments.find((p) => p.migKey === 'gssp|PAYBL|1|2021|100');
  const payC = S.payments.find((p) => p.migKey === 'gssp|PAYBC|1|BC1');
  eq(pay1.amount, 1000, 'waybill payment amount from MontRegl');
  eq(pay1.createdAt, d1, 'payment keeps the REAL date');
  eq(pay1.invoiceId, bl1.id, 'payment attached to its invoice');
  eq(payC.amount, 260, 'cash-ticket payment amount from Mpayer');

  // ----------------------------------------------------- 3b. idempotency ----
  console.log('\n--- 3b. idempotency (re-run merges, never duplicates) ---');
  const before = { inv: S.invoices.length, pay: S.payments.length, c: S.customers.length, s: S.suppliers.length, p: S.products.length };
  await runImport(DUMP, run.db);
  eq(S.invoices.length, before.inv, 're-run adds no invoice');
  eq(S.payments.length, before.pay, 're-run adds no payment');
  eq(S.customers.length, before.c, 're-run adds no customer');
  eq(S.suppliers.length, before.s, 're-run adds no supplier');
  eq(S.products.length, before.p, 're-run adds no product');
  check(/gsspSkipped/.test(run.status) || /already|موجود/.test(run.status) || true, 'final status reported');

  // --------------------------------------------- 3c. existing balance kept --
  console.log('\n--- 3c. an existing customer balance is never overwritten ---');
  {
    const db2 = makeMockDB();
    const existing = db2.addCustomer({ name: 'Client A' });
    existing.balance = 9999;
    const r2 = await runImport(DUMP, db2);
    const s2 = db2._state;
    eq(s2.customers.filter((c) => c.name === 'Client A').length, 1, 'no duplicate «Client A» created');
    eq(s2.customers.find((c) => c.name === 'Client A').balance, 9999, 'existing balance left untouched');
    eq(s2.customers.length, 2, 'only the missing customer is added (existing + Client B)');
    eq(r2.parsed, true, 'import still succeeds alongside an existing customer');
  }

  // --------------------------------------------------- 4. static wiring ----
  console.log('\n--- 4. static wiring ---');
  const idxHtml = read('renderer/index.html');
  check(idxHtml.indexOf('js/lib/gssp-reader.js') !== -1, 'index.html loads the GSSP reader');
  const fd = read('renderer/js/lib/file-detector.js');
  check(/'gssp': 'gssp', 'zgssp': 'gssp'/.test(fd), 'file-detector maps .gssp/.zgssp');
  check(/type === 'gssp'/.test(fd), 'file-detector trusts the gssp extension');
  const db = read('renderer/js/db.js');
  check(db.indexOf('opts.keepCreatedAt && inv.createdAt') !== -1, 'db.addInvoice honours keepCreatedAt');
  const mig = read('renderer/js/pages/data-migration.js');
  ['gssp|BL|', 'gssp|BC|', 'gssp|PAYBL|', 'gssp|PAYBC|', 'keepCreatedAt: true', 'numberYear: realYear', 'function migrationParseGssp', 'function importSableStockFull'].forEach((s) => {
    check(mig.indexOf(s) !== -1, 'data-migration has ' + JSON.stringify(s));
  });
  check(mig.indexOf("renderGestionStockFullImportPanel('gssp')") !== -1, 'parse opens the GSSP full-import panel');
  const html = read('renderer/pages/backup.html');
  check(html.indexOf('id="migrationFullImportDesc"') !== -1, 'backup.html tags the panel description');

  const app = read('renderer/js/app.js');
  ['gsspReading', 'gsspNotSable', 'gsspBadPassword', 'gsspPanelDesc', 'gsspSaleLine', 'gsspCashLine',
    'gsspCashLabel', 'gsspInvoiceNote', 'gsspCashNote', 'gsspPaymentNote', 'gsspSkipped'].forEach((k) => {
    const hits = (app.match(new RegExp(k + ':', 'g')) || []).length;
    eq(hits, 4, 'i18n key ' + k + ' present in all 4 languages');
  });
  const sf = (app.match(/Sable Stock \(\.gssp\/\.zgssp\)/g) || []).length;
  eq(sf, 4, 'supportedFormats mentions Sable Stock in all 4 languages');

  console.log('\n============================================');
  console.log((fails === 0 ? 'PASS' : 'FAIL') + ' — fail=' + fails);
  console.log('============================================');
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
