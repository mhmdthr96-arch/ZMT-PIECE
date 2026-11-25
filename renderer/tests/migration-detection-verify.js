// ============================================================
// ZMT PIECE — migration file-detection / engine asset guard
// Run: node renderer/tests/migration-detection-verify.js
//
// Guards the «استيراد من برنامج سابق» path after the GSSP release:
//   1. extension mapping for every legacy format (.bak, Firebird, SQLite,
//      GSSP, ...);
//   2. conservative .bak content sniffing — positive evidence redirects,
//      inconclusive headers keep the historical SQL Server default;
//   3. binary formats must never be re-classified by text sniffing;
//   4. the manual format override + engine diagnostics are wired in every UI
//      page and in all four languages;
//   5. both build configs ship the migration engines, and the installer
//      verifier actually checks them.
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let fails = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
const check = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (a, b, m) => check(a === b, m + (a === b ? '' : ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)));

function makeDetector() {
  const ctx = { console, TextDecoder, Uint8Array, ArrayBuffer, Math, Set, Map };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('renderer/js/lib/file-detector.js'), ctx, { filename: 'file-detector.js' });
  return ctx.window.FileDetector;
}

function ab(bytes) {
  const u = new Uint8Array(bytes.length);
  u.set(bytes);
  return u.buffer;
}
const textBuf = (s) => ab(Buffer.from(s, 'utf8'));
const pad = (bytes, n) => { const out = Array.from(bytes); while (out.length < n) out.push(0x41); return ab(out); };
const sqliteBuf = () => pad(Buffer.from('SQLite format 3\u0000', 'binary'), 128);
const zipBuf = () => pad([0x50, 0x4B, 0x03, 0x04], 128);
const oleBuf = () => pad([0xD0, 0xCF, 0x11, 0xE0], 128);
const binaryBuf = () => pad([0x00, 0x01, 0x02, 0x03, 0x04, 0x05], 128);

console.log('migration detection / engine guard');

// ----------------------------------------------------- extension mapping --
console.log('\n=== extension mapping (unchanged formats) ===');
const D = makeDetector();
// Use realistic content per format: the detector legitimately prefers a
// positive magic/text signature over the extension for flat files.
const extCases = [
  ['x.bak', binaryBuf(), 'mssql-bak'],
  ['x.fdb', textBuf('id,name,price\n1,x,2'), 'firebird'],
  ['x.fbk', textBuf('id,name,price\n1,x,2'), 'firebird'],
  ['x.gdb', textBuf('id,name,price\n1,x,2'), 'firebird'],
  ['x.db', sqliteBuf(), 'sqlite'],
  ['x.sqlite', sqliteBuf(), 'sqlite'],
  ['x.sqlite3', sqliteBuf(), 'sqlite'],
  ['x.gssp', textBuf('CREATE TABLE personnez;'), 'gssp'],
  ['x.zgssp', zipBuf(), 'gssp'],
  ['x.dbf', binaryBuf(), 'dbf'],
  ['x.csv', textBuf('id,name\n1,product'), 'csv'],
  ['x.xlsx', oleBuf(), 'excel'],
  ['x.json', textBuf('{"a":1}'), 'json'],
  ['x.sql', textBuf('CREATE TABLE x (id INT);'), 'sql'],
  ['x.mdb', binaryBuf(), 'access'],
];
for (const [name, buf, want] of extCases) {
  eq(D.detect(name, buf).type, want, name + ' → ' + want);
}

// ---------------------------------------------------- .bak disambiguation --
console.log('\n=== .bak content sniffing (positive evidence only) ===');
eq(D.detect('old.bak', sqliteBuf()).type, 'sqlite', '.bak with SQLite header → sqlite');
eq(D.detect('old.bak', textBuf('-- MySQL dump\nCREATE TABLE `articles` (id INT);\n')).type, 'sql', '.bak with SQL dump → sql');
eq(D.detect('old.bak', textBuf('{"products":[{"name":"x"}]}')).type, 'json', '.bak with JSON → json');
eq(D.detect('old.bak', textBuf('<?xml version="1.0"?><root></root>')).type, 'xml', '.bak with XML → xml');
eq(D.detect('old.bak', oleBuf()).type, 'excel', '.bak with OLE2 header → excel');
eq(D.detect('old.bak', binaryBuf()).type, 'mssql-bak', '.bak with inconclusive binary keeps SQL Server default');
eq(D.detect('old.bak', zipBuf()).type, 'mssql-bak', '.bak with ZIP magic keeps SQL Server default (no guessing)');
eq(D.detect('old.bak', textBuf('TAPE\0SQL SERVER BACKUP HEADER')).type, 'mssql-bak', 'real SQL Server-style header stays mssql-bak');

