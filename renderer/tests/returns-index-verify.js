// ZMT PIECE — Returns index (حركات العملاء / الموردين) verifier
// Run: node renderer/tests/returns-index-verify.js
//
// Guards the additive optimisation inside party-movements.js: returns are
// indexed once per DB revision instead of scanning the whole list for every
// party. Matching rules, row order and informational-only behaviour must stay
// exactly the same as before the optimisation.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dom = require('./dom-lite');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

function makeEnv() {
  const customers = [
    { id: 'c1', name: 'أحمد', balance: 100 },
    { id: 'c2', name: 'سعاد', balance: 50 },
  ];
  const suppliers = [{ id: 's1', name: 'المورد', balance: 0 }];
  const invoices = [
    { id: 'i1', type: 'customer', customerId: 'c1', totalAmount: 100, createdAt: 1000, items: [{}] },
    { id: 'i2', type: 'customer', customerId: 'c1', totalAmount: 50, createdAt: 2000, items: [{}] },
    { id: 'si1', type: 'supplier', supplierId: 's1', totalAmount: 80, createdAt: 1000, items: [{}] },
  ];
  const payments = [];
  // Deliberately mixed order: the report must preserve the original array order.
  const returns = [
    { id: 'r1', customerId: 'c1', qty: 1, total: 10, createdAt: 1100 },
    { id: 'r3', invoiceId: 'i1', qty: 3, total: 30, createdAt: 1300 },
    { id: 'r5', relatedTo: 'c1', qty: 5, total: 50, createdAt: 1500 },
    { id: 'r2', relatedTo: 'c2', qty: 2, total: 20, createdAt: 1200 },
    { id: 'r4', customerId: 'c2', qty: 4, total: 40, createdAt: 1400 },
    { id: 'rx', customerId: 'cX', qty: 9, total: 90, createdAt: 1600 },
  ];
  const supplierReturns = [
    { id: 'd1', supplierId: 's1', status: 'returned', qty: 1, amount: 11, createdAt: 1100 },
    { id: 'd2', supplierId: 's1', status: 'pending', qty: 2, amount: 22, createdAt: 1200 },
    { id: 'd3', invoiceId: 'si1', status: 'returned', qty: 3, amount: 33, createdAt: 1300 },
  ];

  let returnCalls = 0, supplierReturnCalls = 0, version = 1;
  const sandbox = {
    console, Date, Math, JSON, String, Number, Object, Array,
    parseFloat, parseInt, isFinite,
    document: dom.createDoc(),
    isRTL: () => true,
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    t: (k) => k,
    getStoreInfo: () => ({ name: 'متجر الاختبار' }),
    alert: () => {},
    open: () => ({ document: { write() {}, close() {} }, close() {} }),
    localStorage: { getItem: () => null },
    DB: {
      dataVersion: () => version,
      getCustomers: () => customers,
      getSuppliers: () => suppliers,
      getInvoicesByCustomer: (id) => invoices.filter((i) => i.customerId === id),
      getInvoicesBySupplier: (id) => invoices.filter((i) => i.supplierId === id),
      getCustomerPayments: (id) => payments.filter((p) => p.customerId === id),
      getSupplierPayments: (id) => payments.filter((p) => p.supplierId === id),
      getInvoice: () => null,
      getReturns: () => { returnCalls++; return returns; },
      getSupplierReturns: () => { supplierReturnCalls++; return supplierReturns; },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('renderer/js/lib/party-movements.js'), sandbox, { filename: 'party-movements.js' });
  return {
    env: sandbox, customers, suppliers, returns, supplierReturns,
    calls: () => ({ returnCalls, supplierReturnCalls }),
    bump: () => { version++; },
  };
}

const returnIds = (res) => res.entries.filter((e) => e.type === 'return').map((e) => e.returnId);

// ------------------------------------------------ customer matching / order --
{
  const { env, customers } = makeEnv();
  const PM = env.PartyMovements;
  const c1 = PM.build('customer', customers[0]);
  const c2 = PM.build('customer', customers[1]);

  eq(returnIds(c1).join(','), 'r1,r3,r5', 'customer returns keep original order (direct, invoice, relatedTo)');
  eq(returnIds(c2).join(','), 'r2,r4', 'a different party gets only its own returns');
  check(returnIds(c1).indexOf('rx') === -1, 'returns of another customer never leak in');
  check(c1.entries.filter((e) => e.type === 'return').every((e) => e.informational === true),
    'returns remain informational and never move the balance');
  eq(c1.totals.net, 100, 'customer net is still the stored balance');
}

// ------------------------------------------------ supplier status filter ----
{
  const { env, suppliers } = makeEnv();
  const res = env.PartyMovements.build('supplier', suppliers[0]);
  eq(returnIds(res).join(','), 'd1,d3', 'only returned supplier goods count (pending excluded)');
  eq(res.totals.net, 0, 'supplier balance is unchanged by damaged-goods rows');
}

// ------------------------------------------------ one scan per DB revision --
{
  const { env, customers, suppliers, calls, bump } = makeEnv();
  const PM = env.PartyMovements;
  PM.build('customer', customers[0]);
  PM.build('customer', customers[1]);
  PM.build('customer', customers[0]);
  PM.build('supplier', suppliers[0]);
  eq(calls().returnCalls, 1, 'getReturns() is read once for all customers');
  eq(calls().supplierReturnCalls, 1, 'getSupplierReturns() is read once for all suppliers');
  bump();
  PM.build('customer', customers[0]);
  eq(calls().returnCalls, 2, 'a DB revision bump refreshes the return index');
}

// ----------------------------------------------------- raw build is still pure
{
  const { env, customers, returns, supplierReturns } = makeEnv();
  const before = JSON.stringify({ returns, supplierReturns });
  env.PartyMovements.build('customer', customers[0]);
  env.PartyMovements.build('supplier', env.DB.getSuppliers()[0]);
  check(before === JSON.stringify({ returns, supplierReturns }), 'the return index never mutates DB arrays');
}

console.log('\n============================================');
console.log((fail === 0 ? 'PASS' : 'FAIL') + ' — pass=' + pass + ' fail=' + fail);
console.log('============================================');
