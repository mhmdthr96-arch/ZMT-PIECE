// Static verification of the employees page feature (source only).
// Usage: node renderer/tests/employees-verify.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..') + path.sep;
let fails = 0, passes = 0;
const ok = (m) => { passes++; console.log('  ok  ' + m); };
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const lineOf = (src, needle) => src.split('\n').find(l => l.indexOf(needle) !== -1) || '';

function extractBlocks(src, marker) {
  const blocks = [];
  let i = 0;
  while ((i = src.indexOf(marker, i)) >= 0) {
    const j = src.indexOf('{', i);
    let d = 0, k = j;
    for (; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (d === 0) break; }
    }
    blocks.push(src.slice(j, k + 1));
    i = k + 1;
  }
  return blocks;
}

function keysOf(block) {
  const keys = new Set();
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  let m;
  while ((m = re.exec(block))) keys.add(m[1]);
  return keys;
}

// ---------- 1. index.html nav + script ----------
console.log('\n=== index.html ===');
const idx = read('renderer/index.html');
if (lineOf(idx, 'data-page="employees"').includes('data-page="employees"')) ok('nav item data-page="employees" exists');
else bad('nav item data-page="employees" missing');
if (lineOf(idx, 'js/payroll.js').includes('payroll.js')) ok('renderer/js/payroll.js is loaded');
else bad('payroll.js script tag missing');

// ---------- 2. i18n blocks (app.js ×4) ----------
console.log('\n=== app.js i18n ===');
const app = read('renderer/js/app.js');
const html = read('renderer/pages/employees.html');
const empJs = read('renderer/js/pages/employees.js');

const htmlKeys = new Set();
let km;
const keyRe = /data-i18n(?:-placeholder)?="([^"]+)"/g;
while ((km = keyRe.exec(html))) htmlKeys.add(km[1]);
const jsKeyRe = /\bt\('([^']+)'\)/g;
while ((km = jsKeyRe.exec(empJs))) htmlKeys.add(km[1]);

const empLangKeys = new Set([...htmlKeys].filter(k => k.startsWith('employees.')).map(k => k.split('.')[1]));
const hasOtherPrefix = [...htmlKeys].filter(k => !k.startsWith('employees.') && !k.startsWith('common.') && !k.startsWith('sales.'));
if (hasOtherPrefix.length) bad('unexpected i18n prefixes in employees page: ' + hasOtherPrefix.join(','));
else ok('i18n keys are employees.* / common.* / sales.* only');

const empBlocks = extractBlocks(app, 'employees: {');
if (empBlocks.length === 4) ok('employees i18n block exists ×4 (ar/en/fr/zh)');
else bad('employees i18n blocks found: ' + empBlocks.length);

empBlocks.forEach((b, i) => {
  const have = keysOf(b);
  const missing = [...empLangKeys].filter(k => !have.has(k));
  if (missing.length) bad(`block #${i} missing keys: ` + missing.join(','));
  else ok(`block #${i} has all ${empLangKeys.size} employees.* keys used by page`);
});

if (app.includes("typeSalary:")) {
  const n = (app.match(/typeSalary:/g) || []).length;
  if (n === 4) ok('expenses.typeSalary exists ×4');
  else bad('expenses.typeSalary count = ' + n);
} else bad('expenses.typeSalary missing');

