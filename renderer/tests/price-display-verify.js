// ============================================================
// ZMT PIECE — price display (شاشة عرض السعر) static checks
// Run: node renderer/tests/price-display-verify.js
// Guards the kiosk feature: page/CSS/JS wiring, auth permission row,
// phone-scanner bridge, settings tab, main-process IPC + preload,
// auto-login boot path, and pd.* i18n coverage in ar/en/fr/zh.
// ============================================================
const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', '..') + path.sep;
let fails = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const has = (s, needle) => s.indexOf(needle) !== -1;

console.log('============================================');
console.log('اختبار price-display — فحص شاشة عرض السعر الثابت');
console.log('============================================');

// ---------- 1. files exist ----------
console.log('\n--- 1. الملفات ---');
const pdFiles = [
  'renderer/pages/price-display.html',
  'renderer/css/price-display.css',
  'renderer/js/pages/price-display.js',
  'renderer/tests/price-display-verify.js',
];
for (const f of pdFiles) {
  fs.existsSync(path.join(base, f)) ? ok(f) : bad(f + ' مفقود');
}
const pdHtml = read('renderer/pages/price-display.html');
const pdCss = read('renderer/css/price-display.css');
const pdJs = read('renderer/js/pages/price-display.js');
const connHtml = read('renderer/pages/connection.html');
const connJs = read('renderer/js/pages/connection.js');
const indexHtml = read('renderer/index.html');
const appJs = read('renderer/js/app.js');
const authJs = read('renderer/js/auth.js');
const mainJs = read('main.js');
const preJs = read('preload.js');

// ---------- 2. index.html wiring ----------
console.log('\n--- 2. index.html ---');
has(indexHtml, 'css/price-display.css') ? ok('رابط price-display.css') : bad('css/price-display.css غير مرتبط');
has(indexHtml, 'data-page="price-display"') ? ok('عنصر القائمة price-display') : bad('لا يوجد nav item لـ price-display');
has(indexHtml, 'data-i18n="nav.priceDisplay"') ? ok('مفتاح ترجمة nav.priceDisplay') : bad('nav.priceDisplay مفقود من القائمة');
{
  const navCount = (indexHtml.match(/data-page="price-display"/g) || []).length;
  navCount === 1 ? ok('صفحة القائمة تُعلن مرة واحدة') : bad('price-display يُعلن ' + navCount + ' مرات');
}

// ---------- 3. auth permission row ----------
console.log('\n--- 3. الصلاحيات (auth.js) ---');
{
  const i = authJs.indexOf('DEFAULT_PAGES');
  const seg = i >= 0 ? authJs.slice(i, authJs.indexOf('};', i)) : '';
  has(seg, "'price-display'") ? ok('DEFAULT_PAGES يحوي price-display') : bad('DEFAULT_PAGES بلا price-display');
  const j = authJs.indexOf('PAGE_NAMES');
  const seg2 = j >= 0 ? authJs.slice(j, authJs.indexOf('};', j)) : '';
  has(seg2, "'price-display'") ? ok('PAGE_NAMES يحوي price-display') : bad('PAGE_NAMES بلا price-display');
  has(authJs, 'verifyLocalPassword') ? ok('verifyLocalPassword متاح للقفل') : bad('verifyLocalPassword مفقود');
  has(authJs, 'loginAsUser') ? ok('loginAsUser متاح للدخول التلقائي') : bad('loginAsUser مفقود');
  has(authJs, 'getStoreName') ? ok('getStoreName متاح لاسم المحل') : bad('getStoreName مفقود');
}
{
  const grid = read('renderer/js/pages/settings.js');
  has(grid, 'DEFAULT_PAGES') ? ok('شبكة الصلاحيات تبني صفوفها من DEFAULT_PAGES') : bad('settingsBuildPermissionsGrid لا تستخدم DEFAULT_PAGES');
}

// ---------- 4. price-display.html structure ----------
console.log('\n--- 4. بنية الصفحة ---');
const requiredIds = [
  'pdStage', 'pdHeader', 'pdLogo', 'pdStoreName', 'pdLockBtn',
  'pdVideoWrap', 'pdVideo', 'pdVideoEmpty',
  'pdPriceLayer', 'pdProdName', 'pdPrice', 'pdMiss', 'pdPriceLogo', 'pdPriceStore',
  'pdFooter', 'pdTicker', 'pdTickerTrack', 'pdTickerPhone', 'pdTickerMail',
  'pdScannerField', 'pdLockVeil', 'pdLockInput', 'pdLockStatus',
  'pdLockOk', 'pdLockCancel', 'pdLockClose',
];
for (const id of requiredIds) {
  has(pdHtml, 'id="' + id + '"') ? ok('#' + id) : bad('#' + id + ' مفقود من price-display.html');
}
has(pdHtml, 'class="pd-stage"') && !has(pdHtml, 'class="page"') && !has(pdHtml, 'page pd-stage')
  ? ok('.pd-stage بلا كلاس page (لا يكسر position:fixed)')
  : bad('.pd-stage يحمل كلاس page');
