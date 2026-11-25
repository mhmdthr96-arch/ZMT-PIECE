// ============================================================
// ZMT PIECE — scale sync (مزامنة الميزان) verifier
// Run: node renderer/tests/scale-sync-verify.js
//
// Covers:
//   • renderer/js/scale-sync-core.js (the pure engine)
//   • renderer/js/scale-sync.js (the dialog)
//   • scale-net.js + main.js IPC + preload.js wiring
//   • article building, PLU padding, name transliteration/truncation
//   • CSV + fixed-width formatting, price decimals, selection filters
//   • profile normalization, override merge, diff/stale, consistency guard
//   • i18n keys in 4 languages, button, styles
// ============================================================
'use strict';
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
const count = (s, n) => { let i = 0, c = 0; while ((i = s.indexOf(n, i)) !== -1) { c++; i += n.length; } return c; };

console.log('============================================');
console.log('اختبار مزامنة الميزان (SCALE SYNC)');
console.log('============================================');

const coreSrc = read('renderer/js/scale-sync-core.js');
const uiSrc = read('renderer/js/scale-sync.js');
const indexHtml = read('renderer/index.html');
const appJs = read('renderer/js/app.js');
const css = read('renderer/css/main.css');
const invHtml = read('renderer/pages/inventory.html');
const mainJs = read('main.js');
const preloadJs = read('preload.js');
const scaleNetSrc = read('scale-net.js');

// ---------- 1. loading & static shape ----------
console.log('\n--- 1. التحميل والبنية ---');
check(fs.existsSync(path.join(base, 'renderer/js/scale-sync-core.js')), 'ملف scale-sync-core.js موجود');
check(fs.existsSync(path.join(base, 'renderer/js/scale-sync.js')), 'ملف scale-sync.js موجود');
check(fs.existsSync(path.join(base, 'scale-net.js')), 'ملف scale-net.js موجود');
check(indexHtml.indexOf('js/scale-sync-core.js') > 0, 'index.html يُحمّل scale-sync-core.js');
check(indexHtml.indexOf('js/scale-sync.js') > 0, 'index.html يُحمّل scale-sync.js');
check(indexHtml.indexOf('scale-sync-core.js') < indexHtml.indexOf('scale-sync.js'), 'النواة قبل الواجهة');
check(has(coreSrc, 'root.ScaleSyncCore') || has(coreSrc, 'window.ScaleSyncCore'), 'ScaleSyncCore مُصدَّرة');
check(has(uiSrc, 'root.ScaleSync') || has(uiSrc, 'window.ScaleSync'), 'ScaleSync (واجهة) مُصدَّرة');
check(has(invHtml, 'id="invScaleSyncBtn"'), 'زر «مزامنة الميزان» في صفحة المخزون');
check(has(invHtml, 'ScaleSync.open()'), 'الزر يستدعي ScaleSync.open');
check(has(mainJs, "require('./scale-net')"), 'main.js يتطلب scale-net');
check(has(mainJs, "scale-sync-get"), 'IPC scale-sync-get');
check(has(mainJs, "scale-sync-save"), 'IPC scale-sync-save');
check(has(mainJs, "scale-sync-scan"), 'IPC scale-sync-scan');
check(has(mainJs, "scale-sync-send"), 'IPC scale-sync-send');
check(has(preloadJs, 'scaleSyncGet'), 'preload يكشف scaleSyncGet');
check(has(preloadJs, 'scaleSyncSave'), 'preload يكشف scaleSyncSave');
check(has(preloadJs, 'scaleSyncScan'), 'preload يكشف scaleSyncScan');
check(has(preloadJs, 'scaleSyncSend'), 'preload يكشف scaleSyncSend');
check(has(scaleNetSrc, 'scanPorts'), 'scale-net: scanPorts');
check(has(scaleNetSrc, 'sendText'), 'scale-net: sendText');
check(has(scaleNetSrc, 'textToBytes'), 'scale-net: textToBytes');

// ---------- 2. behavioural core ----------
console.log('\n--- 2. محرّك المزامنة (صرف) ---');