const navN = (app.match(/employees:\s*'/g) || []).length;
if (navN >= 4) ok('nav.employees label exists ×' + navN);
else bad('nav.employees label missing (found ' + navN + ')');

const phsBlock = extractBlocks(app, 'PHS_SCANNER_FIELD = {')[0] || '';
if (phsBlock.includes("employees: 'empScanInput'")) ok('PHS_SCANNER_FIELD.employees = empScanInput');
else bad('PHS_SCANNER_FIELD.employees missing');

// ---------- 3. auth.js ----------
console.log('\n=== auth.js ===');
const auth = read('renderer/js/auth.js');
const defPages = extractBlocks(auth, 'DEFAULT_PAGES = {')[0] || '';
const pageNames = extractBlocks(auth, 'PAGE_NAMES = {')[0] || '';
if (defPages.includes("'employees': { view: true, edit: true, del: true }")) ok('DEFAULT_PAGES[employees] = view/edit/del true');
else bad('DEFAULT_PAGES[employees] missing or wrong');
if (pageNames.includes("'employees':")) ok('PAGE_NAMES[employees] present');
else bad('PAGE_NAMES[employees] missing');

// ---------- 4. db.js ----------
console.log('\n=== db.js ===');
const db = read('renderer/js/db.js');
const dbVer = (db.match(/DB_VERSION\s*=\s*(\d+)/) || [])[1];
if (Number(dbVer) >= 7) ok('DB_VERSION = ' + dbVer + ' (≥ 7: enough for employees + attendance)');
else bad('DB_VERSION is below 7 (got ' + dbVer + ')');
if (/employees:\s*'employees'/.test(db) || /'employees'/.test(db)) ok("STORES contains 'employees'");
else bad("STORES missing 'employees'");
if (/'attendance'/.test(db)) ok("STORES contains 'attendance'");
else bad("STORES missing 'attendance'");
['getEmployees', 'saveEmployees', 'addEmployee', 'updateEmployee', 'deleteEmployee',
  'getEmployee', 'getEmployeeByBarcode', 'findEmployeeBarcodeConflict', 'generateBarcode',
  'getAttendanceRows', 'getAttendance', 'getAttendanceForDate', 'getEmployeeAttendanceMonth',
  'upsertAttendance', 'updateAttendance', 'deleteAttendance'].forEach(fn => {
  if (db.includes(fn)) ok('DB.' + fn + ' present');
  else bad('DB.' + fn + ' missing');
});
if (db.includes('zmt_employees') && db.includes('zmt_attendance')) ok('export/import covers zmt_employees + zmt_attendance');
else bad('export/import missing employee stores');

// ---------- 5. payroll.js ----------
console.log('\n=== payroll.js ===');
const pay = read('renderer/js/payroll.js');
['calculate', 'dayRate', 'shiftMinutes', 'perSecondRate', 'graceSec', 'dayKind',
  'paidSum', 'salaryPayments', 'periodKey', 'todayKey'].forEach(fn => {
  if (pay.includes(fn)) ok('PAY.' + fn + ' present');
  else bad('PAY.' + fn + ' missing');
});
if (pay.includes('module.exports')) ok('UMD export present (node-testable)');
else bad('UMD export missing');

// ---------- 6. employees.html structure ----------
console.log('\n=== employees.html ===');
const jsIds = new Set([...empJs.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const missingIds = [...jsIds].filter(id => !htmlIds.has(id));
if (missingIds.length) bad('IDs used by employees.js missing in HTML: ' + missingIds.join(','));
else ok(`all ${jsIds.size} IDs referenced by employees.js exist in employees.html`);

const handlers = new Set([...html.matchAll(/onclick="([A-Za-z_][A-Za-z0-9_]*)\(/g)].map(m => m[1]));
const missingFns = [...handlers].filter(fn => !new RegExp('function\\s+' + fn + '\\b').test(empJs) && !new RegExp('function\\s+' + fn + '\\b').test(app));
if (missingFns.length) bad('onclick handlers without function: ' + missingFns.join(','));
else ok(`all ${handlers.size} onclick handlers defined`);

if (html.includes('id="empScanInput"') && lineOf(html, 'handleEmpScan').includes('handleEmpScan')) ok('scanner input wired to handleEmpScan');
else bad('empScanInput/handleEmpScan wiring missing');

// ---------- 7. employees.js behavior ----------
console.log('\n=== employees.js ===');
['init_employees', 'handleEmpScan', 'renderEmployees', 'openAddEmpModal', 'openEditEmpModal',
  'saveEmp', 'deleteEmpFromModal', 'toggleEmpSettlement', 'renderEmpSettlement',
  'openEmpPay', 'confirmEmpPay', 'undoEmpPay', 'openEmpRec', 'renderEmpRec',
  'openEmpDay', 'saveEmpDay', 'printEmpBadge', 'empManualIn', 'empManualOut'].forEach(fn => {
  if (new RegExp('function\\s+' + fn + '\\b').test(empJs)) ok('function ' + fn);
  else bad('function ' + fn + ' missing');
});
if (empJs.includes("window._pageSyncHandlers['employees']")) ok('LAN sync handler registered');
else bad('_pageSyncHandlers[employees] missing');
if (empJs.includes("type: 'net_expense'") && empJs.includes("tag: 'salary'")) ok('payout saved as net_expense + tag salary');
else bad('payout payment type/tag wrong');
if (empJs.includes('syncPreserveRefresh')) ok('uses syncPreserveRefresh');
else bad('syncPreserveRefresh not used');

// ---------- 8. expenses.js salary label ----------
console.log('\n=== expenses.js ===');
const exp = read('renderer/js/pages/expenses.js');
if (exp.includes("p.tag === 'salary'")) ok("expenses.js recognizes tag 'salary'");
else bad("expenses.js missing salary tag handling");
if (exp.includes('typeSalary')) ok('expenses.js shows typeSalary label');
else bad('expenses.js typeSalary label missing');
if (exp.includes('employeeName')) ok('expenses.js shows employee name');
else bad('expenses.js employee name missing');

// ---------- 9. sync lists ----------
console.log('\n=== sync lists ===');
const lan = read('renderer/js/lan-service.js');
if (lan.includes("'employees'")) ok('lan-service refresh list contains employees');
else bad('lan-service missing employees');
if (lan.includes("'attendance'") || lan.includes('attendance')) ok('lan-service snapshot contains attendance');
else bad('lan-service missing attendance');

const sup = read('renderer/js/supabase-service.js');
if (sup.includes('zmt_employees')) ok('supabase collectAllData includes zmt_employees');
else bad('supabase missing zmt_employees');
if (sup.includes('zmt_attendance')) ok('supabase collectAllData includes zmt_attendance');
else bad('supabase missing zmt_attendance');

const bak = read('renderer/js/pages/backup.js');
if (bak.includes('zmt_employees') && bak.includes('zmt_attendance')) ok('backup.js covers employee stores');
else bad('backup.js missing employee stores');

const conn = read('renderer/js/pages/connection.js');
if (conn.includes('zmt_employees') && conn.includes('zmt_attendance')) ok('connection.js restore covers employee stores');
else bad('connection.js missing employee stores');

console.log(`\n=== RESULT: ${passes} passed, ${fails} failed ===`);
process.exit(fails ? 1 : 0);
