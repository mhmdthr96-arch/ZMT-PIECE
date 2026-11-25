// ============================================================
// ZMT PIECE — Debt Details page guard
// Run: node renderer/tests/debt-details-verify.js
//
// Guards the new «تفاصيل الديون» dashboard:
//   1. the four receivable/payable totals are computed correctly,
//   2. the party filters (all / those who owe us / those we owe) pick the
//      right rows for both customers and suppliers, without mutating the DB
//      cache,
//   3. the Excel array-of-arrays has the right shape, count and total,
//   4. the page markup, the coloured top-bar shortcut and the permission
//      registration are all present,
//   5. the tolerant name/phone search across both lists,
//   6. the debt-alerts feature: sign-aware FIFO aging, the critical-debts list
//      (scope · threshold · ordering), the start-up reminder and the
//      permissions audit (transfer/category-products/details/utility tools).
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

// ----------------------------------------------------------- load the module
const src = read('renderer/js/pages/debt-details.js');
const ctx = { console };
ctx.window = ctx;
ctx.document = { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } };
ctx.DB = { getCustomers: () => [], getSuppliers: () => [] };
ctx.t = (k) => '';
ctx.fmtMoney = (n) => String(n);
ctx.escHtml = (s) => String(s == null ? '' : s);
ctx.alert = () => {};
ctx.XLSX = {
  utils: {
    aoa_to_sheet: (a) => ({ aoa: a }),
    book_new: () => ({}),
    book_append_sheet: () => {},
    encode_cell: () => ({}),
  },
  write: () => '',
  writeFile: () => {},
};
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'debt-details.js' });

const T = ctx;

const customers = [
  { id: 'c1', name: 'Ahmed', balance: 100, phone: '0555', address: 'Algiers' },
  { id: 'c2', name: 'Bilal', balance: -50, phone: '0666', address: 'Oran' },
  { id: 'c3', name: 'Karim', balance: 0, phone: '', address: '' },
];
const suppliers = [
  { id: 's1', name: 'Sup One', balance: 200, phone: '0111', address: 'Blida' },
  { id: 's2', name: 'Sup Two', balance: -70, phone: '0222', address: 'Setif' },
];

console.log('============================================');
console.log('Debt Details — totals, filters, Excel shape, wiring');
console.log('============================================');

console.log('\n--- 1. four totals ---');
{
  const tt = T._ddTotalsFrom(customers, suppliers);
  check(Math.abs(tt.onCustomers - 100) < 1e-9, 'on customers = 100 (customer balance > 0)');
  check(Math.abs(tt.toCustomers - 50) < 1e-9, 'to customers = 50 (customer balance < 0)');
  check(Math.abs(tt.toSuppliers - 200) < 1e-9, 'to suppliers = 200 (supplier balance > 0)');
  check(Math.abs(tt.fromSuppliers - 70) < 1e-9, 'from suppliers = 70 (supplier balance < 0)');
  const empty = T._ddTotalsFrom(null, null);
  check(empty.onCustomers === 0 && empty.toSuppliers === 0, 'empty lists → all totals zero');
}

console.log('\n--- 2. filters ---');
{
  const allC = T._ddFilterParties('customer', 'all', customers);
  const owingC = T._ddFilterParties('customer', 'owing', customers);
  const owedC = T._ddFilterParties('customer', 'owed', customers);
  check(allC.length === 3, 'customers/all → 3');
  check(owingC.length === 1 && owingC[0].id === 'c1', 'customers/owing → only the one who owes us');
  check(owedC.length === 1 && owedC[0].id === 'c2', 'customers/owed → only the one we owe');
  check(customers.length === 3, 'filter never mutates the source list');

  const owingS = T._ddFilterParties('supplier', 'owing', suppliers);
  const owedS = T._ddFilterParties('supplier', 'owed', suppliers);
  check(owingS.length === 1 && owingS[0].id === 's2', 'suppliers/owing → the one who owes us');
  check(owedS.length === 1 && owedS[0].id === 's1', 'suppliers/owed → the one we owe');
}

