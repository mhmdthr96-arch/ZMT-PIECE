// ZMT PIECE — verifier for the three newest additions:
//   1) optional RC / NIF / NIS / N°article on every supplier & customer form
//   2) customer credit limit blocking a sale, with «مواصلة» for managers only
//   3) hidden-by-default Référence / Marque columns on the invoice
// Run: node renderer/tests/party-extras-verify.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

function makeCtx(extra) {
  const ctx = Object.assign({
    console, Date, Math, JSON, String, Number, Object, Array, RegExp,
    isFinite, parseInt, parseFloat, setTimeout: () => 0, clearTimeout: () => {},
    alert() {}, confirm: () => true,
  }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  return ctx;
}

function fakeElement() {
  return {
    innerHTML: '', textContent: '', value: '', checked: false,
    style: { setProperty() {}, display: '' }, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, focus() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    querySelector() { return fakeElement(); },
  };
}

console.log('\n=== 1) Static wiring: legal fields on every form ===');
const app = read('renderer/js/app.js');
const shortcuts = read('renderer/js/shortcuts.js');
const supJs = read('renderer/js/pages/suppliers.js');
const supHtml = read('renderer/pages/suppliers.html');
const sdJs = read('renderer/js/pages/supplier-detail.js');
const sdHtml = read('renderer/pages/supplier-detail.html');
const custJs = read('renderer/js/pages/customers.js');
const custHtml = read('renderer/pages/customers.html');
const cdJs = read('renderer/js/pages/customer-detail.js');
const cdHtml = read('renderer/pages/customer-detail.html');
const salesJs = read('renderer/js/pages/sales.js');
const salesHtml = read('renderer/pages/sales.html');
const qeJs = read('renderer/js/pages/quick-entry.js');
const qeHtml = read('renderer/pages/quick-entry.html');
const displayJs = read('renderer/js/display-settings.js');
const invJs = read('renderer/js/pages/invoices.js');
const saleCore = read('renderer/js/sale-core.js');
const dbJs = read('renderer/js/db.js');
const css = read('renderer/css/main.css');

check(app.includes('window.ZmtPartyLegal'), 'app.js: shared ZmtPartyLegal helper');
check(app.includes("{ key: 'rc', suffix: 'Rc' }"), 'helper stores rc');
check(app.includes("{ key: 'nif', suffix: 'Nif' }"), 'helper stores nif');
check(app.includes("{ key: 'nis', suffix: 'Nis' }"), 'helper stores nis');
check(app.includes("{ key: 'article', suffix: 'Article' }"), 'helper stores article');

const prefixes = [
  [supHtml, ['supRc', 'supNif', 'supNis', 'supArticle', 'editSupRc', 'editSupNif', 'editSupNis', 'editSupArticle'], 'suppliers.html'],
  [sdHtml, ['editSupRc', 'editSupNif', 'editSupNis', 'editSupArticle'], 'supplier-detail.html'],
  [custHtml, ['custRc', 'custNif', 'custNis', 'custArticle'], 'customers.html'],
  [cdHtml, ['cdEditRc', 'cdEditNif', 'cdEditNis', 'cdEditArticle'], 'customer-detail.html'],
  [qeHtml, ['qeNewSupRc', 'qeNewSupNif', 'qeNewSupNis', 'qeNewSupArticle'], 'quick-entry.html'],
  [salesHtml, ['sacRc', 'sacNif', 'sacNis', 'sacArticle', 'sacCreditLimit'], 'sales.html'],
];
prefixes.forEach(function (entry) {
  entry[1].forEach(function (id) {
    check(entry[0].includes('id="' + id + '"'), entry[2] + ': field ' + id);
  });
});

['_zmtSupRc', '_zmtSupNif', '_zmtSupNis', '_zmtSupArticle'].forEach(function (id) {
  check(shortcuts.includes("'" + id + "'"), 'F2 window: ' + id);
});
['_zmtCustRc', '_zmtCustNif', '_zmtCustNis', '_zmtCustArticle', '_zmtCustCreditLimit'].forEach(function (id) {
  check(shortcuts.includes("'" + id + "'"), 'F3 window: ' + id);
});
check(shortcuts.includes("ZmtPartyLegal.read('_zmtSup')"), 'F2 save reads legal fields');
check(shortcuts.includes("ZmtPartyLegal.read('_zmtCust')"), 'F3 save reads legal fields');
check(shortcuts.includes('creditLimit: creditLimit'), 'F3 save persists the debt limit');
check(supJs.includes('window.ZmtPartyLegal.read(prefix)'), 'suppliers.js delegates reads');
check(sdJs.includes("window.ZmtPartyLegal.read('editSup')"), 'supplier-detail.js delegates reads');
check(custJs.includes("window.ZmtPartyLegal.read('cust')"), 'customers.js delegates reads');
check(cdJs.includes("window.ZmtPartyLegal.read('cdEdit')"), 'customer-detail.js delegates reads');
check(qeJs.includes("ZmtPartyLegal.read('qeNewSup')"), 'quick entry uses its own field prefix');
check(salesJs.includes("ZmtPartyLegal.read('sac')"), 'sales quick-add reads legal fields');
check(dbJs.includes("['rc', 'nif', 'nis', 'article'].forEach"), 'db.addCustomer normalizes all four keys');
check(app.includes("invalidCreditLimit: 'سقف الدين يجب أن يكون موجباً أو صفراً (بلا حد)'"), 'credit-limit error translated');

console.log('\n=== 2) Shared helper behavior ===');
const helperStart = app.indexOf("if (typeof window.ZmtPartyLegal === 'undefined')");
const helperEnd = app.indexOf('// ===== PHONE BARCODE SCANNER BRIDGE', helperStart);
check(helperStart >= 0 && helperEnd > helperStart, 'helper block found in app.js');
const legalEls = {};
['Rc', 'Nif', 'Nis', 'Article'].forEach(function (s) { legalEls['pfx' + s] = fakeElement(); });
const legalCtx = makeCtx({ document: { getElementById: (id) => legalEls[id] || null } });
vm.runInContext(app.slice(helperStart, helperEnd), legalCtx, { filename: 'party-legal-helper.js' });
check(typeof legalCtx.ZmtPartyLegal.read === 'function', 'helper exports read()');
eq(Object.keys(legalCtx.ZmtPartyLegal.normalize({ rc: ' 12 ' })).length, 4, 'normalize always returns four keys');
eq(legalCtx.ZmtPartyLegal.normalize({ rc: ' 12 ', nif: null }).rc, '12', 'normalize trims values');
eq(legalCtx.ZmtPartyLegal.normalize({ rc: ' 12 ', nif: null }).nif, '', 'normalize fills missing keys with empty strings');
legalCtx.ZmtPartyLegal.fill('pfx', { rc: 'RC9', nif: 'N7', nis: 'NI5', article: 'ART3' });
eq(legalEls.pfxRc.value, 'RC9', 'fill writes rc');
eq(legalEls.pfxArticle.value, 'ART3', 'fill writes article');
const readBack = legalCtx.ZmtPartyLegal.read('pfx');
eq(readBack.rc, 'RC9', 'read returns rc');
eq(readBack.nis, 'NI5', 'read returns nis');
legalCtx.ZmtPartyLegal.clear('pfx');
eq(legalEls.pfxNif.value, '', 'clear empties every field');

console.log('\n=== 3) Credit limit: blocking message and manager-only continue ===');
check(app.includes("creditDebtMsg: 'يجب على هذا العميل دفع الديون السابقة لاستمرار هذه العملية'"), 'exact Arabic blocking message in all translations');
check((app.match(/creditDebtMsg:/g) || []).length === 4, 'blocking message exists in four languages');
check(salesJs.includes('const canContinue ='), 'warning computes the manager flag');
check(salesJs.includes("t('sales.creditBlocked')"), 'warning title uses the blocking title');
check(salesJs.includes("t('sales.creditDebtMsg')"), 'warning body uses the blocking message');
check(salesJs.includes('if (creditBypass && !((typeof Auth !=='), 'checkout discards a non-manager bypass');
check(salesJs.includes('renderSalesCart();') && salesJs.includes('_salesCreditBypass = false;'), 'cart edits reset the bypass');

const creditStart = salesJs.indexOf('function showSalesCreditWarning(');
const creditEnd = salesJs.indexOf('function salesMarginKeepGoing(', creditStart);
check(creditStart >= 0 && creditEnd > creditStart, 'credit warning functions found');
const creditOverlay = {
  innerHTML: '', style: {}, dataset: {}, addEventListener() {},
};
const creditContainer = { appendChild() {} };
const creditCtx = makeCtx({
  document: {
    getElementById(id) {
      if (id === 'salesCreditModal') return creditOverlay;
      if (id === 'pageContainer') return creditContainer;
      return null;
    },
    createElement() { return creditOverlay; },
    body: creditContainer,
  },
  t: (k) => ({
    'sales.creditBlocked': 'لا يمكن تجاوز سقف الدين',
    'sales.creditDebtMsg': 'يجب على هذا العميل دفع الديون السابقة لاستمرار هذه العملية',
    'sales.creditLimit': 'سقف الدين', 'sales.currentBalance': 'الرصيد الحالي',
    'sales.projectedBalance': 'الرصيد المتوقع بعد البيع', 'sales.total': 'الإجمالي',
    'common.cancel': 'إلغاء', 'sales.creditContinue': 'مواصلة',
  })[k] || k,
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  Auth: { isManager: () => true },
  alert() { creditCtx.alerts++; },
  checkouts: 0,
  alerts: 0,
});
creditCtx.confirmSalesCheckout = function () { creditCtx.checkouts++; };
vm.runInContext(salesJs.slice(creditStart, creditEnd), creditCtx, { filename: 'sales-credit.js' });

creditCtx._salesCreditBypass = false;
creditCtx.showSalesCreditWarning(1200, 1000, 500, 700);
check(creditOverlay.innerHTML.includes('يجب على هذا العميل دفع الديون السابقة لاستمرار هذه العملية'), 'manager dialog shows the exact blocking message');
check(creditOverlay.innerHTML.includes('salesCreditContinue()'), 'manager dialog exposes «مواصلة»');
creditCtx.salesCreditContinue();
eq(creditCtx._salesCreditBypass, true, 'manager continue sets the one-shot bypass');
eq(creditCtx.checkouts, 1, 'manager continue retries the checkout');

creditCtx._salesCreditBypass = false;
creditCtx.Auth = { isManager: () => false };
creditCtx.showSalesCreditWarning(1200, 1000, 500, 700);
check(!creditOverlay.innerHTML.includes('salesCreditContinue()'), 'cashier dialog has no continue button');
creditCtx.salesCreditContinue();
eq(creditCtx._salesCreditBypass, false, 'forged continue cannot set a bypass for a cashier');
eq(creditCtx.checkouts, 1, 'cashier continue cannot write the sale');
eq(creditCtx.alerts, 1, 'cashier gets the blocking message instead');
creditCtx.salesCreditCancel();
eq(creditOverlay.style.display, 'none', 'cancel closes the warning');

console.log('\n=== 4) Display switches: hidden by default, saved with the panel ===');
check(displayJs.includes('var DS_SWITCHES = ['), 'display-settings.js declares invoice switches');
check(displayJs.includes("name: 'invShowReference'"), 'Référence switch defined');
check(displayJs.includes("name: 'invShowMark'"), 'Marque switch defined');
check(!displayJs.includes("key: 'invShow"), 'switches stay out of the slider pipeline');
check(displayJs.includes('invoiceColumns: function ()'), 'invoiceColumns() exported');
check(displayJs.includes("'zmt_display_settings'"), 'same localStorage key as the sliders');
check(css.includes('.ds-switch-track'), 'switch styles exist');
check(app.includes("invoiceGroup: 'أعمدة الفاتورة'"), 'invoice group label translated');
check(app.includes("invShowReference: 'Référence', invShowMark: 'Marque'"), 'French column labels in all languages');

const store = {
  'zmt_display_settings': JSON.stringify({
    salesCard: 240, invCard: 260, salesHeight: 0, invHeight: 0,
    sidebar: 240, salesName: 13, invName: 16, salesCart: 420,
    invShowReference: true, invShowMark: false,
  }),
};
const dsCtx = makeCtx({
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  },
  document: {
    readyState: 'complete',
    documentElement: fakeElement(),
    body: fakeElement(),
    getElementById: () => fakeElement(),
    createElement: () => fakeElement(),
    querySelector: () => fakeElement(),
    addEventListener() {},
  },
  addEventListener() {},
});
vm.runInContext(displayJs, dsCtx, { filename: 'display-settings.js' });
check(typeof dsCtx.window.DisplaySettings.invoiceColumns === 'function', 'DisplaySettings loaded in sandbox');
eq(dsCtx.window.DisplaySettings.defaults().invShowReference, false, 'Référence default is hidden');
eq(dsCtx.window.DisplaySettings.defaults().invShowMark, false, 'Marque default is hidden');
eq(dsCtx.window.DisplaySettings.invoiceColumns().reference, true, 'saved Référence switch is honored');
eq(dsCtx.window.DisplaySettings.invoiceColumns().mark, false, 'saved Marque switch is honored');
check(JSON.parse(store['zmt_display_settings']).invShowReference === true, 'switches live in the existing storage object');

