// ============================================================
// ZMT PIECE — verifier for the newest price-floor additions:
//   1) Référence / Marque in the post-sale invoice preview
//   2) minimum price wired into F1 / Smart Add auto-fill bands
//   3) fixed minimum-price badge on sales + inventory cards/list rows
// Run: node renderer/tests/price-floor-verify.js
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const section = (t) => console.log('\n--- ' + t + ' ---');
const count = (s, re) => (s.match(re) || []).length;

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}
function run(src, extra) {
  const ctx = Object.assign({ console, Math, JSON, String, Number, Object, Array, parseFloat, parseInt, isFinite }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  if (src) vm.runInContext(src, ctx);
  return ctx;
}

console.log('============================================');
console.log('اختبار السعر الأدنى — الفحص المركّز');
console.log('============================================');

const salesJs = read('renderer/js/pages/sales.js');
const inventoryJs = read('renderer/js/pages/inventory.js');
const qeJs = read('renderer/js/pages/quick-entry.js');
const smartJs = read('renderer/js/pages/invoices-smart.js');
const flJs = read('renderer/js/form-layout.js');
const displayJs = read('renderer/js/display-settings.js');
const appJs = read('renderer/js/app.js');
const css = read('renderer/css/main.css');

/* ------------------------------------------------ 1) invoice preview ----- */
section('1) فاتورة ما بعد البيع');
const previewSrc = extractFn(salesJs, '_previewInvColumns');
check(!!previewSrc, 'sales.js: قارئ إعدادات أعمدة الفاتورة موجود');
check(previewSrc.indexOf('DisplaySettings.invoiceColumns()') > 0, 'يقرأ المفتاح المشترك من DisplaySettings');
check(previewSrc.indexOf("localStorage.getItem('zmt_display_settings')") > 0, 'لديه fallback إلى التخزين المحلي');
check(previewSrc.indexOf('invShowReference') > 0 && previewSrc.indexOf('invShowMark') > 0, 'يقبل شكلي المفاتيح القديم والجديد');

const fromApi = run(previewSrc, {
  DisplaySettings: { invoiceColumns: () => ({ reference: true, mark: false }) },
  localStorage: { getItem: () => null },
});
vm.runInContext('this.__r = _previewInvColumns();', fromApi);
eq(fromApi.__r.reference, true, 'API: Référence مفعّل');
eq(fromApi.__r.mark, false, 'API: Marque متوقف');

const fromRaw = run(previewSrc, {
  localStorage: { getItem: () => '{"invShowReference":true,"invShowMark":true}' },
});
vm.runInContext('this.__r = _previewInvColumns();', fromRaw);
eq(fromRaw.__r.reference, true, 'fallback: Référence من zmt_display_settings');
eq(fromRaw.__r.mark, true, 'fallback: Marque من zmt_display_settings');

const fromEmpty = run(previewSrc, { localStorage: { getItem: () => null } });
vm.runInContext('this.__r = _previewInvColumns();', fromEmpty);
eq(fromEmpty.__r.reference, false, 'الافتراضي: Référence مخفي');
eq(fromEmpty.__r.mark, false, 'الافتراضي: Marque مخفي');

const previewFn = extractFn(salesJs, 'showInvoicePreview');
check(!!previewFn, 'دالة معاينة الفاتورة موجودة');
check(count(previewFn, /invCols\.reference \?/g) === 2, 'عمود Référence في الرأس والصفوف معاً');
check(count(previewFn, /invCols\.mark \?/g) === 2, 'عمود Marque في الرأس والصفوف معاً');
check(previewFn.indexOf("_previewItemExtra(item, 'reference')") > 0, 'قيمة Référence تمر عبر المساعد');
check(previewFn.indexOf("_previewItemExtra(item, 'mark')") > 0, 'قيمة Marque تمر عبر المساعد');
check(!!extractFn(salesJs, '_previewItemExtra'), 'مساعد القديم→الجديد موجود (fallback للفواتير القديمة)');
check(displayJs.indexOf('invShowReference') > 0 && displayJs.indexOf('invShowMark') > 0, 'مفتاحا العرض لم يتغيرا');
check(read('renderer/js/sale-core.js').indexOf('reference: (prod && prod.reference)') > 0, 'لقطة المرجع ما زالت تُحفظ عند البيع');
check(read('renderer/js/sale-core.js').indexOf('mark: (prod && prod.mark)') > 0, 'لقطة المارك ما زالت تُحفظ عند البيع');

// Actual render of the preview with the two switches on, then off again.
const extraSrc = extractFn(salesJs, '_previewItemExtra');
let built = null;
const renderCtx = run(previewSrc + '\n' + extraSrc + '\n' + previewFn, {
  document: {
    getElementById: () => null,
    createElement: () => (built = { id: '', style: { cssText: '' }, innerHTML: '', remove() {} }),
    body: { appendChild() {} },
  },
  getStoreInfo: () => ({ name: 'Shop', address: '', phone: '', nif: '', rcc: '', article: '' }),
  getTvaRate: () => 0,
  calcTimbreFiscal: () => 0,
  DB: {
    getInvoicePaidAmount: () => 0,
    getInvoicePaymentMethods: () => ({ cash: 0, ccp: 0 }),
    getCustomer: () => null,
    getSuppliers: () => [],
    getSupSaleNetDue: () => 0,
    getProduct: () => ({ reference: 'R-9', mark: 'M-9' }),
  },
  DisplaySettings: { invoiceColumns: () => ({ reference: true, mark: true }) },
  localStorage: { getItem: () => null },
  escHtml: (s) => String(s == null ? '' : s),
  fmtMoney: (v) => String(v),
  Unit: { qtyUnit: (q) => String(q) },
  t: (k) => k,
  buildDocHeaderRow: (l, r) => '<table>' + l + r + '</table>',
  Date,
});
const fakeInv = {
  id: 'i1', invoiceNumber: 'F-1', totalAmount: 100, createdAt: Date.now(),
  customerId: null, type: 'sale',
  items: [{ name: 'Produit', qty: 1, price: 100, productId: 'p1' }],
};
renderCtx.showInvoicePreview(fakeInv);
check(built && built.innerHTML.indexOf('>Référence</th>') > 0, 'المعاينة الفعلية: عنوان Référence ظهر');
check(built && built.innerHTML.indexOf('>Marque</th>') > 0, 'المعاينة الفعلية: عنوان Marque ظهر');
check(built && built.innerHTML.indexOf('R-9') > 0, 'المعاينة الفعلية: قيمة المرجع من المنتج');
check(built && built.innerHTML.indexOf('M-9') > 0, 'المعاينة الفعلية: قيمة المارك من المنتج');
renderCtx.DisplaySettings.invoiceColumns = () => ({ reference: false, mark: false });
renderCtx.showInvoicePreview(fakeInv);
check(built && built.innerHTML.indexOf('>Référence</th>') < 0 && built.innerHTML.indexOf('>Marque</th>') < 0, 'إطفاء المفتاحين يُخفي العمودين فوراً');

/* ------------------------------------------------ 2) auto-fill ---------- */
section('2) السعر الأدنى في الملء التلقائي');
check(flJs.indexOf('minPrice: numPct(src.minPrice)') > 0, 'normalizeBands يحفظ نسبة الحد الأدنى');
check(flJs.indexOf('{ sell: 0, whole: 0, minPrice: 0 }') > 0, 'defaultBands وuiAddBand يشملان الحد الأدنى');
check(flJs.indexOf("uiSetBandPct(' + i + ',\\'minPrice\\'") > 0, 'حقل نسبة الحد الأدنى في لوحة الملء');
check(flJs.indexOf("T('quickEntry.minPrice'") > 0, 'عنوان عمود الحد الأدنى مترجم');

const store = {};
const flCtx = run(flJs, {
  document: null,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  t: (k) => k,
  ExtraPrices: { fields: () => [] },
  addEventListener: () => {},
  module: { exports: {} },
});
const FL = flCtx.FormLayout;
check(!!FL, 'form-layout.js يعمل في البيئة المعزولة');
eq(FL.defaults().autoFill.bands[0].pcts.minPrice, 0, 'القيمة المصنعية للنسبة صفر');

const cfg = FL.defaults();
cfg.autoFill.enabled = true;
cfg.autoFill.bands[0].pcts.minPrice = 30;
FL.save(cfg);
const state = FL.priceState({});
let filled = '';
const changed = FL.fillRow('100', state, [{ key: 'minPrice', value: 0, set: (v) => { filled = v; } }], 'toggle');
eq(changed, 1, 'fillRow يعدّل حقل الحد الأدنى');
eq(filled, '130', 'مثال المستخدم: شراء 100 + 30% = 130');

let decimal = '';
const s2 = FL.priceState({});
FL.fillRow('109.2', s2, [{ key: 'minPrice', value: 0, set: (v) => { decimal = v; } }], 'toggle');
eq(decimal, '141.96', 'حساب عشري دقيق بدون أخطاء الفاصلة');

let manual = '150';
const s3 = FL.priceState({});
FL.lockPrice(s3, 'minPrice');
eq(FL.fillRow('100', s3, [{ key: 'minPrice', value: manual, set: (v) => { manual = v; } }], 'buy'), 0, 'القيمة اليدوية لا تُ overwritten');
eq(manual, '150', 'الإدخال اليدوي محمي');

const legacy = FL.defaults();
legacy.autoFill.bands = [{ min: 0, pcts: { sell: 10, whole: 5 } }];
FL.save(legacy);
eq(FL.bands()[0].pcts.minPrice, 0, 'نطاق قديم بدون المفتاح يكمل بصفر');

check(qeJs.indexOf("{ key: 'minPrice', value: row.minPrice") > 0, 'F1: الحد الأدنى ضمن أهداف الملء');
check(qeJs.indexOf("field === 'sell' || field === 'whole' || field === 'minPrice'") > 0, 'F1: الإدخال اليدوي يقفل الحد الأدنى');
check(qeJs.indexOf("['sell', 'whole', 'minPrice']") > 0, 'F1: علامة-autofill على الخلية');
check(smartJs.indexOf("{ key: 'minPrice', value: r.minPrice") > 0, 'الإضافة الذكية: الحد الأدنى ضمن أهداف الملء');
check(smartJs.indexOf("field === 'sell' || field === 'whole' || field === 'minPrice'") > 0, 'الإضافة الذكية: الإدخال اليدوي يقفل الحد الأدنى');
check(smartJs.indexOf("var keys = ['sell', 'whole', 'minPrice']") > 0, 'الإضافة الذكية: علامة-autofill على الخلية');
check((appJs.match(/'quickEntry\.minPrice':/g) || []).length >= 4, 'الترجمة موجودة باللغات الأربع');

/* ------------------------------------------------ 3) cards -------------- */
section('3) شارة السعر الأدنى على البطاقات');
const groupSrc = extractFn(salesJs, 'salesGroupMinPrice');
const groupCtx = run(groupSrc, {});
vm.runInContext('this.__r = salesGroupMinPrice({ records: [{ minPrice: 100 }, { minPrice: 130 }, {}] });', groupCtx);
eq(groupCtx.__r, 130, 'يأخذ أعلى حد أدنى بين دفعات المجموعة');
vm.runInContext('this.__r2 = salesGroupMinPrice(null);', groupCtx);
eq(groupCtx.__r2, 0, 'مجموعة فارغة = بلا حد');

const badgeSrc = extractFn(salesJs, 'salesMinPriceBadge');
check(!!badgeSrc, 'دالة الشارة المشتركة موجودة');
const badgeCtx = run(badgeSrc, {
  salesGroupMinPrice: () => 130,
  fmtMoney: (v) => String(v),
  escHtml: (s) => s,
  t: () => 'السعر الأدنى',
});
vm.runInContext('this.__grid = salesMinPriceBadge({}, false);', badgeCtx);
vm.runInContext('this.__list = salesMinPriceBadge({}, true);', badgeCtx);
check(badgeCtx.__grid.indexOf('price-pill price-floor fv-minPrice') > 0 && badgeCtx.__grid.indexOf('DA130') > 0, 'شبكة البيع: قيمة ثابتة بلون واحد');
check(badgeCtx.__list.indexOf('sales-list-price floor fv-minPrice') > 0 && badgeCtx.__list.indexOf('DA130') > 0, 'قائمة البيع: نفس القيمة بشكل مدمج');
check(badgeCtx.__grid.indexOf('السعر الأدنى') > 0 && badgeCtx.__list.indexOf('السعر الأدنى') > 0, 'التسمية مأخوذة من الترجمة الحالية');

const zeroCtx = run(badgeSrc, {
  salesGroupMinPrice: () => 0, fmtMoney: (v) => String(v), escHtml: (s) => s, t: () => 'السعر الأدنى',
});
vm.runInContext('this.__z = salesMinPriceBadge({}, false);', zeroCtx);
check(zeroCtx.__z.indexOf('>—</b>') > 0 && zeroCtx.__z.indexOf('DA0') < 0, 'الصفر يُعرض «—» لا «DA0»');

const cardFn = extractFn(salesJs, 'salesCardHTML');
check(cardFn.indexOf('salesMinPriceBadge(g, false)') > 0, 'بطاقة شبكة البيع تستدعي الشارة');
check(cardFn.indexOf('minFloorVisible') > 0, 'تخطيط الصف يراعي وجود الشارة');
const rowFn = extractFn(salesJs, 'salesListRowHTML');
check(rowFn.indexOf('salesMinPriceBadge(g, true)') > 0, 'صف قائمة البيع يستدعي الشارة');
const invCardFn = extractFn(inventoryJs, '_renderInvProductCard');
check(invCardFn.indexOf('class="price-pill price-floor fv-minPrice"') > 0, 'بطاقة المخزون تحمل الشارة');
check(invCardFn.indexOf('minFloorText') > 0, 'قيمة المخزون محسوبة من minPrice');
check(salesJs.indexOf('return salesGroupMinPrice(getSalesGroupByKey(line.key));') > 0, 'سلة البيع تستخدم نفس دالة الحد الأدنى');

check(css.indexOf('.price-floor {') > 0 && css.indexOf('.sales-list-price.floor {') > 0, 'لون بنفسجي ثابت للشبكة والقائمة');
check(css.indexOf('html[data-theme="dark"] .price-floor') > 0, 'تباين مناسب في الوضع الداكن');
check(css.indexOf('body.fv-hide-minPrice .fv-minPrice') > 0, 'زر إظهار السعر الأدنى يتحكم بالشارة');
check(css.indexOf('rgba(111,66,193,0.12)') > 0, 'لون الشارة مختلف عن الأزرق والأخضر والبرتقالي');

console.log('\n============================================');
console.log('PASS=' + pass + '  FAIL=' + fail);
console.log('============================================');
process.exit(fail ? 1 : 0);
