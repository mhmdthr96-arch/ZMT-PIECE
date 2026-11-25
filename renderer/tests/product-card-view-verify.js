// ============================================================
// ZMT PIECE — product card view verifier
// Run: node renderer/tests/product-card-view-verify.js
//
// Guards the three additive UI changes without touching runtime data:
//   1. richer sales LIST rows (reference + coloured price strip)
//   2. optional fixed card heights (0 = auto) for sales/inventory grids
//   3. inventory GRID/LIST toggle that reuses the untouched card markup
// ============================================================
const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', '..') + path.sep;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (cond, m) => cond ? ok(m) : bad(m);
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const has = (s, n) => s.indexOf(n) !== -1;
const count = (s, re) => (s.match(re) || []).length;
const between = (s, a, b) => {
  const i = s.indexOf(a);
  if (i < 0) return '';
  const j = s.indexOf(b, i + a.length);
  return j < 0 ? s.slice(i) : s.slice(i, j);
};

console.log('============================================');
console.log('اختبار بطاقات العرض — الفحص الثابت');
console.log('============================================');

const salesJs = read('renderer/js/pages/sales.js');
const salesHtml = read('renderer/pages/sales.html');
const inventoryJs = read('renderer/js/pages/inventory.js');
const inventoryHtml = read('renderer/pages/inventory.html');
const displayJs = read('renderer/js/display-settings.js');
const appJs = read('renderer/js/app.js');
const css = read('renderer/css/main.css');
const pkg = JSON.parse(read('package.json'));
const update = JSON.parse(read('update.json'));

// ---------- 1. sales list rows ----------
console.log('\n--- 1. صفوف قائمة البيع ---');
const listFn = between(salesJs, 'function salesListRowHTML', 'function toggleSalesListDetails');
check(!!listFn, 'دالة صف القائمة موجودة');
check(has(listFn, 'class="sales-list-ref">') && has(listFn, 'referenceCellHTML(rep.reference)'), 'المرجع بجانب الاسم وما زال قابلاً للنقر');
check(has(listFn, 'class="sales-list-row-prices"'), 'شريط أسعار مستقل داخل الصف');
check(has(listFn, 'class="sales-list-price unit"') && has(listFn, 'Unit.esc(unitLabel)'), 'سعر القطعة مع اسم الوحدة (قطعة/كجم/...)');
check(has(listFn, 'class="sales-list-price whole"') && has(listFn, "t('sales.wholesale')"), 'سعر الجملة مع كلمة «جملة»');
check(has(listFn, "salesExtraPillsHTML(rep, 'sales-list-extra')"), 'حقول السعر الإضافية تستعمل ألوانها الأصلية');
check(!has(listFn, 'quickEntry.sellPrice') && !has(listFn, 'quickEntry.wholesalePrice'), 'لا تكرار لسعرَي البيع والجملة في التفاصيل');
check(has(listFn, 'toggleSalesListDetails(this)') && has(listFn, 'addSalesGroupToCart'), 'زر التفاصيل والإضافة للسلة بقي');
check(has(css, '.sales-list-ref .ref-link') && has(css, 'color: var(--silver-900) !important') && has(css, 'font-weight: 800 !important'), 'المرجع داكن وعريض (يتجاوز اللون المضمّن)');
check(has(css, '.sales-list-price.unit') && has(css, '.sales-list-price.whole') && has(css, '.sales-list-extra.price-pill'), 'ألوان منفصلة للقطعة والجملة والحقول الإضافية');
check(has(salesHtml, 'id="salesViewGridBtn"') && has(salesHtml, 'id="salesViewListBtn"'), 'تبديل شبكة/قائمة في البيع لم يتأثر');

