// ============================================================
// ZMT PIECE —Movements / debt-details performance guard
// Run: node renderer/tests/ledger-performance-verify.js
//
// The old pages scanned the ENTIRE invoice/payment cache once per party and
// rebuilt ALL ledgers on every keystroke. This guard proves the additive fix:
//   1. the by-party DB indexes return byte-for-byte the same rows as the old
//      full-scan predicates (company scope AND store scope included);
//   2. DB.dataVersion() advances on every write, including in-place updates;
//   3. PartyMovements.build() is still pure, while buildCached() reuses the
//      same ledger until the data revision moves, then recomputes;
//   4. real inline search input is debounced but programmatic calls stay
//      synchronous (existing callers/tests keep their behaviour);
//   5. expanding one card replaces only that card, and very large ledgers use
//      "show more" while totals/print/export still see every party;
//   6. debt-details prefers the shared ledger cache and keys its alert cache
//      on the data revision instead of only list lengths.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dom = require('./dom-lite.js');
const createDoc = dom.createDoc;

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const section = (m) => console.log('\n=== ' + m + ' ===');
const ids = (list) => (list || []).map((x) => x.id).sort().join(',');

// ------------------------------------------------ minimal IndexedDB --------
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
    module: { exports: {} }, console, localStorage: ls, document: createDoc(),
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

// ------------------------------------------------ movements sandbox -------
const DICT = {
  'movements.settledTag': 'تسوية رصيد',
  'movements.opening': 'رصيد سابق',
  'movements.entrySale': 'فاتورة بيع',
  'movements.entryPayment': 'دفعة',
};

function makePMEnv(withVersion, count) {
  let version = 1;
  const customers = [], suppliers = [], invoices = [], payments = [];
  const n = count || 2;
  for (let i = 1; i <= n; i++) {
    const c = { id: 'c' + i, name: 'عميل ' + i, balance: 0, phone: '055' + i };
    customers.push(c);
    invoices.push({ id: 'i' + i, type: 'customer', customerId: c.id, totalAmount: 100 * i, createdAt: 1000 + i, invoiceNumber: 'F-' + i, items: [] });
    payments.push({ id: 'pm' + i, customerId: c.id, amount: 10 * i, createdAt: 2000 + i });
  }
  suppliers.push({ id: 's1', name: 'مورد 1', balance: 0 });
  invoices.push({ id: 'is1', type: 'supplier', supplierId: 's1', totalAmount: 500, createdAt: 1000, invoiceNumber: 'A-1', items: [] });
  payments.push({ id: 'pms1', supplierId: 's1', amount: 500, createdAt: 2000 });

  const db = {
    getCustomers: () => customers,
    getSuppliers: () => suppliers,
    getInvoicesByCustomer: (id) => invoices.filter((i) => i.customerId === id),
    getInvoicesBySupplier: (id) => invoices.filter((i) => i.supplierId === id),
    getCustomerPayments: (id) => payments.filter((p) => p.customerId === id),
    getSupplierPayments: (id) => payments.filter((p) => p.supplierId === id),
  };
  if (withVersion) db.dataVersion = () => version;

  const lsStore = {};
  const sandbox = {
    console, Date, Math, JSON, String, Number, parseFloat, parseInt, isFinite, Object, Array,
    document: createDoc(),
    isRTL: () => true,
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    t: (k) => DICT[k] || '',
    getStoreInfo: () => ({ name: 'متجر', address: '', phone: '' }),
    alert: () => {},
    open: () => ({ document: { write() {}, close() {} }, close() {} }),
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null),
      setItem: (k, v) => { lsStore[k] = String(v); },
    },
    DB: db,
    setTimeout: (fn) => { sandbox.__pending = fn; return 1; },
    clearTimeout: () => {},
    event: null,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('renderer/js/lib/party-movements.js'), sandbox, { filename: 'party-movements.js' });
  return {
    env: sandbox,
    customers,
    ls: lsStore,
    bump: () => { version++; },
    version: () => version,
  };
}

