// ============================================================
// ZMT PIECE — display settings (إعدادات العرض) static checks
// Run: node renderer/tests/display-settings-verify.js
// Guards the top-bar display button + panel: index.html wiring,
// the eight CSS variables and their hooks, the module's ranges /
// clamping / dirty-state contract, the four-language labels and
// the fact that nothing here can ever touch the database.
// ============================================================
const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', '..') + path.sep;
let fails = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const has = (s, needle) => s.indexOf(needle) !== -1;
const count = (s, re) => (s.match(re) || []).length;

console.log('============================================');
console.log('اختبار إعدادات العرض — الفحص الثابت');
console.log('============================================');

const indexHtml = read('renderer/index.html');
const css = read('renderer/css/main.css');
const js = read('renderer/js/display-settings.js');
const appJs = read('renderer/js/app.js');
const pkg = JSON.parse(read('package.json'));
const notes = read('release-notes.md');

// ---------- 1. files & wiring ----------
console.log('\n--- 1. الملفات والربط ---');
fs.existsSync(path.join(base, 'renderer/js/display-settings.js')) ? ok('renderer/js/display-settings.js') : bad('display-settings.js مفقود');
has(indexHtml, 'js/display-settings.js') ? ok('السكربت مرتبط في index.html') : bad('js/display-settings.js غير مرتبط');
{
  // التحميل المزدوج كان ينشئ لوحتين ويربط النقر مرتين: النقرة الواحدة تفتح ثم تغلق فوراً.
  const dsLoads = (indexHtml.match(/src="js\/display-settings\.js"/g) || []).length;
  dsLoads === 1 ? ok('يُحمَّل مرة واحدة فقط (بدون ازدواج)') : bad('يُحمَّل ' + dsLoads + ' مرات — النقر سيفتح ثم يغلق فوراً');
  const iDs = indexHtml.indexOf('js/display-settings.js');
  const iApp = indexHtml.indexOf('js/app.js');
  (iDs > 0 && iApp > iDs) ? ok('يُحمَّل قبل app.js (تطبيق القيم قبل الرسم)') : bad('ترتيب السكربتات غير صحيح');
}
has(indexHtml, 'id="btnDisplaySettings"') ? ok('زر شريط العنوان btnDisplaySettings') : bad('زر إعدادات العرض مفقود');
has(indexHtml, 'class="tb-btn tb-ds"') ? ok('الزر يستعمل صنف tb-ds') : bad('صنف tb-ds مفقود');
has(indexHtml, 'class="tb-ds-dot"') ? ok('نقطة التخصيص موجودة') : bad('نقطة التخصيص مفقودة');
has(indexHtml, 'id="btnDisplaySettings" title="إعدادات العرض"') ? ok('تلميح الزر الافتراضي') : bad('تلميح الزر مفقود');
{
  const iBtn = indexHtml.indexOf('id="btnDisplaySettings"');
  const seg = indexHtml.slice(iBtn, indexHtml.indexOf('</button>', iBtn));
  (seg.indexOf('<svg') !== -1 && count(seg, /<circle /g) === 3) ? ok('أيقونة SVG مضمّنة (3 مؤشرات)') : bad('أيقونة SVG غير مطابقة');
}
(indexHtml.indexOf('btnDisplaySettings') < indexHtml.indexOf('id="btnLang"')) ? ok('الزر قبل زر اللغة') : bad('موضع الزر غير متوقع');