// ---------- 2. height controls ----------
console.log('\n--- 2. ارتفاع البطاقات ---');
check(has(css, '--sales-card-h: auto;') && has(css, '--inv-card-h: auto;'), 'القيم الافتراضية auto ⇒ شكل التثبيت الأول كما هو');
check(has(displayJs, "key: 'salesHeight', css: '--sales-card-h', min: 0, max: 520, def: 0"), 'منزلق ارتفاع بطاقات البيع');
check(has(displayJs, "key: 'invHeight', css: '--inv-card-h', min: 0, max: 520, def: 0"), 'منزلق ارتفاع بطاقات المخزون');
check(count(displayJs, /key: '/g) === 8, 'إعدادات العرض أصبحت 8 عناصر (6 + 2)');
check(count(displayJs, /zeroAuto: true/g) === 2, 'الصفر قيمة صحيحة تعني تلقائي للمنزلقين');
check(has(displayJs, "(it.zeroAuto && v === 0) ? 'auto' : v + 'px'"), 'dsApply يكتب auto لا 0px');
check(has(displayJs, 'sc.style.height = dsDraft.salesHeight') && has(displayJs, 'ic.style.height = dsDraft.invHeight'), 'المعاينة المباشرة تتبع الارتفاعين');
check(has(css, '.sales-product-grid:not(.sales-list-view) > .prod-card') && has(css, 'height: var(--sales-card-h);'), 'ارتفاع البيع للشبكة فقط');
check(has(css, '.prod-grid:not(.inv-list-view) > .prod-card') && has(css, 'height: var(--inv-card-h);'), 'ارتفاع المخزون للشبكة فقط');
check(count(css, /overflow-y: auto;/g) >= 2, 'تمرير داخلي حتى لا تضيع أي بيانات عند تصغير الارتفاع');
for (const [key, values] of [
  ['salesHeight', ["'ارتفاع بطاقات البيع'", "'Sales card height'", "'Hauteur des cartes de vente'", "'销售卡片高度'"]],
  ['invHeight', ["'ارتفاع بطاقات المخزون'", "'Inventory card height'", "'Hauteur des cartes de stock'", "'库存卡片高度'"]],
]) {
  check(values.every(v => has(appJs, key + ': ' + v)), 'ترجمات ' + key + ' باللغات الأربع');
}

// ---------- 3. inventory grid/list toggle ----------
console.log('\n--- 3. تبديل عرض المخزون ---');
check(has(inventoryHtml, 'id="invViewGridBtn"') && has(inventoryHtml, 'id="invViewListBtn"'), 'زرّا الشبكة والقائمة بجانب البحث');
check(has(inventoryHtml, 'data-i18n-title="sales.viewNetwork"') && has(inventoryHtml, 'data-i18n-title="sales.viewList"'), 'نفس مفاتيح الترجمة المستعملة في البيع');
check(has(inventoryHtml, 'aria-label="عرض شبكة"') && has(inventoryHtml, 'aria-label="عرض قائمة"'), 'تسميتان واضحتان لقارئ الشاشة ولتخصيص الأزرار');
check(has(inventoryJs, 'function setInventoryView') && has(inventoryJs, "localStorage.setItem('zmt_inv_view_mode'"), 'تبديل محفوظ على الجهاز');
check(has(inventoryJs, "localStorage.getItem('zmt_inv_view_mode')"), 'الوضع مُستعاد عند فتح الصفحة');
check(has(inventoryJs, "grid.classList.toggle('inv-list-view'"), 'الصنف يُطبَّق على حاوية البطاقات');
check(has(inventoryJs, "id: 'invViewGridBtn'") && has(inventoryJs, "id: 'invViewListBtn'"), 'الزرّان ضمن تخصيص أزرار المخزون');
check(has(inventoryJs, "_applyInvViewMode();") && has(inventoryJs, 'setupInvSearch()'), 'التطبيق داخل init_inventory دون لمس البحث');
const invListCss = between(css, '/* ===== INVENTORY GRID / LIST TOGGLE', '/* ===== BRAND GRID ===== */');
check(!!invListCss && has(invListCss, '.prod-grid.inv-list-view { display: flex;'), 'قائمة المخزون صفوف مرنة');
check(has(invListCss, 'flex-direction: row; align-items: center; flex-wrap: wrap;'), 'محتوى البطاقة مرتب أفقياً مع ترك مساحة للالتفاف');
check(has(invListCss, '@media (max-width:900px)'), 'حل احتياطي للشاشات الضيقة');
check(!has(invListCss, 'display:none') && !has(invListCss, 'display: none'), 'لا شيء مخفي في وضع القائمة');
check(has(inventoryHtml, 'id="invGrid"') && has(inventoryJs, 'new InfiniteScrollPager'), 'حاوية التمرير والصفحات بقيت كما هي');
check(has(inventoryJs, 'ondblclick=') && has(inventoryJs, 'openPrintBarcodeModal') && has(inventoryJs, '_registerProdCtxHandlers'), 'التعديل بالنقر المزدوج والطباعة والقائمة السياقية بقيت');
check(has(inventoryJs, 'Auth.buyPriceVisible()') && has(inventoryJs, 'Auth.canEdit(') && has(inventoryJs, 'ExtraPrices.pillHTML'), 'الصلاحيات والأسعار الإضافية لم تُمس');

// ---------- 4. release metadata untouched ----------
console.log('\n--- 4. الإصدار ---');
const vParts = (v) => String(v).split('.').map(Number);
const vAtLeast = (v, min) => {
  const a = vParts(v), b = vParts(min);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
};
check(pkg.version === update.version, 'package.json و update.json متطابقان على الإصدار ' + pkg.version);
check(vAtLeast(pkg.version, '3.2.8'), 'الإصدار الحالي (' + pkg.version + ') لا يقل عن 3.2.8');

console.log('\n============================================');
console.log((fail === 0 ? 'كل الفحوص نجحت' : 'فشل ' + fail + ' فحص') + ' — pass=' + pass + ' fail=' + fail);
console.log('============================================');
process.exit(fail === 0 ? 0 : 1);