console.log('\n=== 5) Invoice columns: dynamic table and product fallback ===');
check(invJs.includes('function _invColumnVis()'), 'invoice column visibility helper');
check(invJs.includes('function _invItemExtra(item, field)'), 'invoice product fallback helper');
check(invJs.includes('const invCols = _invColumnVis();'), 'detail builder reads the switches');
check(invJs.includes('const invColCount = 4 + (invCols.reference ? 1 : 0) + (invCols.mark ? 1 : 0);'), 'column count is dynamic');
check(invJs.includes('>Référence</th>'), 'Référence header rendered when enabled');
check(invJs.includes('>Marque</th>'), 'Marque header rendered when enabled');
check(invJs.includes('colspan="${invColCount}"'), 'purchase-discount row uses the dynamic colspan');
check(invJs.includes("_invItemExtra(item, 'reference')"), 'Référence cells read the line snapshot');
check(invJs.includes("_invItemExtra(item, 'mark')"), 'Marque cells read the line snapshot');
check(invJs.indexOf('>Référence</th>') < invJs.indexOf('>Désignation</th>'), 'Référence comes before Désignation');
check(invJs.indexOf('>Marque</th>') > invJs.indexOf('>Désignation</th>'), 'Marque comes after Désignation');
check(saleCore.includes('reference: (prod && prod.reference)'), 'sale-core snapshots product reference');
check(saleCore.includes('mark: (prod && prod.mark)'), 'sale-core snapshots product mark');

