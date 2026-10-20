'use strict';
/*
 * Behavioral test for the "merge waybills (وصول التسليم) into one sale invoice"
 * feature. It loads the REAL renderer/js/pages/customer-detail.js inside a vm
 * sandbox with a faithful mini-implementation of the DB contract, then runs the
 * actual cdMergeConfirm() / openCdMerge() code and asserts the financial
 * invariants the feature promises:
 *
 *   1. stock is NEVER written (the stock methods throw if touched);
 *   2. the customer balance moves by exactly (new remainder - old remainders),
 *      i.e. by zero when the recorded paid amount is kept;
 *   3. the new invoice total is the EXACT sum of the merged waybills' totals;
 *   4. identical lines merge, different prices stay as separate lines;
 *   5. the chosen date+time is honoured by both `date` and `createdAt`, and the
 *      invoice number is stamped with the year of that date;
 *   6. returns / discounts are re-pointed, never deleted;
 *   7. a full snapshot + mergedFrom list is stored, and an audit entry written.
 *
 * Run:  node renderer/tests/merge-waybills-behavior.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'js', 'pages', 'customer-detail.js');

// Minimal i18n table for the keys the merge code reads (values are placeholders;
// a real translation table lives in renderer/js/app.js and is checked by the
// static verifier).
const I18N = {
  'merge.none': 'none',
  'merge.recorded': 'recorded:',
  'merge.waybillNo': 'waybill',
  'merge.summary': 'summary',
  'merge.selCount': 'count',
  'merge.sumTotal': 'total',
  'merge.sumPaid': 'paid',
  'merge.sumRemaining': 'remaining',
  'merge.debtDelta': 'delta',
  'merge.selectAtLeast': 'select',
  'merge.needDate': 'date',
  'merge.paidExceeds': 'exceeds',
  'merge.confirmTitle': 'confirm',
  'merge.confirmMsg': '{n}|{total}|{paid}|{remaining}',
  'merge.mergedNote': 'merged from:',
  'merge.done': '{n}|{num}',
};

// ---------------- tiny DOM ----------------
function makeDoc() {
  const els = {};
  function el(id) {
    if (!els[id]) {
      els[id] = {
        id, value: '', textContent: '', innerHTML: '', disabled: false, checked: false,
        style: {}, dataset: {},
        classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
        scrollTop: 0,
      };
    }
    return els[id];
  }
  return {
    _els: els,
    getElementById: el,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => {
      let t = '';
      return {
        set textContent(v) { t = String(v == null ? '' : v); },
        get textContent() { return t; },
        get innerHTML() {
          return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
      };
    },
    addEventListener() {},
    removeEventListener() {},
    documentElement: { dir: 'rtl' },
  };
}

// ---------------- faithful mini DB ----------------
// Mirrors the exact semantics of the methods the merge relies on in
// renderer/js/db.js. Stock mutators deliberately throw: the whole point of the
// feature is that stock is untouched, so a call here must fail the test loudly.
function makeDB(state) {
  let idSeq = 0, numSeq = 0;
  const genId = () => 'g' + (++idSeq);
  const db = {
    // ---- invoices ----
    addInvoice(inv, opts) {
      inv = Object.assign({}, inv);
      inv.id = genId();
      inv.createdAt = Date.now();
      const y = (opts && typeof opts.numberYear === 'number' && isFinite(opts.numberYear))
        ? opts.numberYear : new Date().getFullYear();
      inv.invoiceNumber = (opts && opts.payment)
        ? 'PAY-' + y + '-' + String(++numSeq).padStart(4, '0')
        : 'FACT-' + y + '-' + String(++numSeq).padStart(4, '0');
      state.invoices.push(inv);
      return inv;
    },
    updateInvoice(id, changes) {
      const inv = state.invoices.find(x => x.id === id);
      if (!inv) return null;
      Object.assign(inv, changes);
      return inv;
    },
    deleteInvoice(id) {
      const i = state.invoices.findIndex(x => x.id === id);
      if (i === -1) return false;
      state.invoices.splice(i, 1);
      return true;
    },
    getInvoice(id) { return state.invoices.find(x => x.id === id) || null; },
    getInvoicesByCustomer(cid) { return state.invoices.filter(x => x.customerId === cid); },
    // ---- payments ----
    addPayment(p) {
      const row = Object.assign({ createdAt: Date.now(), id: genId() }, p);
      state.payments.push(row);
      return row;
    },
    getInvoicePayments(invoiceId) { return state.payments.filter(p => p.invoiceId === invoiceId); },
    getInvoicePaidAmount(invoiceId) {
      return this.getInvoicePayments(invoiceId).reduce((s, p) => s + (p.amount || 0), 0);
    },
    getInvoiceEffectivePaid(inv) {
      const i = typeof inv === 'string' ? this.getInvoice(inv) : inv;
      if (!i) return 0;
      return this.getInvoicePaidAmount(i.id) + (i.creditUsed || 0);
    },
    getInvoicePaymentMethods(invoiceId) {
      let cash = 0, ccp = 0;
      this.getInvoicePayments(invoiceId).forEach(p => {
        const a = p.amount || 0;
        if (p.method === 'ccp') ccp += a;
        else if (p.method === 'mixed') { cash += p.cashAmount || 0; ccp += p.ccpAmount || 0; }
        else cash += a;
      });
      return { cash, ccp };
    },
    deletePaymentsByInvoice(invoiceId) {
      state.payments = state.payments.filter(p => p.invoiceId !== invoiceId);
    },
    // ---- customers ----
    getCustomers() { return state.customers; },
    saveCustomers(list) { state.customers = list; },
    getCustomer(id) { return state.customers.find(c => c.id === id) || null; },
    // ---- returns / discounts ----
    getReturns() { return state.returns; },
    saveReturns(list) { state.returns = list; },
    getDiscounts() { return state.discounts; },
    saveDiscounts(list) { state.discounts = list; },
    // ---- audit ----
    logAudit(e) { state.audit.push(e); },
    // ---- STOCK: must never be called by the merge ----
    getProducts() { return state.products; },
    updateProduct() { throw new Error('STOCK WRITE: updateProduct() must never be called by the merge'); },
    updateProductsBatch() { throw new Error('STOCK WRITE: updateProductsBatch() must never be called by the merge'); },
    addReturn() { throw new Error('merge must not create returns'); },
  };
  return db;
}

// ---------------- load the real page module ----------------
function loadModule(db, doc, overrides) {
  const ctx = {
    console, Date, Math, JSON, Object, Array, String, Number, Boolean,
    parseFloat, parseInt, isNaN, isFinite, RegExp, Error,
    alert: () => {},
    confirm: () => true,
    t: k => (I18N[k] !== undefined ? I18N[k] : k),
    fmtMoney: n => (Number(n) || 0).toFixed(2),
    DB: db,
    document: doc,
    window: {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'customer-detail.js' });
  Object.keys(overrides || {}).forEach(k => { ctx[k] = overrides[k]; });
  return ctx;
}

// ---------------- assertion helpers ----------------
let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; failures.push(label); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(a === e, label + '  (got ' + a + ', want ' + e + ')');
}
function near(actual, expected, label) {
  ok(Math.abs((Number(actual) || 0) - expected) < 1e-6,
    label + '  (got ' + actual + ', want ' + expected + ')');
}

// ---------------- fixtures ----------------
const T = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0).getTime();

function baseState() {
  return {
    invoices: [],
    payments: [],
    customers: [{ id: 'c1', name: 'Client', balance: 740 }],
    returns: [],
    discounts: [],
    products: [{ id: 'pA', quantity: 90, buyPrice: 60 }, { id: 'pB', quantity: 10, buyPrice: 150 }],
    audit: [],
  };
}

// 3 real waybills. Items are built so that the test exercises:
//   * an identical line spread over two waybills (pA @100 x2 + x3 -> x5)
//   * the same product at two different prices (pA @100 vs pA @115)
//   * the same product name/barcode at two different prices (pB @200 vs pB @20)
function addWaybills(state) {
  const w1 = {
    id: 'w1', invoiceNumber: 'WAY-0001', type: 'waybill', customerId: 'c1',
    date: T(2021, 3, 5, 8, 0), createdAt: T(2021, 3, 5, 8, 0),
    items: [
      { productId: 'pA', barcode: 'A', name: 'A', qty: 2, price: 100, total: 200, discount: 0, originalPrice: 100 },
      { productId: 'pB', barcode: 'B', name: 'B', qty: 1, price: 200, total: 200, discount: 0, originalPrice: 200 },
    ],
    totalAmount: 400, extraDiscount: 0, timbreFiscal: 0, profit: 60,
  };
  const w2 = {
    id: 'w2', invoiceNumber: 'WAY-0002', type: 'waybill', customerId: 'c1',
    date: T(2021, 3, 8, 10, 30), createdAt: T(2021, 3, 8, 10, 30),
    items: [
      { productId: 'pA', barcode: 'A', name: 'A', qty: 3, price: 100, total: 300, discount: 0, originalPrice: 100 },
      { productId: 'pB', barcode: 'B', name: 'B', qty: 1, price: 20, total: 20, discount: 0, originalPrice: 20 },
    ],
    totalAmount: 300, extraDiscount: 20, timbreFiscal: 0, profit: 30,
  };
  const w3 = {
    id: 'w3', invoiceNumber: 'WAY-0003', type: 'waybill', customerId: 'c1',
    date: T(2021, 3, 12, 15, 45), createdAt: T(2021, 3, 12, 15, 45),
    items: [
      { productId: 'pA', barcode: 'A', name: 'A', qty: 2, price: 115, total: 230, discount: 0, originalPrice: 115 },
    ],
    totalAmount: 240, extraDiscount: 0, timbreFiscal: 10, profit: 20,
  };
  state.invoices.push(w1, w2, w3);
  state.payments.push(
    { id: 'pay1', invoiceId: 'w1', customerId: 'c1', amount: 150, note: 'x' },      // no method -> cash
    { id: 'pay2', invoiceId: 'w3', customerId: 'c1', amount: 50, method: 'ccp' },
  );
  return { w1, w2, w3 };
}

function setup(extraReturns, extraDiscounts) {
  const state = baseState();
  const wb = addWaybills(state);
  const db = makeDB(state);
  const doc = makeDoc();
  const renders = [];
  const ctx = loadModule(db, doc, {
    renderCdStats: () => renders.push('stats'),
    renderCdInvoices: () => renders.push('invoices'),
    renderCdHistory: () => renders.push('history'),
    renderCdPayments: () => renders.push('payments'),
    showCdInvoiceDetail: () => renders.push('detail'),
  });
  ctx._cdCustomerId = 'c1';
  ctx._cdInvoices = db.getInvoicesByCustomer('c1');
  (extraReturns || []).forEach(r => state.returns.push(r));
  (extraDiscounts || []).forEach(d => state.discounts.push(d));
  return { state, db, doc, ctx, renders, wb };
}

function mergeAll(ctx, doc, date, time, method, paid, cash, ccp) {
  const el = id => doc.getElementById(id);
  // The dialog pre-selects every waybill and seeds the defaults; open it when
  // the caller has not done so yet.
  if (Object.keys(ctx._cdMergeSel).length === 0) ctx.openCdMerge();
  el('cdMergeDate').value = date;
  el('cdMergeTime').value = time;
  if (method) ctx.cdMergeSetMethod(method);
  if (paid != null) el('cdMergePaid').value = paid;
  if (cash != null) el('cdMergeCash').value = cash;
  if (ccp != null) el('cdMergeCcp').value = ccp;
  ctx.cdMergeConfirm();
}

// ============================ TESTS ============================

// T1 - defaults + exact merge with unchanged debt
(function t1() {
  const { state, db, doc, ctx, wb, renders } = setup();
  const stockBefore = JSON.stringify(state.products);
  ctx.openCdMerge();

  // dialog defaults
  eq(doc._els['cdMergeDate'].value, '2021-03-05', 'T1 default date = oldest waybill');
  eq(doc._els['cdMergeTime'].value, '08:00', 'T1 default time = oldest waybill');
  eq(doc._els['cdMergePaid'].value, '200.00', 'T1 default paid = recorded total');
  eq(doc._els['cdMergeCash'].value, '150.00', 'T1 default cash split');
  eq(doc._els['cdMergeCcp'].value, '50.00', 'T1 default ccp split');
  eq(ctx._cdMergeMethod, 'mixed', 'T1 default method = mixed');
  ok(doc._els['cdMergeList'].innerHTML.indexOf('WAY-0001') !== -1, 'T1 list shows the waybill numbers');
  ok(doc._els['cdMergeSummary'].innerHTML.indexOf('940.00') !== -1, 'T1 summary shows the exact total 940');

  mergeAll(ctx, doc, '2021-03-05', '08:00', 'mixed', 200, 150, 50);

  const invs = state.invoices;
  eq(invs.length, 1, 'T1 exactly one invoice remains');
  const inv = invs[0];
  eq(inv.type, 'customer', 'T1 merged invoice type = customer');
  eq(inv.customerId, 'c1', 'T1 merged invoice belongs to the customer');
  near(inv.totalAmount, 940, 'T1 totalAmount is the exact sum (940)');
  near(inv.extraDiscount, 20, 'T1 extraDiscount is summed');
  near(inv.timbreFiscal, 10, 'T1 timbreFiscal is summed');
  near(inv.profit, 110, 'T1 profit is summed');
  eq(inv.invoiceNumber, 'FACT-2021-0001', 'T1 number uses the year of the chosen date');
  eq(inv.date, T(2021, 3, 5, 8, 0), 'T1 date = chosen date+time');
  eq(inv.createdAt, T(2021, 3, 5, 8, 0), 'T1 createdAt = chosen date+time (period reports)');

  // lines: identical merge, different prices stay separate
  const lines = inv.items.map(i => ({ p: i.productId, price: i.price, qty: i.qty, total: i.total }));
  eq(lines.length, 4, 'T1 four distinct lines (identical merged, prices kept apart)');
  eq(lines[0], { p: 'pA', price: 100, qty: 5, total: 500 }, 'T1 pA @100 merged to qty 5 / 500');
  eq(lines[1], { p: 'pB', price: 200, qty: 1, total: 200 }, 'T1 pB @200 kept separate');
  eq(lines[2], { p: 'pB', price: 20, qty: 1, total: 20 }, 'T1 pB @20 kept separate');
  eq(lines[3], { p: 'pA', price: 115, qty: 2, total: 230 }, 'T1 pA @115 kept separate');
  near(inv.items.reduce((s, i) => s + i.total, 0), 950, 'T1 summed line totals = 950 (exact, no drift)');

  // payment
  const pmts = db.getInvoicePayments(inv.id);
  eq(pmts.length, 1, 'T1 exactly one payment row on the merged invoice');
  eq(pmts[0].amount, 200, 'T1 payment amount = recorded paid');
  eq(pmts[0].method, 'mixed', 'T1 payment method preserved');
  eq(pmts[0].cashAmount, 150, 'T1 payment cash split preserved');
  eq(pmts[0].ccpAmount, 50, 'T1 payment ccp split preserved');

  // balance unchanged by default
  near(state.customers[0].balance, 740, 'T1 balance unchanged (740) by default');

  // stock untouched
  eq(JSON.stringify(state.products), stockBefore, 'T1 stock is byte-for-byte unchanged');

  // snapshot + audit
  eq(Array.isArray(inv.mergedFrom) && inv.mergedFrom.length, 3, 'T1 mergedFrom has all 3 waybills');
  eq(Array.isArray(inv.mergeSnapshot) && inv.mergeSnapshot.length, 3, 'T1 full snapshot stored');
  eq(inv.mergeSnapshot[0].id, 'w1', 'T1 snapshot keeps the first waybill');
  eq(inv.mergeSnapshot[0].items.length, 2, 'T1 snapshot keeps its items');
  eq(inv.mergeSnapshot[1].payments.length, 0, 'T1 snapshot keeps per-waybill payments');
  eq(inv.mergeSnapshot[2].payments.length, 1, 'T1 snapshot keeps the w3 payment');
  eq(state.audit.filter(a => a.action === 'merge').length, 1, 'T1 one merge audit entry written');
  ok(renders.indexOf('detail') !== -1, 'T1 invoice detail opened after merge');
  ok(renders.indexOf('stats') !== -1 && renders.indexOf('invoices') !== -1, 'T1 page refreshed after merge');
})();

// T2 - increasing the paid amount lowers the debt by exactly the difference
(function t2() {
  const { state, db, doc, ctx } = setup();
  mergeAll(ctx, doc, '2021-03-05', '09:00', 'cash', 900);
  near(state.customers[0].balance, 40, 'T2 balance 740 -> 40 when paid rises to 900');
  const inv = state.invoices[0];
  near(inv.totalAmount, 940, 'T2 total still 940');
  eq(db.getInvoicePayments(inv.id)[0].method, 'cash', 'T2 method cash');
  near(db.getInvoicePayments(inv.id)[0].amount, 900, 'T2 payment 900');
})();

// T3 - paying nothing raises the debt to the full invoice total
(function t3() {
  const { state, doc, ctx } = setup();
  mergeAll(ctx, doc, '2021-03-05', '09:00', 'cash', 0);
  near(state.customers[0].balance, 940, 'T3 balance 740 -> 940 when nothing new is paid');
})();

// T4 - returns and discounts are re-pointed, never deleted
(function t4() {
  const { state, ctx, doc } = setup(
    [{ id: 'r1', invoiceId: 'w1', productId: 'pA', qty: 1 }],
    [{ id: 'd1', invoiceId: 'w2', type: 'customer', amount: 5 }],
  );
  mergeAll(ctx, doc, '2021-03-05', '09:00', 'cash', 200);
  const inv = state.invoices[0];
  eq(state.returns.length, 1, 'T4 return row kept');
  eq(state.returns[0].invoiceId, inv.id, 'T4 return re-pointed to the merged invoice');
  eq(state.discounts.length, 1, 'T4 discount row kept');
  eq(state.discounts[0].invoiceId, inv.id, 'T4 discount re-pointed to the merged invoice');
})();

// T5 - a single waybill may be merged on its own (direct conversion)
(function t5() {
  const state = baseState();
  const db = makeDB(state);
  const doc = makeDoc();
  const ctx = loadModule(db, doc, {
    renderCdStats() {}, renderCdInvoices() {}, renderCdHistory() {}, renderCdPayments() {}, showCdInvoiceDetail() {},
  });
  state.invoices.push({
    id: 'solo', invoiceNumber: 'WAY-9000', type: 'waybill', customerId: 'c1',
    date: T(2022, 1, 9, 12, 0), createdAt: T(2022, 1, 9, 12, 0),
    items: [{ productId: 'pA', name: 'A', qty: 4, price: 50, total: 200, discount: 0 }],
    totalAmount: 200, extraDiscount: 0, timbreFiscal: 0, profit: 40,
  });
  state.payments.push({ id: 'sp', invoiceId: 'solo', customerId: 'c1', amount: 80 });
  state.customers[0].balance = 120;
  ctx._cdCustomerId = 'c1';
  ctx._cdInvoices = db.getInvoicesByCustomer('c1');

  mergeAll(ctx, doc, '2022-01-09', '12:00', 'cash', 80);
  eq(state.invoices.length, 1, 'T5 single waybill converted (1 invoice remains)');
  const inv = state.invoices[0];
  eq(inv.type, 'customer', 'T5 converted to a customer invoice');
  eq(inv.invoiceNumber, 'FACT-2022-0001', 'T5 number uses 2022');
  near(inv.totalAmount, 200, 'T5 total preserved');
  near(state.customers[0].balance, 120, 'T5 balance unchanged for a single waybill too');
  eq(inv.items.length, 1, 'T5 single line kept');
})();

// T6 - partial selection merges only the selected waybills
(function t6() {
  const { state, db, doc, ctx } = setup();
  ctx.openCdMerge();
  // deselect w2 + w3 by toggling them off
  ctx.cdMergeToggle('w2');
  ctx.cdMergeToggle('w3');
  eq(ctx.cdMergeSelected().length, 1, 'T6 only one waybill selected');
  const el6 = id => doc.getElementById(id);
  el6('cdMergeDate').value = '2021-03-05';
  el6('cdMergeTime').value = '08:00';
  el6('cdMergePaid').value = '150';
  ctx.cdMergeSetMethod('cash');
  ctx.cdMergeConfirm();
  eq(state.invoices.length, 3, 'T6 the two untouched waybills survive');
  const merged = state.invoices.find(i => i.type === 'customer');
  near(merged.totalAmount, 400, 'T6 merged only the selected waybill (400)');
  near(state.customers[0].balance, 740, 'T6 balance unchanged');
  eq(db.getInvoicePayments(merged.id).length, 1, 'T6 payment recorded');
})();

// T7 - method mapping (cash / ccp / mixed) and the pay-full helper
(function t7() {
  const { doc, ctx } = setup();
  ctx.openCdMerge();
  ctx.cdMergeSetMethod('ccp');
  doc._els['cdMergePaid'].value = '123.45';
  eq(ctx.cdMergeGetPay(), { method: 'ccp', cash: 0, ccp: 123.45, total: 123.45 }, 'T7 ccp mapping');
  ctx.cdMergeSetMethod('cash');
  eq(ctx.cdMergeGetPay(), { method: 'cash', cash: 123.45, ccp: 0, total: 123.45 }, 'T7 cash mapping');
  ctx.cdMergeSetMethod('mixed');
  doc._els['cdMergeCash'].value = '100';
  doc._els['cdMergeCcp'].value = '40';
  eq(ctx.cdMergeGetPay(), { method: 'mixed', cash: 100, ccp: 40, total: 140 }, 'T7 mixed mapping');
  ctx.cdMergePayFull();
  eq(ctx.cdMergeGetPay().total, 940, 'T7 pay-full fills the exact total');
})();

// T8 - stock guards: the merge must never touch stock, even on a fresh DB where
// a stock write would be caught by the throwing stubs.
(function t8() {
  const { state, doc, ctx } = setup();
  let threw = null;
  try { mergeAll(ctx, doc, '2021-03-05', '08:00', 'mixed', 200, 150, 50); }
  catch (e) { threw = e; }
  ok(threw === null, 'T8 merge completes without any stock call (' + (threw && threw.message) + ')');
  eq(state.products.length, 2, 'T8 product count untouched');
})();

// T9 - selection helper: "all remaining" / "clear"
(function t9() {
  const { ctx, doc } = setup();
  ctx.openCdMerge();
  eq(ctx.cdMergeSelected().length, 3, 'T9 all selected when the dialog opens');
  ctx.cdMergeSelectNone();
  eq(ctx.cdMergeSelected().length, 0, 'T9 clear selection');
  ok(doc._els['cdMergeConfirmBtn'].disabled === true, 'T9 confirm disabled with no selection');
  ctx.cdMergeSelectAll();
  eq(ctx.cdMergeSelected().length, 3, 'T9 select all');
  ok(doc._els['cdMergeConfirmBtn'].disabled === false, 'T9 confirm enabled again');
})();

// ---------------------------- report ----------------------------
function report() {
  const total = pass + fail;
  console.log('\nmerge-waybills behavior: ' + pass + '/' + total + ' checks passed');
  if (fail) {
    console.log('\nFAILED:');
    failures.forEach(f => console.log('  x ' + f));
  }
  return { pass, fail, total, failures };
}

if (require.main === module) {
  const r = report();
  process.exit(r.fail ? 1 : 0);
}

module.exports = { run: report };