has(pdHtml, '../assets/logo.png') ? ok('شعار البرنامج في الشريط') : bad('شعار البرنامج مفقود من الشريط');
has(pdHtml, 'ZMT SOFTWARE') ? ok('اسم الشركة في الشريط') : bad('اسم الشركة مفقود');
has(pdHtml, 'data-i18n="pd.noVideos"') && has(pdHtml, 'data-i18n="pd.notFound"')
  ? ok('مفاتيح i18n في الصفحة') : bad('مفاتيح i18n ناقصة في price-display.html');

// ---------- 5. price-display.css contract ----------
console.log('\n--- 5. عقد CSS ---');
const cssNeedles = [
  'body.pd-kiosk .title-bar', 'body.pd-kiosk .sidebar', 'body.pd-kiosk .main-content',
  'body.pd-kiosk .pd-stage', '.pd-stage.has-video .pd-video-empty',
  '.pd-price-layer.show', '.pd-footer', '.pd-ticker-track',
  '.pd-scanner-field', '.pd-lock-veil', '.pd-lock-dialog',
  '.pd-grid', '.pd-field', '.pd-vid-list', '.pd-vid-row', '.pd-icon-btn', '.pd-logo-box',
  '--pd-ticker-ink', '--pd-phone', '--pd-mail', '@keyframes pd-marquee',
];
for (const c of cssNeedles) has(pdCss, c) ? ok(c) : bad(c + ' مفقود من price-display.css');
const pdBanned = ['var(--panel', 'var(--text', 'var(--line'];
{
  const hits = pdBanned.filter(b => has(pdCss, b));
  hits.length ? bad('price-display.css -> ' + hits.join(', ')) : ok('price-display.css بلا متغيرات محظورة');
}
{
  const z = pdCss.match(/--pd-z:\s*(\d+)/);
  const zNum = z ? parseInt(z[1], 10) : 0;
  (zNum >= 8000 && zNum < 9999) ? ok('--pd-z = ' + zNum + ' (بين التطبيق والتراكب الترخيصي)') : bad('--pd-z = ' + zNum);
}

// ---------- 6. price-display.js behaviour ----------
console.log('\n--- 6. منطق الصفحة ---');
has(pdJs, 'window.init_price_display') ? ok('window.init_price_display') : bad('init_price_display غير معرّف');
for (const fn of ['pdScan', 'pdOpenLock', 'pdExitKiosk']) {
  has(pdJs, 'window.' + fn + ' =') ? ok('window.' + fn) : bad('window.' + fn + ' غير مصدَّر');
}
{
  const m = pdJs.match(/PRICE_MS\s*=\s*(\d+)/);
  m && parseInt(m[1], 10) === 3000 ? ok('مدة السعر 3000ms') : bad('PRICE_MS = ' + (m ? m[1] : 'غير معرّف'));
}
{
  const i = pdJs.indexOf('function showPrice');
  const seg = i >= 0 ? pdJs.slice(i, pdJs.indexOf('\n  }', i)) : '';
  has(seg, 'sellPrice') ? ok('السعر المعروض هو sellPrice (التجزئة)') : bad('showPrice لا يستخدم sellPrice');
}
has(pdJs, 'document.body.classList.remove(\'pd-kiosk\')') ? ok('الخروج يزيل pd-kiosk') : bad('الخروج لا يزيل pd-kiosk');
has(pdJs, 'Auth.signOut()') ? ok('الخروج ينهي جلسة الكيوسك') : bad('doExit لا يsignOut');
has(pdJs, 'window.__pdExitBound') ? ok('مستمع Alt+F4 مقيَّد بمرة واحدة') : bad('لا يوجد تقييد لمستمع Alt+F4');
has(pdJs, 'window.pdOpenLock') ? ok('مستمع Alt+F4 يمرّ عبر window.pdOpenLock') : bad('Alt+F4 غير مرتبط بـ window.pdOpenLock');
has(pdJs, 'lastCodeAt') ? ok('مرشّح تكرار المسح') : bad('لا يوجد مرشّح تكرار المسح في pdScan');
has(pdJs, "trackPageListener('keydown'") ? ok('keydown مسجّل عبر trackPageListener') : bad('keydown غير مسجّل عبر trackPageListener');
has(pdJs, "'zmt-phs-scan'") ? ok('يستمع لحدث zmt-phs-scan (مسح الهاتف)') : bad('لا يستمع لـ zmt-phs-scan');
has(pdJs, 'windowSetKiosk(true)') ? ok('يدخل kiosk حقيقي عبر IPC') : bad('لا يستدعي windowSetKiosk(true)');

