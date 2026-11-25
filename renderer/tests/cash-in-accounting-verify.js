// ============================================================
// ZMT PIECE — Cash-collection accounting guard
// Run: node renderer/tests/cash-in-accounting-verify.js
//
// Every amount of money that actually entered the till — an invoice payment,
// a walk-in sale, a «سند قبض» voucher or a direct customer payment — must be
// visible as revenue in the period of the collection. Margin follows the day
// an invoice became FULLY paid. This guard proves the shared helpers do that
// and that reports / net-account consume them instead of the old mirrors.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dom = require('./dom-lite.js');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const section = (m) => console.log('\n=== ' + m + ' ===');

function makeFakeIDB() {
  const data = {};
  const os = (name) => ({
    put: (rec) => { if (!data[name]) data[name] = new Map(); data[name].set(rec.id, JSON.parse(JSON.stringify(rec))); },
    delete: (id) => { if (data[name]) data[name].delete(id); },
    clear: () => { data[name] = new Map(); },
    getAll: () => {
      const r = {};
      Promise.resolve().then(() => {
        r.result = Array.from((data[name] || new Map()).values());
        if (r.onsuccess) r.onsuccess({ target: r });
      });
      return r;
    },
  });
  return {
    open: () => {
      const r = {};
      Promise.resolve().then(() => {
        const d = {
          objectStoreNames: { contains: (n) => Object.prototype.hasOwnProperty.call(data, n) },
          createObjectStore: (n) => { data[n] = new Map(); return os(n); },
          transaction: (name) => {
            const tx = {};
            tx.objectStore = () => os(name);
            Promise.resolve().then(() => { if (tx.oncomplete) tx.oncomplete(); });
            return tx;
          },
          close: () => {},
        };
        r.result = d;
        if (r.onupgradeneeded) r.onupgradeneeded({ target: r });
        if (r.onsuccess) r.onsuccess({ target: r });
      });
      return r;
    },
  };
}

function makeDBBox() {
  const store = {};
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i],
    get length() { return Object.keys(store).length; },
  };
  const box = {
    module: { exports: {} }, console, localStorage: ls, document: dom.createDoc(),
    Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
    RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map, WeakMap,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    indexedDB: makeFakeIDB(), navigator: { onLine: false },
    fetch: () => Promise.reject(new Error('no network in tests')),
    alert: () => {}, confirm: () => true,
    addEventListener: () => {}, removeEventListener: () => {},
    CustomEvent: function (name, opts) { this.type = name; this.detail = opts && opts.detail; },
    Auth: {
      isLoggedIn: () => false, getUserCode: () => '', getCurrentUser: () => null,
      getCompanyId: () => '', getRole: () => 'manager', getStoreName: () => '',
      isManager: () => true, canEdit: () => true, currentUserId: () => 'u1', buyPriceVisible: () => true,
    },
    t: (k) => k,
    escHtml: (s) => String(s == null ? '' : s),
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    normSearch: (s) => String(s || ''),
    productSearchScore: () => 1,
    debounce: (fn) => fn,
    BRANDS: { global: [], chinese: [] },
    ExtraPrices: { fields: () => [], readInputs: () => ({}), inputsHTML: () => '', COLORS: ['#111'], MAX: 5, saveFields: () => {}, fillInputs: () => {} },
    cleanScannedCode: (v) => String(v || '').trim(),
  };
  box.window = box; box.self = box; box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(read('renderer/js/db.js'), box, { filename: 'db.js' });
  return box;
}

