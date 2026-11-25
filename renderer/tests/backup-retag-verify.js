// ============================================================================
// ZMT PIECE — خيار إعادة الوسم عند الاستعادة (Option 3) — فحص دائم
// Run: node renderer/tests/backup-retag-verify.js
//
// يثبّت السلوك المُضاف دون تغيير أي سلوك قائم:
//   1) DB.importAll(data, { retagStoreId }) يُعيد وسم storeId إلى الرمز الحالي
//   2) بدون الخيار (الافتراضي) يبقى السلوك كما هو تماماً: بيانات الرمز القديم
//      تُستعاد لكن تبقى مخفية (لا يمسّها أي تغيير)
//   3) الصفوف بلا storeId لا تُلمس، والبيانات غير المخزنية تبقى كما هي
//   4) الواجهة: نافذة استعادة بخيار معطّل افتراضياً + مفاتيح ترجمة في اللغات الأربع
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createDoc } = require('./dom-lite.js');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const section = (name) => console.log('\n=== ' + name + ' ===');

const appSrc = read('renderer/js/app.js');
const backupJs = read('renderer/js/pages/backup.js');
const dbJs = read('renderer/js/db.js');

function sliceBalanced(text, start, open, close) {
  let depth = 0, i = start, inStr = null, esc = false, line = false, block = false;
  for (; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return text.slice(start);
}
function grabAppFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error(name + ' is not a global function in app.js');
  const open = src.indexOf('{', src.indexOf(')', i));
  return src.slice(i, open + sliceBalanced(src, open, '{', '}').length);
}
function grabAppRange(src, startDecl, endFn) {
  const a = src.indexOf(startDecl);
  if (a === -1) throw new Error(startDecl + ' is not in app.js');
  const b = src.indexOf('function ' + endFn + '(', a);
  if (b === -1) throw new Error(endFn + ' does not follow ' + startDecl);
  const open = src.indexOf('{', src.indexOf(')', b));
  return src.slice(a, open + sliceBalanced(src, open, '{', '}').length);
}