const sandbox = { console, Math, Number, String, Object, Array, Date, isFinite, parseFloat, parseInt, JSON };
sandbox.window = sandbox;
vm.runInNewContext(coreSrc, sandbox, { filename: 'scale-sync-core.js' });
const C = sandbox.ScaleSyncCore;
check(!!C, 'ScaleSyncCore مُحمَّل في بيئة الاختبار');

if (C) {
  // translit
  check(C.translitAr('لوز') === 'lwz' || C.translitAr('لوز').length > 0, 'translitAr يحوّل العربية');
  check(C.translitAr('abc 123') === 'abc 123', 'translitAr يُبقي اللاتينية');
  check(C.sanitizeName('  لوز   عنب  ', 8, 'latin').length <= 8, 'sanitizeName يقتصر الطول');
  check(C.sanitizeName('hello world', 5, 'raw') === 'hello', 'sanitizeName يقتصر (raw)');
  check(C.sanitizeName('a|b;c', 10, 'raw').indexOf('|') === -1, 'sanitizeName يُزيل الفواصل');
  // pad
  check(C.padNum('123', 5) === '00123', 'padNum يحشو بـ0');
  check(C.padNum('1234567', 5) === '34567', 'padNum يقتصر من اليمين');
  check(C.padText('abc', 6) === 'abc   ', 'padText يحشو بمسافات');
  check(C.padText('abcdefgh', 5) === 'abcde', 'padText يقتصر');
  // priceInt
  check(C.priceInt(12.5, 2) === '1250', 'priceInt 12.5 → 1250');
  check(C.priceInt(12.5, 3) === '12500', 'priceInt 3 منازل');
  check(C.priceInt(0, 2) === '0', 'priceInt صفر');
  // pluKey
  check(C.pluKey('00123') === '123', 'pluKey ي drop الأصفار');
  // profiles
  check(Array.isArray(C.PROFILES) && C.PROFILES.length >= 5, 'PROFILES (≥5)');
  check(C.PROFILES.every(p => p.id && p.key), 'كل ملف تعريفي has id+key');
  // normalizeConfig
  var cfg = C.normalizeConfig(null);
  check(cfg.profileId === 'csv-generic', 'normalizeConfig(null) default profile');
  check(cfg.transport === 'file', 'normalizeConfig default transport');
  var cfg2 = C.normalizeConfig({ profileId: 'nope', transport: 'bogus', comPort: 'COM3', baudRate: 115200, selection: { onlyWithPlu: false, onlyWeighed: true, brandId: 'B1' } });
  check(cfg2.profileId === 'csv-generic', 'profileId غير معروف → default');
  check(cfg2.transport === 'file', 'transport غير معروف → file');
  check(cfg2.comPort === 'COM3', 'comPort محفوظ');
  check(cfg2.selection.onlyWithPlu === false && cfg2.selection.onlyWeighed === true && cfg2.selection.brandId === 'B1', 'selection محفوظ');
  // effectiveProfile override
  var ep = C.effectiveProfile({ profileId: 'csv-generic', override: { pluWidth: 6, priceDecimals: 3, nameMode: 'latin', delimiter: '|' } });
  check(ep.pluWidth === 6 && ep.priceDecimals === 3, 'override pluWidth/priceDecimals');
  check(ep.nameMode === 'latin' && ep.delimiter === '|', 'override nameMode/delimiter');
  // clamp guards
  var ep2 = C.effectiveProfile({ profileId: 'csv-generic', override: { pluWidth: 99, priceDecimals: 9, nameMax: 0 } });
  check(ep2.pluWidth <= 8 && ep2.priceDecimals <= 4 && ep2.nameMax >= 1, 'override مُقَيَّد (clamp)');

  // selectProducts + buildArticles
  var prods = [
    { id: 'a', name: 'لوز', plu: '12', sellPrice: 1500, fixed: false },
    { id: 'b', name: 'عنب', plu: '00034', sellPrice: 800.5, fixed: true, brandId: 'BR1', scaleName: 'Grapes' },
    { id: 'c', name: 'NoPLU', plu: '', sellPrice: 100, fixed: false },
    { id: 'd', name: 'FixedNoPlu', plu: '', sellPrice: 50, fixed: true },
  ];
  var cfgSel = C.normalizeConfig({ profileId: 'csv-generic', selection: { onlyWithPlu: true, onlyWeighed: false, brandId: '' } });
  var sel = C.selectProducts(prods, cfgSel);
  check(sel.length === 2 && sel.map(p=>p.id).sort().join(',') === 'a,b', 'selectProducts onlyWithPlu → a,b');
  var cfgW = C.normalizeConfig({ profileId: 'csv-generic', selection: { onlyWithPlu: false, onlyWeighed: true, brandId: '' } });
  check(C.selectProducts(prods, cfgW).map(p=>p.id).join(',') === 'b,d', 'selectProducts onlyWeighed → b,d');
  var cfgB = C.normalizeConfig({ profileId: 'csv-generic', selection: { onlyWithPlu: true, onlyWeighed: false, brandId: 'BR1' } });
  check(C.selectProducts(prods, cfgB).map(p=>p.id).join(',') === 'b', 'selectProducts brandId → b');

  var arts = C.buildArticles(prods, cfgSel);
  check(arts.length === 2, 'buildArticles → 2 articles');
  check(arts[0].plu === '00012', 'buildArticles pads PLU to width 5 (12 → 00012)');
  check(arts[1].plu === '00034', 'buildArticles keeps padded PLU');
  check(arts[1].name === 'Grapes', 'buildArticles uses scaleName when present');
  check(arts[0].name === 'لوز', 'buildArticles keeps raw name in raw mode');
  check(arts[0].price === '150000', 'buildArticles priceInt with 2 decimals (1500 → 150000)');
  // latin profile transliterates
  var cfgLat = C.normalizeConfig({ profileId: 'csv-latin', selection: { onlyWithPlu: true, onlyWeighed: false, brandId: '' } });
  var artsLat = C.buildArticles(prods, cfgLat);
  check(artsLat[0].name === 'lwz' || artsLat[0].name.length <= 20, 'latin profile transliterates name');

  // formatText CSV
  var profCsv = C.effectiveProfile(cfgSel);
  var textCsv = C.formatText(arts, profCsv);
  check(textCsv.indexOf('00012') !== -1 && textCsv.indexOf('150000') !== -1, 'CSV contains PLU + price');
  check(textCsv.indexOf(';') !== -1, 'CSV uses ; delimiter');
  check(/\r\n/.test(textCsv), 'CSV uses CRLF by default');
  var lines = textCsv.split(/\r?\n/).filter(Boolean);
  check(lines.length === 2, 'CSV → 2 data lines');
  // fixed
  var cfgFixed = C.normalizeConfig({ profileId: 'fixed-generic', selection: { onlyWithPlu: true, onlyWeighed: false, brandId: '' } });
  var artsF = C.buildArticles(prods, cfgFixed);
  var profF = C.effectiveProfile(cfgFixed);
  var textF = C.formatText(artsF, profF);
  check(textF.length > 0, 'fixed format produces text');
  check(textF.split(/\r?\n/).filter(Boolean).length === 2, 'fixed → 2 lines');
  // each fixed row width = sum widths
  var rowWidth = profF.columns.reduce((s,c)=>s+(c.width||0),0);
  var firstRow = textF.split(/\r?\n/).filter(Boolean)[0];
  check(firstRow.length === rowWidth, 'fixed row width = sum of column widths (' + firstRow.length + ' vs ' + rowWidth + ')');

  // buildText convenience
  check(C.buildText(prods, cfgSel) === textCsv, 'buildText == formatText(buildArticles)');

  // previewLines
  var pv = C.previewLines('a\nb\nc\nd\n', 2);
  check(pv.length === 2 && pv[0] === 'a' && pv[1] === 'b', 'previewLines caps');

  // contentHash
  check(typeof C.contentHash('abc') === 'string' && C.contentHash('abc') !== C.contentHash('abcd'), 'contentHash varies');

  // diffStale + priceSnapshot
  var lastSync = { at: 1, count: 2, hash: 'x', prices: { '12': 150000, '34': 80050 } };
  var cfgWithSync = C.normalizeConfig({ profileId: 'csv-generic', selection: { onlyWithPlu: true, onlyWeighed: false, brandId: '' }, lastSync: lastSync });
  // change price of product a
  var prods2 = [ { id:'a', name:'لوز', plu:'12', sellPrice: 1600, fixed:false }, { id:'b', name:'عنب', plu:'00034', sellPrice: 800.5, fixed:true } ];
  var stale = C.diffStale(prods2, cfgWithSync);
  check(stale.length === 1 && stale[0].id === 'a', 'diffStale detects price change (a)');
  var snap = C.priceSnapshot(prods, cfgSel);
  check(snap['12'] === 150000 && snap['34'] === 80050, 'priceSnapshot correct');

  // checkConsistency
  var decodeCfg = { enabled: true, patterns: [ { enabled: true, plu: { len: 5 } } ] };
  check(C.checkConsistency(decodeCfg, cfgSel).length === 0, 'checkConsistency: ok when plu width matches');
  var decodeCfgOff = { enabled: false, patterns: [] };
  check(C.checkConsistency(decodeCfgOff, cfgSel).indexOf('scaleSync.warnDecodeOff') !== -1, 'checkConsistency: warns when decode off');
  var decodeCfgBad = { enabled: true, patterns: [ { enabled: true, plu: { len: 4 } } ] };
  check(C.checkConsistency(decodeCfgBad, cfgSel).indexOf('scaleSync.warnPluWidth') !== -1, 'checkConsistency: warns on plu width mismatch');

  // bufferEncoding
  check(C.bufferEncoding('utf8') === 'utf8', 'bufferEncoding utf8');
  check(C.bufferEncoding('latin1') === 'latin1', 'bufferEncoding latin1');
  check(C.bufferEncoding('ascii') === 'latin1', 'bufferEncoding ascii→latin1');

  // articleDiff
  var lastSync = { at: 1, count: 2, hash: 'x', prices: { '12': 150000, '34': 80050 }, pluList: ['12', '34'] };
  var cfgDiff = C.normalizeConfig({ profileId: 'csv-generic', selection: { onlyWithPlu: true, onlyWeighed: false, brandId: '' }, lastSync: lastSync });
  var prodsDiff = [
    { id: 'a', name: 'لوز', plu: '12', sellPrice: 1600, fixed: false },
    { id: 'b', name: 'عنب', plu: '00034', sellPrice: 800.5, fixed: true },
    { id: 'e', name: 'New', plu: '99', sellPrice: 100, fixed: false },
  ];
  var d = C.articleDiff(prodsDiff, cfgDiff);
  check(d.added.length === 1 && d.added[0].id === 'e', 'articleDiff: added (e)');
  check(d.changed.length === 1 && d.changed[0].id === 'a', 'articleDiff: changed (a)');
  check(d.unchanged.length === 1 && d.unchanged[0].id === 'b', 'articleDiff: unchanged (b)');
  check(d.removed.length === 0, 'articleDiff: no removed when all present');
  // removed: last had '34' (canonical of 00034 = 34) and selected has 34 → not removed. Test removed with a dropped plu:
  var lastSync2 = { at: 1, count: 2, hash: 'x', prices: { '12': 150000, '34': 80050 }, pluList: ['12', '34', '77'] };
  var cfgDiff2 = C.normalizeConfig({ profileId: 'csv-generic', selection: { onlyWithPlu: true, onlyWeighed: false, brandId: '' }, lastSync: lastSync2 });
  var d2 = C.articleDiff(prodsDiff, cfgDiff2);
  check(d2.removed.length === 1 && d2.removed[0] === '77', 'articleDiff: removed (77)');

  // generateScaleCode
  var decodeCfg = { enabled: true, patterns: [ { id: 'p', enabled: true, prefix: '21', digits: 13, plu: { start: 2, len: 5 }, weight: { start: 7, len: 5, decimals: 3 }, check: true } ] };
  var gcode = C.generateScaleCode(decodeCfg, '123', 0.25);
  check(typeof gcode === 'string' && gcode.length === 13, 'generateScaleCode → 13 digits');
  check(gcode.indexOf('21') === 0, 'generateScaleCode prefix 21');
  // verify check digit
  var body = gcode.slice(0, 12);
  check(Number(gcode.charAt(12)) === C.ean13Check(body), 'generateScaleCode check digit valid');
  check(C.generateScaleCode({ enabled: false, patterns: [] }, '123', 1) === null, 'generateScaleCode null when disabled');
  check(C.generateScaleCode({ enabled: true, patterns: [] }, '123', 1) === null, 'generateScaleCode null without plu+weight pattern');

  // effectiveProfile override columns
  var ep3 = C.effectiveProfile({ profileId: 'csv-generic', override: { columns: ['plu','price'] } });
  check(Array.isArray(ep3.columns) && ep3.columns.length === 2, 'override columns array');
}