console.log('\n--- 3. status key ---');
{
  check(T._ddStatusKey('customer', 10) === 'owingUs', 'customer + → owingUs');
  check(T._ddStatusKey('customer', -10) === 'weOwe', 'customer − → weOwe');
  check(T._ddStatusKey('supplier', 10) === 'weOwe', 'supplier + → weOwe');
  check(T._ddStatusKey('supplier', -10) === 'owingUs', 'supplier − → owingUs');
  check(T._ddStatusKey('customer', 0) === '', 'zero → no status');
}

console.log('\n--- 4. Excel AOA shape ---');
{
  const L = {
    title: 'T', dateLabel: 'Date', countLabel: 'Count', by: 'By',
    colIndex: '#', colName: 'Name', colPhone: 'Phone', colAddress: 'Address',
    colBalance: 'Balance', colStatus: 'Status', total: 'Total',
    statusOwingUs: 'Owes', statusWeOwe: 'WeOwe',
  };
  const built = T._ddBuildAoa('customer', 'all', customers, L, { date: '2026-01-01', user: 'Me' });
  check(built.count === 3, 'count = 3');
  check(built.aoa.length === 3 + 6, 'aoa has header(4) + 3 rows + empty + total = 9 rows');
  check(Array.isArray(built.aoa[3]) && built.aoa[3].length === 6, 'header row has 6 columns');
  check(built.aoa[4][0] === 1 && built.aoa[4][1] === 'Ahmed', 'first data row starts at index 4');
  const totalRow = built.aoa[built.aoa.length - 1];
  check(Math.abs(totalRow[4] - 50) < 1e-9, 'total row carries the net sum (100 − 50 = 50)');
  check(built.aoa[4][5] === 'Owes', 'customer owing row labelled statusOwingUs');

  const sup = T._ddBuildAoa('supplier', 'owed', suppliers.slice(0, 1), L, {});
  check(sup.aoa[4][5] === 'WeOwe', 'supplier owed row labelled statusWeOwe');
  check(Math.abs(sup.aoa[sup.aoa.length - 1][4] - 200) < 1e-9, 'supplier total = 200');
}

console.log('\n--- 5. search (name / phone across both lists) ---');
{
  const cust = [
    { id: 'c1', name: 'أحمد بن علي', balance: 120, phone: '0555111222' },
    { id: 'c2', name: 'Samir', balance: -30, phone: '0666000111' },
    { id: 'c3', name: 'Parts Delta Co', balance: 5, phone: '' },
  ];
  const sup = [
    { id: 's1', name: 'أحمد للتوريد', balance: 400, phone: '0777999888' },
    { id: 's2', name: 'Delta Parts', balance: -15, phone: '0555111222' },
  ];

  const byName = T._ddSearchAll('أحمد', cust, sup);
  check(byName.length === 2, 'search "أحمد" finds both the customer and the supplier');
  check(byName.every(r => r.kind === 'customer' || r.kind === 'supplier'), 'each hit carries a kind');
  check(byName.some(r => r.kind === 'customer') && byName.some(r => r.kind === 'supplier'),
    'results identify customer vs supplier');

  const tolerant = T._ddSearchAll('احمد', cust, sup); // bare alef
  check(tolerant.length === 2, 'search is tolerant to alef/hamza spelling (احمد == أحمد)');

  const ranked = T._ddSearchAll('delta', cust, sup);
  check(ranked.length === 2, 'search "delta" finds both spellings across the two lists');
  check(ranked[0].party.id === 's2', 'name-prefix match ranks before a mid-name match');

  const byPhone = T._ddSearchAll('0555111222', cust, sup);
  check(byPhone.length === 2, 'phone search matches across both lists');
  check(byPhone.some(r => r.party.id === 'c1') && byPhone.some(r => r.party.id === 's2'),
    'phone search returns the right two parties');

  check(T._ddSearchAll('', cust, sup).length === 0, 'empty query → no results');
  check(T._ddSearchAll('zzz-nobody', cust, sup).length === 0, 'no match → empty');
  check(cust.length === 3 && sup.length === 2, 'search never mutates the source lists');
}

