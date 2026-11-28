// ============================================================
// ZMT PIECE — units & decimals + dense POS layout (2.12 / 2.13)
// Run: node renderer/tests/units-verify.js
//
// Static + behavioural checks for:
//   • renderer/js/lib/units.js (the single source of truth)
//   • 6-decimal quantities, per-unit pricing, show-unit switch
//   • unit snapshot on invoice lines and the "piece" fallback
//   • unit field placed after quantity in every product form
//   • 2.13 sales layout: grid/list, all-columns, in-cart strip,
//     cart width 300–700 (default 420) shared with display settings
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const base = path.join(__dirname, '..', '..') + path.sep;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (cond, m) => cond ? ok(m) : bad(m);
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const has = (s, n) => s.indexOf(n) !== -1;

console.log('============================================');
console.log('اختبار الوحدات والكسور العشرية وتخطيط البيع');
console.log('============================================');

const units = read('renderer/js/lib/units.js');
const indexHtml = read('renderer/index.html');
const salesJs = read('renderer/js/pages/sales.js');
const salesHtml = read('renderer/pages/sales.html');
const css = read('renderer/css/main.css');
const qeHtml = read('renderer/pages/quick-entry.html');
const qeJs = read('renderer/js/pages/quick-entry.js');
const displayJs = read('renderer/js/display-settings.js');
const invoicesJs = read('renderer/js/pages/invoices.js');
const invoicesHtml = read('renderer/pages/invoices.html');
const saleCore = read('renderer/js/sale-core.js');
const phoneApp = read('renderer/phone-sales/app.js');
const phoneSvc = read('renderer/js/phone-sale-service.js');
const inventoryHtml = read('renderer/pages/inventory.html');
const inventoryJs = read('renderer/js/pages/inventory.js');
const appJs = read('renderer/js/app.js');

// ---------- 1. loading & API ----------
console.log('\n--- 1. التحميل والواجهة ---');
check(fs.existsSync(path.join(base, 'renderer/js/lib/units.js')), 'ملف units.js موجود');
{
  const iUnit = indexHtml.indexOf('js/lib/units.js');
  const iApp = indexHtml.indexOf('js/app.js');
  check(iUnit > 0 && iApp > iUnit, 'units.js يُحمَّل قبل app.js');
}
check(has(units, "var DECIMALS = 6;"), 'دقة الكميات = 6 منازل');
check(has(units, "var DEFAULT_CODE = 'piece';"), 'الوحدة الافتراضية = قطعة');
check(has(units, "var SHOW_KEY = 'zmt_inv_show_unit';"), 'مفتاح إظهار الوحدة محفوظ');
for (const fn of ['normalize', 'isCustom', 'name', 'short', 'label', 'parse', 'roundQty', 'roundMoney', 'fmtQty', 'step', 'lineTotal', 'showInInvoice', 'setShowInInvoice', 'toggleShowInInvoice', 'qtyUnit', 'applyToProduct', 'snapshot', 'optionsHTML', 'fillSelect', 'syncCustom', 'readSelect']) {
  check(has(units, 'function ' + fn), 'واجهة Unit.' + fn);
}
for (const code of ["'piece'", "'kg'", "'g'", "'m'", "'cm'", "'L'", "'custom'"]) {
  check(has(units, code), 'الوحدة ' + code + ' مدعومة');
}