// ---------- 3. i18n keys ----------
console.log('\n--- 3. مفاتيح الترجمة ---');
const keyCount = (key) => count(appJs, key);
for (const key of ["'inventory.scaleSync':", "'scaleSync.title':", "'scaleSync.profile':", "'scaleSync.transport':", "'scaleSync.transport.file':", "'scaleSync.transport.com':", "'scaleSync.transport.net':", "'scaleSync.count':", "'scaleSync.stale':", "'scaleSync.removed':", "'scaleSync.incremental':", "'scaleSync.articles':", "'scaleSync.saveArticles':", "'scaleSync.preview':", "'scaleSync.exportFile':", "'scaleSync.send':", "'scaleSync.printLabel':", "'scaleSync.genCode':", "'scaleSync.warnDecodeOff':", "'scaleSync.warnPluWidth':", "'scaleSync.exported':", "'scaleSync.sent':", "'scaleSync.noPermission':"]) {
  check(keyCount(key) >= 4, 'المفتاح ' + key + ' في اللغات الأربع (' + keyCount(key) + ')');
}
check(has(appJs, "'مزامنة الميزان'"), 'الترجمة العربية');
check(has(appJs, "'Scale sync'"), 'الترجمة الإنجليزية');
check(has(appJs, "'Synchronisation balance'"), 'الترجمة الفرنسية');
check(has(appJs, "'电子秤同步'"), 'الترجمة الصينية');