// ---------- 7. connection.html settings tab ----------
console.log('\n--- 7. تبويب الإعدادات ---');
has(connHtml, 'data-tab="display"') ? ok('زر التبويب') : bad('زر التبويب display مفقود');
has(connHtml, 'id="connTabDisplay"') ? ok('لوحة التبويب connTabDisplay') : bad('لوحة connTabDisplay مفقودة');
has(connHtml, 'connSwitchTab(\'display\')') ? ok('التبديل إلى التبويب') : bad('onclick التبديل مفقود');
const connIds = [
  'pdEnable', 'pdEnableResult', 'pdVideoList', 'pdVideoEmpty', 'pdVideoResult',
  'pdLogoBox', 'pdLogoClearBtn', 'pdLogoResult',
  'pdBg', 'pdPriceColor', 'pdNameColor', 'pdNameSize', 'pdNameSizeVal',
  'pdPriceSize', 'pdPriceSizeVal', 'pdFont',
  'pdTickerOn', 'pdTickerPhone', 'pdTickerMail',
  'pdAutoLogin', 'pdAutoUser', 'pdAutoPass', 'pdAutoLoginResult',
  'pdAutoStart', 'pdAutoStartResult', 'pdPin', 'pdPinResult',
];
for (const id of connIds) {
  has(connHtml, 'id="' + id + '"') ? ok('#' + id) : bad('#' + id + ' مفقود من connection.html');
}

// ---------- 8. connection.js settings logic ----------
console.log('\n--- 8. منطق الإعدادات ---');
has(connJs, 'pdInit();') ? ok('pdInit() داخل init_connection()') : bad('pdInit غير مستدعى في init_connection');
const pdFns = ['pdDefaults', 'pdLoad', 'pdSave', 'pdResult', 'pdFileUrl', 'pdInit',
  'pdSaveEnable', 'pdRenderVideos', 'pdAddVideo', 'pdRemoveVideo', 'pdMoveVideo',
  'pdRenderLogo', 'pdPickLogo', 'pdClearLogo', 'pdSaveLook', 'pdSaveTicker',
  'pdFillAccounts', 'pdSaveAutoLogin', 'pdLoadAutoStart', 'pdSaveAutoStart', 'pdSavePin'];
for (const fn of pdFns) {
  has(connJs, 'function ' + fn + '(') ? ok(fn) : bad(fn + ' غير معرّفة');
}
has(connJs, "'zmt_pd_settings'") ? ok('مفتاح التخزين zmt_pd_settings') : bad('مفتاح التخزين مفقود');
has(connJs, 'pdImportMedia') ? ok('نسخ الوسائط عبر pdImportMedia') : bad('لا يستخدم pdImportMedia');
has(connJs, 'pdRemoveMedia') ? ok('حذف الوسائط عبر pdRemoveMedia') : bad('لا يستخدم pdRemoveMedia');
has(connJs, 'autoLaunchGet') && has(connJs, 'autoLaunchSet') ? ok('بدء التشغيل مع Windows') : bad('auto-launch غير مستخدم');
has(connJs, "Auth.listUsers()") ? ok('قائمة الحسابات من Auth.listUsers') : bad('لا يملأ قائمة الحسابات');

