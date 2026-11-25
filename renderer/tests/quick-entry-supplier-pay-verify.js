// ============================================================================
// ZMT PIECE — الإدخال السريع (F1): إنشاء مورد وتسديد الفاتورة في نفس النافذة
// Run: node renderer/tests/quick-entry-supplier-pay-verify.js
//
// يشغّل quick-entry.js الحقيقية فوق quick-entry.html المشحونة نفسها (DOM مصغّر
// من dom-lite)، فما يُقرأ من معرّفات هو ما يراه الصندوق فعلاً. القاعدات المثبَّتة:
//   • زر «إنشاء مورد» ظاهر وينفتح عليه، والنافذة تحفظ وتختار المورد فوراً.
//   • حقل «المدفوع الآن» يسجّل سند دفعة حقيقياً ويقلّص دين المورّد بالباقي.
//   • السالب صفر، والأكثر من الإجمالي يُقتطع عند الإجمالي، وبلا دفعة لا سند.
//   • دفعة بلا مورّد مرفوضة قبل أي كتابة، مع إعادة المؤشر لحقل المورّد.
//   • وضع «تعديل الفاتورة» يخفي المورد والدفع لأنه لا يكتب في القاعدة.
//   • التحكم السلبي: بلا حقل الدفع لا تُسجَّل أي دفعة مهما كُتب.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createDoc, parseInto } = require('./dom-lite');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (c, m) => c ? ok(m) : bad(m);
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

console.log('============================================================');
console.log('الإدخال السريع (F1): إنشاء مورد وتسديد الفاتورة');
console.log('============================================================');

const qeHtmlSrc = read('renderer/pages/quick-entry.html');
const qeJsSrc = read('renderer/js/pages/quick-entry.js');
const appSrc = read('renderer/js/app.js');
const shortcutsSrc = read('renderer/js/shortcuts.js');