// ---------- 2. runtime behaviour (units.js in a sandbox) ----------
console.log('\n--- 2. سلوك الوحدات والكسور ---');
const store = {};
const sandbox = {
  window: { __lang: 'ar', t: () => '' },
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  },
  document: { getElementById: () => null },
  setTimeout, console, Math, Number, String, Object, Array, isFinite, parseFloat
};
vm.runInNewContext(units, sandbox, { filename: 'units.js' });
const U = sandbox.window.Unit;
check(!!U, 'Unit مُصدَّر على window');
if (U) {
  check(U.parse('0,25') === 0.25, 'الفاصلة العشرية تُقبل (0,25)');
  check(U.parse('0.00006') === 0.00006, '6 منازل تُقرأ بدقة');
  check(U.roundQty(0.1 + 0.2) === 0.3, '0.1 + 0.2 = 0.3 (تقريب 6 منازل)');
  check(U.fmtQty(1) === '1', 'fmtQty(1) = 1');
  check(U.fmtQty(0.25) === '0.25', 'fmtQty(0.25) = 0.25');
  check(U.fmtQty(0.00006) === '0.00006', 'fmtQty(0.00006) = 0.00006');
  check(U.step(1) === 1, 'خطوة 1 = 1');
  check(U.step(0.25) === 0.01, 'خطوة 0.25 = 0.01');
  check(U.step(0.001) === 0.001, 'خطوة 0.001 = 0.001');
  check(U.step(0.00006) === 0.00001, 'خطوة 0.00006 = 0.00001 (آخر منزلة مكتوبة)');
  check(U.lineTotal(1000, 0.25) === 250, 'السعر لكل وحدة: 0.25 كغ × 1000 = 250');
  check(U.normalize('') === 'piece', 'الوحدة الفارغة ⇒ قطعة');
  check(U.normalize('bogus') === 'piece', 'الوحدة المجهولة ⇒ قطعة');
  check(U.name('piece') === 'قطعة', 'اسم الوحدة بالعربية');
  sandbox.window.__lang = 'fr';
  check(U.name('kg') === 'Kilogramme', 'اسم الوحدة بالفرنسية');
  sandbox.window.__lang = 'ar';
  check(U.label({}) === 'قطعة', 'الفاتورة القديمة بلا وحدة ⇒ قطعة');
  check(U.label({ unit: 'kg' }) === 'كغ', 'الوحدة المختصرة في المستندات');
  check(U.label({ unit: 'custom', unitLabel: 'علبة' }) === 'علبة', 'الوحدة الحرة تُعرض كما كُتبت');
  check(U.snapshot({ unit: 'kg' }).unit === 'kg', 'لقطة الوحدة على سطر الفاتورة');
  check(U.snapshot({}).unit === 'piece', 'لقطة الوحدة الافتراضية = قطعة');
  check(U.showInInvoice() === true, 'إظهار الوحدة مفعّل افتراضيًا');
  U.setShowInInvoice(false);
  check(U.showInInvoice() === false, 'يمكن إخفاء الوحدة ويُحفظ');
  check(U.qtyUnit(2.5, { unit: 'kg' }) === '2.5', 'عند الإخفاء تُعرض الكمية فقط');
  U.setShowInInvoice(true);
  check(U.qtyUnit(2.5, { unit: 'kg' }) === '2.5 كغ', 'عند الإظهار تظهر الكمية والوحدة');
  U.applyToProduct({ name: 'x' });
  check(U.applyToProduct({ name: 'x' }).unit === 'piece', 'applyToProduct يضبط الافتراضي');
}

// ---------- 3. invoice snapshot & printing ----------
console.log('\n--- 3. الفواتير والطباعة ---');
check(has(saleCore, 'unitSnapshot'), 'sale-core يحفظ لقطة الوحدة');
check(has(saleCore, 'QTY_DECIMALS'), 'sale-core يستعمل دقة الكميات');
check(has(invoicesHtml, 'id="btnInvShowUnit"'), 'زر «إظهار الوحدة في الفاتورة» موجود');
check(has(invoicesJs, 'toggleInvUnitVisibility'), 'منطق الزر مربوط');
check(has(invoicesJs, 'Unit.qtyUnit'), 'قوائم الفواتير تعرض الكمية مع الوحدة');
check(has(read('renderer/js/thermal-print.js'), 'qtyUnit'), 'الطباعة الحرارية تعرض الوحدة');
check(has(read('renderer/js/rest-service.js'), 'qtyUnit'), 'فاتورة 80mm تعرض الوحدة');