(async function main() {
  console.log('ledger performance guard');

  // ---------------------------------------------- 1/2. indexed DB getters --
  section('1) DB by-party indexes are result-identical to the old full scan');
  {
    const box = makeDBBox();
    const DB = vm.runInContext('DB', box);
    box.localStorage.setItem('zmt_store_code', 'S1');
    await DB.importAll({
      customers: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }],
      suppliers: [{ id: 's1', name: 'S1' }, { id: 's2', name: 'S2' }],
      invoices: [
        { id: 'i1', type: 'customer', customerId: 'c1', totalAmount: 10, createdAt: 1, invoiceNumber: 'F1', items: [], storeId: 'S1' },
        { id: 'i2', type: 'customer', customerId: 'c1', totalAmount: 20, createdAt: 2, invoiceNumber: 'F2', items: [], storeId: 'S2' },
        { id: 'i3', type: 'customer', customerId: 'c1', totalAmount: 30, createdAt: 3, invoiceNumber: 'F3', items: [] },
        { id: 'i4', type: 'supplier', supplierId: 's1', totalAmount: 40, createdAt: 4, invoiceNumber: 'A1', items: [], storeId: 'S1' },
        { id: 'i5', type: 'supplier', supplierId: 's1', totalAmount: 50, createdAt: 5, invoiceNumber: 'A2', items: [], storeId: 'S2' },
      ],
      payments: [
        { id: 'p1', customerId: 'c1', amount: 5, createdAt: 6 },
        { id: 'p2', supplierId: 's1', amount: 7, createdAt: 7 },
        { id: 'p3', supplierId: 's1', amount: 8, createdAt: 8 },
        { id: 'p4', customerId: 'c2', amount: 9, createdAt: 9 },
      ],
    });

    function reference() {
      const sid = box.localStorage.getItem('zmt_store_code');
      const inv = DB.getInvoices();
      const pay = DB.getPayments();
      return {
        ci: ids(inv.filter((v) => v.customerId === 'c1' && (!sid || !v.storeId || v.storeId === sid))),
        si: ids(inv.filter((v) => v.supplierId === 's1' && (!sid || !v.storeId || v.storeId === sid))),
        cp: ids(pay.filter((p) => p.customerId === 'c1')),
        sp: ids(pay.filter((p) => p.supplierId === 's1')),
      };
    }
    function actual() {
      return {
        ci: ids(DB.getInvoicesByCustomer('c1')),
        si: ids(DB.getInvoicesBySupplier('s1')),
        cp: ids(DB.getCustomerPayments('c1')),
        sp: ids(DB.getSupplierPayments('s1')),
      };
    }
    eq(JSON.stringify(actual()), JSON.stringify(reference()), 'active store S1: all four getters match a full scan');
    box.localStorage.setItem('zmt_store_code', 'S2');
    eq(JSON.stringify(actual()), JSON.stringify(reference()), 'active store S2: store-scoped rows still match exactly');
    box.localStorage.setItem('zmt_store_code', '');
    eq(JSON.stringify(actual()), JSON.stringify(reference()), 'no active store: all rows visible, still identical');
    eq(DB.getInvoicesBySupplier('nobody').length, 0, 'unknown supplier → empty list (no error)');
    const got = DB.getSupplierPayments('s1');
    got.push({ id: 'intruder', supplierId: 's1', amount: 1 });
    eq(DB.getSupplierPayments('s1').length, 2, 'caller cannot corrupt the internal index bucket by mutating the result');
  }

  section('2) DB.dataVersion() moves on every mutation');
  {
    const box = makeDBBox();
    const DB = vm.runInContext('DB', box);
    await DB.importAll({ invoices: [{ id: 'x1', type: 'customer', customerId: 'c1', totalAmount: 1, createdAt: 1, invoiceNumber: 'F1', items: [] }] });
    const v0 = DB.dataVersion();
    const added = DB.addInvoice({ type: 'customer', customerId: 'c1', totalAmount: 2, items: [] });
    const v1 = DB.dataVersion();
    check(v1 > v0, 'addInvoice advances the revision');
    DB.updateInvoice(added.id, { totalAmount: 9 });
    check(DB.dataVersion() > v1, 'in-place updateInvoice advances the revision (no index rebuild)');
    const v2 = DB.dataVersion();
    DB.deleteInvoice(added.id);
    check(DB.dataVersion() > v2, 'deleteInvoice advances the revision');
  }

  // ------------------------------------------ 3. build vs buildCached -----
  section('3) buildCached reuses identical ledgers and invalidates on writes');
  {
    const m = makePMEnv(true, 2);
    const PM = m.env.PartyMovements;
    const c1 = m.customers[0];
    const a = PM.build('customer', c1);
    const b = PM.buildCached('customer', c1);
    eq(b.entries.length, a.entries.length, 'buildCached has the same entry count as build');
    eq(b.totals.net, a.totals.net, 'buildCached has the same balance as build');
    eq(b.settlements.length, a.settlements.length, 'buildCached keeps the same settlements');
    check(PM.build('customer', c1) !== PM.build('customer', c1), 'direct build() stays pure (recomputes each call)');
    check(PM.buildCached('customer', c1) === PM.buildCached('customer', c1), 'buildCached reuses the same object while data is unchanged');
    m.bump();
    check(PM.buildCached('customer', c1) !== b, 'a data revision bump invalidates the cache');
    eq(PM.buildCached('customer', c1).totals.net, a.totals.net, 'and produces the same correct figures');
    const beforeSwitch = PM.buildCached('customer', c1);
    m.ls['zmt_active_company'] = 'COMPANY-B';
    check(PM.buildCached('customer', c1) !== beforeSwitch,
      'switching the active company (localStorage-only) also invalidates the cache');
    eq(PM.buildCached('customer', c1).totals.net, a.totals.net, 'and the figures are still correct');
  }

  // ------------------------------------------ 4. no-revision fallback -----
  section('4) DB without dataVersion() → caching disabled, behaviour unchanged');
  {
    const m = makePMEnv(false, 2);
    const PM = m.env.PartyMovements;
    const c1 = m.customers[0];
    check(PM.buildCached('customer', c1) !== PM.buildCached('customer', c1),
      'fakes without a revision counter always recompute (zero stale-data risk)');
  }

  // ------------------------------------------ 5/6. rendering path ---------
  section('5) search debounce, single-card toggle and show-more paging');
  {
    const m = makePMEnv(false, 2);
    const env = m.env;
    dom.parseInto(read('renderer/pages/customer-movements.html'), env.document.body);
    env.PartyMovements.renderPage('customer');
    const list = env.document.getElementById('pmList');
    check(list.innerHTML.indexOf('عميل 1') !== -1, 'initial page renders the parties');

    // Real inline handler: deferred. Programmatic call: immediate (covered by
    // the existing party-movements-verify.js).
    env.event = { type: 'input' };
    env.pmOnSearch('عميل 2');
    check(typeof env.__pending === 'function', 'inline input schedules a deferred refresh');
    check(list.innerHTML.indexOf('عميل 1') !== -1, 'nothing changes before the debounce fires');
    env.__pending();
    check(list.innerHTML.indexOf('عميل 1') === -1 && list.innerHTML.indexOf('عميل 2') !== -1,
      'deferred refresh applies the search correctly');
    env.event = null;
    env.pmOnSearch('');
    check(list.innerHTML.indexOf('عميل 1') !== -1, 'programmatic search stays synchronous');

    // Expanding ONE card must not recreate the other cards.
    const before = list.children.slice();
    env.pmToggleParty('c2');
    check(list.children[0] === before[0], 'other cards keep their DOM nodes on toggle');
    check(list.children[1] !== before[1], 'only the toggled card is replaced');
    check(list.children[1].getAttribute('data-party') === 'c2', 'the right card was replaced');
    check(String(list.children[1].className).indexOf('is-open') !== -1, 'the toggled card is expanded');
  }
  {
    const m = makePMEnv(false, 230);
    const env = m.env;
    dom.parseInto(read('renderer/pages/customer-movements.html'), env.document.body);
    env.PartyMovements.renderPage('customer');
    const list = env.document.getElementById('pmList');
    const shown = (list.innerHTML.match(/data-party="/g) || []).length;
    eq(shown, 200, 'large ledger paints the first 200 cards only');
    check(list.innerHTML.indexOf('عرض المزيد') !== -1, 'a show-more control is offered');
    env.pmShowMore();
    const more = (env.document.getElementById('pmList').innerHTML.match(/data-party="/g) || []).length;
    check(more > shown, 'show-more reveals more parties');
    eq(more, 230, 'all customers remain reachable after expanding');
  }

  // ------------------------------------------ 7. debt-details ------------
  section('6) debt-details uses the shared cache and a data-aware key');
  {
    const dd = read('renderer/js/pages/debt-details.js');
    check(dd.indexOf('PartyMovements.buildCached') !== -1, 'critical debts reuse the memoised ledger');
    check(dd.indexOf('typeof DB.dataVersion') !== -1, 'alert cache key includes the DB revision');
    const pm = read('renderer/js/lib/party-movements.js');
    check(pm.indexOf('_pmAllLedgers') !== -1 && pm.indexOf('_pmLedgerCache') !== -1, 'movements page memoises the whole ledger list');
    check(pm.indexOf('opts.skipChart') !== -1, 'card toggle no longer destroys/recreates the chart');
    check(pm.indexOf('_pmReturnsIndexFor') !== -1, 'returns are indexed once per revision instead of once per party');
    check(pm.indexOf('opts.deferChart') !== -1 && pm.indexOf('_pmScheduleChart') !== -1,
      'search input paints cards first and debounces the chart redraw');
    check(pm.indexOf('allEntries.length > 300') !== -1,
      'single-party chart samples long ledgers while reports use every row');
    // A print-mode click must never generate a report or open a print window.
    const modeOnly = (src, fn, setter) =>
      new RegExp('function\\s+' + fn + '\\s*\\(\\s*\\)\\s*\\{\\s*' + setter + '\\([^)]*\\);\\s*\\}').test(src);
    check(modeOnly(pm, 'pmPrintColor', 'pmSetPrintMode') && modeOnly(pm, 'pmPrintBw', 'pmSetPrintMode'),
      'movements colour/B&W buttons only set the preference');
    check(modeOnly(dd, 'ddPrintColor', 'ddSetPrintMode') && modeOnly(dd, 'ddPrintBw', 'ddSetPrintMode'),
      'debt-details colour/B&W buttons only set the preference');
    const bm = read('renderer/js/lib/brand-movements.js');
    check(modeOnly(bm, 'printColor', 'setPrintMode') && modeOnly(bm, 'printBw', 'setPrintMode'),
      'mark-movements colour/B&W buttons only set the preference');
    const dbJs = read('renderer/js/db.js');
    check(dbJs.indexOf("_partyRows('invoices', 'sup:'") !== -1 && dbJs.indexOf("_partyRows('payments', 'cust:'") !== -1,
      'both invoice and payment getters use the existing by-party indexes');
  }

  console.log('');
  console.log('ledger-performance-verify: ' + (fails ? fails + ' FAILED' : 'all checks passed'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