// ---------- 9. app.js: scanner bridge, cleanup, auto login, navigation ----------
console.log('\n--- 9. app.js ---');
{
  const i = appJs.indexOf('PHS_SCANNER_FIELD');
  const seg = i >= 0 ? appJs.slice(i, appJs.indexOf('};', i)) : '';
  has(seg, "'price-display': 'pdScannerField'") ? ok('PHS_SCANNER_FIELD[price-display]') : bad('price-display غير مسجّل في PHS_SCANNER_FIELD');
  has(seg, "'pdScannerField'") ? ok('الحقل المخفي pdScannerField') : bad('pdScannerField مفقود');
}
{
  const i = appJs.indexOf('function cleanupPage');
  const seg = i >= 0 ? appJs.slice(i, appJs.indexOf('\n}', i)) : '';
  has(seg, "'pd-kiosk'") && has(seg, 'windowSetKiosk(false)')
    ? ok('cleanupPage يوقف وضع الكيوسك') : bad('cleanupPage لا يوقف الكيوسك');
}
has(appJs, "'zmt_pd_settings'") ? ok('bootApp يقرأ zmt_pd_settings') : bad('bootApp لا يقرأ zmt_pd_settings');
has(appJs, 'Auth.loginAsUser(') ? ok('bootApp يستدعي loginAsUser') : bad('bootApp لا يستدعي loginAsUser');
has(appJs, 'window.__pdKioskMode = true') ? ok('يضبط __pdKioskMode') : bad('لا يضبط __pdKioskMode');
{
  const i = appJs.indexOf('__pdKioskMode &&');
  const seg = i >= 0 ? appJs.slice(i, i + 300) : '';
  has(seg, 'Auth.canView') ? ok('يحترم canView قبل الدخول') : bad('لا يفحص canView');
  has(seg, "navigateTo('price-display')") ? ok('الإقلاع يفتح price-display مباشرة') : bad('الإقلاع لا يفتح price-display');
}
{
  const i = appJs.indexOf('_pdAutoLoggedIn');
  const seg = i >= 0 ? appJs.slice(i, appJs.indexOf('Check auth state', i)) : '';
  has(seg, "'price-display'") ? ok('يمنح صلاحية عرض price-display لحساب الكيوسك') : bad('لا يمنح صلاحية price-display');
  has(seg, 'licenseGateAfterLogin') ? ok('بوابة الترخيص تُطبَّق بعد الدخول التلقائي') : bad('بوابة الترخيص مهملة في الدخول التلقائي');
}

// ---------- 10. main.js IPC ----------
console.log('\n--- 10. main.js ---');
const mainNeedles = [
  "ipcMain.handle('pd-import-media'",
  "ipcMain.handle('pd-remove-media'",
  "ipcMain.handle('window-set-kiosk'",
  "ipcMain.handle('auto-launch-get'",
  "ipcMain.handle('auto-launch-set'",
  "before-input-event",
  "'pd-exit-request'",
  'let kioskOn',
  'setKiosk',
  'setLoginItemSettings',
  'zmt-pd',
];
for (const n of mainNeedles) has(mainJs, n) ? ok(n) : bad(n + ' مفقود من main.js');
{
  const i = mainJs.indexOf("ipcMain.handle('pd-remove-media'");
  const seg = i >= 0 ? mainJs.slice(i, mainJs.indexOf('\n});', i)) : '';
  has(seg, 'outside_media_dir') ? ok('الحذف محصور داخل مجلد الوسائط') : bad('pd-remove-media بلا تحقق المسار');
}
{
  const i = mainJs.indexOf("ipcMain.handle('pd-import-media'");
  const seg = i >= 0 ? mainJs.slice(i, mainJs.indexOf('\n});', i)) : '';
  has(seg, 'mkdirSync') ? ok('ينشئ مجلد الوسائط قبل النسخ') : bad('pd-import-media لا ينشئ المجلد');
}

// ---------- 11. preload.js ----------
console.log('\n--- 11. preload.js ---');
const preNeedles = ['pdImportMedia', 'pdRemoveMedia', 'windowSetKiosk', 'autoLaunchGet', 'autoLaunchSet', 'onPdExitRequest'];
for (const n of preNeedles) has(preJs, n) ? ok(n) : bad(n + ' مفقود من preload.js');

