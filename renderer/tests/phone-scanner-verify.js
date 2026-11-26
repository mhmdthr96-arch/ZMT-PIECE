// ============================================================================
// ZMT PIECE — ماسح الجوال (القراءة فقط) + وصول المسح إلى الحقول
// Run: node renderer/tests/phone-scanner-verify.js
//
// يغطي هذا الاختبار ثلاث مشكلات:
//   1) قارئ الهاتف لم يقرأ QR (كان BrowserBarcodeReader أحادي الصيغة).
//   2) المسح لا يصل إلى نوافذ الإدخال السريع الفرعية ( كان يُرسل للنافذة الرئيسية ).
//   3) المسح لا يُحقن في حقول النوافذ المنبثقة مثل الإضافة الذكية.
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
const has = (src, needle) => src.indexOf(needle) !== -1;

// Extract a function body from real source by counting braces. Safe here:
// the extracted functions contain no braces inside string literals.
function bodyOf(src, marker, from) {
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

// ---------------------------------------------------------------------------
console.log('\n=== 1. ماسح القراءة فقط: قراءة QR وتحويل الحمولة ===');
// ---------------------------------------------------------------------------
const scannerApp = read('renderer/phone-scanner/app.js');
check(has(scannerApp, 'BrowserMultiFormatReader'), 'قارئ الهاتف متعدد الصيغ (QR + باركود)');
check(has(scannerApp, 'ZXing.DecodeHintType.POSSIBLE_FORMATS'), 'صيغ القراءة مُمرَّرة ك hints');
check(has(scannerApp, 'ZXing.BarcodeFormat.QR_CODE'), 'QR_CODE ضمن الصيغ المقبولة');
check(has(scannerApp, 'function scannableCode(text)'), 'تحويل حمولة QR إلى باركود موجود');
check(has(scannerApp, 'Scanner ready — point at a barcode or QR'), 'رسالة الحالة تذكر QR');
check(has(scannerApp, 'window.ZXing.BrowserBarcodeReader'), 'قارئ الباركود القديم بقي كخطة احتياطية (لا فقدان ميزة)');

const scannableBody = bodyOf(scannerApp, 'function scannableCode(text)');
check(!!scannableBody, 'تم استخراج دالة تحويل الحمولة من الكود الحقيقي');
const scannable = new Function('text', scannableBody);
eq(scannable('ZMT-PRODUCT|p1|123456'), '123456', 'QR بمنتج وباركود → يُرسل الباركود');
eq(scannable('ZMT-PRODUCT|p1'), 'p1', 'QR قديم بمعرّف فقط → يُرسل المعرّف');
eq(scannable('ZMT-PRODUCT||'), '', 'حمولة فارغة → لا يُرسل شيء');
eq(scannable('  123456  '), '123456', 'الباركود العادي يُرسل كما هو بعد تقليم المسافات');
eq(scannable('ZMT-PRODUCT|p1|123|tail'), '123|tail', 'جزء الباركود متعدد الأجزاء يُحفظ كاملاً');

// ---------------------------------------------------------------------------
console.log('\n=== 2. توجيه المسح إلى النافذة المركّزة ===');
// ---------------------------------------------------------------------------
const mainSrc = read('main.js');
check(has(mainSrc, 'PhoneScanner.setWindowGetter(() => BrowserWindow.getFocusedWindow() || mainWindow)'),
  'مسح الهاتف يصل إلى نافذة الإدخال السريع الفرعية المركّزة');
check(has(mainSrc, 'PhoneScanner.setWindowGetter('), 'جسر ماسح الهاتف ما زال مُسجَّلاً');

// ---------------------------------------------------------------------------
console.log('\n=== 3. حقن المسح في أي حقل (بما فيه الإضافة الذكية) ===');
// ---------------------------------------------------------------------------
const appSrc = read('renderer/js/app.js');
check(has(appSrc, 'if (editable && (!pinned || inModal)) target = active;'),
  'الحقل المركّز داخل نافذة منبثقة يستقبل المسح');

const injectBody = bodyOf(appSrc, 'window.injectRemoteScan = function injectRemoteScan(code)');
check(!!injectBody, 'تم استخراج جسم injectRemoteScan من الكود الحقيقي');

function EventStub(type) { this.type = type; }
function KeyboardStub(type, init) { this.type = type; this.key = init && init.key; this.code = init && init.code; }
function CustomStub() {}

function makeField(id, cls, inModal) {
  const events = [];
  return {
    id: id,
    tagName: 'INPUT',
    value: '',
    disabled: false,
    readOnly: false,
    className: cls || '',
    events: events,
    getAttribute: (name) => {
      if (name === 'id') return id;
      if (name === 'type') return 'text';
      if (name === 'class') return cls || '';
      return null;
    },
    closest: (sel) => (inModal && sel === '.modal-overlay') ? {} : null,
    classList: { add() {}, remove() {} },
    dispatchEvent: (e) => { events.push(e.type); return true; },
    focus() {},
    nextElementSibling: null,
  };
}

function runInject(page, active, mapped, code) {
  const doc = {
    activeElement: active,
    body: { tagName: 'BODY' },
    getElementById: (id) => (mapped && mapped.id === id) ? mapped : null,
    querySelector: () => null,
  };
  const win = {
    cleanScannedCode: (v) => v,
    zmtEmployeeScanHook: null,
    dispatchEvent: () => {},
  };
  const fn = new Function(
    'code', 'PHS_SCANNER_FIELD', 'PINNED_SCANNER_PAGES', 'PHS_ENTER_FIELDS',
    '_currentPageId', 'document', 'window', 'requestAnimationFrame',
    'setTimeout', 'CustomEvent', 'Event', 'KeyboardEvent', injectBody
  );
  fn(
    code,
    { sales: 'salesBarcodeScan', inventory: 'invBarcodeScanner', 'quick-entry': 'qeScanInput' },
    ['quick-entry', 'employees', 'sales'],
    ['editBarcodeScan'],
    page, doc, win,
    (cb) => cb(),
    () => {},
    CustomStub, EventStub, KeyboardStub
  );
  return { active: active, mapped: mapped };
}

// أ) حقل داخل نافذة الإضافة الذكية في المخزون (كان يتجاهل المسح سابقاً)
const smartField = makeField('smartAddBarcode', 'form-control', true);
runInject('inventory', smartField, null, '123456');
eq(smartField.value, '123456', 'مسح أثناء الإضافة الذكية يُكتب في حقل النافذة المنبثقة');
check(smartField.events.indexOf('input') >= 0 && smartField.events.indexOf('change') >= 0,
  'الحقل يُطلق input + change تماماً كالكتابة اليدوية');
check(smartField.events.indexOf('keydown') < 0,
  'لا يُرسل Enter لحقل بحث عام (تجنّب إرسال النموذج)');

// ب) صفحة البيع: حقل الماسح المثبّت يبقى هو المستقبل خارج النافذة المنبثقة
const saleScanner = makeField('salesBarcodeScan', 'sales-scanner-input', false);
const unrelated = makeField('orderSearch', 'form-control', false);
runInject('sales', unrelated, saleScanner, '999');
eq(saleScanner.value, '999', 'صفحة البيع تحتفظ بحقل الماسح المثبّت');
eq(unrelated.value, '', 'حقل بحث عابر لا يسرق المسح في صفحة البيع');
check(saleScanner.events.indexOf('keydown') >= 0 && saleScanner.events.indexOf('keyup') >= 0,
  'حقل ماسح البيع يستلم Enter لإضافة السطر');

// ج) صفحة البيع داخل نافذة منبثقة: الحقل المركّز هو المقصود
const saleModalField = makeField('editBarcodeScan', 'form-control', true);
const saleScanner2 = makeField('salesBarcodeScan', 'sales-scanner-input', false);
runInject('sales', saleModalField, saleScanner2, '777');
eq(saleModalField.value, '777', 'حقل داخل نافذة في البيع يستقبل المسح');
eq(saleScanner2.value, '', 'حقل الماسح المثبّت لا يُحدَّث أثناء نافذة منبثقة');

// د) الإدخال السريع: حقل الكمية المركّز لا يسرق المسح
const qeScanner = makeField('qeScanInput', 'scanner-input', false);
const qtyField = makeField('qeQty', 'form-control', false);
runInject('quick-entry', qtyField, qeScanner, '555');
eq(qeScanner.value, '555', 'الإدخال السريع يبقي المسح في qeScanInput');
eq(qtyField.value, '', 'حقل الكمية لا يستقبل المسح');

// ---------------------------------------------------------------------------
console.log('\n=== 4. أيقونات SVG لتثبيت التطبيقين ===');
// ---------------------------------------------------------------------------
const paths = [
  'renderer/phone-scanner/icons/icon.svg',
  'renderer/phone-sales/icons/icon.svg',
];
for (const p of paths) {
  const file = path.join(root, p);
  check(fs.existsSync(file), p + ' موجود');
  if (fs.existsSync(file)) {
    const svg = fs.readFileSync(file, 'utf8');
    check(/<svg[\s\S]*<\/svg>/.test(svg) && has(svg, 'viewBox="0 0 512 512"'), p + ' ملف SVG صالح');
  }
}
const scanSvg = read(paths[0]);
const saleSvg = read(paths[1]);
check(has(scanSvg, '#0b6db5') && has(saleSvg, '#00a878'),
  'أيقونتان بلوني التطبيقين: أزرق للماسح وأخضر للبيع');
check(has(scanSvg, 'aria-label="ZMT Scanner"') && has(saleSvg, 'aria-label="ZMT Phone Sale"'),
  'كل أيقونة تحمل وصفاً وصولياً');

for (const dir of ['phone-scanner', 'phone-sales']) {
  const manifest = JSON.parse(read('renderer/' + dir + '/manifest.webmanifest'));
  const svgIcon = (manifest.icons || []).find(i => i.src === 'icons/icon.svg');
  check(!!svgIcon && svgIcon.type === 'image/svg+xml' && svgIcon.sizes === 'any',
    dir + ': أيقونة SVG مُسجَّلة في manifest');
  check((manifest.icons || []).some(i => i.src === 'icons/icon-192.png') &&
        (manifest.icons || []).some(i => i.src === 'icons/icon-512.png'),
    dir + ': أيقونات PNG احتُفظت بها لتوافق التثبيت');
  const html = read('renderer/' + dir + '/index.html');
  check(has(html, '<link rel="icon" href="icons/icon.svg" type="image/svg+xml">'),
    dir + ': صفحة HTML تشير إلى أيقونة SVG');
  const sw = read('renderer/' + dir + '/sw.js');
  check(has(sw, "'icons/icon.svg'"), dir + ': Service Worker يخزّن أيقونة SVG');
}
check(has(read('renderer/phone-scanner/sw.js'), "zmt-scanner-v4"), 'تم رفع إصدار كاش ماسح القراءة فقط');
check(has(read('renderer/phone-sales/sw.js'), "zmt-psale-v3"), 'تم رفع إصدار كاش ماسح البيع');

// ---------------------------------------------------------------------------
console.log('\n========================================');
console.log(fail === 0 ? 'PHONE SCANNER VERIFY PASSED (' + pass + ')' : 'PHONE SCANNER VERIFY FAILED: ' + fail);
console.log('========================================');
process.exit(fail ? 1 : 0);
