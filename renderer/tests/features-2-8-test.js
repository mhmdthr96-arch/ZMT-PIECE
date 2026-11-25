// ============================================================
// ZMT PIECE — features 1, 2, 3, 4, 6, 7, 8 — verification
// Run: node renderer/tests/features-2-8-test.js
//
// Behavioural tests for the shared ExtraPrices / PrintPaper modules and
// static wiring checks for the inventory «i» aggregation, the zero-quantity
// Excel option, the title-bar shortcut strip and the invoices header layout.
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const base = path.join(__dirname, '..', '..') + path.sep;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (cond, m) => cond ? ok(m) : bad(m);
const eq = (a, b, m) => check(a === b, m + ' (got ' + a + ', want ' + b + ')');
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const has = (s, n) => s.indexOf(n) !== -1;
// Body of a top-level `function name(...) {...}` — lets a check say "this
// function must not touch that element" instead of grepping the whole file.
const fnBody = (src, name) => {
  const at = src.indexOf('function ' + name + '(');
  if (at === -1) return '';
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return '';
};

// In-memory localStorage shared by both module sandboxes.
const store = {};
const localStorageStub = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

function loadModule(file, extra) {
  const sandbox = { module: { exports: {} }, console, localStorage: localStorageStub, Date, Math, Object, Array, JSON, String, Number, isFinite, parseFloat, parseInt };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  Object.assign(sandbox, extra || {});
  vm.createContext(sandbox);
  vm.runInContext(read(file), sandbox);
  return { api: sandbox.module.exports, sandbox };
}

const { api: EP } = loadModule('renderer/js/extra-prices.js', { fmtMoney: (v) => Number(v).toFixed(2) });
const { api: PP } = loadModule('renderer/js/print-paper.js');

console.log('\n--- 1. حقول أسعار البيع الإضافية (feature 3) ---');
{
  store[EP.KEY] = '';
  let r = EP.addField('نصف جملة', '#6f42c1');
  check(r.ok && r.fields.length === 1, 'إضافة حقل باسم ولون');
  const id = r.fields[0].id;
  eq(EP.fieldById(id).name, 'نصف جملة', 'قراءة الحقل بالمعرّف');
  eq(EP.fieldById(id).color, '#6f42c1', 'اللون محفوظ');

  r = EP.addField('نصف جملة', '#000000');
  check(!r.ok && r.error === 'duplicate', 'منع الاسم المكرر');

  r = EP.updateField(id, { name: 'جملة كبيرة', color: '#0ea5e9' });
  check(r.ok && EP.fieldById(id).name === 'جملة كبيرة', 'إعادة التسمية لا تغيّر المعرّف');
  eq(EP.fieldById(id).color, '#0ea5e9', 'إعادة التلوين');

  const rec = { extraPrices: { [id]: 450.5, other: 0 } };
  eq(EP.priceOf(rec, id), 450.5, 'سعر المنتج للحقل');
  eq(EP.priceOf(rec, 'missing'), 0, 'حقل غير موجود = 0');
  const cleaned = EP.cleanPriceMap({ [id]: 450.5, empty: 0, bad: 'x' });
  eq(Object.keys(cleaned).length, 1, 'تنظيف الخريطة يحذف القيم الفارغة');

  const pills = EP.pillHTML(rec, EP.fieldById(id));
  check(has(pills, 'price-extra') && has(pills, '450.50') && has(pills, 'جملة كبيرة'), 'بطاقة السعر الإضافي تُبنى بالاسم واللون والسعر');
  eq(EP.pillHTML({}, EP.fieldById(id)), '', 'لا بطاقة لحقل بلا سعر');

  store[EP.KEY] = '';
  const err = EP.addField('', '#fff');
  check(!err.ok && err.error === 'name', 'رفض الاسم الفارغ');
  for (let i = 0; i < EP.MAX + 3; i++) EP.addField('حقل ' + i, '#123456');
  eq(EP.fields().length, EP.MAX, 'الحد الأقصى للحقول = ' + EP.MAX);

  const sales = read('renderer/js/pages/sales.js');
  check(has(sales, 'salesNextLineMode') && has(sales, "return list[(i < 0 ? 0 : i + 1) % list.length]"), 'زر السعر يتنقّل بين القطعة/الجملة/الحقول');
  check(has(sales, "m.indexOf('extra:')") && has(sales, 'salesMarginKindOfMode') && has(sales, "String(kind).indexOf('extra:')"), 'أوضاع السعر الإضافية في السلة والهامش');
  check(has(sales, "line.mode !== 'unit' && line.mode !== 'wholesale' && !salesExtraFieldOfMode(line.mode)"), 'الرجوع للقطعة عند حذف الحقل');
  check(has(sales, 'store.extras') && has(sales, 'rules[].extras') === false && has(sales, 'extras: {}'), 'إعدادات الهامش تدعم الحقول الإضافية');
  check(has(sales, 'zmt:extra-prices-changed'), 'تحديث البيع عند تغيير الحقول');

  const inv = read('renderer/js/pages/inventory.js');
  check(has(inv, 'openExtraPriceFieldsModal') && has(inv, 'epfSave'), 'زر ونافذة ادراج حقول بيع اضافية');
  check(has(inv, "'invAdd'") && has(inv, "'invDirect'") && has(inv, "'invQuick'") && has(inv, "'invEdit'"), 'الحقول في كل نماذج المخزون');
  check(has(inv, 'ExtraPrices.pillHTML'), 'بطاقات المخزون تعرض الأسعار الإضافية');
}

console.log('\n--- 2. تجميع «i» في المخزون (feature 6) ---');
{
  const db = read('renderer/js/db.js');
  const app = read('renderer/js/app.js');
  check(has(db, 'detailsIdentityKey') && has(db, 'name') && has(db, 'canonBarcode'), 'مفتاح الهوية = الاسم + الباركود + المرجع');
  check(has(db, 'getProductIdentityGroup(productId)'), 'دالة تجميع صفوف نفس المنتج');
  check(has(db, 'new Set(productId)') && has(db, 'ids.has(it.productId)'), 'سجلات البيع/الشراء تقبل عدة معرّفات');
  check(has(app, 'DB.getProductIdentityGroup(prod.id)') && has(app, 'DB.getProductPurchaseHistory(groupIds)'), 'نافذة التفاصيل تجمع كل الدفعات');
  check(has(app, 'const totalQty =') && has(app, 'totalQty < 5'), 'كمية النافذة مجموع الدفعات');
  check(has(app, 'groupProds.length > 1') && has(app, 'PD.batches'), 'شارة عدد الدفعات تظهر فقط عند التعدد');
  check(has(app, "batches: 'دفعات'") && has(app, "batches: 'batches'") && has(app, "batches: 'lots'") && has(app, "batches: '批次'"), 'ترجمة عدد الدفعات بكل اللغات');
}

console.log('\n--- 3. إعدادات ورق الطباعة العامة (feature 4) ---');
{
  eq(PP.config().preset, 'A4', 'الافتراضي A4');
  eq(PP.config().orientation, 'portrait', 'الافتراضي عمودي');
  check(PP.PRESETS.map(p => p.id).join(',') === 'A3,A4,A5,A6,B4,B5,Letter,Legal,Executive,custom', 'كل أحجام الورق المطلوبة موجودة');
  PP.save({ preset: 'A5', orientation: 'landscape', margin: 7 });
  const cfg = PP.config();
  eq(cfg.preset, 'A5', 'حفظ الحجم');
  eq(cfg.orientation, 'landscape', 'حفظ الاتجاه');
  eq(cfg.margin, 7, 'حفظ الهامش');
  check(PP.pageRule(10).indexOf('size:A5 landscape') !== -1 && PP.pageRule(10).indexOf('margin:7mm') !== -1, 'قاعدة @page تستخدم الاختيار');
  eq(PP.previewWidthCss(), '210mm', 'عرض المعاينة يتبع الورق الأفقي');

  PP.save({ preset: 'custom', orientation: 'portrait', margin: 5, width: 120, height: 180 });
  check(PP.pageRule(10).indexOf('size:120mm 180mm') !== -1, 'الورق المخصص يُطبع بالمليمتر');
  eq(PP.dims(PP.config()).w, 120, 'عرض الورق المخصص');

  const invoices = read('renderer/js/pages/invoices.js');
  const sales = read('renderer/js/pages/sales.js');
  const zakat = read('renderer/js/pages/zakat.js');
  const settings = read('renderer/js/pages/settings.js');
  const ppSrc = read('renderer/js/print-paper.js');
  const settingsHtml = read('renderer/pages/settings.html');
  check(has(invoices, 'PrintPaper.pageRule(10)') && has(invoices, 'PrintPaper.pageRule(0)'), 'فواتير الشراء/البيع وتصدير PDF تتبع الإعداد');
  check(has(sales, 'PrintPaper.pageRule(10)') && has(zakat, 'PrintPaper.pageRule(12)'), 'فاتورة البيع وتقرير الزكاة يتبعان الإعداد');
  check(has(invoices, 'PrintPaper.previewWidthCss()'), 'عرض المعاينة يتبع حجم الورق');
  check(has(settingsHtml, 'PrintPaper.openSettings()') && has(settingsHtml, 'settings.printSettingsBtn'), 'زر اعدادات الطباعة في الإعدادات');
  check(has(ppSrc, 'function openSettings') && has(ppSrc, 'ppPreset') && has(ppSrc, 'ppWidth'), 'نافذة اختيار الحجم/الاتجاه/الهامش/المخصص');
  check(!has(settings, '_ppEl(') && !has(settings, 'printPaperModal'), 'صفحة الإعدادات لم تعد تحتفظ بنسخة ثانية من النافذة');
  check(has(read('renderer/index.html'), 'js/print-paper.js'), 'وحدة الطباعة محمّلة عند بدء التشغيل');
  check(!has(read('renderer/js/thermal-print.js'), 'PrintPaper'), 'الطباعة الحرارية لا تتأثر بإعدادات الفواتير');
}

console.log('\n--- 4. تصدير Excel بدون كمية صفر (feature 7) ---');
{
  const inv = read('renderer/js/pages/inventory.js');
  const db = read('renderer/js/db.js');
  check(has(inv, "zmt_xlsx_exclude_zero_qty"), 'الاختيار محفوظ في localStorage');
  check(has(inv, 'exportExcludeZero') && has(inv, 'exportSkippedZero'), 'خيار الاستبعاد وتقرير العدد المستبعد');
  check(has(inv, 'excludeZero === undefined') && has(inv, 'invXlsxExcludeZeroPref()'), 'الاختيار يُعاد استخدامه في تصدير Ctrl+X');
  check(has(inv, 'invXlsxIsZeroQty') && has(inv, 'p.fixed === true'), 'تصفية الصفوف ذات الكمية صفر مع إبقاء المنتجات غير المحدودة');
  check(has(inv, '_invExportDoneMsg(skipped)'), 'رسالة النجاح تذكر العدد المستبعد');
  check(has(db, 'Array.isArray(opts.products)'), 'محرك Excel يقبل القائمة المصفّاة');
}

console.log('\n--- 5. شريط الاختصارات في الشريط العلوي (feature 2) ---');
{
  const html = read('renderer/index.html');
  const app = read('renderer/js/app.js');
  const css = read('renderer/css/main.css');
  check(has(html, 'id="titleShortcuts"') && has(html, 'tel:0772363629'), 'رقم الهاتف 0772363629 كرابط اتصال');
  check(has(html, 'ZMT SOFTWARE') && has(html, 'ts-company'), 'اسم الشركة ZMT SOFTWARE');
  check(html.indexOf('title-shortcuts') < html.indexOf('title-bar-center'), 'الشريط بين ZMT PIECE وحالة الاتصال');
  check(has(app, 'toggleTitleShortcuts') && has(app, 'zmt_title_shortcuts_collapsed'), 'الطي/الفرد محفوظ');
  check(has(css, '.title-shortcuts.is-collapsed .title-shortcut') && has(css, '@media (max-width: 880px)'), 'تصميم متجاوب وانهيار تلقائي');
  check(has(css, '-webkit-app-region: no-drag'), 'الروابط قابلة للنقر داخل شريط السحب');
}

console.log('\n--- 6. ترويسة صفحة الفواتير (feature 8) ---');
{
  const html = read('renderer/pages/invoices.html');
  const css = read('renderer/css/main.css');
  check(has(html, 'inv-page-header-row') && has(html, 'inv-header-actions'), 'صف ترويسة وأزرار مستقلان');
  check(!has(html, 'justify-content:space-between"'), 'لا يوجد صف أزرار بلا التفاف');
  check(has(css, '.inv-page-header-row') && has(css, 'flex-wrap: wrap'), 'الترويسة تلتف بدل التراكب');
  check(has(css, '.inv-header-actions > button') && has(css, 'flex: 0 0 auto'), 'الأزرار لا تنكمش وتبقى بترتيبها');
  check(has(css, '@media (max-width: 560px)') && has(css, 'flex: 1 1 calc(50% - 8px)'), 'تخطيط مريح على الشاشات الصغيرة');
}

console.log('\n--- 7. العلامات المفضلة في صفحة البيع (feature 1) ---');
{
  const html = read('renderer/pages/sales.html');
  const sales = read('renderer/js/pages/sales.js');
  const css = read('renderer/css/main.css');
  check(has(html, 'id="salesFavBrandsBtn"') && has(html, 'sales.favBrandsBtn'), 'زر «إظهار العلامات المفضلة» بجوار سجل المبيعات');
  check(html.indexOf('salesFavBrandsBtn') < html.indexOf('salesFavStrip'), 'الزر في الترويسة والبطاقات في جسم الصفحة');
  check(has(sales, "'zmt_sales_fav_brands_on'") && has(sales, 'toggleSalesFavBrands'), 'تشغيل/إطفاء الميزة محفوظ بعد إعادة التشغيل');
  check(has(sales, "'zmt_fav_brands'") && has(sales, "'zmt_custom_brands'"), 'المفضلة تُقرأ من مفاتيح صفحة العلامات (مع العلامات المخصصة)');
  check(has(sales, 'toggleSalesFavBrand(id)') && has(sales, '_salesFavBrandActive === next'), 'نقرة ثانية على العلامة تخفي منتجاتها');
  check(has(sales, 'favItems.push({ g, idx: i })') && has(sales, 'mainItems.push({ g, idx: i })'), 'المنتجات تحتفظ بفهرسها المطلق بعد الفصل');
  check(has(sales, '_salesGroupList[index]'), 'نقرات البطاقات تستخدم الفهرس المطلق لا فهرس القسم');
  check(has(sales, 'loadMoreSalesFavProducts') && has(sales, 'SALES_GRID_PAGE_SIZE'), 'قسم العلامة يدعم التحميل التدريجي');
  check(has(css, '.sales-fav-strip') && has(css, '.sales-fav-card') && has(css, '.sales-fav-active'), 'تنسيق شريط العلامات وقسم المنتجات');
}

console.log('\n--- 8. تحويل فاتورة بيع إلى حساب عميل (feature 9) ---');
{
  const { api: CC } = loadModule('renderer/js/invoice-convert.js');

  const base = {
    type: 'customer',
    isProvisional: false,
    hasReturns: false,
    currentCustomerId: '',
    totalAmount: 1000,
    recordedCash: 400,
    creditUsed: 0
  };
  let p = CC.plan(Object.assign({}, base, { targetCustomerId: 'c1' }));
  check(p.ok && p.mode === 'walkin', 'فاتورة نقدية: تحويل كامل المبلغ');
  eq(p.newCustomerDelta, 1000, 'النقدي: يُضاف كامل المبلغ إلى رصيد العميل');
  eq(p.cancelledCash, 400, 'النقدي: يُلغى المقبوض النقدي المسجّل');
  eq(p.appliedPaid, 0, 'النقدي: لا يُحتسب أي دفع على الحساب');
  eq(p.oldCustomerDelta, 0, 'النقدي: لا رصيد سابق يُخصم');

  p = CC.plan(Object.assign({}, base, { recordedCash: 0, targetCustomerId: 'c1' }));
  check(p.ok && p.cancelPayments === false && p.cancelledCash === 0, 'بلا مقبوض نقدي: لا حذف دفعات');
  eq(p.newCustomerDelta, 1000, 'بلا مقبوض: يبقى كامل المبلغ على العميل');

  p = CC.plan(Object.assign({}, base, {
    currentCustomerId: 'c1', targetCustomerId: 'c2', recordedCash: 300, creditUsed: 100
  }));
  check(p.ok && p.mode === 'reassign', 'إعادة إسناد فاتورة مرتبطة');
  eq(p.effectivePaid, 400, 'إعادة الإسناد: المقبوض = نقد + رصيد مستعمل');
  eq(p.newCustomerDelta, 600, 'إعادة الإسناد: يُنقل المتبقي فقط');
  eq(p.oldCustomerDelta, -600, 'إعادة الإسناد: يُخصم المتبقي من العميل السابق');
  check(p.retagPayments === true, 'إعادة الإسناد: تُنقل دفعات الفاتورة للعميل الجديد');

  p = CC.plan(Object.assign({}, base, {
    currentCustomerId: 'c1', targetCustomerId: 'c2', recordedCash: 1000
  }));
  eq(p.newCustomerDelta, 0, 'فاتورة مدفوعة بالكامل: لا مبلغ يُنقل');

  const err = (over) => {
    const r = CC.plan(Object.assign({}, base, { targetCustomerId: 'c1' }, over));
    return r.ok ? 'ok' : r.error;
  };
  eq(err({ type: 'purchase' }), 'not_sale', 'رفض غير فواتير البيع');
  eq(err({ isProvisional: true }), 'provisional', 'رفض الفاتورة الشكلية');
  eq(err({ hasReturns: true }), 'has_returns', 'رفض فاتورة عليها مرتجعات');
  eq(err({ targetCustomerId: '' }), 'no_customer', 'رفض غياب العميل');
  eq(err({ currentCustomerId: 'c1' }), 'same_customer', 'رفض نفس العميل');
  eq(err({ totalAmount: 0 }), 'zero_total', 'رفض فاتورة بمبلغ صفر');
  eq(CC.round2(10.005), 10.01, 'تدوير المبالغ إلى فلسين');

  const html = read('renderer/index.html');
  const js = read('renderer/js/pages/invoices.js');
  const css = read('renderer/css/main.css');
  const app = read('renderer/js/app.js');
  check(has(html, 'js/invoice-convert.js'), 'محرّك التحويل محمّل عند بدء التشغيل');
  check(has(js, '_invConvertEligibility') && has(js, 'ConvertCore.plan'), 'الواجهة تستخدم محرّك التحويل النقي');
  check(has(js, 'DB.deletePaymentsByInvoice') && has(js, 'conversionCancelledCash'), 'إلغاء المقبوض النقدي محفوظ ومؤرشف');
  check(has(js, '_invAdjustCustomerBalance') && has(js, 'oldCustomerDelta'), 'تعديل رصيد العميل القديم والجديد');
  check(has(js, '_injectInvConvertFooterButton') && has(js, 'invDetailConvertBtn'), 'زر التحويل في نافذة الفاتورة');
  check(has(js, 'data-action="convert"') && has(js, 'inv-card-ctx-convert-wrap'), 'عنصر التحويل في قائمة النقر الأيمن');
  check(has(js, "action === 'convert'") && has(js, 'openInvConvert(id)'), 'تنفيذ التحويل من قائمة الإجراءات');
  check(has(js, 'invConvertNewName') && has(js, 'setInvConvertTab'), 'نافذة: اختيار عميل أو إنشاء عميل جديد');
  check(has(js, "_canManageInvoices() && _invConvertEligibility") || has(js, "!_canManageInvoices()"), 'صلاحية التحويل = إدارة الفواتير');
  check(has(css, '.inv-convert-modal') && has(css, '.inv-convert-tabs') && has(css, '.inv-convert-form'), 'تنسيق نافذة التحويل');
  const titleCount = (app.match(/'invoices\.convertTitle'/g) || []).length;
  eq(titleCount, 4, 'ترجمة عنوان التحويل بكل اللغات الأربع');
}

console.log('\n--- 9. فاتورة الشراء: الشاشة 200 والطباعة 190 أو 200 (feature 5) ---');
{
  const js = read('renderer/js/pages/invoices.js');
  const html = read('renderer/pages/invoices.html');
  check(has(js, 'const screenTotal ='), 'الشاشة تعرض الإجمالي قبل الخصم (200)');
  check(has(js, '(opts && opts.printBasis === \'gross\')'), 'أساس الطباعة يُمرَّر وقت الطباعة');
  check(has(js, 'const printTotal =') && has(js, 'const printDiscRows ='), 'الورق: صافي أو إجمالي حسب الاختيار');
  check(has(js, 'function _invHasBuyDiscount') && has(js, 'function _invGrossTotal'), 'كشف الخصم من purchaseGross');
  check(has(js, 'function setInvPrintTotalBasis') && has(js, '_invPrintBasisFor'), 'اختيار الإجمالي محفوظ قبل البناء');
  check(has(html, 'id="invPrintTotalBlock"'), 'نافذة الطباعة تعرض قسم إجمالي الطباعة');
  check(has(html, 'name="invPrintTotalBasis" value="net"') && has(html, 'name="invPrintTotalBasis" value="gross"'), 'خيارا بعد الخصم وقبل الخصم');
  check(has(html, 'data-i18n="invoices.printTotalTitle"'), 'قسم الإجمالي مترجم');
  check(has(js, 'inv-disc-banner') && has(js, 'invoices.discountOnInvoiceBanner'), 'بانر ظاهر على الشاشة يشرح وجود الخصم');
  check(has(js, 'class="inv-screen-only"') && has(js, 'class="inv-print-only"'), 'نسختا الشاشة والورق في نفس القالب');
  check(has(js, 'paidBlockHTML(netTotal, { afterDisc: true })'), 'المدفوع/المتبقي على أساس الصافي (190)');
  check(has(js, 'function printInvFromReadOnly') && has(js, 'openInvPrintChoice(); return;'), 'طباعة الفاتورة المخفّضة تفتح نافذة الاختيار');
  check(has(js, 'if (!m) { printInvFromDetail(); return; }'), 'لا تعطّل زر الطباعة على الصفحات بلا نافذة اختيار');
  check(has(js, 'stripInvPrintHidden(content.outerHTML)'), 'الطبع يمر عبر منقّي العناصر الحساسة');
  check(has(js, 'inv-buy-sensitive inv-print-hide'), 'تفاصيل الخصم الحساسة تبقى مخفية عن الورق');
  check(has(js, 'const cardTotal = isBuy ? _invGrossTotal(inv)'), 'بطاقة القائمة تعرض الإجمالي قبل الخصم (200)');
  check(has(js, 'inv-card-disc-tag') && has(js, 'inv-card-net'), 'بطاقة القائمة: شارة خصم + الصافي 190');
  const app = read('renderer/js/app.js');
  check((app.match(/cardDiscountTag:/g) || []).length >= 4, 'ترجمة شارة الخصم بكل اللغات (4 على الأقل)');
  check((app.match(/cardDiscountTitle:/g) || []).length >= 4, 'ترجمة شرح شارة الخصم بكل اللغات (4 على الأقل)');
}

console.log('\n--- 10. زر «نمط الطابعة» في الشريط العلوي — اختيار ورق الفواتير ---');
{
  const html = read('renderer/index.html');
  const css = read('renderer/css/main.css');
  const ppSrc = read('renderer/js/print-paper.js');
  check(has(html, 'id="tbPrintPaper"') && has(html, 'id="btnPrintPaper"') && has(html, 'id="printPaperDropdown"'), 'زر وقائمة نمط الطابعة في الشريط العلوي');
  check(has(html, 'نمط الطابعة'), 'اسم الزر «نمط الطابعة»');
  const supAt = html.indexOf('id="tbSupport"');
  const ppAt = html.indexOf('id="tbPrintPaper"');
  const sideAt = html.indexOf('id="btnToggleSidebar"');
  check(supAt !== -1 && ppAt > supAt && ppAt < sideAt, 'الزر بجانب الدعم الاحترافي داخل أزرار الشريط');
  check(has(ppSrc, 'function setupTitleBar') && has(ppSrc, 'try { setupTitleBar(); }'), 'الشريط العلوي يُوصَّل عند بدء التشغيل دون انتظار صفحة');
  check(has(ppSrc, 'data-pp-preset') && has(ppSrc, 'function pickPreset'), 'قائمة سريعة بكل أحجام الورق');
  check(has(ppSrc, 'orientation: cfg.orientation') && has(ppSrc, 'margin: cfg.margin'), 'الحجم السريع يحفظ الاتجاه والهامش الحاليين');
  check(has(css, '.tb-pp-dropdown') && has(css, '.tb-dropdown-title') && has(css, '.tb-pp-preset.is-active'), 'تنسيق قائمة نمط الطابعة');
  check(has(css, '.title-shortcuts') === true, 'بقية الشريط العلوي لم يتغيّر تخطيطه');
}