console.log('\n--- 6. page markup ---');
{
  const html = read('renderer/pages/debt-details.html');
  ['ddOnCustomers', 'ddToSuppliers', 'ddToCustomers', 'ddFromSuppliers', 'ddCustMenu', 'ddSupMenu', 'ddResults']
    .forEach((id) => check(html.indexOf('id="' + id + '"') !== -1, 'has #' + id));
  ['debtDetails.title', 'debtDetails.onCustomers', 'debtDetails.toSuppliers', 'debtDetails.toCustomers',
    'debtDetails.fromSuppliers', 'debtDetails.exportCustomers', 'debtDetails.exportSuppliers',
    'debtDetails.groupAll', 'debtDetails.groupOwing', 'debtDetails.groupOwed', 'debtDetails.exportExcel', 'debtDetails.view']
    .forEach((k) => check(html.indexOf('data-i18n="' + k + '"') !== -1, 'markup uses ' + k));
  check(html.indexOf("ddExport('customer','all')") !== -1, 'customers menu wires ddExport');
  check(html.indexOf("ddView('supplier','owed')") !== -1, 'suppliers menu wires ddView');
  check(html.indexOf('id="ddSearchInput"') !== -1, 'markup has the search input #ddSearchInput');
  check(html.indexOf('id="ddSearchClear"') !== -1, 'markup has the search clear button');
  check(html.indexOf('data-i18n-placeholder="debtDetails.searchPh"') !== -1, 'search placeholder is translated');
  check(html.indexOf('oninput="ddSearchInput(this.value)"') !== -1, 'search input is wired to ddSearchInput');
}

