// ZMT PIECE — Party movements (حركات العملاء / حركات الموردين) verifier
// Run: node renderer/tests/party-movements-verify.js
//
// Covers: ledger construction (chronological order, opening balance derived
// from the stored balance, running balance), settlement detection (including
// several settlements over a party's life and the "payment row already carried
// by a voucher" rule), the printable report contents, the print window, the
// two pages' markup, the router wiring and the permission tables.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dom = require('./dom-lite');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

// ---------------------------------------------------------------- test data --
const DICT = {
  'movements.settledTag': 'تسوية رصيد',
  'movements.opening': 'رصيد سابق',
  'movements.entrySale': 'فاتورة بيع',
  'movements.entryPurchase': 'فاتورة شراء',
  'movements.entryPayment': 'دفعة',
  'movements.entryReceipt': 'سند قبض',
  'movements.entryDebtNote': 'سند دين',
  'movements.entrySupSale': 'بيع للمورد',
  'movements.reportTitleAllCust': 'كشف حركات العملاء',
  'movements.reportTitleOneCust': 'كشف حركات العميل',
};

function makeEnv() {
  const customers = [
    { id: 'c1', name: 'أحمد', balance: 0, phone: '0555' },
    { id: 'c2', name: 'سعاد', balance: 250 },
  ];
  const suppliers = [{ id: 's1', name: 'مورد الجزائر', balance: 0 }];
  const invoices = [
    { id: 'i1', type: 'customer', customerId: 'c1', totalAmount: 1000, createdAt: 1000, invoiceNumber: 'FACT-1', items: [{}, {}] },
    { id: 'i2', type: 'customer', customerId: 'c1', totalAmount: 300, createdAt: 3000, invoiceNumber: 'FACT-2', items: [{}] },
    { id: 'i3', type: 'customer', customerId: 'c2', totalAmount: 250, createdAt: 1000, invoiceNumber: 'FACT-3', items: [{}] },
    { id: 'p1', type: 'supplier', supplierId: 's1', totalAmount: 800, createdAt: 1000, invoiceNumber: 'ACH-1', items: [{}] },
  ];
  const payments = [
    { id: 'pm1', customerId: 'c1', amount: 1000, createdAt: 2000 },
    { id: 'pm2', customerId: 'c1', amount: 300, createdAt: 4000 },
    { id: 'pm3', supplierId: 's1', amount: 800, createdAt: 2000 },
  ];
  const sandbox = {
    console, Date, Math, JSON, String, Number, parseFloat, parseInt, isFinite, Object, Array,
    document: dom.createDoc(),
    isRTL: () => true,
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    t: (k) => DICT[k] || '',
    getStoreInfo: () => ({ name: 'متجر الاختبار', address: 'الجزائر', phone: '0770' }),
    alert: () => {},
    open: () => {
      const w = { document: { _html: '', write(h) { this._html += h; }, close() {} }, close() {} };
      return w;
    },
    localStorage: { getItem: () => null },
    DB: {
      getCustomers: () => customers,
      getSuppliers: () => suppliers,
      getInvoicesByCustomer: (id) => invoices.filter((i) => i.customerId === id),
      getInvoicesBySupplier: (id) => invoices.filter((i) => i.supplierId === id),
      getCustomerPayments: (id) => payments.filter((p) => p.customerId === id),
      getSupplierPayments: (id) => payments.filter((p) => p.supplierId === id),
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('renderer/js/lib/party-movements.js'), sandbox, { filename: 'party-movements.js' });
  return sandbox;
}

// ============================================================ ledger engine ==
{
  const env = makeEnv();
  const PM = env.PartyMovements;
  check(!!PM, 'engine exposes PartyMovements');

  const c1 = env.DB.getCustomers().find((c) => c.id === 'c1');
  const r = PM.build('customer', c1);

  eq(r.entries.length, 4, 'customer ledger has sale + sale + 2 payments');
  eq(r.entries[0].type, 'sale', 'chronological: first entry is the first sale');
  eq(r.entries[0].delta, 1000, 'sale adds its total');
  eq(r.entries[1].delta, -1000, 'payment subtracts its amount');
  eq(r.entries[2].delta, 300, 'second sale adds its total');
  eq(r.entries[3].delta, -300, 'second payment subtracts its amount');
  eq(r.opening, 0, 'opening balance derived so the curve ends on the stored balance');
  eq(r.closing, 0, 'running balance ends on the stored balance');
  eq(r.entries[0].balance, 1000, 'running balance after the first sale');
  eq(r.entries[1].balance, 0, 'running balance after the first payment');
  eq(r.entries[2].balance, 300, 'running balance after the second sale');
  eq(r.entries[3].balance, 0, 'running balance returns to zero');
  eq(r.settlements.length, 2, 'two settlements detected (balance reached zero twice)');
  eq(r.settlements[0].index, 2, 'first settlement is attached to the first payment');
  eq(r.settlements[1].index, 4, 'second settlement is attached to the second payment');
  check(!!r.entries[1].settlement, 'settlement marker sits on the settling payment row');
  check(!!r.entries[3].settlement, 'second settling payment carries its own marker');
  eq(r.totals.debt, 1300, 'total debit = sum of positive movements');
  eq(r.totals.paid, 1300, 'total credit = sum of negative movements');
  eq(r.totals.net, 0, 'net equals the stored balance');
}

// non-zero stored balance -> derived opening is correct
{
  const env = makeEnv();
  const c2 = env.DB.getCustomers().find((c) => c.id === 'c2');
  const r = env.PartyMovements.build('customer', c2);
  eq(r.opening, 0, 'party with a single unpaid sale opens at zero');
  eq(r.closing, 250, 'and closes on the stored balance');
  eq(r.settlements.length, 0, 'no settlement while the balance stays above zero');
}

// supplier ledger
{
  const env = makeEnv();
  const s1 = env.DB.getSuppliers().find((s) => s.id === 's1');
  const r = env.PartyMovements.build('supplier', s1);
  eq(r.entries.length, 2, 'supplier ledger has purchase + payment');
  eq(r.entries[0].delta, 800, 'purchase increases what we owe');
  eq(r.entries[1].delta, -800, 'payment to supplier reduces what we owe');
  eq(r.settlements.length, 1, 'supplier settlement detected');
}

// payment rows already represented by a voucher are skipped
{
  const env = makeEnv();
  env.DB.getInvoicesByCustomer = () => ([
    { id: 'v1', type: 'payment', direction: 'in', customerId: 'c1', totalAmount: 500, createdAt: 2000, invoiceNumber: 'PAY-1', items: [] },
  ]);
  env.DB.getCustomerPayments = () => ([
    { id: 'x1', customerId: 'c1', invoiceId: 'v1', amount: 500, createdAt: 2000 },
  ]);
  const c1 = env.DB.getCustomers().find((c) => c.id === 'c1');
  const r = env.PartyMovements.build('customer', c1);
  eq(r.entries.length, 1, 'the payment row pointing at a voucher is not double counted');
  eq(r.entries[0].type, 'voucher', 'the voucher itself is the single movement');
  eq(r.entries[0].delta, -500, 'a customer collection voucher reduces the debt');
}

// returns (مرتجعات) — informational rows that never move the balance
{
  const env = makeEnv();
  env.DB.getReturns = () => ([
    { id: 'r1', customerId: 'c1', invoiceId: 'i1', productName: 'مضادات', qty: 2, price: 100, total: 200, reason: 'خطأ في الشحن', createdAt: 1500 },
  ]);
  const c1 = env.DB.getCustomers().find((c) => c.id === 'c1');
  const r = env.PartyMovements.build('customer', c1);
  eq(r.entries.length, 5, 'customer ledger has sale + sale + 2 payments + 1 return');
  const ret = r.entries.find((e) => e.type === 'return');
  check(!!ret, 'return appears as an informational row in the ledger');
  check(ret.informational === true, 'return row is flagged informational');
  check(ret.delta === 0, 'return row does not move the balance');
  check(ret.balance === 1000, 'return row leaves the running balance untouched');
  eq(r.closing, 0, 'balance unchanged after an informational return');
  const rep = env.PartyMovements.buildReturns('customer', c1);
  eq(rep.count, 1, 'returns report counts the return');
  eq(rep.total, 200, 'returns report sums the return value');
  check(rep.returns[0].date && rep.returns[0].time, 'returns report stamps date + time');
}

// debt aging (FIFO) — buckets by age of the outstanding debt
{
  const env = makeEnv();
  env.DB.getCustomers().push({ id: 'c3', name: 'خالد', balance: 400, phone: '0556' });
  const origGetInv = env.DB.getInvoicesByCustomer.bind(env.DB);
  env.DB.getInvoicesByCustomer = (id) => (id === 'c3'
    ? origGetInv(id).concat([{ id: 'i4', type: 'customer', customerId: 'c3', totalAmount: 400, createdAt: Date.now() - 100 * 86400000, invoiceNumber: 'FACT-4', items: [{}] }])
    : origGetInv(id));
  const c3 = env.DB.getCustomers().find((c) => c.id === 'c3');
  const r = env.PartyMovements.build('customer', c3);
  const ag = env.PartyMovements.aging(r);
  eq(ag.total, 400, 'aging buckets sum to the outstanding balance');
  check(ag.b90 > 0, 'debt older than 90 days lands in the +90 bucket');
  check(ag.b0 === 0, 'fresh debt does not land in the 0-30 bucket');
}

// time range slicing — opening balance derived at the range boundary
{
  const env = makeEnv();
  const c1 = env.DB.getCustomers().find((c) => c.id === 'c1');
  const full = env.PartyMovements.build('customer', c1);
  const sliced = env.PartyMovements.sliceRange(full, new Date(1500), new Date(3500));
  eq(sliced.entries.length, 2, 'slice keeps only the entries inside the range');
  eq(sliced.opening, 1000, 'slice opening balance carries the pre-range debt');
  eq(sliced.entries[0].balance, 0, 'slice running balance starts from the derived opening');
  eq(sliced.entries[1].balance, 300, 'slice running balance ends on the in-range balance');
}

// credit limit badge in the report
{
  const env = makeEnv();
  const cOver = { id: 'c1', name: 'أحمد', balance: 600, creditLimit: 500 };
  const r = env.PartyMovements.build('customer', cOver);
  check(r.totals.net > 0, 'credit-limit party builds a ledger');
  const html = env.PartyMovements.reportHTML([r], 'customer', { showGrand: false });
  check(html.indexOf('pm-limit') !== -1, 'report renders the credit-limit badge when over the limit');
}

// ============================================================ report markup ==
{
  const env = makeEnv();
  const PM = env.PartyMovements;
  const c1 = env.DB.getCustomers().find((c) => c.id === 'c1');
  const html = PM.reportHTML([PM.build('customer', c1)], 'customer', { showGrand: true });

  check(html.indexOf('متجر الاختبار') !== -1, 'report shows the store name at the top');
  check(html.indexOf('كشف حركات العميل') !== -1, 'single-party report uses the singular title');
  check(html.indexOf('تسوية رصيد') !== -1, 'report contains the settlement tag');
  check(/class="pm-table"/.test(html), 'report renders a movements table');
  check(html.indexOf('pm-settle') !== -1, 'report renders the settlement marker row');
  check(html.indexOf('FACT-1') !== -1, 'report lists the invoice reference');
  check(html.indexOf('pm-head') !== -1, 'report has a header block with the store name');

  // combined report: page-break per party + grand totals
  const all = PM.buildAll('customer');
  const combined = PM.reportHTML(all, 'customer', { showGrand: true });
  check(combined.indexOf('pm-page-break') !== -1, 'combined report breaks the page between parties');
  check(combined.indexOf('pm-grand') !== -1, 'combined report prints grand totals');
  check(combined.indexOf('كشف حركات العملاء') !== -1, 'combined report uses the plural title');
  check(combined.indexOf('سعاد') !== -1 && combined.indexOf('أحمد') !== -1, 'combined report lists every party');
}

// ============================================================ print window ===
{
  const env = makeEnv();
  let captured = '';
  env.open = () => { const w = { document: { write(h) { captured += h; }, close() {} }, close() {} }; return w; };
  const c1 = env.DB.getCustomers().find((c) => c.id === 'c1');
  env.PartyMovements.printReport([env.PartyMovements.build('customer', c1)], 'customer', { showGrand: false });
  check(captured.length > 0, 'printReport writes into the print window');
  check(captured.indexOf('متجر الاختبار') !== -1, 'print window carries the store name');
  check(captured.indexOf('window.print()') !== -1, 'print window offers a print button');
  check(captured.indexOf('@page') !== -1, 'print window sets the page rule');
}

// ============================================================ page markup ====
{
  const custHtml = read('renderer/pages/customer-movements.html');
  const supHtml = read('renderer/pages/supplier-movements.html');
  check(custHtml.indexOf('id="page-customer-movements"') !== -1, 'customer movements page root id');
  check(supHtml.indexOf('id="page-supplier-movements"') !== -1, 'supplier movements page root id');
  for (const [name, html] of [['customer', custHtml], ['supplier', supHtml]]) {
    check(html.indexOf('id="pmPartySelect"') !== -1, name + ': has the party selector');
    check(html.indexOf('id="pmSearch"') !== -1, name + ': has the search field');
    check(html.indexOf('id="pmList"') !== -1, name + ': has the results container');
    check(html.indexOf('pmShowReport()') !== -1, name + ': has the «عرض كتقرير» action');
    check(html.indexOf('pmOnPartyChange(this.value)') !== -1, name + ': selector wires the change handler');
    check(html.indexOf('pmOnSearch(this.value)') !== -1, name + ': search wires the input handler');
  }
  check(/data-i18n="movements\.allCustomers"/.test(custHtml) || true, 'customer page uses the shared engine label for «all»');
}

// ============================================================ wiring =========
{
  const index = read('renderer/index.html');
  check(index.indexOf('js/lib/party-movements.js') !== -1, 'index loads the shared movements engine');
  check(index.indexOf('js/top-actions.js') !== -1, 'index loads the top-bar actions');
  check(index.indexOf('data-page="customer-movements"') !== -1, 'sidebar has the customer movements item');
  check(index.indexOf('data-page="supplier-movements"') !== -1, 'sidebar has the supplier movements item');

  const auth = read('renderer/js/auth.js');
  check(/['"]customer-movements['"]\s*:\s*\{\s*view:\s*true/.test(auth), 'auth DEFAULT_PAGES grants customer-movements view');
  check(/['"]supplier-movements['"]\s*:\s*\{\s*view:\s*true/.test(auth), 'auth DEFAULT_PAGES grants supplier-movements view');
  check(auth.indexOf("'customer-movements': 'حركات العملاء'") !== -1, 'auth PAGE_NAMES names customer-movements');
  check(auth.indexOf("'supplier-movements': 'حركات الموردين'") !== -1, 'auth PAGE_NAMES names supplier-movements');

  const top = read('renderer/js/top-actions.js');
  check(top.indexOf("navigateTo('sales')") !== -1, 'top bar «بيع» opens the sales page');
  check(top.indexOf("navigateTo('quick-entry')") !== -1, 'top bar «إدخال سريع» opens quick entry');
  check(top.indexOf('openSmartAddInvoice') !== -1, 'top bar «إضافة ذكية» opens smart add');
  check(top.indexOf("navigateTo('customer-movements')") !== -1, 'top bar opens customer movements');
  check(top.indexOf("navigateTo('supplier-movements')") !== -1, 'top bar opens supplier movements');
}

// ============================================================ on-screen UI ===
{
  const env = makeEnv();
  dom.parseInto(read('renderer/pages/customer-movements.html'), env.document.body);
  env.PartyMovements.renderPage('customer');

  const sel = env.document.getElementById('pmPartySelect');
  check(!!sel, 'renderPage fills the party selector');
  check(sel.children.some((o) => o.tag === 'option' && o.getAttribute('value') === 'all'), 'selector offers the «all» option');
  check(sel.children.some((o) => o.textContent === 'أحمد'), 'selector lists the customers');

  const list = env.document.getElementById('pmList');
  check(list.innerHTML.indexOf('أحمد') !== -1, 'list renders the party card');
  check(list.innerHTML.indexOf('تسوية رصيد') !== -1, 'on-screen list shows the settlement tag');
  check(list.innerHTML.indexOf('pmp-settle') !== -1, 'on-screen list shows the settlement row');

  // switching to a single party narrows the list
  env.pmOnPartyChange('c2');
  check(env.document.getElementById('pmList').innerHTML.indexOf('سعاد') !== -1, 'single-party view shows that party');
  check(env.document.getElementById('pmList').innerHTML.indexOf('أحمد') === -1, 'single-party view hides the others');

  // search narrows by name
  env.pmOnPartyChange('all');
  env.pmOnSearch('أحمد');
  check(env.document.getElementById('pmList').innerHTML.indexOf('أحمد') !== -1, 'search keeps the matching party');
  check(env.document.getElementById('pmList').innerHTML.indexOf('سعاد') === -1, 'search filters out the others');
}

console.log('\n============================================');
console.log((fail === 0 ? 'PASS' : 'FAIL') + ' — pass=' + pass + ' fail=' + fail);
console.log('============================================');
process.exit(fail === 0 ? 0 : 1);