// ---- minimal fake IndexedDB (enough for openDB / getAll / put / clear) ----
function makeFakeIDB() {
  const data = {};
  const os = (name) => ({
    put: (rec) => { if (!data[name]) data[name] = new Map(); data[name].set(rec.id, JSON.parse(JSON.stringify(rec))); },
    delete: (id) => { if (data[name]) data[name].delete(id); },
    clear: () => { data[name] = new Map(); },
    getAll: () => { const r = {}; Promise.resolve().then(() => { r.result = Array.from((data[name] || new Map()).values()); if (r.onsuccess) r.onsuccess({ target: r }); }); return r; },
  });
  return {
    open: () => {
      const r = {};
      Promise.resolve().then(() => {
        const dbObj = {
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
        r.result = dbObj;
        if (r.onupgradeneeded) r.onupgradeneeded({ target: r });
        if (r.onsuccess) r.onsuccess({ target: r });
      });
      return r;
    },
  };
}

function makeBox() {
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
  ['normBarcode', 'canonBarcode', 'normalizeSearchText', 'searchTokens', 'productSearchScore',
    'cleanScannedCode', 'normSearch'].forEach((n) => {
    vm.runInContext(grabAppFn(appSrc, n), box, { filename: 'app.js#' + n });
  });
  vm.runInContext(grabAppRange(appSrc, 'function _mapChars(', 'barcodeVariants'), box, { filename: 'app.js#barcode helpers' });
  vm.runInContext(read('renderer/js/lib/units.js'), box, { filename: 'units.js' });
  vm.runInContext(dbJs, box, { filename: 'db.js' });
  return box;
}

const OLD = '1111111111';
const NEW = '2222222222';

function seedOldCodeRows(box) {
  const DB = vm.runInContext('DB', box);
  box.localStorage.setItem('zmt_store_code', OLD);
  const p1 = DB.addProduct({ name: 'A', barcode: '8000001', buyPrice: 1, sellPrice: 2, quantity: 3 });
  const p2 = DB.addProduct({ name: 'B', barcode: '8000002', buyPrice: 4, sellPrice: 5, quantity: 6 });
  const exported = DB.exportAll();
  return { DB, p1, p2, exported };
}

(async () => {
  // ================================================= 1. الافتراضي محفوظ ====
  section('1) بدون الخيار: بيانات الرمز القديم تُستعاد لكن تبقى مخفية (السلوك الأصلي)');

  {
    const box = makeBox();
    const { DB, p1, exported } = seedOldCodeRows(box);
    eq(p1.storeId, OLD, 'المنتج أُنشئ بمعرّف الرمز القديم');
    eq(DB.currentStoreCode(), OLD, 'currentStoreCode يعكس الرمز النشط (القديم)');

    box.localStorage.setItem('zmt_store_code', NEW);
    eq(DB.currentStoreCode(), NEW, 'currentStoreCode يعكس الرمز النشط (الجديد)');
    eq(DB.getProducts().length, 0, 'قبل الاستعادة: منتجات الرمز القديم مخفية');

    await DB.importAll({ products: exported.products });
    eq(DB.getProducts().length, 0, 'بدون خيار إعادة الوسم: تبقى مخفية كما قبل');
    const stored = DB.exportAll().products.find(p => p.id === p1.id);
    eq(stored && stored.storeId, OLD, 'بدون الخيار: storeId لا يتغيّر (لا فقدان بيانات)');
  }

  // ================================================= 2. مع الخيار ==========
  section('2) مع الخيار: يُعاد وسم storeId إلى الرمز الحالي فتظهر البيانات');

  {
    const box = makeBox();
    const { DB, p1, p2, exported } = seedOldCodeRows(box);
    box.localStorage.setItem('zmt_store_code', NEW);
    eq(DB.getProducts().length, 0, 'قبل الاستعادة: مخفية');

    await DB.importAll({ products: exported.products }, { retagStoreId: NEW });
    const vis = DB.getProducts();
    eq(vis.length, 2, 'بعد إعادة الوسم: كل المنتجات ظاهرة');
    check(vis.every(p => p.storeId === NEW), 'كل الصفوف صارت تحمل الرمز الحالي');
    const p1b = vis.find(p => p.id === p1.id);
    const p2b = vis.find(p => p.id === p2.id);
    eq(p1b && p1b.name, 'A', 'اسم المنتج الأول محفوظ');
    eq(p2b && p2b.quantity, 6, 'كمية المنتج الثاني محفوظة');
  }

  // ================================================= 3. الصفوف بلا storeId =
  section('3) الصفوف بلا storeId لا تُلمس، والبيانات غير المخزنية سليمة');

  {
    const box = makeBox();
    const { DB, exported } = seedOldCodeRows(box);
    // صف مخزني بلا storeId (قديم/مستورد) + عميل بلا storeId (بيانات غير مخزنية)
    exported.products.push({ id: 'p-nostore', name: 'NoStore', barcode: '8000003', buyPrice: 0, sellPrice: 0, quantity: 1 });
    const customers = [{ id: 'c1', name: 'Client' }];
    box.localStorage.setItem('zmt_store_code', NEW);
    await DB.importAll({ products: exported.products, customers: customers }, { retagStoreId: NEW });

    const noStore = DB.exportAll().products.find(p => p.id === 'p-nostore');
    check(noStore && !noStore.storeId, 'الصف بلا storeId يبقى بلا storeId');
    const cust = DB.exportAll().customers.find(c => c.id === 'c1');
    check(cust && !cust.storeId, 'العميل (غير مخزني) لا يُوسم بـ storeId');
  }

  // ================================================= 4. اتصال الواجهة =====
  section('4) نافذة الاستعادة ومفاتيح الترجمة (اللغات الأربع)');

  check(/function showRestoreDialog\(backup, summary\)/.test(backupJs), 'backup.js يعرّف showRestoreDialog');
  check(/function _backupCurrentStoreCode\(\)/.test(backupJs), 'backup.js يعرّف _backupCurrentStoreCode');
  check(/id="restoreRetagChk"/.test(backupJs), 'مربع اختيار إعادة الوسم موجود في النافذة');
  // الافتراضي معطّل: لا سمة checked على مربع الاختيار
  check(!/id="restoreRetagChk"[^>]*checked/.test(backupJs), 'مربع إعادة الوسم معطّل افتراضياً (بلا checked)');
  check(/retag: !!\(chk && chk\.checked\)/.test(backupJs), 'النافذة تُرجع قيمة الخيار');
  check(/async function setAllData\(data, opts\)/.test(backupJs), 'setAllData يقبل خيارات الاستعادة');
  check(/retagTarget \? \{ retagStoreId: retagTarget \} : undefined/.test(backupJs), 'setAllData يمرّر retagStoreId إلى DB.importAll');
  check(/const answer = await showRestoreDialog\(backup, s\);/.test(backupJs), 'restoreBackup/الأخ يستخدمان النافذة');
  check(/await setAllData\(backup\.data, \{ retag: answer\.retag \}\)/.test(backupJs), 'الاستعادة تمرّر خيار إعادة الوسم');
  check(/^zmt_users\(_meta\)\?_\(\.\+\)\$/m.test(backupJs) || /\^zmt_users\(_meta\)\?_\(\.\+\)\$/.test(backupJs), 'backup.js يعالج مفاتيح مستخدمي المتجر بالرمز');
  check(/currentStoreCode\(\) \{/.test(dbJs), 'db.js يعرّف currentStoreCode');
  check(/retagStoreId/.test(dbJs), 'db.js يستقبل خيار retagStoreId في importAll');

  const keys = ['restoreTitle', 'retagLabel', 'retagHint', 'retagWarn', 'retagCurrent', 'restoreSuccessRetag', 'restoreFromFileSuccessRetag'];
  for (const k of keys) {
    const n = (appSrc.match(new RegExp(k + ':', 'g')) || []).length;
    eq(n, 4, 'مفتاح ' + k + ' موجود في اللغات الأربع');
  }

  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log('  FAIL exception: ' + (e && e.stack || e)); console.log('\nFAIL — ' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });
