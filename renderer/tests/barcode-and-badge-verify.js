// ============================================================================
// ZMT PIECE — باركود المنتجات + شارة الموظف + ماسح الإدخال السريع
// Run: node renderer/tests/barcode-and-badge-verify.js
//
// 1) يشغّل وحدة barcode-print.js الحقيقية (تصدير للاختبار) ويتحقق من ترتيب
//    عناصر الملصق وأحجام الخطوط وإخفاء/إظهار المحل والسعر.
// 2) فحوص ثابتة على ربط الماسح في صفحة الإدخال السريع، وربط ماسح الموظفين،
//    وطباعة الشارة بمقاس 54×86 مم، وحقول الأسعار الإضافية في صفحة العلامة.
// ============================================================================
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..') + path.sep;
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (c, m) => c ? ok(m) : bad(m);
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const at = (src, needle) => src.indexOf(needle);

const BP = require('../js/barcode-print.js');

function label(product, over) {
  const cfg = Object.assign(BP.defaults(), over || {});
  return BP.buildLabelHtml(product, '<svg class="bars"></svg>', cfg);
}
const product = { name: 'منتج تجريبي', barcode: '123456789012', sellPrice: 450.5 };

// ---------------------------------------------------------------------------
console.log('\n=== 1. وحدة طباعة الباركود: الترتيب الافتراضي ===');
// ---------------------------------------------------------------------------
eq(BP.defaultOrder().join(','), 'name,shop,barcode,qr,code,price',
  'QR موجود في قائمة الترتيب مباشرة بعد الباركود');
eq(BP.ELEMENT_KEYS.join(','), BP.defaultOrder().join(','),
  'كل العناصر القابلة للترتيب مُعرّفة');
eq(BP.defaults().printMode, 'barcode', 'وضع الطباعة الافتراضي = باركود فقط (سلوك قديم)');
eq(BP.defaults().qrMm, 20, 'حجم QR الافتراضي 20 مم');

const def = label(product);
const pName = at(def, 'bp-name');
const pShop = at(def, 'bp-shop');
const pBars = at(def, 'bp-svg');
const pCode = at(def, 'bp-code');
const pPrice = at(def, 'bp-price');
check(pName >= 0 && pShop >= 0 && pBars >= 0 && pCode >= 0 && pPrice >= 0,
  'الملصق يحتوي العناصر الافتراضية: الاسم، المحل، الخطوط، الرقم، السعر');
check(at(def, 'bp-qr') < 0,
  'QR لا يظهر إطلاقاً في الوضع الافتراضي (لا تغيير بصري للمستخدم القديم)');
check(pName < pShop && pShop < pBars && pBars < pCode && pCode < pPrice,
  'الترتيب الافتراضي: الاسم ← المحل ← الباركود ← الرقم ← السعر');

// ---------------------------------------------------------------------------
console.log('\n=== 2. ترتيب مخصّص للعناصر ===');
// ---------------------------------------------------------------------------
const custom = label(product, { order: ['price', 'name', 'shop', 'barcode', 'code'] });
check(at(custom, 'bp-price') < at(custom, 'bp-name') &&
      at(custom, 'bp-name') < at(custom, 'bp-shop') &&
      at(custom, 'bp-shop') < at(custom, 'bp-svg') &&
      at(custom, 'bp-svg') < at(custom, 'bp-code'),
  'الترتيب المخصّص يُطبَّق فعلياً على الملصق');

const onlyBars = label(product, { order: ['barcode'] });
check(at(onlyBars, 'bp-svg') >= 0 && at(onlyBars, 'bp-name') < 0 &&
      at(onlyBars, 'bp-price') < 0,
  'قائمة ترتيب منقوصة ترسم العناصر المذكورة فقط');

const emptyOrder = label(product, { order: [] });
check(at(emptyOrder, 'bp-name') < at(emptyOrder, 'bp-shop') &&
      at(emptyOrder, 'bp-price') >= 0,
  'قائمة فارغة ترجع للترتيب الافتراضي');

// ---------------------------------------------------------------------------
console.log('\n=== 2ب. وضع QR: وحده / باركود فقط / الاثنان معاً ===');
// ---------------------------------------------------------------------------
const qrSvg = '<svg class="bp-qr-svg" viewBox="0 0 25 25" width="20mm" height="20mm"></svg>';
const qrOnly = BP.buildLabelHtml(product, '',
  Object.assign(BP.defaults(), { printMode: 'qr' }), qrSvg);