// ---------- 4. decimal inputs & unit order ----------
console.log('\n--- 4. حقول الكميات وترتيب الوحدة ---');
check(has(salesJs, 'sc-qty-input num-input" inputmode="decimal"'), 'كمية سلة البيع عشرية (inputmode=decimal)');
check(/qe-col-num"(?:\s+data-col="qty")?\s+data-i18n="quickEntry\.qty"/.test(qeHtml), 'عمود الكمية في الإدخال السريع');
{
  const iQty = qeHtml.indexOf('data-i18n="quickEntry.qty"');
  const iUnit = qeHtml.indexOf('data-i18n="units.label"');
  check(iQty > 0 && iUnit > iQty, 'الوحدة تأتي بعد الكمية في الإدخال السريع');
}
check(has(qeJs, 'Unit.optionsHTML(row.unit)'), 'الإدخال السريع يملأ قائمة الوحدات');
check(has(qeJs, 'Unit.isCustom'), 'الإدخال السريع يدعم «أخرى»');
check(has(phoneApp, 'function qStep'), 'بيع الهاتف يدعم خطوة الكسور');
check(has(phoneSvc, 'unitLabel'), 'بيع الهاتف يحفظ الوحدة');

// ---------- 5. dense sales layout ----------
console.log('\n--- 5. تخطيط البيع الكثيف ---');
check(has(salesHtml, 'id="salesProductGrid"'), 'حاوية بطاقات المنتجات موجودة (إصلاح 2.13.0)');
check(has(salesHtml, 'id="salesViewGridBtn"') && has(salesHtml, 'id="salesViewListBtn"'), 'زرّا شبكة/قائمة');
check(has(salesHtml, 'id="salesListAllCols"'), 'خيار «كل الأعمدة»');
check(has(salesHtml, 'id="salesInCartStrip"'), 'شريط «في السلة»');
check(has(salesHtml, 'id="salesCartResizer"'), 'مقبض تغيير عرض السلة');
check(has(salesJs, "localStorage.setItem('zmt_sales_view_mode'"), 'وضع العرض يُحفظ');
check(has(salesJs, "localStorage.setItem('zmt_sales_list_allcols'"), '«كل الأعمدة» يُحفظ');
check(has(salesJs, "localStorage.setItem('zmt_sales_incart_strip'"), 'شريط السلة يُحفظ');
check(has(salesJs, 'function salesListRowHTML'), 'صف القائمة يُبنى');
check(has(salesJs, 'function toggleSalesListDetails'), 'زر «تفاصيل» لكل صف');
check(has(salesJs, '_salesListAllCols'), 'صف القائمة يحترم «كل الأعمدة»');
check(has(salesJs, 'Math.max(300') || has(salesJs, 'n < 300') || has(salesJs, '< 300'), 'عرض السلة لا يقل عن 300');
check(has(salesJs, 'n > 700') || has(salesJs, '> 700'), 'عرض السلة لا يزيد عن 700');
check(has(salesJs, "window.DisplaySettings.setLive('salesCart'") || has(salesJs, "setLive('salesCart'"), 'السحب يحدّث إعدادات العرض');
check(has(css, '--sales-cart-width: 420px'), 'العرض الافتراضي 420px');
check(has(css, 'grid-template-columns: 1fr !important;'), 'أقل من 1100px ⇒ عمود واحد');
check(has(salesHtml, 'id="salesCommandBar"') && has(css, '.sales-pay-bar {'), 'منطقة الدفع داخل شريط الأوامر أعلى الصفحة');
check(has(css, '.sales-cart-items-wrap { flex: 1 1 auto; min-height: 0; overflow-y: auto; }'), 'عناصر السلة وحدها تُمرَّر');
{
  const cartListBlock = css.slice(css.indexOf('.sales-cart-items {'), css.indexOf('.sales-cart-badge {'));
  const cartCardBlock = css.slice(css.indexOf('.sales-cart-section {'), css.indexOf('.sales-cart-section .sales-cart-items-wrap'));
  check(!/max-height|overflow-y/.test(cartListBlock), 'قائمة السلة بلا سقف داخلي ولا تمرير مزدوج');
  check(/flex:\s*0 1 auto/.test(cartCardBlock) && /height:\s*auto/.test(cartCardBlock) && /max-height:\s*100%/.test(cartCardBlock),
    'بطاقة السلة تلتف حول المنتجات وتتوقف عند ارتفاع الصف');
  check(!has(css, 'scrollbar-gutter: stable;'), 'لا عمود فارغ محجوز تحت آخر منتج');
}

// ---------- 5b. richer sales list rows ----------
console.log('\n--- 5b. بطاقات القائمة الأغنى ---');
{
  const listFn = salesJs.slice(salesJs.indexOf('function salesListRowHTML'), salesJs.indexOf('function toggleSalesListDetails'));
  check(has(listFn, '<span class="sales-list-ref">'), 'المرجع بجانب اسم المنتج في القائمة');
  check(has(listFn, 'class="sales-list-row-prices"'), 'شريط أسعار مستقل داخل الصف');
  check(has(listFn, 'class="sales-list-price unit"') && has(listFn, 'class="sales-list-price whole"'), 'سعر القطعة والجملة ب(label) واضحة');
  check(has(listFn, "salesExtraPillsHTML(rep, 'sales-list-extra')"), 'حقول السعر الإضافية بلونها الخاص');
  check(listFn.indexOf('quickEntry.sellPrice') === -1 && listFn.indexOf('quickEntry.wholesalePrice') === -1, 'لا تكرار للأسعار في التفاصيل القابلة للفتح');
}
check(has(css, '.sales-list-ref .ref-link') && has(css, 'color: var(--silver-900) !important'), 'المرجع داكن وعريض مع بقاءه قابلاً للنقر');
check(has(css, '.sales-list-price.unit') && has(css, '.sales-list-price.whole') && has(css, '.sales-list-extra.price-pill'), 'ألوان الأسعار الثلاثة في القائمة');

// ---------- 5c. inventory grid/list toggle ----------
console.log('\n--- 5c. تبديل شبكة/قائمة في المخزون ---');
check(has(inventoryHtml, 'id="invViewGridBtn"') && has(inventoryHtml, 'id="invViewListBtn"'), 'زرّا شبكة/قائمة في المخزون');
check(has(inventoryHtml, 'data-i18n-title="sales.viewNetwork"') && has(inventoryHtml, 'data-i18n-title="sales.viewList"'), 'الزرّان يستعملان ترجمات الأيقونات الحالية');
check(has(inventoryJs, 'function setInventoryView') && has(inventoryJs, "localStorage.setItem('zmt_inv_view_mode'"), 'وضع عرض المخزون يُحفظ');
check(has(inventoryJs, "grid.classList.toggle('inv-list-view'"), 'التبديل يضيف صنف القائمة على الحاوية نفسها');
check(has(inventoryJs, "id: 'invViewGridBtn'") && has(inventoryJs, "id: 'invViewListBtn'"), 'الزرّان في تخصيص أزرار المخزون');
check(has(css, '.prod-grid.inv-list-view') && has(css, '.prod-grid:not(.inv-list-view) > .prod-card'), 'قواعد القائمة والشبكة منفصلتان');
check(has(inventoryHtml, 'id="invGrid"') && has(inventoryJs, 'new InfiniteScrollPager'), 'حاوية التمرير والصفحات بقيت كما هي');
check(has(inventoryJs, 'ondblclick=') && has(inventoryJs, 'openPrintBarcodeModal') && has(inventoryJs, '_registerProdCtxHandlers'), 'أزرار البطاقة والطباعة والقائمة السياقية بقيت');

// ---------- 6. display settings slider ----------
console.log('\n--- 6. شريط عرض السلة في إعدادات العرض ---');
check(has(displayJs, "key: 'salesCart', css: '--sales-cart-width', min: 300, max: 700, def: 420"), 'عنصر salesCart (300–700، افتراضي 420)');
check(has(displayJs, 'setLive: dsSetLive'), 'واجهة setLive مشتركة مع السحب');
check(has(displayJs, 'applySalesCartWidth'), 'إعدادات العرض تُطبّق على السلة المفتوحة');
check(has(read('renderer/js/app.js'), "salesCart: 'عرض سلة البيع'"), 'ترجمة عربية لعرض السلة');
check(has(read('renderer/js/app.js'), "salesCart: 'Sales cart width'"), 'ترجمة إنجليزية لعرض السلة');
check(has(read('renderer/js/app.js'), "salesCart: 'Largeur du panier de vente'"), 'ترجمة فرنسية لعرض السلة');
check(has(appJs, "salesCart: '销售购物车宽度'"), 'ترجمة صينية لعرض السلة');
check(has(displayJs, "key: 'salesHeight', css: '--sales-card-h', min: 0, max: 520, def: 0"), 'منزلق ارتفاع بطاقات البيع (0 = تلقائي)');
check(has(displayJs, "key: 'invHeight', css: '--inv-card-h', min: 0, max: 520, def: 0"), 'منزلق ارتفاع بطاقات المخزون (0 = تلقائي)');
check(has(css, '--sales-card-h: auto;') && has(css, '--inv-card-h: auto;'), 'الافتراضية تلقائي ⇒ لا تغيير في التثبيت الأول');
check(has(appJs, "salesHeight: 'ارتفاع بطاقات البيع'") && has(appJs, "salesHeight: 'Sales card height'") && has(appJs, "salesHeight: 'Hauteur des cartes de vente'") && has(appJs, "salesHeight: '销售卡片高度'"), 'تسميات ارتفاع البيع باللغات الأربع');
check(has(appJs, "invHeight: 'ارتفاع بطاقات المخزون'") && has(appJs, "invHeight: 'Inventory card height'") && has(appJs, "invHeight: 'Hauteur des cartes de stock'") && has(appJs, "invHeight: '库存卡片高度'"), 'تسميات ارتفاع المخزون باللغات الأربع');

// ---------- summary ----------
console.log('\n============================================');
console.log((fail === 0 ? 'كل الفحوص نجحت' : 'فشل ' + fail + ' فحص') + ' — pass=' + pass + ' fail=' + fail);
console.log('============================================');
process.exit(fail === 0 ? 0 : 1);