const colStart = invJs.indexOf('function _invColumnVis()');
const colEnd = invJs.indexOf('function _legalInfoVis()', colStart);
const invStore = {};
const invCtx = makeCtx({
  localStorage: { getItem: (k) => (k in invStore ? invStore[k] : null) },
  DB: { getProduct: (id) => (id === 'p1' ? { reference: 'REF-1', mark: 'MARK-1' } : null) },
});
vm.runInContext(invJs.slice(colStart, colEnd), invCtx, { filename: 'invoice-columns.js' });
invCtx.DisplaySettings = { invoiceColumns: () => ({ reference: false, mark: false }) };
const off = invCtx._invColumnVis();
eq(off.reference, false, 'columns hidden when both switches are off');
eq(off.mark, false, 'Marque hidden by default');
invCtx.DisplaySettings = { invoiceColumns: () => ({ reference: true, mark: true }) };
const on = invCtx._invColumnVis();
eq(on.reference, true, 'Référence switch turns the column on');
eq(on.mark, true, 'Marque switch turns the column on');
invCtx.DisplaySettings = null;
invStore['zmt_display_settings'] = JSON.stringify({ invShowMark: true });
eq(invCtx._invColumnVis().mark, true, 'localStorage fallback works if the panel is not loaded');
eq(invCtx._invItemExtra({ reference: 'LINE' }, 'reference'), 'LINE', 'line snapshot wins');
eq(invCtx._invItemExtra({ productId: 'p1' }, 'mark'), 'MARK-1', 'old lines fall back to the product');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