check(at(qrOnly, 'bp-qr') >= 0 && at(qrOnly, 'bp-svg') < 0,
  'وضع QR يرسم مربع QR ولا يرسم خطوط الباركود');
check(at(qrOnly, 'bp-code') >= 0 && at(qrOnly, 'bp-price') >= 0,
  'بقية عناصر الملصق تبقى خاضعة لإعدادات الإظهار الحالية');

const qrBig = BP.buildLabelHtml(product, '',
  Object.assign(BP.defaults(), { printMode: 'qr', qrMm: 32 }), qrSvg);
check(at(qrBig, 'width:32mm;height:32mm') >= 0,
  'حجم QR المستقل (مم) يُطبَّق على الملصق');

const both = BP.buildLabelHtml(product, '<svg class="bars"></svg>',
  Object.assign(BP.defaults(), { printMode: 'both' }), qrSvg);
check(at(both, 'bp-svg') >= 0 && at(both, 'bp-qr') >= 0 &&
      at(both, 'bp-svg') < at(both, 'bp-qr') && at(both, 'bp-qr') < at(both, 'bp-code'),
  'وضع الاثنين يرسمهما معاً بالترتيب: خطوط ← QR ← رقم الباركود');

eq(BP.normalizeOrder(['name', 'shop', 'barcode', 'code', 'price']).join(','),
  'name,shop,barcode,qr,code,price',
  'الترتيب القديم المحفوظ يحصل على QR بعد الباركود دون فقدان ترتيبه');
eq(BP.normalizeOrder(['price', 'qr', 'name']).join(','),
  'price,qr,name,shop,barcode,code',
  'ترتيب مخصّص يحتوي QR يحتفظ بمكانه ويُكمل العناصر الناقصة');
const bpPrintSrc = read('renderer/js/barcode-print.js');
check(at(bpPrintSrc, 'data-bp-printmode="qr"') >= 0 &&
      at(bpPrintSrc, 'data-bp-printmode="both"') >= 0,
  'نافذة الطباعة فيها أزرار QR فقط والاثنان معاً');
check(at(bpPrintSrc, 'data-bp-qrmm') >= 0 && at(bpPrintSrc, 'qrMm') >= 0,
  'حجم QR قابل للاختيار ومحفوظ ضمن إعدادات الملصق');

// ---------------------------------------------------------------------------
console.log('\n=== 2ج. انحدار: ترتيب تحديث أزرار QR قبل المعاينة ===');
// ---------------------------------------------------------------------------
// نُنفّذ جسم مستمع النقر الحقيقي من الملف النصي مع بدائل صغيرة، لأن الخلل كان
// ترتيبياً: renderPreview() قرأ الزر active القديم فأعاد الوضع إلى barcode.
function listenerBody(src, marker, from) {
  const start = src.indexOf(marker, from || 0);
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return '';
}
const pmBlockAt = at(bpPrintSrc, "_modal.querySelectorAll('[data-bp-printmode]')");
const clickBody = listenerBody(bpPrintSrc, "b.addEventListener('click', function () {", pmBlockAt);
check(!!clickBody, 'تم العثور على مستمع أزرار نوع الكود المطبوع');

function runPrintModeClick(modeName, cfgObj, calls) {
  const fn = new Function('b', 'PRINT_MODES', '_cfg', 'updatePrintModeUI', 'renderPreview', clickBody);
  fn({ getAttribute: function () { return modeName; } }, BP.PRINT_MODES, cfgObj,
    function () { calls.push('updatePrintModeUI'); },
    function () { calls.push('renderPreview'); });
}

const qrCalls = [];
const qrCfg = {};
runPrintModeClick('qr', qrCfg, qrCalls);
eq(qrCfg.printMode, 'qr', 'النقر على «QR فقط» يثبّت الوضع الجديد');
eq(qrCalls.join(' > '), 'updatePrintModeUI > renderPreview',
  'واجهة الأزرار تُحدَّث قبل قراءة الإعدادات وإعادة رسم المعاينة (إصلاح الخلل)');

const bothCalls = [];
const bothCfg = {};
runPrintModeClick('both', bothCfg, bothCalls);
eq(bothCfg.printMode, 'both', 'النقر على «الاثنان معاً» يثبّت الوضع الجديد');
eq(bothCalls.join(' > '), 'updatePrintModeUI > renderPreview',
  'نفس الترتيب مطبَّق في وضع الاثنين');

const ignoredCalls = [];
const ignoredCfg = { printMode: 'barcode' };
runPrintModeClick('unknown', ignoredCfg, ignoredCalls);
eq(ignoredCfg.printMode, 'barcode', 'قيمة غير معروفة لا تغيّر الوضع الحالي');
eq(ignoredCalls.length, 0, 'قيمة غير معروفة لا تُعيد رسم المعاينة');

// ---------------------------------------------------------------------------
console.log('\n=== 3. أحجام الخطوط (0 = تلقائي) ===');
// ---------------------------------------------------------------------------
const big = label(product, { nameFont: 19, shopFont: 7, priceFont: 24 });
check(at(big, 'font-size:19px') >= 0, 'حجم خط اسم المنتج المخصّص يُطبَّق');
check(at(big, 'font-size:7px') >= 0, 'حجم خط اسم المحل المخصّص يُطبَّق');
check(at(big, 'font-size:24px') >= 0, 'حجم خط السعر المخصّص يُطبَّق');
check(at(big, 'font-size:0px') < 0, 'لا يظهر حجم صفر على الورق');

const auto = label(product, { nameFont: 0, shopFont: 0, priceFont: 0 });
check(at(auto, 'font-size:0px') < 0 && at(auto, 'font-size:19px') < 0,
  'القيمة 0 تعني تلقائي في كل الحقول');
check(at(auto, 'bp-name') >= 0 && at(auto, 'font-size:') >= 0,
  'الحجم التلقائي يبقى مطبوعاً');

// ---------------------------------------------------------------------------
console.log('\n=== 4. إظهار/إخفاء المحل والسعر + الدوران ===');
// ---------------------------------------------------------------------------
const noShop = label(product, { showShop: false });
check(at(noShop, 'bp-shop') < 0 && at(noShop, 'bp-name') >= 0,
  'إخفاء اسم المحل لا يحذف بقية العناصر');

const noPrice = label(product, { showPrice: false });
check(at(noPrice, 'bp-price') < 0 && at(noPrice, 'bp-svg') >= 0,
  'إخفاء السعر لا يحذف الباركود');

const rot = label(product, { rotate: 90 });
check(at(rot, 'width:30mm;height:40mm') >= 0 && at(rot, 'rotate(90deg)') >= 0,
  'الدوران 90° يبدّل العرض والارتفاع ويطبّق التحويل');

const mirrored = label(product, { flip: true });
check(at(mirrored, 'scaleX(-1)') >= 0, 'العكس الأفقي (المرآة) يُطبَّق');

// ---------------------------------------------------------------------------
console.log('\n=== 4ب. إظهار/إخفاء رقم الباركود وحجم خطه المستقل ===');
// ---------------------------------------------------------------------------
const bpSrc = read('renderer/js/barcode-print.js');

check(at(label(product), 'bp-code') >= 0,
  'رقم الباركود يظهر افتراضياً (توافق خلفي)');
const hideCode = label(product, { showCode: false });
check(at(hideCode, 'bp-code') < 0 && at(hideCode, 'bp-svg') >= 0 && at(hideCode, 'bp-price') >= 0,
  'إخفاء رقم الباركود يبقي الخطوط والسعر');
eq(BP.defaults().showCode, true, 'الإعداد الافتراضي: إظهار رقم الباركود');
eq(BP.defaults().codeFont, 0, 'حجم خط الرقم الافتراضي = تلقائي');

const codeBig = label(product, { codeFont: 21, shopFont: 7 });
check(at(codeBig, 'class="bp-code" dir="ltr" style="font-size:21px"') >= 0,
  'حجم خط رقم الباركود المستقل يُطبَّق');
const codeAuto = label(product, { codeFont: 0, shopFont: 7 });
check(at(codeAuto, 'class="bp-code" dir="ltr" style="font-size:7px"') >= 0,
  'القيمة 0 تجعل الرقم يتبع خط المحل (لا تغيير بصري للمستخدم الحالي)');

check(at(bpSrc, 'data-bp-showcode') >= 0, 'نافذة الطباعة فيها خيار إظهار رقم الباركود');
check(at(bpSrc, 'data-bp-codefont') >= 0, 'نافذة الطباعة فيها حجم خط مستقل للرقم');
check(at(bpSrc, 'showCode') >= 0 && at(bpSrc, 'codeFont') >= 0,
  'الإعدادان محفوظان ضمن إعدادات الملصق المشتركة');