// ---------- 12. i18n coverage (pd.* + nav.priceDisplay × 4) ----------
console.log('\n--- 12. تغطية الترجمة ---');
const langStarts = [];
const reLang = /\n  (ar|en|fr|zh): \{/g;
let ml;
while ((ml = reLang.exec(appJs)) !== null) langStarts.push([ml[1], ml.index]);
const langBlocks = {};
for (let i = 0; i < langStarts.length; i++) {
  const end = i + 1 < langStarts.length ? langStarts[i + 1][1] : appJs.length;
  langBlocks[langStarts[i][0]] = appJs.slice(langStarts[i][1], end);
}
const langs = ['ar', 'en', 'fr', 'zh'];
function pdSegment(L) {
  const body = langBlocks[L] || '';
  const s2 = body.indexOf('    pd: {');
  if (s2 === -1) return '';
  const e2 = body.indexOf('\n    },', s2);
  return e2 === -1 ? '' : body.slice(s2, e2);
}
function pdKeySet(L) {
  const seg = pdSegment(L);
  const keys = [];
  const re = /^\s*([A-Za-z0-9_]+)\s*:/gm;
  let m2;
  while ((m2 = re.exec(seg)) !== null) keys.push(m2[1]);
  return keys;
}
const refKeys = pdKeySet('ar');
if (!refKeys.length) bad('كتلة pd في اللغة العربية فارغة');
for (const L of langs) {
  const keys = pdKeySet(L);
  if (!keys.length) { bad('كتلة pd مفقودة في ' + L); continue; }
  const missing = refKeys.filter(k => keys.indexOf(k) === -1);
  const extra = keys.filter(k => refKeys.indexOf(k) === -1);
  missing.length || extra.length
    ? bad(L + ' — ناقص: [' + missing.join(',') + '] زائد: [' + extra.join(',') + ']')
    : ok(L + ' — ' + keys.length + ' مفتاح مطابق للعربية');
}
{
  const referenced = new Set();
  for (const [f, src] of [['connection.html', connHtml], ['price-display.html', pdHtml], ['connection.js', connJs], ['price-display.js', pdJs]]) {
    let m3;
    const reA = /t\(\s*'(pd\.[A-Za-z0-9_]+)'/g;
    while ((m3 = reA.exec(src)) !== null) referenced.add(m3[1]);
    const reB = /data-i18n="(pd\.[A-Za-z0-9_]+)"/g;
    while ((m3 = reB.exec(src)) !== null) referenced.add(m3[1]);
    const reC = /data-i18n-placeholder="(pd\.[A-Za-z0-9_]+)"/g;
    while ((m3 = reC.exec(src)) !== null) referenced.add(m3[1]);
  }
  const missingAll = [];
  for (const k of referenced) {
    const short = k.split('.').slice(1).join('.');
    for (const L of langs) if (pdKeySet(L).indexOf(short) === -1) missingAll.push(k + ' @' + L);
  }
  missingAll.length ? bad('مفاتيح ناقصة: ' + missingAll.join('; ')) : ok(referenced.size + ' مفتاح pd مستخدم متوفر في 4 لغات');
}
for (const L of langs) {
  const body = langBlocks[L] || '';
  const i = body.indexOf('nav: {');
  const seg = i === -1 ? '' : body.slice(i, i + 3000);
  has(seg, "priceDisplay: '") ? ok('nav.priceDisplay @' + L) : bad('nav.priceDisplay مفقود في ' + L);
}

// ---------- 13. JS getElementById ids exist in the matching HTML ----------
console.log('\n--- 13. المعرّفات ---');
function idsIn(src) {
  const out = new Set();
  let m4;
  const re = /id="([^"]+)"/g;
  while ((m4 = re.exec(src)) !== null) out.add(m4[1]);
  return out;
}
function idsUsed(src) {
  const out = new Set();
  let m4;
  const re = /getElementById\(\s*'([^']+)'/g;
  while ((m4 = re.exec(src)) !== null) out.add(m4[1]);
  return out;
}
{
  const have = idsIn(pdHtml);
  const miss = [...idsUsed(pdJs)].filter(id => !have.has(id));
  miss.length ? bad('price-display.js يستخدم معرّفات غائبة: ' + miss.join(', ')) : ok('كل معرّفات price-display.js موجودة في HTML');
}
{
  const have = idsIn(connHtml);
  const miss = [...idsUsed(connJs)].filter(id => id.indexOf('pd') === 0 && !have.has(id));
  miss.length ? bad('connection.js يستخدم معرّفات pd غائبة: ' + miss.join(', ')) : ok('كل معرّفات connection.js pd موجودة في HTML');
}

// ---------- 14. inline handlers are defined ----------
console.log('\n--- 14. معالجات الأزرار ---');
{
  const handlers = new Set();
  let m5;
  const re = /on(?:click|change|input)="([a-zA-Z_$][\w$]*)\(/g;
  const pdHandlersSrc = connHtml + pdHtml;
  while ((m5 = re.exec(pdHandlersSrc)) !== null) handlers.add(m5[1]);
  const defs = connJs + pdJs + appJs;
  const undef = [...handlers].filter(fn => !new RegExp('function\\s+' + fn + '\\s*\\(|window\\.' + fn + '\\s*=').test(defs));
  undef.length ? bad('دوال غير معرّفة: ' + undef.join(', ')) : ok([...handlers].length + ' معالج معرّف');
  const pdOnly = [...handlers].filter(fn => fn.indexOf('pd') === 0);
  pdOnly.length ? ok('معالجة pd: ' + pdOnly.join(', ')) : bad('لا توجد معالجات pd');
}

console.log('\n============================================');
console.log(fails === 0 ? 'نجح: كل فحوصات شاشة عرض السعر' : 'فشل: ' + fails + ' فحصًا');
console.log('============================================');
process.exit(fails ? 1 : 0);