(async function main() {
  console.log('cash-in accounting guard');
  const box = makeDBBox();
  const DB = vm.runInContext('DB', box);

  section('1) getCashInEvents includes every collection shape');
  await DB.importAll({
    customers: [{ id: 'c1', name: 'أحمد' }],
    suppliers: [{ id: 's1', name: 'مورد' }],
    invoices: [
      { id: 'i1', type: 'customer', customerId: 'c1', totalAmount: 1000, createdAt: 1000, items: [] },
      { id: 'v1', type: 'payment', direction: 'in', customerId: 'c1', totalAmount: 200, createdAt: 3000, items: [] },
      { id: 'v2', type: 'payment', direction: 'out', supplierId: 's1', totalAmount: 90, createdAt: 3100, items: [] },
      { id: 'v3', type: 'payment', direction: 'in', supplierId: 's1', kind: 'supplier-receipt', totalAmount: 90, createdAt: 3200, items: [] },
      { id: 'v4', type: 'payment', direction: 'in', supplierId: 's1', isDebtNote: true, totalAmount: 5, createdAt: 3300, items: [] },
    ],
    payments: [
      { id: 'pm1', customerId: 'c1', invoiceId: 'i1', amount: 400, createdAt: 2000, method: 'cash' },
      { id: 'pm2', type: 'customer_direct', customerId: 'c1', amount: 50, createdAt: 2500, method: 'ccp' },
      { id: 'pm3', supplierId: 's1', amount: 700, createdAt: 2600, method: 'cash' },
      { id: 'pm4', type: 'net_expense', amount: 30, createdAt: 2700, method: 'cash' },
      { id: 'pm5', invoiceId: 'v1', amount: 200, createdAt: 3050, method: 'cash' }, // voucher mirror: skip
    ],
  });

  const all = DB.getCashInEvents();
  eq(all.length, 4, 'two customer money-ins + customer voucher + supplier receipt (mirror skipped)');
  eq(all.reduce((s, c) => s + c.amount, 0), 740, 'cash-in total = 400 + 50 + 200 + 90');
  check(all.some(c => c.id === 'pm1' && c.source === 'payment'), 'invoice payment included');
  check(all.some(c => c.id === 'pm2' && c.source === 'direct' && c.customerId === 'c1'), 'direct customer payment included');
  check(all.some(c => c.id === 'v1' && c.source === 'voucher'), 'incoming «سند قبض» included');
  const supReceipt = all.find(c => c.id === 'v3');
  check(!!supReceipt && supReceipt.supplierId === 's1' && supReceipt.kind === 'supplier-receipt', 'supplier receipt is revenue and carries supplier/kind');
  check(!all.some(c => c.id === 'pm3'), 'supplier payment excluded');
  check(!all.some(c => c.id === 'pm4'), 'manual expense excluded');
  check(!all.some(c => c.id === 'pm5'), 'payment linked to a voucher excluded (no double count)');
  check(!all.some(c => c.id === 'v2'), 'outgoing supplier debt note excluded');
  check(!all.some(c => c.id === 'v4'), 'explicit debt note with direction:in excluded');

  const q1 = DB.getCashInEvents({ from: 2500, to: 2999 });
  eq(q1.reduce((s, c) => s + c.amount, 0), 50, 'period filter uses the collection timestamp');
  const q2 = DB.getCashInEvents({ from: 3000, to: 4000 });
  eq(q2.reduce((s, c) => s + c.amount, 0), 290, 'both vouchers counted in their own period');

  section('2) getInvoiceCompletionTs follows the completing payment');
  const inv = DB.getInvoice('i1');
  eq(DB.getInvoiceCompletionTs(inv), 0, 'partially paid invoice has no completion date');
  DB.addPayment({ customerId: 'c1', invoiceId: 'i1', amount: 600, createdAt: 4000, method: 'cash' });
  eq(DB.getInvoiceCompletionTs(inv), 4000, 'completion timestamp = the payment that finished the invoice');
  DB.addPayment({ customerId: 'c1', invoiceId: 'i1', amount: 1, createdAt: 5000, method: 'cash' });
  eq(DB.getInvoiceCompletionTs(inv), 4000, 'a later overpayment does not move the completion date');
  const creditInv = { id: 'x', type: 'customer', totalAmount: 100, creditUsed: 100, createdAt: 1234 };
  eq(DB.getInvoiceCompletionTs(creditInv), 1234, 'fully credit-settled invoice completes at sale date');

  section('3) reports / net-account consume the shared helpers');
  const na = read('renderer/js/pages/net-account.js');
  const rp = read('renderer/js/pages/reports.js');
  check(na.includes('getCashInEvents('), 'net-account revenue uses getCashInEvents');
  check(na.includes('completionTs(') || na.includes('DB.getInvoiceCompletionTs('), 'net-account margin uses completion dates');
  check(na.includes('paymentFromSupplier') && na.includes('supplierReceipt'), 'net-account log labels supplier receipts');
  check(/supRange\[c\.supplierId\]/.test(na), 'supplier receipt reduces the supplier debt of the period');
  check(rp.includes('DB.getCashInEvents('), 'reports revenue uses getCashInEvents');
  check(rp.includes('DB.getInvoiceCompletionTs('), 'reports margin uses completion dates');
  check(!/const paidSalesAmount = paidSales\.reduce/.test(rp), 'no dangling paidSales reference');

  const invJs = read('renderer/js/pages/invoices.js');
  const invHtml = read('renderer/pages/invoices.html');
  check(invHtml.includes('id="payInvDebtNote"') && /id="payInvDebtNoteGroup"/.test(invHtml), 'supplier modal has the explicit debt-note option');
  check(invJs.includes("kind: isCustomer ? 'customer-receipt'"), 'voucher stores the supplier receipt kind');
  check(/suppliers\[sIdx\]\.balance = \(parseFloat\(suppliers\[sIdx\]\.balance\) \|\| 0\) - amount/.test(invJs), 'supplier receipt deducts the supplier balance');
  check(invJs.includes('suppReceiptNote'), 'supplier receipt note is localised');

  const summary = fails ? 'FAILED (' + fails + ')' : 'ALL PASS';
  console.log('\n' + summary);
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
