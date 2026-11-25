// ZMT PIECE — verifier for the three new additions:
//   1) dashboard low-stock dialog (open product + black & white print)
//   2) shared product search between sales and inventory
//   3) supplier payment edit / delete with automatic balance delta
// Run: node renderer/tests/new-features-verify.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const count = (s, needle) => s.split(needle).length - 1;

function fakeElement() {
  return { innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, focus() {} };
}
function fakeDoc(elements) {
  return {
    getElementById(id) { return elements[id] || null; },
    createElement() {
      const el = { innerHTML: '', _text: '' };
      Object.defineProperty(el, 'textContent', {
        get() { return el._text; },
        set(v) {
          el._text = String(v == null ? '' : v);
          el.innerHTML = el._text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        },
      });
      return el;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() { return []; },
  };
}
function makeCtx(extra) {
  const ctx = Object.assign({
    console, Date, Math, JSON, String, Number, Object, Array, RegExp, isFinite, parseFloat, parseInt,
    setTimeout: () => 0, clearTimeout: () => {},
    alert() {}, confirm: () => true,
  }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  return ctx;
}

console.log('\n=== 1) Static wiring ===');
const app = read('renderer/js/app.js');
const dashJs = read('renderer/js/pages/dashboard.js');
const dashHtml = read('renderer/pages/dashboard.html');
const supJs = read('renderer/js/pages/supplier-detail.js');
const supHtml = read('renderer/pages/supplier-detail.html');
const db = read('renderer/js/db.js');
const css = read('renderer/css/main.css');

check(app.includes("SHARED_PRODUCT_SEARCH_KEY = 'zmt_shared_product_search'"), 'app.js: shared search storage key');
check(app.includes("captureSharedProductSearch(_currentPageId)"), 'app.js: search captured before cleanupPage()');
check(app.indexOf('captureSharedProductSearch(_currentPageId)') < app.indexOf('  cleanupPage();'), 'capture happens before cleanupPage()');
check(app.includes('restoreSharedProductSearch(pageId)'), 'app.js: search restored after page init');
check(app.includes("id === 'salesBarcodeScan' || id === 'invSearch'"), 'app.js: both search fields update the shared value');
check(app.includes('window.openProductEditor = function (id)'), 'app.js: global openProductEditor helper');
check(app.includes('window.__zmtPendingProductEdit'), 'app.js: deferred product-edit handoff to inventory');
check(count(app, 'lowStockModalTitle:') === 4, 'dash.lowStockModalTitle translated in 4 languages');
check(count(app, 'sdPayment: {') === 4, 'sdPayment namespace translated in 4 languages');
check(dashHtml.includes('id="lowStockModal"'), 'dashboard.html: low-stock modal present');
check(dashJs.includes('function openLowStockModal()'), 'dashboard.js: modal opener');
check(dashJs.includes('function printLowStockReport()'), 'dashboard.js: print action');
check(dashJs.includes("window.PrintMode.openPreview(title, html, { mode: 'bw' })"), 'dashboard.js: black & white print mode');
check(dashJs.includes('openLowStockProduct(this.dataset.id)'), 'dashboard.js: open-product action per row');
check(css.includes('.low-stock-view-btn'), 'main.css: low-stock view button styles');
check(css.includes('.sd-pay-actions'), 'main.css: payment action buttons styles');
check(supHtml.includes('id="sdEditPayModal"'), 'supplier-detail.html: payment edit modal');
check(supHtml.includes('id="sdEditPayDate"'), 'supplier-detail.html: payment date input');
check(supJs.includes('function saveSdPaymentEdit()'), 'supplier-detail.js: save payment edit');
check(supJs.includes('function deleteSdPayment(id)'), 'supplier-detail.js: delete payment');
check(supJs.includes('function _sdApplyPaymentDelta('), 'supplier-detail.js: balance delta helper');
check(db.includes('updatePayment(id, changes)'), 'db.js: additive updatePayment()');
check(/deletePayment\(id\)[\s\S]{0,1400}updatePayment\(id, changes\)/.test(db), 'db.js: updatePayment sits next to deletePayment');

console.log('\n=== 2) Low-stock modal & print ===');
const lowProducts = [
  { id: 'p1', name: 'قطعة أولى', barcode: 'B100', mark: 'مارك A', quantity: 2 },
  { id: 'p2', name: 'قطعة ثانية', barcode: 'B200', mark: 'مارك B', quantity: 4 },
];
let printed = null;
const dashCtx = makeCtx({
  DB: {
    getLowStockThreshold: () => 5,
    getLowStockProducts: () => lowProducts,
  },
  t: (k) => ({ 'dash.view': 'عرض', 'dash.openProduct': 'فتح المنتج', 'dash.lowStockPrintTitle': 'كشف المخزون' })[k] || k,
  PrintMode: { openPreview(title, html, opts) { printed = { title, html, opts }; return true; } },
  document: fakeDoc({
    lowStockModal: fakeElement(),
    lowStockModalBody: fakeElement(),
    lowStockModalSummary: fakeElement(),
  }),
});
vm.runInContext(dashJs, dashCtx, { filename: 'dashboard.js' });
check(typeof dashCtx.openLowStockModal === 'function', 'dashboard.js loads in sandbox');
dashCtx.openLowStockModal();
const modalBody = dashCtx.document.getElementById('lowStockModalBody').innerHTML;
check(modalBody.includes('قطعة أولى') && modalBody.includes('قطعة ثانية'), 'modal lists every low-stock product');
check(modalBody.includes('openLowStockProduct(this.dataset.id)'), 'modal rows expose the open-product action');
check(dashCtx.document.getElementById('lowStockModal').style.display === 'flex', 'modal is shown');
dashCtx.printLowStockReport();
check(!!printed, 'print opened a preview');
if (printed) {
  eq(printed.opts.mode, 'bw', 'preview forced to black & white');
  check(printed.html.includes('dir="rtl"'), 'print sheet is RTL');
  check(printed.html.includes('قطعة أولى') && printed.html.includes('قطعة ثانية'), 'print sheet contains all rows');
  check(printed.html.includes('border:1px solid #000'), 'print sheet uses monochrome borders');
}

console.log('\n=== 3) Supplier payment balance deltas ===');
const originalTs = new Date(2024, 0, 2, 10, 30, 45, 123).getTime();
let suppliers = [{ id: 's1', name: 'مورد', balance: 1000 }];
let payments = [
  { id: 'p1', supplierId: 's1', amount: 100, note: 'دفعة نقدية', createdAt: originalTs },
  { id: 'p2', supplierId: 's1', invoiceId: 'i1', amount: 80, note: 'فاتورة بيع للمورد', createdAt: originalTs + 10000 },
  { id: 'p3', supplierId: 's1', invoiceId: 'v1', amount: 50, note: 'سند دين', createdAt: originalTs + 20000 },
];
const invoices = [
  { id: 'i1', type: 'sup_sale', supplierId: 's1' },
  { id: 'v1', type: 'payment', supplierId: 's1' },
];
const updates = [];
const deletedIds = [];
const payEls = {
  sdPaymentsList: fakeElement(),
  sdEditPayAmount: fakeElement(),
  sdEditPayDate: fakeElement(),
  sdEditPayNote: fakeElement(),
  sdEditPayBalance: fakeElement(),
  sdEditPayModal: fakeElement(),
};
const payDoc = fakeDoc(payEls);
const supCtx = makeCtx({
  document: payDoc,
  t: (k) => ({ 'common.edit': 'تعديل', 'common.delete': 'حذف', 'sdPayment.confirmDelete': 'حذف الدفعة؟' })[k] || k,
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  window: undefined,
  DB: {
    getPayments: () => payments,
    getSupplierPayments: (id) => payments.filter((p) => p.supplierId === id),
    getSuppliers: () => suppliers,
    saveSuppliers(list) { suppliers = list; },
    getInvoice(id) { return invoices.find((i) => i.id === id) || null; },
    getInvoices: () => invoices,
    updatePayment(id, changes) {
      updates.push({ id, changes });
      const p = payments.find((x) => x.id === id);
      if (p) Object.assign(p, changes);
      return p;
    },
    deletePayment(id) {
      deletedIds.push(id);
      payments = payments.filter((p) => p.id !== id);
      return true;
    },
  },
});
supCtx.window = supCtx;
supCtx.window._zmtCanEditBalance = () => true;
vm.runInContext(supJs, supCtx, { filename: 'supplier-detail.js' });
supCtx._sdSupplierId = 's1';
const realRenderSdPayments = supCtx.renderSdPayments;
supCtx.renderSdStats = () => {};
supCtx.renderSdPayments = () => {};
supCtx.renderSdInvoices = () => {};

const p1 = payments[0], p2 = payments[1], p3 = payments[2];
eq(supCtx._sdPaymentSign(p1), -1, 'standalone supplier payment decreases balance');
eq(supCtx._sdPaymentSign(p2), 1, 'sup_sale payment increases balance');
eq(supCtx._sdPaymentSign(p3), 1, 'supplier payment voucher increases balance');

suppliers[0].balance = 1000;
supCtx._sdApplyPaymentDelta(p1, 120, false);
eq(suppliers[0].balance, 980, 'editing 100 -> 120 reduces balance by 20');

suppliers[0].balance = 1000;
supCtx._sdApplyPaymentDelta(p1, 0, true);
eq(suppliers[0].balance, 1100, 'deleting a 100 payment restores 100 to the balance');

suppliers[0].balance = 1000;
supCtx._sdApplyPaymentDelta(p2, 100, false);
eq(suppliers[0].balance, 1020, 'sup_sale 80 -> 100 increases balance by 20');

suppliers[0].balance = 1000;
supCtx._sdApplyPaymentDelta(p2, 0, true);
eq(suppliers[0].balance, 920, 'deleting sup_sale payment reverses its +80');

suppliers[0].balance = 1000;
supCtx._sdApplyPaymentDelta(p3, 70, false);
eq(suppliers[0].balance, 1020, 'voucher 50 -> 70 increases balance by 20');

console.log('\n=== 4) Payment edit / delete flow ===');
suppliers[0].balance = 1000;
payEls.sdEditPayAmount.value = '120';
payEls.sdEditPayDate.value = supCtx._sdToDateInput(originalTs);
payEls.sdEditPayNote.value = 'معدّلة';
supCtx._sdEditPayId = 'p1';
supCtx.saveSdPaymentEdit();
eq(p1.amount, 120, 'save writes the new amount');
eq(p1.note, 'معدّلة', 'save writes the new note');
eq(p1.createdAt, originalTs, 'save preserves the payment seconds/milliseconds');
eq(updates.length, 1, 'save calls DB.updatePayment exactly once');
eq(suppliers[0].balance, 980, 'save adjusts the supplier balance by the delta');
eq(supCtx._sdEditPayId, null, 'save closes the edit state');

suppliers[0].balance = 980;
supCtx.confirm = () => true;
supCtx.deleteSdPayment('p1');
eq(deletedIds.length, 1, 'delete calls DB.deletePayment');
check(!payments.some((p) => p.id === 'p1'), 'deleted payment is gone from the list');
eq(suppliers[0].balance, 1100, 'delete restores the payment effect on the balance');

suppliers[0].balance = 1000;
supCtx.confirm = () => false;
supCtx.deleteSdPayment('p2');
eq(suppliers[0].balance, 1000, 'cancelled delete leaves the balance untouched');
check(payments.some((p) => p.id === 'p2'), 'cancelled delete keeps the payment');

// Rendered rows must expose both actions.
supCtx.renderSdPayments = realRenderSdPayments;
payEls.sdPaymentsList.innerHTML = '';
supCtx.renderSdPayments();
const rowsHtml = payEls.sdPaymentsList.innerHTML;
check(rowsHtml.includes('showSdEditPayModal('), 'payment rows have an edit button');
check(rowsHtml.includes('deleteSdPayment('), 'payment rows have a delete button');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