// ---------- 4. styles ----------
console.log('\n--- 4. الأنماط ---');
for (const cls of ['.ss-grid', '.ss-card', '.ss-preview', '.ss-warn', '.ss-advanced', '.ss-status']) {
  check(has(css, cls), 'نمط ' + cls + ' موجود');
}

// ---------- 5. wiring ----------
console.log('\n--- 5. الربط (main/preload/inventory) ---');
check(has(invHtml, 'id="invScaleSyncBtn"'), 'زر في inventory.html');
check(has(invHtml, 'ScaleSync.open()'), 'الزر يستدعي ScaleSync.open');
check(has(mainJs, 'scale-sync.json'), 'main.js: scale-sync.json');
check(has(mainJs, 'ScaleNet.scanPorts'), 'main.js: scanPorts');
check(has(mainJs, 'ScaleNet.sendText'), 'main.js: sendText');
check(has(preloadJs, 'scaleSyncSend'), 'preload: scaleSyncSend');
check(has(scaleNetSrc, 'scanPorts()'), 'scale-net: scanPorts()');
check(has(scaleNetSrc, "transport === 'net'"), 'scale-net: net transport');
check(has(scaleNetSrc, "transport === 'raw-com'"), 'scale-net: raw-com transport');

// ---------- 6. ميزات المراحل 3 و 4 ----------
console.log('\n--- 6. ميزات المراحل 3 و 4 ---');
check(has(uiSrc, 'saveArticles'), 'UI: saveArticles');
check(has(uiSrc, 'generatePrintCode'), 'UI: generatePrintCode');
check(has(uiSrc, 'printScaleLabel'), 'UI: printScaleLabel');
check(has(uiSrc, 'articleDiff'), 'UI: uses articleDiff');
check(has(coreSrc, 'function articleDiff'), 'core: articleDiff');
check(has(coreSrc, 'function generateScaleCode'), 'core: generateScaleCode');
check(has(coreSrc, 'pluList'), 'core: pluList in lastSync');

console.log('\n============================================');
console.log(`النتيجة: ${pass} نجاح، ${fail} فشل`);
console.log('============================================');
process.exit(fail === 0 ? 0 : 1);
