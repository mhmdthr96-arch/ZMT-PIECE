// ============================================================================
// ZMT PIECE — تشخيص المنتج (زر «تشخيص» في نافذة تعديل المنتج) — فحص دائم
// Run: node renderer/tests/product-diagnosis-verify.js
//
// يثبّت السلوك المُضاف دون تغيير أي سلوك قائم:
//   1) تسجيل مصدر الإنشاء (createdVia) وسبب الفصل/الدمج في سجل التدقيق
//   2) الفصل الذكي يبقى كما هو (سعر مختلف ⇒ بطاقة منفصلة تشير إلى أصلها)
//   3) DB.diagnoseProduct يشرح التكرار، اختلاف المورد، سبب الفصل، والكمية
//   4) زر التشخيص موجود في نافذة تعديل المنتج ومفاتيح الترجمة مكتملة
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

const appSrc = read('renderer/js/app.js');
const invJs = read('renderer/js/pages/inventory.js');
const dbJs = read('renderer/js/db.js');

function makeBox() {
  const store = {};
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const box = {
    module: { exports: {} }, console, localStorage: ls, document: createDoc(),
    Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
    RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map, WeakMap,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    indexedDB: null, navigator: { onLine: false },
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
  vm.runInContext(read('renderer/js/purchase-core.js'), box, { filename: 'purchase-core.js' });
  vm.runInContext(dbJs, box, { filename: 'db.js' });
  return box;
}

const box = makeBox();
const DB = vm.runInContext('DB', box);

// ================================================= 1. createdVia + logging ==
section('1) مصدر الإنشاء وسبب الفصل/الدمج في سجل التدقيق');

const a = DB.addProduct({ name: 'X', barcode: '7000001', buyPrice: 10, sellPrice: 20, quantity: 5 }, { source: 'test-add' });
eq(a.createdVia, 'test-add', 'addProduct يسجّل createdVia من opts.source');
eq(DB.getProduct(a.id).createdVia, 'test-add', 'createdVia محفوظ على المنتج نفسه');

const addLog = DB.getAuditLogs().find(l => l.action === 'add' && l.entityId === a.id);
check(!!addLog, 'إنشاء المنتج سُجّل في سجل التدقيق');
eq(addLog && addLog.source, 'test-add', 'سجل الإنشاء يحمل المصدر');
eq(addLog && addLog.hadExisting, false, 'سجل الإنشاء يقول hadExisting=false');

// ================================================= 2. split keeps behaviour =
section('2) الفصل الذكي: بطاقة منفصلة تشير إلى أصلها (السلوك محفوظ)');

const s = DB.addOrMergeProduct({
  name: 'X', barcode: '7000001', buyPrice: 12, sellPrice: 20, quantity: 3, supplierId: 'sup1',
}, { source: 'test-split' });
eq(s.ok, true, 'الفصل ينجح');
eq(s.separate, true, 'سعر شراء مختلف ⇒ بطاقة منفصلة (لا دمج)');
eq(s.product.splitFromId, a.id, 'البطاقة المنفصلة تشير إلى البطاقة الأصلية');

const splitLog = DB.getAuditLogs().find(l => l.action === 'split' && l.entityId === s.product.id);
check(!!splitLog, 'الفصل سُجّل في سجل التدقيق');
check(splitLog && /buyPrice/.test(splitLog.reason || ''), 'سبب الفصل يذكر buyPrice');
eq(splitLog && splitLog.source, 'test-split', 'سجل الفصل يحمل المصدر');
eq(splitLog && splitLog.hadExisting, true, 'سجل الفصل يقول hadExisting=true');

// ================================================= 3. diagnoseProduct ======
section('3) DB.diagnoseProduct يشرح التكرار واختلاف المورد');

const rep = DB.diagnoseProduct(a.id);
eq(rep.ok, true, 'التشخيص ينجح');
eq(rep.groupCount, 2, 'يكشف بطاقتين لنفس الهوية/الباركود');
eq(rep.duplicate, true, 'يعلن وجود تكرار');
eq(rep.supplierDiffers, true, 'يكشف اختلاف المورد بين البطاقتين');
eq(rep.group[0].isCurrent, true, 'البطاقة الحالية معلَّمة');
eq(rep.group[1].supplierId, 'sup1', 'البطاقة الثانية تحمل المورد');
eq(rep.group[0].supplierId, '', 'البطاقة الأولى بلا مورد');
check(rep.group[1].splitReason.indexOf('buyPrice') !== -1, 'سبب الفصل الظاهر يذكر buyPrice');
eq(rep.group[1].barcodeSame, true, 'البطاقتان بنفس الباركود');
eq(rep.totals.groupQty, 8, 'مجموع كميات البطاقات = 8');
eq(rep.verdict, 'split', 'الحكم: فصل ذكي');

const repAudit = DB.diagnoseProduct(s.product.id);
check(repAudit.audit.some(l => l.action === 'split'), 'تقرير البطاقة المنفصلة يعرض عملية الفصل');

// ================================================= 4. merge + conflict =====
section('4) الدمج والتعارض يبقيان سليمين');

const m1 = DB.addOrMergeProduct({ name: 'Y', barcode: '7000002', buyPrice: 5, sellPrice: 9, quantity: 2 }, { source: 'test-new' });
eq(m1.created, true, 'منتج جديد يُنشأ');
const m2 = DB.addOrMergeProduct({ name: 'Y', barcode: '7000002', buyPrice: 5, sellPrice: 9, quantity: 3 }, { source: 'test-merge' });
eq(m2.merged, true, 'نفس الهوية والسعر ⇒ دمج');
eq(DB.getProduct(m1.product.id).quantity, 5, 'الكمية تُجمع في بطاقة واحدة');
const mergeLog = DB.getAuditLogs().find(l => l.action === 'merge' && l.entityId === m1.product.id);
eq(mergeLog && mergeLog.reason, 'same_prices', 'سبب الدمج same_prices');
const single = DB.diagnoseProduct(m1.product.id);
eq(single.duplicate, false, 'منتج غير مكرر: بطاقة واحدة');
eq(single.groupCount, 1, 'عدد البطاقات 1');
eq(single.verdict, 'single', 'الحكم: بطاقة واحدة');

// Two independent creations of the same identity (bypassing merge) must be
// reported as an independent duplicate — the exact symptom reported by users.
const d1 = DB.addProduct({ name: 'Dup', barcode: '7000003', buyPrice: 1, sellPrice: 2, quantity: 1 });
DB.addProduct({ name: 'Dup', barcode: '7000003', buyPrice: 1, sellPrice: 2, quantity: 1 });
const drep = DB.diagnoseProduct(d1.id);
eq(drep.duplicate, true, 'إنشاءان مستقلان ⇒ تكرار مكتشف');
eq(drep.verdict, 'independent_creation', 'الحكم: إنشاء مستقل مزدوج');
eq(drep.groupCount, 2, 'البطاقتان المستقلتان مكتشفتان');

const conflict = DB.addOrMergeProduct({ name: 'Z', barcode: '7000001', buyPrice: 1, sellPrice: 2, quantity: 1 }, { source: 'test-conflict' });
eq(conflict.ok, false, 'باركود مستخدم لهوية مختلفة ⇒ يُرفض');
eq(conflict.conflict, true, 'يُبلَّغ كتعارض');
const confLog = DB.getAuditLogs().find(l => l.action === 'product_conflict');
eq(confLog && confLog.reason, 'barcode_conflict', 'التعارض يُسجَّل بسبب barcode_conflict');

// ================================================= 5. static UI wiring =====
section('5) زر التشخيص ومفاتيح الترجمة');

check(/function invShowDiagnosis\(id\)/.test(invJs), 'inventory.js يعرّف invShowDiagnosis');
check(/function _invDiagHtml\(rep\)/.test(invJs), 'inventory.js يعرّف _invDiagHtml');
check(/onclick="invShowDiagnosis\('\$\{id\}'\)"/.test(invJs), 'زر التشخيص مربوط بمعرّف المنتج');
check(/id="invDiagPanel"/.test(invJs), 'لوحة التشخيص موجودة في نافذة التعديل');
check(/extraFooterHtml/.test(invJs), 'showModal يقبل زراً إضافياً اختيارياً');
check(/function _scheduleAuditFlush\(\)/.test(dbJs), 'db.js يعرّف _scheduleAuditFlush (كان ناقصاً)');
check(/diagnoseProduct\(id\) \{/.test(dbJs), 'db.js يعرّف diagnoseProduct');

const keyCount = (appSrc.match(/diagNotFound:/g) || []).length;
eq(keyCount, 4, 'مفاتيح التشخيص موجودة في اللغات الأربع');
eq((appSrc.match(/diagVerdictIndependent:/g) || []).length, 4, 'مفاتيح الحكم موجودة في اللغات الأربع');
check(appSrc.indexOf('diagnoseBtn:') !== -1, 'مفتاح زر التشخيص موجود');
check(/verdictMap\[rep\.verdict\]/.test(invJs), 'واجهة التقرير تعرض الحكم');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