// ---------- 2. CSS variables & hooks ----------
console.log('\n--- 2. متغيّرات CSS ---');
const vars = [
  ['--sales-card-min', '240px'],
  ['--inv-card-min', '260px'],
  ['--sales-card-h', 'auto'],
  ['--inv-card-h', 'auto'],
  ['--sidebar-width', '240px'],
  ['--sales-name-size', '13px'],
  ['--prod-name-size', '16px'],
  ['--sales-cart-width', '420px'],
];
const rootSeg = css.slice(css.indexOf(':root {'), css.indexOf('/* Western digits'));
for (const [name, def] of vars) {
  new RegExp(name.replace(/-/g, '\\-') + ':\\s*' + def + ';').test(rootSeg)
    ? ok(name + ' = ' + def + ' في :root')
    : bad(name + ' غير معرّف بالقيمة ' + def);
}
has(css, 'minmax(var(--inv-card-min, 260px),1fr)') ? ok('.prod-grid يستعمل --inv-card-min (مع قيمة احتياطية)') : bad('.prod-grid لا يستعمل المتغيّر');
has(css, 'minmax(var(--sales-card-min, 240px), 1fr)') ? ok('.sales-product-grid يستعمل --sales-card-min') : bad('.sales-product-grid لا يستعمل المتغيّر');
has(css, '.sales-product-grid:not(.sales-list-view) > .prod-card') && has(css, 'height: var(--sales-card-h);') ? ok('ارتفاع بطاقات البيع للشبكة فقط') : bad('قاعدة ارتفاع بطاقات البيع مفقودة');
has(css, '.prod-grid:not(.inv-list-view) > .prod-card') && has(css, 'height: var(--inv-card-h);') ? ok('ارتفاع بطاقات المخزون للشبكة فقط') : bad('قاعدة ارتفاع بطاقات المخزون مفقودة');
count(css, /overflow-y: auto;/g) >= 2 ? ok('البطاقات ذات الارتفاع الثابت تُمرَّر داخلياً') : bad('لا يوجد تمرير داخلي للبطاقات');
has(css, '.sales-product-grid .prod-card-title { font-size: var(--sales-name-size, 13px); }') ? ok('خط أسماء بطاقات البيع مستقل') : bad('تجاوز خط بطاقات البيع مفقود');
has(css, 'grid-template-columns: 1fr minmax(300px, var(--sales-cart-width))') ? ok('.sales-layout يستعمل --sales-cart-width') : bad('عرض السلة غير مربوط بالمتغيّر');
has(css, 'grid-template-columns: 1fr !important;') ? ok('الشاشات الضيقة تفرد عموداً واحداً') : bad('قاعدة الشاشات الضيقة مفقودة');
count(css, /\.prod-card-title \{ font-size:var\(--prod-name-size, 16px\);/g) === 2 ? ok('قاعدتا .prod-card-title تستعملان --prod-name-size') : bad('عدد قواعد .prod-card-title غير متوقع');
has(css, 'width: var(--sidebar-width);') ? ok('القائمة الجانبية تستعمل --sidebar-width') : bad('عرض القائمة الجانبية غير مربوط');
has(css, '.app-container.sidebar-slim .sidebar { width: 60px; }') ? ok('الوضع المدمج (60px) ما زال يتقدّم') : bad('الوضع المدمج للقائمة تأثّر');

// ---------- 3. panel styles ----------
console.log('\n--- 3. تنسيقات النافذة ---');
for (const cls of ['.ds-overlay', '.ds-modal', '.ds-hint', '.ds-row', '.ds-range', '.ds-num', '.ds-preview-stage', '.ds-pv-card', '.ds-footer', '.ds-status', '.ds-reset', '.ds-save:disabled']) {
  has(css, cls) ? ok('تنسيق ' + cls) : bad('تنسيق ' + cls + ' مفقود');
}
has(css, '.tb-ds.is-custom .tb-ds-dot { display: block; }') ? ok('إظهار نقطة التخصيص') : bad('قاعدة إظهار النقطة مفقودة');
has(css, 'html[data-theme="dark"] .ds-row') ? ok('النافذة تدعم الوضع الليلي') : bad('لا دعم للوضع الليلي');
has(css, '.ds-overlay { background: rgba(15,23,42,.30); z-index: 1200; }') ? ok('خلفية شفافة تُبقي التطبيق مرئيًا') : bad('خلفية النافذة غير مضبوطة');

// ---------- 4. module contract ----------
console.log('\n--- 4. عقد الوحدة (display-settings.js) ---');
has(js, "'zmt_display_settings'") ? ok('مفتاح التخزين zmt_display_settings') : bad('مفتاح التخزين مفقود');
has(js, 'window.DisplaySettings') ? ok('واجهة DisplaySettings مُصدَّرة') : bad('التصدير مفقود');
has(js, 'is-custom') ? ok('تحديث نقطة التخصيص') : bad('تحديث النقطة مفقود');
has(js, "e.key === 'Escape'") ? ok('Esc يغلق النافذة') : bad('معالجة Esc مفقودة');
has(js, 'e.target === overlay') ? ok('النقر على الخلفية يغلق') : bad('معالجة النقر على الخلفية مفقودة');
has(js, 'Discard') || has(js, 'discard any unsaved live preview') ? ok('الإغلاق يرجّع القيم المحفوظة') : bad('لا يوجد رجوع عند الإغلاق');
has(js, 'save.disabled = !dsDirty()') ? ok('زر الحفظ معطّل حتى يوجد تعديل') : bad('تعطيل زر الحفظ مفقود');
has(js, 'localStorage.setItem') ? ok('الكتابة في localStorage عند الحفظ') : bad('كتابة localStorage مفقودة');
{
  const seg = js.slice(js.indexOf('function dsPersist'), js.indexOf('function dsApply'));
  count(seg, /localStorage\.setItem/g) === 1 ? ok('الكتابة في مكان واحد فقط (dsPersist)') : bad('عدد مواضع الكتابة غير متوقع');
}
has(js, 'function dsClamp') ? ok('دالة التقييد موجودة') : bad('دالة التقييد مفقودة');
count(js, /it\.min|it\.max/g) >= 4 ? ok('التقييد يستعمل الحدود الدنيا/العليا') : bad('التقييد غير مطبّق');
has(js, 'catch (e) { /* corrupted value -> factory defaults') ? ok('JSON تالف ⇒ القيم الافتراضية') : bad('معالجة JSON التالف مفقودة');

// ---------- 5. ranges & defaults (cross-file agreement) ----------
console.log('\n--- 5. المديات والقيم الافتراضية ---');
const items = [
  ['salesCard', '--sales-card-min', 140, 420, 240, '240px'],
  ['invCard', '--inv-card-min', 150, 450, 260, '260px'],
  ['salesHeight', '--sales-card-h', 0, 520, 0, 'auto'],
  ['invHeight', '--inv-card-h', 0, 520, 0, 'auto'],
  ['sidebar', '--sidebar-width', 120, 400, 240, '240px'],
  ['salesName', '--sales-name-size', 10, 32, 13, '13px'],
  ['invName', '--prod-name-size', 10, 40, 16, '16px'],
  ['salesCart', '--sales-cart-width', 300, 700, 420, '420px'],
];
for (const [key, cssVar, min, max, def, cssVal] of items) {
  const re = new RegExp("key: '" + key + "',\\s*css: '" + cssVar.replace(/-/g, '\\-') + "',\\s*min: (\\d+),\\s*max: (\\d+),\\s*def: (\\d+)");
  const m = re.exec(js);
  if (!m) { bad('تعريف ' + key + ' غير مطابق'); continue; }
  (Number(m[1]) === min && Number(m[2]) === max && Number(m[3]) === def)
    ? ok(key + ': ' + min + '–' + max + ' (افتراضي ' + def + ')')
    : bad(key + ' نطاق غير متوقع: ' + m.slice(1).join('/'));
  new RegExp(cssVar.replace(/-/g, '\\-') + ':\\s*' + cssVal + ';').test(rootSeg)
    ? ok(key + ': الافتراضي مطابق لقيمة CSS')
    : bad(key + ': الافتراضي لا يطابق CSS');
}
count(js, /key: '/g) === 8 ? ok('ثمانية عناصر تحكم بالضبط') : bad('عدد العناصر ليس 8');
count(js, /zeroAuto: true/g) === 2 ? ok('الارتفاع 0 = تلقائي لمنزلقين') : bad('تعليمة zeroAuto مفقودة');
has(js, "(it.zeroAuto && v === 0) ? 'auto' : v + 'px'") ? ok('dsApply يكتب auto بدل 0px') : bad('dsApply لا يعالج الصفر كقيمة تلقائية');

// ---------- 6. i18n (ar/en/fr/zh) ----------
console.log('\n--- 6. الترجمات الأربع ---');
const dStart = appJs.indexOf('/* ---- Display settings');
const dEnd = appJs.indexOf('\n})();', dStart); // end of the display IIFE only
const dSeg = (dStart >= 0 && dEnd > dStart) ? appJs.slice(dStart, dEnd) : '';
dSeg ? ok('كتلة ترجمات إعدادات العرض موجودة') : bad('كتلة الترجمات مفقودة');
const dKeys = ['title:', 'close:', 'hint:', 'preview:', 'tagSales:', 'tagInv:', 'sample1:', 'sampleMeta1:', 'sample2:', 'sampleMeta2:', 'salesCards:', 'invCards:', 'salesHeight:', 'invHeight:', 'sidebar:', 'salesName:', 'invName:', 'salesCart:', 'px:', 'reset:', 'save:', 'saved:', 'dirty:'];
for (const k of dKeys) {
  const n = count(dSeg, new RegExp('(^|[\\s{,])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
  n === 4 ? ok('المفتاح ' + k + ' في اللغات الأربع') : bad('المفتاح ' + k + ' موجود ' + n + ' مرة (المطلوب 4)');
}
has(appJs, 'window.DisplaySettings.refreshLabels') ? ok('refreshLabels مربوط بتغيير اللغة') : bad('ربط اللغة مفقود');
has(js, 'function refreshLabels()') && has(js, 'window.DisplaySettings = {') ? ok('refreshLabels مكشوف للخارج') : bad('refreshLabels غير مكشوف');
has(js, "display.saved") && has(js, "display.dirty") ? ok('رسائل الحالة مترجمة') : bad('رسائل الحالة غير مترجمة');
has(js, "T('display.title', 'إعدادات العرض')") ? ok('نص احتياطي عربي إن غابت الترجمة') : bad('لا يوجد نص احتياطي');

// ---------- 7. isolation from data ----------
console.log('\n--- 7. العزل عن البيانات ---');
const dbHits = ['DB.', 'db.save', 'Auth.', 'CloudService', 'lanService', 'fetch(', 'ipcRenderer'];
const found = dbHits.filter((t) => has(js, t));
found.length === 0 ? ok('لا استدعاء لأي قاعدة بيانات/شبكة/IPC') : bad('الوحدة تلمس: ' + found.join(', '));
count(js, /localStorage\.(getItem|setItem|removeItem)/g) === 2 ? ok('localStorage مقروء/مكتوب فقط (مفتاح واحد)') : bad('استعمال localStorage غير متوقع');
has(js, 'document.documentElement') ? ok('التطبيق على :root فقط') : bad('التطبيق ليس على :root');

// ---------- 8. version & notes ----------
console.log('\n--- 8. الإصدار وملاحظات النشر ---');
// Feature verifier: the release version must be a valid semver >= 2.7.0 (the
// release that introduced the feature), and the newest notes section must match
// the current version.
/^\d+\.\d+\.\d+$/.test(pkg.version) && (() => {
  const A = pkg.version.split('.').map(Number), B = [2, 7, 0];
  for (let i = 0; i < 3; i++) { if (A[i] !== B[i]) return A[i] > B[i]; }
  return true;
})() ? ok('الإصدار ' + pkg.version + ' (>= 2.7.0)') : bad('إصدار غير صالح أو أقدم من 2.7.0 (' + pkg.version + ')');
has(notes, 'ZMT PIECE 2.7.0') ? ok('ملاحظات الإصدار 2.7.0 موجودة') : bad('ملاحظات 2.7.0 مفقودة');
notes.trimStart().startsWith('ZMT PIECE ' + pkg.version) ? ok('أحدث قسم في الملاحظات يطابق الإصدار الحالي') : bad('ترتيب الملاحظات غير صحيح');
has(notes, 'إعدادات العرض') ? ok('الملاحظات تشرح الميزة') : bad('شرح الميزة مفقود');

console.log('\n============================================');
console.log((fails === 0 ? 'كل الفحوص نجحت' : 'فشل ' + fails + ' فحص') + ' — fail=' + fails);
console.log('============================================');
process.exit(fails === 0 ? 0 : 1);