// ---------------------------------------------------------- 0. الواجهة مشحونة --
console.log('\n--- 0. ما في الصفحة المشحونة فعلاً ---');
const has = (needle, m) => check(qeHtmlSrc.indexOf(needle) !== -1, m);
has('id="qeAddSupplierBtn"', 'زر «إنشاء مورد» موجود في شريط المورّد');
has('onclick="QE.openAddSupplier()"', 'الزر يستدعي الدالة المصدَّرة نفسها');
has('data-i18n="quickEntry.addSupplier"', 'الزر مترجم ب مفتاح خاص به');
has('id="qeAddSupplierModal"', 'نافذة إنشاء المورد داخل صفحة الإدخال السريع');
has('id="qeNewSupName"', 'النافذة فيها حقل اسم المورد');
has('id="qeNewSupPhone"', 'النافذة فيها حقل الهاتف');
has('id="qeNewSupAddress"', 'النافذة فيها حقل العنوان');
has('onclick="QE.confirmAddSupplier()"', 'نافذتها فيها زر حفظ يسمّي الدالة المصدَّرة');
has('onclick="QE.closeAddSupplier()"', 'ولها زر وإغلاق جانبي يستدعان الإغلاق');
has('id="qePaidAmount"', 'حقل «المدفوع الآن» موجود في التذييل');
has('oninput="QE.updatePayPreview()"', 'الكتابة في الدفع تحدّث المتبقي فوراً');
has('id="qePayPreview"', 'معاينة «المتبقي» موجودة');
check(/\.qe-pay-block\s*\{/.test(read('renderer/css/main.css')), 'التنسيق .qe-pay-block معرَّف في main.css');
check(shortcutsSrc.indexOf("'qeAddSupplierModal'") !== -1,
  'shortcuts.js يعرف النافذة الجديدة (Esc/F1 يغلقانها)');

// المفاتيح الجديدة يجب أن تكون في اللغات الأربع داخل قاموس app.js المشحون
const NEW_KEYS = ['addSupplier', 'newSupplierTitle', 'saveAndSelect', 'paidNow', 'remaining', 'needSupplierForPay'];
console.log('\n--- 1. الترجمة في القاموس المشحون ---');
const dictLines = appSrc.split(/\r?\n/).filter((l) => l.indexOf("'quickEntry.") !== -1);
const dictText = dictLines.join('\n');
for (const k of NEW_KEYS) {
  const hits = (dictText.match(new RegExp("'quickEntry\\." + k + "'", 'g')) || []).length;
  eq(hits, 4, "المفتاح quickEntry." + k + ' موجود في اللغات الأربع');
}
// page-local table (QE_I18N) must carry them too, or _t() falls back to the key
const tableSrc = /var QE_I18N = \{[\s\S]*?\n  \};/.exec(qeJsSrc);
check(!!tableSrc, 'جدول QE_I18N موجود في بداية quick-entry.js');
const tableText = tableSrc ? tableSrc[0] : '';
for (const k of NEW_KEYS) {
  const inTable = (tableText.match(new RegExp('(?:^|[{,\\s])' + k + '\\s*:', 'g')) || []).length;
  eq(inTable, 4, 'QE_I18N فيها ' + k + ' في اللغات الأربع');
}

// ------------------------------------------------------------- mini dictionary --
function arDict(key) {
  const re = new RegExp("'quickEntry\\." + key + "':\\s*'((?:[^'\\\\]|\\\\.)*)'");
  const m = re.exec(dictText);
  return m ? m[1].replace(/\\'/g, "'") : '';
}
const t = (key) => {
  const p = String(key).split('.');
  if (p[0] === 'quickEntry') return arDict(p[1]) || String(key);
  return String(key);
};

// ------------------------------------------------------------------ the DOM ---
function freshDoc() {
  const d = createDoc();
  parseInto(qeHtmlSrc, d.body);
  return d;
}

// ------------------------------------------------------------------ the DB ----
function makeHarness(opts) {
  const o = opts || {};
  const doc = o.doc || freshDoc();
  const alerts = [];
  const writes = { invoices: [], payments: [], productUpdates: [], audits: [] };
  const suppliers = o.suppliers || [];
  const products = o.products || [];
  const byId = {};
  products.forEach((p) => { byId[p.id] = p; });
  const DB = {
    getSuppliers: () => suppliers,
    saveSuppliers: (list) => {
      // The page hands back the very array it got from getSuppliers, so the
      // stub has to snapshot before replacing its own copy.
      const copy = JSON.parse(JSON.stringify(list));
      writes.savedSuppliers = copy;
      suppliers.length = 0;
      copy.forEach((s) => suppliers.push(s));
    },
    getProducts: () => products,
    getProduct: (id) => byId[id] || null,
    getProductByBarcode: (b) => products.find((p) => p.barcode === b) || null,
    addOrMergeProduct: (item) => {
      if (!byId[item.id]) { products.push(item); byId[item.id] = item; }
      byId[item.id].quantity = item.quantity;
      return { ok: true, product: byId[item.id] };
    },
    updateProduct: (id, patch) => {
      writes.productUpdates.push([id, patch]);
      if (byId[id]) Object.assign(byId[id], patch);
      return { ok: true };
    },
    addInvoice: (inv) => { writes.invoices.push(inv); return Object.assign({ id: 'inv1', invoiceNumber: 'FA-1' }, inv); },
    addPayment: (p) => { writes.payments.push(p); return p; },
    generateBarcode: () => 'GEN1',
    findProductsByPlu: () => [],
    logAudit: (a) => { writes.audits.push(a); },
    getMeta: () => null,
  };
  const store = {};
  const sandbox = {
    console, document: doc, DB, t,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    alert: (m) => alerts.push(String(m)),
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
    RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map,
    normSearch: (s) => String(s == null ? '' : s).toLowerCase(),
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
    getPharmacyMode: () => false,
    buildBrandSelectOptions: () => '<option value="">—</option>',
    BRANDS: { global: [], chinese: [] },
    navigateTo: () => {},
    trackPageListener: () => {},
    _currentPageId: 'quick-entry',
    FV: { isVisible: () => true, apply: () => {}, toggle: () => {} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.addEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(read('renderer/js/lib/units.js'), sandbox, { filename: 'units.js' });
  vm.runInContext(read('renderer/js/purchase-core.js'), sandbox, { filename: 'purchase-core.js' });
  vm.runInContext(qeJsSrc, sandbox, { filename: 'quick-entry.js' });
  return { doc, sandbox, DB, writes, alerts, suppliers, products, QE: sandbox.QE };
}

console.log('\n--- 2. إنشاء مورد من داخل النافذة ---');
{
  const H = makeHarness({ suppliers: [] });
  const modal = H.doc.getElementById('qeAddSupplierModal');
  eq(modal.style.display, 'none', 'النافذة مغلقة قبل الضغط');
  H.doc.getElementById('qeNewSupName').value = 'خردة القديمة';
  H.QE.openAddSupplier();
  eq(modal.style.display, 'flex', 'الزر يفتح نافذة المورد الجديدة');
  eq(H.doc.getElementById('qeNewSupName').value, '', 'الفتح يُنظّف الحقول');
  eq(H.doc._activeElement && H.doc._activeElement.id, 'qeNewSupName', 'التركيز يقع على اسم المورد');
  H.QE.confirmAddSupplier();
  eq(H.alerts.length, 1, 'بلا اسم: تنبيه واحد');
  eq(H.suppliers.length, 0, 'ولا يُخزَّن أي مورد');
  H.doc.getElementById('qeNewSupName').value = 'مؤسسة النور';
  H.doc.getElementById('qeNewSupPhone').value = '0555112233';
  H.doc.getElementById('qeNewSupAddress').value = 'شارع الاستقلال';
  H.QE.confirmAddSupplier();
  eq(H.suppliers.length, 1, 'المورد يُحفظ في القاعدة');
  const s = H.suppliers[0];
  eq(s.name, 'مؤسسة النور', 'الاسم كما كُتب');
  eq(s.phone, '0555112233', 'الهاتف محفوظ');
  eq(s.address, 'شارع الاستقلال', 'العنوان محفوظ');
  eq(s.balance, 0, 'الرصيد يبدأ صفراً');
  eq(modal.style.display, 'none', 'النافذة تُغلق بعد الحفظ');
  eq(H.doc.getElementById('qeSupplierName').textContent, 'مؤسسة النور', 'المورد المختار يظهر في الشريط');
  eq(H.doc.getElementById('qeSelectedSupplier').style.display, 'flex', 'شريط «المورّد المختار» ظاهر');
  eq(H.writes.audits.length, 1, 'الحفظ يُسجَّل في سجل التدقيق');
}

console.log('\n--- 3. الدفع يسجَّل والرصيد يعكس الباقي ---');
{
  const H = makeHarness({
    suppliers: [{ id: 'sup1', name: 'مؤسسة النور', phone: '', address: '', balance: 100 }],
    products: [],
  });
  H.QE.open();
  H.QE.selectSupplier('sup1');
  // open() already puts one empty row on the sheet (uid 1); we type into it the
  // way the page itself does, through the exported setField.
  eq(H.QE.computeTotals().lines.length, 1, 'الفتح يعطي سطراً واحدًا جاهزًا');
  H.QE.setField(1, 'name', 'مِرقابة');
  H.QE.setField(1, 'qty', '2');
  H.QE.setField(1, 'buy', '500');
  const total = H.QE.computeTotals().total;
  eq(total, 1000, 'الإجمالي المحسوب 2 × 500 = 1000');
  const paidEl = H.doc.getElementById('qePaidAmount');
  paidEl.value = '400';
  H.QE.updatePayPreview();
  eq(H.doc.getElementById('qePayPreview').textContent, t('quickEntry.remaining') + ': DA600.00',
    'معاينة المتبقي = 600.00 أثناء الكتابة');
  H.QE.confirm();
  eq(H.writes.invoices.length, 1, 'الفاتورة تُحفظ');
  eq(H.writes.invoices[0].totalAmount, 1000, 'إجمالي الفاتورة 1000');
  eq(H.writes.invoices[0].supplierId, 'sup1', 'الفاتورة منسوبة للمورد');
  eq(H.writes.invoices[0].type, 'supplier', 'نوعها فاتورة مورد');
  eq(H.writes.payments.length, 1, 'سند الدفعة كُتب');
  eq(H.writes.payments[0].amount, 400, 'مبلغ الدفعة 400');
  eq(H.writes.payments[0].supplierId, 'sup1', 'الدفعة على نفس المورد');
  eq(H.writes.payments[0].invoiceId, 'inv1', 'الدفعة مرتبطة بالفاتورة');
  eq(H.suppliers[0].balance, 700, 'الرصيد: 100 + الباقي 600');
}

console.log('\n--- 4. الحدود: صفر / سالب / أكثر من الإجمالي ---');
function clampCase(label, typed, expectPay, expectBalance) {
  const H = makeHarness({
    suppliers: [{ id: 'sup1', name: 'مؤسسة النور', phone: '', address: '', balance: 0 }],
    products: [],
  });
  H.QE.open();
  H.QE.selectSupplier('sup1');
  H.QE.setField(1, 'name', 'سلك');
  H.QE.setField(1, 'qty', '2');
  H.QE.setField(1, 'buy', '500');
  H.doc.getElementById('qePaidAmount').value = typed;
  H.QE.confirm();
  eq(H.writes.invoices.length, 1, label + ': الفاتورة تُحفظ');
  eq(H.writes.payments.length, expectPay === 0 ? 0 : 1, label + ': ' + (expectPay === 0 ? 'بلا دفعة لا سند' : 'سند بمبلغ ' + expectPay));
  if (expectPay !== 0) eq(H.writes.payments[0].amount, expectPay, label + ': المبلغ المسجّل');
  eq(H.suppliers[0].balance, expectBalance, label + ': الرصيد = الإجمالي ناقص المدفوع');
}
clampCase('صفراً', '0', 0, 1000);
clampCase('سالباً', '-250', 0, 1000);
clampCase('أكثر من الإجمالي', '5000', 1000, 0);

console.log('\n--- 5. دفعة بلا مورّد: مرفوضة قبل أي كتابة ---');
{
  const H = makeHarness({ suppliers: [{ id: 'sup1', name: 'مؤسسة النور', phone: '', address: '', balance: 0 }], products: [] });
  H.QE.open();
  H.QE.setField(1, 'name', 'مطرقة');
  H.QE.setField(1, 'qty', '1');
  H.QE.setField(1, 'buy', '700');
  H.doc.getElementById('qePaidAmount').value = '200';
  H.doc.getElementById('qePaidAmount').focus();
  H.QE.confirm();
  eq(H.writes.invoices.length, 0, 'لا فاتورة كُتبت');
  eq(H.writes.payments.length, 0, 'لا سند كُتب');
  eq(H.writes.productUpdates.length, 0, 'ولا لامخزون لم يُمسّ');
  eq(H.alerts.length, 1, 'تنبيه واحد');
  eq(H.alerts[0], t('quickEntry.needSupplierForPay'), 'نصّه يقول اختر مورداً أو أنشئه');
  eq(H.doc._activeElement && H.doc._activeElement.id, 'qeSupplierSearch', 'المؤشر يعود لحقل المورّد');
  H.QE.selectSupplier('sup1');
  H.QE.confirm();
  eq(H.writes.payments.length, 1, 'وبعد اختيار المورد تُسجَّل الدفعة');
  eq(H.suppliers[0].balance, 500, 'الرصيد = 700 - 200');
}

console.log('\n--- 6. وضع تعديل الفاتورة: المورد والدفع مخفيّان ---');
{
  const H = makeHarness({
    suppliers: [{ id: 'sup1', name: 'مؤسسة النور', balance: 0 }],
    products: [{ id: 'p1', name: 'زيت', barcode: '111', buyPrice: 500, sellPrice: 600, quantity: 3, unit: 'piece' }],
  });
  H.sandbox._qePrefill = {
    invoiceId: 'inv9', invoiceNumber: 'FA-9', supplierName: 'مؤسسة النور',
    rows: [{ src: 'item', itemIdx: 0, productId: 'p1', name: 'زيت', qty: 2, price: 500 }],
  };
  H.QE.open();
  eq(H.doc.querySelector('.qe-supplier-bar').style.display, 'none', 'شريط المورّد مخفي');
  eq(H.doc.querySelector('.qe-pay-block').style.display, 'none', 'كتلة الدفع مخفية');
  H.doc.getElementById('qePaidAmount').value = '400';
  H.QE.confirm();
  eq(H.writes.invoices.length, 0, 'لا فاتورة في هذا الوضع');
  eq(H.writes.payments.length, 0, 'ولا سند دفع');
}

console.log('\n--- 7. التحكم السلبي: بلا حقل الدفع لا تُسجَّل دفعة ---');
{
  // نفس الكود، ونفس المورد والأسطر، لكن من نسخة صفحة حُذف منها حقل الدفع.
  const stripped = qeHtmlSrc.replace(/<input[^>]*id="qePaidAmount"[^>]*>/, '<!-- no paid field -->');
  check(stripped !== qeHtmlSrc && stripped.indexOf('id="qePaidAmount"') === -1,
    'نسخة التحكم السلبي بلا حقل دفع');
  const H = makeHarness({
    suppliers: [{ id: 'sup1', name: 'مؤسسة النور', phone: '', address: '', balance: 0 }],
    products: [],
    doc: (() => { const d = createDoc(); parseInto(stripped, d.body); return d; })(),
  });
  H.QE.open();
  H.QE.selectSupplier('sup1');
  H.QE.setField(1, 'name', 'سلك');
  H.QE.setField(1, 'qty', '2');
  H.QE.setField(1, 'buy', '500');
  H.QE.confirm();
  eq(H.writes.invoices.length, 1, 'الفاتورة تُحفظ كما قبل');
  eq(H.writes.payments.length, 0, 'بلا حقل: لا سند أبداً — إثبات أن الحقل هو مصدر الدفعة');
  eq(H.suppliers[0].balance, 1000, 'والرصيد يحمَل الإجمالي كاملاً');
}
{
  // وحذف نافذة المورد: الزر لا يكسر الصفحة ولا يخزّن أحداً.
  const noModal = qeHtmlSrc.replace(/<div class="modal-overlay" id="qeAddSupplierModal"[\s\S]*?\r?\n<\/div>\r?\n/, '\n');
  check(noModal.indexOf('qeAddSupplierModal') === -1, 'نسخة التحكم السلبي بلا نافذة مورد');
  const H = makeHarness({ suppliers: [], doc: (() => { const d = createDoc(); parseInto(noModal, d.body); return d; })() });
  H.QE.open();
  H.QE.openAddSupplier();
  let threw = null;
  try { H.QE.confirmAddSupplier(); } catch (e) { threw = e; }
  check(H.suppliers.length === 0,
    'وبلا حقول لا يُخزَّن مورد' + (threw ? ' (الدالة تتوقف بخطأ)' : ''));
}

console.log('\n============================================================');
console.log((fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' نجحت، ' + fail + ' فشلت');
console.log('============================================================');
process.exit(fail === 0 ? 0 : 1);