console.log('\n--- 11. حقول أسعار البيع الإضافية في كل مداخل المنتجات (feature 2) ---');
{
  const qe = read('renderer/js/pages/quick-entry.js');
  const invHtml = read('renderer/pages/invoices.html');
  const js = read('renderer/js/pages/invoices.js');
  const css2 = read('renderer/css/main.css');

  check(has(qe, 'function extrasBandHTML') && has(qe, 'ExtraPrices.inputsHTML(extrasScope(row)'), 'الإدخال السريع يرسم حقول الأسعار لكل سطر');
  check(has(qe, "function extrasScope(row) { return 'qe' + row.uid; }"), 'معرّف نطاق لكل سطر حتى لا تُقرأ قيم سطر آخر');
  check(has(qe, "ExtraPrices.readInputs(extrasScope(row))"), 'السطر يقرأ حقوله الخاصة فقط');
  check(has(qe, 'extraPrices: extras,') && has(qe, 'extraPrices: mergeExtras(row, prod)'), 'الأسعار المُلواة تذهب مع المنتج الجديد ومع دمج الموجود');
  check(has(qe, 'function mergeExtras(row, prod)'), 'الحقول الفارغة لا تمسح أسعاراً مخزنة');
  check(has(qe, 'row.extras = (p.extraPrices'), 'اختيار منتج يعبّئ حقوله تلقائياً');
  check(has(qe, 'extras: (d.extraPrices'), 'أسطر تعديل الفاتورة تحمل حقولها');
  check(has(qe, 'extraPrices: readExtras(row),') && has(qe, 'function refreshExtrasBand'), 'التعبئة تُحدَّث عند تغيير المنتج');
  const lockBody = fnBody(qe, 'lockPriceInputs');
  check(has(lockBody, 'qeBuy_') && !has(lockBody, 'qeExtras'),
    'تحرير الفاتورة يقفل أسعار السطر ويُبقي حقول أسعار البيع قابلة للتعبئة');
  check(has(qe, "extraPrices: readExtras(row),\n          purchaseDiscountPct"), 'payload المنتج الجديد في تحرير الفاتورة يحمل الحقول');

  check(has(invHtml, 'id="purExtraPricesWrap"'), 'نموذج فاتورة الشراء/المورد فيه موضع للحقول');
  check(has(js, 'function _purRenderExtraInputs') && has(js, "ExtraPrices.inputsHTML('pur', rec)"), 'نموذج الشراء يرسم الحقول بحالتها المحفوظة');
  check(has(js, '_purRenderExtraInputs(null);') && has(js, '_purRenderExtraInputs(p);'), 'تفريغ النموذج وتعبئته يحدّثان الحقول');
  check(has(js, "ExtraPrices.readInputs('pur')"), 'السلة تقرأ الحقول وقت الإضافة');
  check(has(js, 'extraPrices: item.extraPrices || {},'), 'تأكيد الفاتورة يكتب الحقول على المنتج');
  check(has(js, 'extraPrices: (p && p.extraPrices) || (ni.payload && ni.payload.extraPrices)'), 'شاشة تحرير الفاتورة تمرّر الحقول للإدخال السريع');
  check(has(js, 'if (isPurFamily && newItem.extraPrices)'), 'الحقول المضافة أثناء التحرير تُحفظ على المنتج');

  check(has(css2, '.qe-col-extras { grid-column: 1 / -1;'), 'شريط الحقول يمتد تحت أعمدة السطر');
  check(has(css2, '.qe-col-extras .extra-price-section'), 'تنسيق الحقول داخل الإدخال السريع');

  const sales = read('renderer/js/pages/sales.js');
  check(has(sales, 'return v || r.sellPrice || 0'), 'السلة تعرض سعر الحقل المُلوء وترجع للقطعة عند غيابها');
}

console.log('\n============================================');
console.log((fail ? 'فشل ' + fail + ' فحصاً' : 'كل الفحوص نجحت') + ' — pass=' + pass + ' fail=' + fail);
console.log('============================================');
process.exit(fail ? 1 : 0);