// ---------------------------------------------------------------------------
console.log('\n=== 4ج. طباعة باركود الباقات ومشاركة الإعدادات ===');
// ---------------------------------------------------------------------------
const invJs = read('renderer/js/pages/inventory.js');
const salesJs = read('renderer/js/pages/sales.js');

check(at(bpSrc, 'function openBundleBarcodeModal(') >= 0 &&
      at(bpSrc, 'window.openBundleBarcodeModal = openBundleBarcodeModal') >= 0,
  'طباعة باركود الباقة متاحة من نفس وحدة الطباعة');
check(at(bpSrc, 'openBundle: openBundleBarcodeModal') >= 0,
  'BP.openBundle مُصدَّر');
check(at(bpSrc, 'function getTargetModel(') >= 0 && at(bpSrc, 'isBundle: true') >= 0,
  'الطباعة تتعامل مع الباقة كمنتج بنفس القالب');
check(at(bpSrc, "_modal.style.zIndex = '100050'") >= 0,
  'نافذة الطباعة تظهر فوق نوافذ الباقات');
check(at(invJs, 'openBundleBarcodeModal') >= 0,
  'زر باركود ظاهر في قائمة الباقات');
check(at(invJs, "t('inventory.barcodeUsedProduct')") >= 0,
  'منع حفظ باركود باقة مكرر مع منتج');
check(at(invJs, "t('inventory.barcodeUsedBundle')") >= 0,
  'منع حفظ باركود باقة مكرر مع باقة أخرى');
check(at(salesJs, 'DB.getBundleByBarcode(cleaned)') >= 0,
  'مسح باركود الباقة يضيفها إلى سلة البيع');
check(typeof BP.barcodeOwner === 'function' && typeof BP.generateUniqueBarcode === 'function',
  'أدوات فحص/توليد الباركود الفريد متاحة للنافذتين');

// ---------------------------------------------------------------------------
console.log('\n=== 5. ماسح الإدخال السريع (حقل مستقل + ربط الهاتف) ===');
// ---------------------------------------------------------------------------
const qeHtml = read('renderer/pages/quick-entry.html');
const qeJs = read('renderer/js/pages/quick-entry.js');
const appJs = read('renderer/js/app.js');

check(at(qeHtml, 'id="qeScanInput"') >= 0, 'صفحة الإدخال السريع فيها حقل ماسح مستقل qeScanInput');
check(at(qeHtml, 'QE.handleScanKey(event)') >= 0, 'حقل الماسح يستدعي QE.handleScanKey عند Enter');
check(at(qeHtml, 'id="qeScanStatus"') >= 0, 'شريط الماسح يعرض حالة المسح');

check(at(qeJs, 'window.QE = {') >= 0 && at(qeJs, 'handleScanKey: handleScanKey') >= 0,
  'الدالة handleScanKey منشورة على QE (تعمل من onkeydown)');
check(at(qeJs, 'scanProduct: scanProduct') >= 0, 'الدالة scanProduct منشورة على QE');
check(at(qeJs, 'function scanProduct(') >= 0 && at(qeJs, 'function isBlankRow(') >= 0 &&
      at(qeJs, 'function findBlankRow(') >= 0,
  'منطق المسح: منتج موجود ← زيادة كمية، منتج جديد ← سطر جديد');
check(at(qeJs, "trackPageListener('zmt-phs-scan'") >= 0,
  'الصفحة تستمع لحدث ماسح الهاتف zmt-phs-scan كخطة بديلة');
check(at(qeJs, 'addRow(); target = _qeRows[_qeRows.length - 1];') >= 0,
  'المسح ينشئ سطراً تلقائياً عند امتلاء السطور الفارغة');

check(at(appJs, "'quick-entry': 'qeScanInput'") >= 0,
  'جسر الهاتف يوجّه مسح صفحة الإدخال السريع إلى qeScanInput');
check(at(appJs, 'PINNED_SCANNER_PAGES') >= 0 &&
      at(appJs, "PINNED_SCANNER_PAGES = ['quick-entry', 'employees', 'sales']") >= 0,
  'صفحات الإدخال السريع والموظفين والبيع مثبّتة على حقولها المستقلة');