console.log('\n--- 7. top-bar shortcut + CSS + permissions ---');
{
  const ta = read('renderer/js/top-actions.js');
  check(ta.indexOf("id: 'tbActDebtDetails'") !== -1, 'top-actions registers tbActDebtDetails');
  check(ta.indexOf("page: 'debt-details'") !== -1, 'shortcut targets debt-details');
  check(ta.indexOf("labelKey: 'movements.btnDebts'") !== -1, 'shortcut uses movements.btnDebts label');
  check(/debts:\s*'<svg/.test(ta), 'a debts SVG icon is defined');

  const css = read('renderer/css/main.css');
  check(css.indexOf('.tb-action-debt') !== -1, 'main.css styles .tb-action-debt');

  const auth = read('renderer/js/auth.js');
  check(auth.indexOf("'debt-details': { view: true") !== -1, 'auth DEFAULT_PAGES has debt-details');
  check(auth.indexOf("'debt-details': 'تفاصيل الديون'") !== -1, 'auth PAGE_NAMES has debt-details');

  const idx = read('renderer/index.html');
  check(idx.indexOf('data-page="debt-details"') !== -1, 'sidebar has a debt-details nav item');
  check(idx.indexOf('data-i18n="nav.debtDetails"') !== -1, 'nav item uses nav.debtDetails');
  check(idx.indexOf('js/top-actions.js') !== -1, 'index.html loads top-actions.js');
}

console.log('\n--- 8. critical-debts aging (sign-aware FIFO) ---');
{
  const DAY = 86400000;
  const now = Date.now();
  const entries = [
    { delta: 100, ts: now - 10 * DAY },                       // newest
    { delta: 100, ts: now - 40 * DAY },
    { delta: 100, ts: now - 70 * DAY },                       // oldest
    { delta: 0, ts: now - 5 * DAY, informational: true },     // ignored
  ];
  check(T._ddAgingForOwed(entries, 150, 1).oldestDays === 40, 'customer owed 150 → oldest slice is 40d');
  check(T._ddAgingForOwed(entries, 250, 1).oldestDays === 70, 'customer owed 250 → oldest slice is 70d');
  check(T._ddAgingForOwed(entries, 400, 1).oldestDays === 365, 'unmatched opening balance → treated as oldest (365d)');
  check(T._ddAgingForOwed(entries, 0, 1).oldestDays === 0, 'nothing owed → 0');
  check(T._ddAgingForOwed([], 100, 1).oldestDays === 365, 'no ledger but a debt → oldest (365d)');

  const supEntries = [
    { delta: -100, ts: now - 5 * DAY },
    { delta: -100, ts: now - 50 * DAY },
    { delta: 100, ts: now - 90 * DAY }, // a movement in our favour the other way → ignored
  ];
  check(T._ddAgingForOwed(supEntries, 100, -1).oldestDays === 5, 'supplier owed 100 (dir −1) → 5d');
  check(T._ddAgingForOwed(supEntries, 150, -1).oldestDays === 50, 'supplier owed 150 → oldest 50d');

  // Imported rows keep the real movement date in `date` while `ts`/createdAt is
  // only the import time. Aging must follow the business date, otherwise every
  // migrated supplier advance looks brand new and never turns critical.
  check(T._ddEntryTs({ ts: now - 2 * DAY, date: now - 45 * DAY }) === now - 45 * DAY,
    '_ddEntryTs prefers the business date over the entry timestamp');
  check(T._ddEntryTs({ ts: now - 3 * DAY }) === now - 3 * DAY, '_ddEntryTs falls back to ts when no date');
  check(T._ddEntryTs({ ts: now - 3 * DAY, date: '' }) === now - 3 * DAY, '_ddEntryTs ignores an empty date');
  check(T._ddEntryTs({ ts: now - 3 * DAY, date: String(now - 30 * DAY) }) === now - 30 * DAY,
    '_ddEntryTs accepts a numeric-string business date');
  const importedSup = [{ delta: -200, ts: now - 2 * DAY, date: now - 45 * DAY }];
  check(T._ddAgingForOwed(importedSup, 200, -1).oldestDays === 45,
    'imported supplier credit ages by its business date (45d), not the import time');
  const importedCust = [{ delta: 300, ts: now - 1 * DAY, date: now - 40 * DAY }];
  check(T._ddAgingForOwed(importedCust, 300, 1).oldestDays === 40,
    'imported customer invoice ages by its business date (40d)');
}

console.log('\n--- 9. critical-debts list (scope · threshold · ordering) ---');
{
  const DAY = 86400000;
  const now = Date.now();
  const build = (kind, p) => ({ entries: p.entries || [] });
  const cust = [
    { id: 'c1', name: 'Old', balance: 100, entries: [{ delta: 100, ts: now - 45 * DAY }] },  // 45d → critical @30
    { id: 'c2', name: 'New', balance: 100, entries: [{ delta: 100, ts: now - 5 * DAY }] },    // 5d → not
    { id: 'c3', name: 'WeOwe', balance: -80, entries: [] },                                    // we owe → skip
  ];
  const sup = [
    { id: 's1', name: 'SupOld', balance: -200, entries: [{ delta: -200, ts: now - 65 * DAY }] }, // 65d → critical
    { id: 's2', name: 'SupWeOwe', balance: 50, entries: [] },                                     // we owe → skip
  ];

  const both = T._ddCriticalDebts({ enabled: true, scope: 'both', days: 30 }, cust, sup, build);
  check(both.length === 2, 'both scope → 2 critical parties');
  check(both.some(r => r.party.id === 'c1' && r.kind === 'customer'), 'customer owing past the duration is critical');
  check(both.some(r => r.party.id === 's1' && r.kind === 'supplier'), 'supplier owing us past the duration is critical');
  check(!both.some(r => r.party.id === 'c2'), 'a fresh debt is not critical');
  check(!both.some(r => r.party.id === 'c3' || r.party.id === 's2'), 'parties we owe are never critical');
  check(both[0].party.id === 's1', 'list is ordered by oldest debt first');

  const onlyC = T._ddCriticalDebts({ enabled: true, scope: 'customers', days: 30 }, cust, sup, build);
  check(onlyC.length === 1 && onlyC[0].party.id === 'c1', 'scope=customers → only customers');
  const onlyS = T._ddCriticalDebts({ enabled: true, scope: 'suppliers', days: 30 }, cust, sup, build);
  check(onlyS.length === 1 && onlyS[0].party.id === 's1', 'scope=suppliers → only suppliers');

  const at60 = T._ddCriticalDebts({ enabled: true, scope: 'both', days: 60 }, cust, sup, build);
  check(at60.length === 1 && at60[0].party.id === 's1', '60-day threshold excludes the 45-day debt');
  const at3 = T._ddCriticalDebts({ enabled: true, scope: 'both', days: 3 }, cust, sup, build);
  check(at3.length === 3, 'a 3-day threshold also catches the 5-day debt');

  check(T._ddCriticalDebts({ enabled: false, scope: 'both', days: 30 }, cust, sup, build).length === 0,
    'disabled → empty list');

  // A supplier migrated with a real business date must turn critical even though
  // its row was created (imported) only a couple of days ago.
  const supImported = [
    { id: 's9', name: 'SupImported', balance: -500, entries: [{ delta: -500, ts: now - 2 * DAY, date: now - 120 * DAY }] },
  ];
  const imp = T._ddCriticalDebts({ enabled: true, scope: 'suppliers', days: 30 }, [], supImported, build);
  check(imp.length === 1 && imp[0].party.id === 's9' && imp[0].oldestDays === 120,
    'a migrated supplier advance turns critical by its business date, not the import time');
}

console.log('\n--- 10. alerts markup + config + permissions audit ---');
{
  const html = read('renderer/pages/debt-details.html');
  ['ddAlertsBtn', 'ddAlertsChip', 'ddCriticalPanel', 'ddCriticalBody', 'ddCritSearch',
    'ddCritClear', 'ddCritCount', 'ddAlertsModal', 'ddAlertScope', 'ddAlertEnable', 'ddAlertDuration']
    .forEach((id) => check(html.indexOf('id="' + id + '"') !== -1, 'markup has #' + id));
  ['debtDetails.alertsBtn', 'debtDetails.alertsTitle', 'debtDetails.scopeCustomers', 'debtDetails.scopeSuppliers',
    'debtDetails.scopeBoth', 'debtDetails.enable', 'debtDetails.disable', 'debtDetails.durWeek', 'debtDetails.durTwoWeeks',
    'debtDetails.durMonth', 'debtDetails.durTwoMonths', 'debtDetails.criticalTitle']
    .forEach((k) => check(html.indexOf('data-i18n="' + k + '"') !== -1, 'markup uses ' + k));
  check(html.indexOf('data-i18n-placeholder="debtDetails.critSearchPh"') !== -1, 'markup uses debtDetails.critSearchPh');
  check(html.indexOf('onclick="ddOpenAlerts()"') !== -1, 'alerts button opens the modal');
  check(html.indexOf('onclick="ddSaveAlerts()"') !== -1, 'modal saves the alert settings');
  check(html.indexOf('onclick="ddCritExport()"') !== -1, 'critical list exports to Excel');
  check(html.indexOf('onclick="ddCritPrint()"') !== -1, 'critical list prints');

  const js = read('renderer/js/pages/debt-details.js');
  check(js.indexOf("'zmt_debt_alerts'") !== -1, 'debt-details reads/writes zmt_debt_alerts');
  check(js.indexOf('window.ddShowDebtAlertReminder') !== -1, 'exposes the start-up reminder builder');
  check(js.indexOf('function _ddCriticalDebts') !== -1, 'defines the critical-debts computation');
  check(js.indexOf('function ddOpenCriticalFromAlert') !== -1, 'reminder «عرض» opens the list');
  check(js.indexOf('function _ddEntryTs') !== -1, 'ages debts by the business date (imported rows)');
  check(js.indexOf('var PER_TYPE = 3;') !== -1, 'reminder lists the top of each type, not just the overall top 6');
  check(js.indexOf('dd-reminder-split') !== -1, 'reminder shows a per-type split (customers · suppliers)');
  check(js.indexOf('document.body.appendChild(m)') !== -1 && js.indexOf('m._host') !== -1,
    'alerts modal is hoisted to <body> while open (stays centred in the viewport, not the tall page)');

  const indexHtml = read('renderer/index.html');
  check(/js\/pages\/debt-details\.js/.test(indexHtml),
    'index.html preloads js/pages/debt-details.js (reminder works before the page is opened)');
  check(/css\/debt-alerts\.css/.test(indexHtml),
    'index.html links css/debt-alerts.css (reminder is styled before the page is opened)');
  const alertCss = read('renderer/css/debt-alerts.css');
  check(alertCss.indexOf('.dd-reminder-overlay') !== -1, 'global stylesheet styles the reminder overlay');
  check(alertCss.indexOf('html[data-theme="dark"] .dd-reminder') !== -1, 'global stylesheet covers dark mode');
  check(alertCss.indexOf('.dd-reminder-split') !== -1, 'global stylesheet styles the reminder split line');

  const app = read('renderer/js/app.js');
  check(app.indexOf('window.getDebtAlertSettings') !== -1, 'app defines getDebtAlertSettings');
  check(app.indexOf('window.checkDebtAlertsWarning') !== -1, 'app defines checkDebtAlertsWarning');
  check(app.indexOf('checkDebtAlertsWarning();') !== -1, 'app calls the reminder at boot');
  ['debtDetails.alertsBtn', 'debtDetails.criticalTitle', 'debtDetails.reminderTitle', 'debtDetails.later']
    .forEach((k) => check(app.indexOf("alertsBtn:") !== -1 || app.indexOf(k.split('.')[1] + ":") !== -1,
      'i18n key ' + k + ' present'));

  const auth = read('renderer/js/auth.js');
  ['transfer', 'category-products', 'customer-detail', 'supplier-detail', 'activity-log', 'theme-settings', 'data-migration']
    .forEach((p) => {
      check(auth.indexOf("'" + p + "': { view:") !== -1, 'DEFAULT_PAGES includes ' + p);
      check(auth.indexOf("'" + p + "': '") !== -1, 'PAGE_NAMES includes ' + p);
    });

  const backup = read('renderer/js/pages/backup.js');
  check(backup.indexOf("'zmt_debt_alerts'") !== -1, 'backup settingsKeys includes zmt_debt_alerts');
  const supa = read('renderer/js/supabase-service.js');
  check(supa.indexOf("'zmt_debt_alerts'") !== -1, 'cloud sync settingsKeys includes zmt_debt_alerts');

  const act = read('renderer/js/pages/activity-log.js');
  check(act.indexOf("Auth.canView('activity-log')") !== -1, 'activity-log is permission-gated');
  const thm = read('renderer/js/pages/theme-settings.js');
  check(thm.indexOf("Auth.canView('theme-settings')") !== -1, 'theme-settings is permission-gated');
  const mig = read('renderer/js/pages/data-migration.js');
  check(mig.indexOf("Auth.canView('data-migration')") !== -1, 'data-migration is permission-gated');
}

console.log('\n--- 11. sidebar active-company banner ---');
{
  const indexHtml = read('renderer/index.html');
  check(indexHtml.indexOf('id="sidebarCompany"') !== -1, 'sidebar has the company banner');
  check(indexHtml.indexOf('id="sidebarCompanyName"') !== -1, 'sidebar banner has a name slot');
  check(indexHtml.indexOf('data-i18n="menu.currentCompany"') !== -1, 'banner label is translated');

  const css = read('renderer/css/main.css');
  check(css.indexOf('.sidebar-company {') !== -1, 'main.css styles the company banner');
  check(css.indexOf('.sidebar-company-name') !== -1, 'main.css styles the company name');
  check(css.indexOf('sidebarCompanyShine') !== -1, 'banner has the shine animation');
  check(css.indexOf('.app-container.sidebar-slim .sidebar-company') !== -1,
    'banner hides when the sidebar is collapsed');
  check(css.indexOf('.sidebar .sidebar-company') !== -1,
    'banner hides on narrow screens');

  const app = read('renderer/js/app.js');
  check(app.indexOf('function renderSidebarCompany()') !== -1, 'app defines renderSidebarCompany');
  check(app.indexOf('window.renderSidebarCompany = renderSidebarCompany') !== -1,
    'renderSidebarCompany is exposed globally');
  check(app.indexOf('renderSidebarCompany();') !== -1, 'banner is filled at boot');
  check(app.indexOf("currentCompany: 'الشركة الحالية'") !== -1, 'ar translation present');
  check(app.indexOf("currentCompany: 'Current company'") !== -1, 'en translation present');
  check(app.indexOf("currentCompany: 'Société actuelle'") !== -1, 'fr translation present');
  check(app.indexOf("currentCompany: '当前公司'") !== -1, 'zh translation present');

  const settings = read('renderer/js/pages/settings.js');
  check(settings.indexOf('renderSidebarCompany()') !== -1,
    'entering/leaving a company refreshes the banner');
}

console.log('\n============================================');
console.log((fails === 0 ? 'PASS' : 'FAIL') + ' — fail=' + fails);
console.log('============================================');
process.exit(fails === 0 ? 0 : 1);