// ------------------------------------------ binary formats must stay put --
console.log('\n=== binary headers are never re-classified ===');
eq(D.detect('stock.zgssp', zipBuf()).type, 'gssp', 'encrypted GSSP ZIP stays gssp');
eq(D.detect('stock.gssp', textBuf('CREATE TABLE personnez;')).type, 'gssp', 'plain GSSP dump stays gssp');
eq(D.detect('stock.fdb', textBuf('id,name,price\n1,x,2')).type, 'firebird', 'Firebird header with commas stays firebird');
eq(D.detect('stock.fbk', textBuf('id,name,price\n1,x,2')).type, 'firebird', 'Firebird backup with commas stays firebird');
eq(D.detect('stock.db', sqliteBuf()).type, 'sqlite', 'SQLite header stays sqlite');

// --------------------------------------------------- manual override UI ---
console.log('\n=== manual format override wiring ===');
for (const page of ['renderer/pages/data-migration.html', 'renderer/pages/backup.html']) {
  const html = read(page);
  check(html.indexOf('id="migrationForceType"') !== -1, page + ' has the format selector');
  check(html.indexOf('id="migrationForceTypeWrap"') !== -1, page + ' has the selector wrapper');
  check(html.indexOf('value="auto"') !== -1, page + ' keeps "auto" as the default option');
  for (const v of ['mssql-bak', 'firebird', 'sqlite', 'gssp']) {
    check(html.indexOf('value="' + v + '"') !== -1, page + ' offers ' + v);
  }
}

const mig = read('renderer/js/pages/data-migration.js');
for (const fn of ['function migrationForcedType()', 'function migrationEngineHint(', 'function migrationPreflight()']) {
  check(mig.indexOf(fn) !== -1, 'data-migration.js defines ' + fn);
}
check(mig.indexOf('const forced = migrationForcedType();') !== -1, 'processMigrationFile honours the manual override');
check(mig.indexOf('if (!(await migrationPreflight())) return;') !== -1, 'step 1 runs the engine preflight');
check(mig.indexOf("migrationUpdateStatus(t('migration.parseError') + ': ' + migrationEngineHint(type, err)") !== -1,
  'parse failures carry an actionable engine hint');
check(mig.indexOf("migrationEngineHint('mssql-bak', err)") !== -1, 'SQL Server engine failures carry a hint');
check(mig.indexOf("migrationEngineHint('firebird', err)") !== -1, 'Firebird engine failures carry a hint');
check(mig.indexOf("if (fw) fw.style.display = 'none';") !== -1, 'resetMigrationFile hides the override again');

// ------------------------------------------------------------- i18n ------
console.log('\n=== i18n keys in all four languages ===');
const app = read('renderer/js/app.js');
for (const key of ['forceTypeLabel', 'forceAuto', 'forceTypeHint', 'engineHintSql',
  'engineHintFirebird', 'engineHintSqlite', 'engineHintGeneric',
  'mssqlNoPath', 'mssqlOpenError', 'mssqlNoTables']) {
  const n = (app.match(new RegExp('\\b' + key + ':', 'g')) || []).length;
  check(n >= 4, key + ' present in all 4 languages (found ' + n + ')');
}

// ------------------------------------------------- packaging / build ------
console.log('\n=== packaging + build guards ===');
const mainJs = read('main.js');
const filterLine = (mainJs.match(/name:\s*'All Supported'[^\n]*/) || [''])[0];
for (const e of ['bak', 'gssp', 'zgssp']) {
  check(filterLine.indexOf("'" + e + "'") !== -1, 'native import dialog offers .' + e);
}

const w7 = JSON.parse(read('win7.builder.json'));
const w7From = (w7.extraResources || []).filter((r) => r && r.from).map((r) => r.from.replace(/\\/g, '/'));
for (const need of ['mssql-bak.ps1', 'resources/mssql', 'firebird-runtime']) {
  check(w7From.indexOf(need) !== -1, 'win7.builder.json ships ' + need);
}

const vf = read('scripts/verify-installers.js');
check(vf.indexOf('REQUIRED_ENGINE_ASSETS') !== -1, 'installer verifier checks migration engine assets');
check(vf.indexOf('SqlLocalDB.msi') !== -1, 'installer verifier checks the LocalDB MSI');
check(vf.indexOf('sql-wasm.wasm') !== -1, 'installer verifier checks the SQLite WASM');
check(JSON.parse(read('package.json')).scripts['verify:migration'] === 'node renderer/tests/migration-detection-verify.js',
  'npm script verify:migration is registered');

console.log('');
console.log('migration-detection-verify: ' + (fails ? fails + ' FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);