check(at(appJs, 'PINNED_SCANNER_PAGES.indexOf(_currentPageId)') >= 0,
  'الجسر لا يكتب في أي حقل آخر مركّز خارج النوافذ المنبثقة');

// ---------------------------------------------------------------------------
console.log('\n=== 6. ماسح الموظفين وطباعة الشارة ===');
// ---------------------------------------------------------------------------
const empHtml = read('renderer/pages/employees.html');
const empJs = read('renderer/js/pages/employees.js');

check(at(empHtml, 'id="empScanInput"') >= 0 && at(empHtml, 'onkeydown="handleEmpScan(event)"') >= 0,
  'صفحة الموظفين تربط حقل المسح بدالة handleEmpScan');
check(at(empHtml, 'onclick="printEmpBadge()"') >= 0,
  'زر الطباعة في نافذة الشارة يستدعي printEmpBadge');
check(at(empJs, 'function handleEmpScan(') >= 0,
  'handleEmpScan موجودة (كانت مفقودة سابقاً)');
check(at(empJs, 'empApplyScan(code)') >= 0,
  'المسح يستخدم نفس قواعد الحضور/الانصراف empApplyScan');
check(at(empJs, 'input.value = \'\'') >= 0,
  'الحقل يُفرَّغ بعد كل مسح ليكون جاهزاً للبطاقة التالية');

check(at(empJs, 'function printEmpBadge(') >= 0, 'printEmpBadge موجودة (كانت مفقودة سابقاً)');
check(at(empJs, '@page{size:54mm 86mm;margin:0;}') >= 0,
  'الشارة تُطبع بمقاس البطاقة الثابت 54×86 مم');
check(at(empJs, 'BP.genBarcodeSVG(code)') >= 0 || at(empJs, 'BP.genBarcodeSVG') >= 0,
  'الشارة تستخدم مولّد الباركود نفسه المستخدم في بقية البرنامج');
check(at(empJs, 'window.print()') >= 0 && at(empJs, 'window.close()') >= 0,
  'الشارة تُفتح في نافذة طباعة ثم تُغلق بعد الطباعة');
check(at(empJs, "@page{size:54mm 86mm") >= 0 && at(empJs, "class=\"zmt-badge\"") >= 0,
  'الشارة تحتوي قالب البطاقة (اسم، صورة/حرف، باركود، رقم)');

// ---------------------------------------------------------------------------
console.log('\n=== 7. حقول الأسعار الإضافية في صفحة العلامة ===');
// ---------------------------------------------------------------------------
const catHtml = read('renderer/pages/category-products.html');
const catJs = read('renderer/js/pages/category-products.js');

check(at(catHtml, 'id="catExtraPricesWrap"') >= 0,
  'نموذج إضافة/تعديل منتج العلامة فيه حاوية حقول الأسعار');
check(at(catHtml, 'id="catQuickAddExtrasWrap"') >= 0,
  'نافذة الإضافة السريعة الثابتة فيها حاوية حقول الأسعار');
check(at(catJs, 'function _catRenderExtraInputs(') >= 0,
  'دالة رسم الحقول المشتركة موجودة');
check(at(catJs, "ExtraPrices.readInputs('catAdd')") >= 0,
  'نموذج العلامة يقرأ حقول catAdd');
check(at(catJs, "ExtraPrices.readInputs('catQuick')") >= 0,
  'الإضافة السريعة تقرأ حقول catQuick');
check(at(catJs, 'extraPrices: item.extraPrices || {}') >= 0,
  'تأكيد الفاتورة يمرّر الأسعار الإضافية إلى addOrMergeProduct');
check(at(catJs, 'family, sellPrice, extraPrices') >= 0,
  'الإضافة السريعة تمرّر الأسعار الإضافية إلى quickAddProduct');
check(at(catJs, "ExtraPrices.fillInputs('catAdd', p)") >= 0,
  'اختيار منتج موجود يعبّئ حقوله المحفوظة');
check(at(catJs, "_catRenderExtraInputs('catExtraPricesWrap', 'catAdd', p)") >= 0,
  'فتح التعديل يرسم الحقول بقيم المنتج');

// ---------------------------------------------------------------------------
console.log('\n============================================');
if (fail) {
  console.log('فشل ' + fail + ' فحصاً من ' + (pass + fail));
  process.exit(1);
} else {
  console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
}
