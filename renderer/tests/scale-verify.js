// ============================================================================
// ZMT PIECE — الميزان: فحص سلوكي دائم
// Run: node renderer/tests/scale-verify.js
//
// يشغّل الوحدات الحقيقية (scale-core.js + db.js + pages/inventory.js) داخل vm
// فوق DOM مصغّر مبني من inventory.html المشحونة نفسها، وبقاموس app.js الحقيقي
// بنفس اللغات الأربع. القواعد المثبَّتة من صاحب المتجر:
//   مبلغ اللاصقة هو المرجع — الكمية مشتقّة منه عند غياب الوزن —
//   تُعرض الكمية على الفاتورة «0.250 كغ» — الأنماط قابلة للضبط بالكامل —
//   معاينة حيّة بلصق كود حقيقي — رمز PLU المجهول يخيّر الكاشير بين سطر حر
//   وربط دائم بالمنتج — المرتجعات تقبل الرمز الموزون والأجهزة الفرعية لا.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { doc, createDoc, parseInto } = require('./dom-lite.js');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (c, m) => c ? ok(m) : bad(m);
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const near = (a, b, m, tol) => check(Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol), m + ' (got ' + a + ', want ' + b + ')');
const section = (name) => console.log('\n=== ' + name + ' ===');

// ============================================================ 0. wiring ======
section('0) التوصيل في الملفات المشحونة');

const indexHtml = read('renderer/index.html');
const inventoryHtml = read('renderer/pages/inventory.html');
const css = read('renderer/css/main.css');
const pkg = JSON.parse(read('package.json'));

(function () {
  const sale = indexHtml.indexOf('js/sale-core.js');
  const scale = indexHtml.indexOf('js/scale-core.js');
  const purchase = indexHtml.indexOf('js/purchase-core.js');
  check(scale !== -1, 'index.html loads js/scale-core.js');
  check(sale !== -1 && scale > sale && purchase > scale,
    'scale-core.js sits between the other pure cores, before any page script');
  check(indexHtml.indexOf('js/db.js') < scale, 'db.js still loads before the page scripts');
}());

check(/id="invScaleBtn"[^>]*onclick="openScaleSettingsModal\(\)"/.test(inventoryHtml.replace(/\s+/g, ' ')) ||
  inventoryHtml.indexOf('id="invScaleBtn"') !== -1, 'inventory.html has the «إعدادات الميزان» button');
check(inventoryHtml.indexOf('onclick="openScaleSettingsModal()"') !== -1, 'the button calls openScaleSettingsModal');
check(inventoryHtml.indexOf('data-i18n="inventory.scaleSettings"') !== -1, 'the button label is translated');
['invPlu', 'invDirectPlu'].forEach(id => check(inventoryHtml.indexOf('id="' + id + '"') !== -1, 'inventory.html has #' + id));
check(inventoryHtml.indexOf('data-i18n="inventory.plu"') !== -1, 'the PLU label is translated');
check(css.indexOf('.plu-chip') !== -1, 'main.css styles the PLU chip');
check(css.indexOf('.scale-row') !== -1 && css.indexOf('.scale-preview') !== -1, 'main.css styles the scale settings modal');

// ============================================================ 1. dictionary ==
section('1) قاموس app.js الحقيقي في اللغات الأربع');

function sliceBalanced(text, start, open, close) {
  let depth = 0, i = start, inStr = null, esc = false, line = false, block = false;
  for (; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new Error('unbalanced ' + open);
}

const appSrc = read('renderer/js/app.js');
const LANG = (function () {
  const decl = appSrc.indexOf('const LANG = {');
  const literal = sliceBalanced(appSrc, appSrc.indexOf('{', decl), '{', '}');
  const patchesStart = appSrc.indexOf('(function patchLANG()');
  const patchesEnd = appSrc.indexOf('const LANG_LABELS');
  check(patchesStart !== -1 && patchesEnd > patchesStart, 'app.js carries the dictionary patch blocks');
  const src = 'var LANG = ' + literal + ';\n' + appSrc.slice(patchesStart, patchesEnd) + '\n__out = LANG;';
  const box = { __out: null, console };
  vm.createContext(box);
  vm.runInContext(src, box, { filename: 'app.js dictionaries' });
  return box.__out;
}());

// Same lookup as app.js:t() — Arabic is the fallback for a missing language.
function dictT(lang, key) {
  const parts = String(key).split('.');
  const dig = (obj) => {
    let v = obj;
    for (const p of parts) {
      if (v && typeof v === 'object') v = v[p];
      else return undefined;
    }
    return v;
  };
  let val = dig(LANG[lang]);
  if (val === undefined || val === '') val = dig(LANG.ar);
  return val;
}
const t = (key) => dictT('ar', key);

const SCALE_KEYS = [
  'scale.settingsTitle', 'scale.hint', 'scale.enable', 'scale.rejectBadCheck', 'scale.preview',
  'scale.previewPlaceholder', 'scale.previewHint', 'scale.previewNoMatch', 'scale.addField',
  'scale.restorePresets', 'scale.restoreConfirm', 'scale.newPattern', 'scale.moduleMissing',
  'scale.fixErrors', 'scale.needPattern', 'scale.fromLabel', 'scale.priceFromCard',
  'scale.checkOk', 'scale.checkBad', 'scale.qty', 'scale.total', 'scale.colPrefix',
  'scale.colDigits', 'scale.colCheck', 'scale.colWeight', 'scale.colUnitPrice', 'scale.colAmount',
  'scale.pos', 'scale.len', 'scale.dec', 'scale.errNoPrefix', 'scale.errRange', 'scale.errOverlap',
  'scale.errPrefix', 'scale.preset21Weight', 'scale.preset22Unit', 'scale.preset23Amount',
  'scale.preset24Count', 'scale.preset2xWeight', 'scale.preset9xWeight', 'scale.preset12Weight',
  'inventory.plu', 'inventory.pluPlaceholder', 'inventory.pluConflict', 'inventory.scaleSettings',
  'inventory.pluReplaceConfirm',
  'sales.scaleTitle', 'sales.scaleQty', 'sales.scalePrice', 'sales.scaleLink',
  'sales.scaleSearchPh', 'sales.scaleLinkHint', 'sales.scaleFree', 'sales.scaleAdd',
  'sales.scaleTag', 'sales.scaleFromLabelTag', 'sales.scaleNeedQty', 'sales.scaleUnknownPlu',
  'sales.scalePick', 'sales.scaleNone', 'sales.scaleQtyBad',
];
(function () {
  const langs = ['ar', 'en', 'fr', 'zh'];
  let missing = [];
  let untranslated = [];
  for (const k of SCALE_KEYS) {
    for (const lang of langs) {
      const v = dictT(lang, k);
      if (!v) missing.push(lang + ':' + k);
    }
    const values = langs.map(lang => dictT(lang, k));
    if (new Set(values).size < 2) untranslated.push(k);
  }
  check(!missing.length, 'every scale key exists in all four languages (' + missing.slice(0, 6).join(', ') + ')');
  check(!untranslated.length, 'no scale key is an Arabic-only copy (' + untranslated.slice(0, 6).join(', ') + ')');
  check(SCALE_KEYS.every(k => !!dictT('ar', k)), SCALE_KEYS.length + ' scale keys resolve through t()');
}());

// Every scale/PLU message the shipped code asks for really exists in the four
// dictionaries — a t() that silently returns '' is how a register goes quiet.
(function () {
  const src = ['renderer/js/scale-core.js', 'renderer/js/pages/sales.js', 'renderer/js/pages/inventory.js',
    'renderer/js/pages/invoices.js'].map(read).join('\n');
  const used = new Set();
  const re = /t\('((?:scale|inventory\.plu|inventory\.scale|sales\.scale)[^']*)'\)/g;
  let m;
  while ((m = re.exec(src))) used.add(m[1]);
  check(used.size >= 40, 'the sweep finds the messages the shipped code asks for (' + used.size + ' of them)');
  const dead = [];
  used.forEach((k) => {
    ['ar', 'en', 'fr', 'zh'].forEach((lang) => { if (!dictT(lang, k)) dead.push(lang + ':' + k); });
  });
  check(!dead.length, 'no scale message is missing from a language (' + dead.slice(0, 8).join(', ') + ')');
  check(used.has('sales.scaleTag'), 'the invoice edit screen\'s weighed-line message is inside the sweep');
}());

// Every scale class the shipped markup emits has a rule in the shipped CSS:
// an unstyled window is how a modal ends up unreadable on the counter.
(function () {
  const src = ['renderer/js/pages/sales.js', 'renderer/js/pages/inventory.js', 'renderer/js/scale-core.js',
    'renderer/pages/inventory.html'].map(read).join('\n');
  const names = new Set();
  const classRe = /class="([^"]*)"/g;
  let m;
  while ((m = classRe.exec(src))) {
    const inner = /scale|plu/.exec(m[1]) ? m[1] : '';
    if (!inner) continue;
    const tok = /\b(scale-[a-z-]+|sc-scale-[a-z-]+|plu-chip)\b/g;
    let t2;
    while ((t2 = tok.exec(inner))) names.add(t2[1]);
  }
  check(names.size >= 25, 'the sweep finds the classes the scale windows use (' + names.size + ' of them)');
  const unstyled = [];
  names.forEach((cls) => {
    if (!new RegExp('\\.' + cls.replace(/-/g, '\\-') + '(?![-\\w])').test(css)) unstyled.push(cls);
  });
  check(!unstyled.length, 'every scale class is styled in main.css (' + unstyled.slice(0, 8).join(', ') + ')');
}());

// ============================================================ 2. ScaleCore ===
section('2) محرك فك الترميز (scale-core.js الحقيقي)');

const ScaleCore = require('../js/scale-core.js');

(function () {
  // A real EAN-13 in-store code: 21 + PLU 00123 + weight 00250 + check.
  const body = '210012300250';
  const cd = ScaleCore.checkDigitFor(body + '0');
  const weightCode = body + String(ScaleCore.ean13Check(body));
  eq(ScaleCore.ean13Check('210012300250'), Number(weightCode.charAt(12)), 'the check digit of the fixture code is self-consistent');

  const cfg = ScaleCore.defaultConfig();
  cfg.enabled = true;
  const d = ScaleCore.decode(weightCode, cfg);
  check(!!d, 'the 21 weight pattern decodes a 13-digit label');
  eq(d.patternId, 'e13-21-weight', 'the matched pattern is the 21 weight preset');
  eq(d.plu, '00123', 'PLU is read from positions 2..6');
  near(d.weight, 0.25, 'weight 00250 with 3 decimals is 0.25 kg');
  eq(d.checkOk, true, 'a valid check digit is accepted');
  near(d.qtyFromLabel, 0.25, 'the label quantity is the weight');

  const r = ScaleCore.resolve(d, 90);
  near(r.qty, 0.25, 'resolve keeps the label weight as the quantity');
  near(r.price, 90, 'a weight-only label keeps the product card price');
  near(r.total, 22.5, 'total is card price x label weight');
  eq(d.weightDecimals, 3, 'the decode reports the weight field\'s own places');
  eq(r.qtyDecimals, 3, 'and the line is to be written with them (0.250, not 0.25)');

  // ---- the owner rule: the amount printed on the label wins -----------------
  const amountBody = '230012300500';
  const amountCode = amountBody + String(ScaleCore.ean13Check(amountBody));
  const da = ScaleCore.decode(amountCode, cfg);
  check(!!da, 'the 23 amount pattern decodes');
  near(da.amount, 5.0, 'amount 00500 with 2 decimals is 5.00 DA');
  eq(da.qtyFromLabel, null, 'an amount-only label carries no quantity yet');
  const ra = ScaleCore.resolve(da, 20);
  near(ra.total, 5.0, 'the label amount is the line total');
  near(ra.qty, 0.25, 'the quantity is derived from the amount and the card price');
  eq(ra.amountFromLabel, true, 'the line is reported as label-priced');
  eq(ra.qtyDecimals, null, 'a quantity derived from money is not a printed weight, so it claims no places');
  const ra2 = ScaleCore.resolve(da, 40);
  near(ra2.total, 5.0, 'raising the card price never changes the label amount');
  near(ra2.qty, 0.125, 'and only moves the derived quantity');

  // ---- unit price on the label ---------------------------------------------
  // A 22 label carries only the price per kilo: the weight stays on the paper,
  // so the engine cannot invent a quantity. The caller keys it and hands it back.
  const priceBody = '220012301500';
  const priceCode = priceBody + String(ScaleCore.ean13Check(priceBody));
  const dp = ScaleCore.decode(priceCode, cfg);
  near(dp.unitPrice, 15.0, 'the 22 preset reads the unit price');
  eq(dp.qtyFromLabel, null, 'a price-only label carries no quantity of its own');
  eq(ScaleCore.resolve(dp, 999), null, 'the engine refuses to sell a price-only label with an unknown quantity');
  const rp = ScaleCore.resolve(Object.assign({}, dp, { qtyFromLabel: 2 }), 999);
  near(rp.price, 15.0, 'with the weighed quantity supplied, the label unit price beats the card price');
  near(rp.total, 30.0, 'and the line total is that price times the quantity');
  eq(rp.amountFromLabel, false, 'a price-times-quantity line is not label-money');

  // ---- a bad check digit ----------------------------------------------------
  const broken = weightCode.slice(0, 12) + String((Number(weightCode.charAt(12)) + 1) % 10);
  eq(ScaleCore.decode(broken, cfg), null, 'a wrong check digit is rejected while rejectBadCheck is on');
  const lenient = Object.assign({}, cfg, { rejectBadCheck: false });
  const dl = ScaleCore.decode(broken, lenient);
  check(dl && dl.checkOk === false, 'turning the rule off decodes it and flags checkOk=false');

  // ---- master switch --------------------------------------------------------
  eq(ScaleCore.decode(weightCode, { enabled: false, patterns: cfg.patterns }), null, 'a disabled config never decodes');
  eq(ScaleCore.decode(weightCode, null), null, 'a missing config means the feature is off');

  // ---- a non-scale code -----------------------------------------------------
  eq(ScaleCore.decode('1234567890123', cfg), null, 'an ordinary retail barcode is not a scale code');

  // ---- count preset (24) ----------------------------------------------------
  const countBody = '240000700003';
  const countCode = countBody + String(ScaleCore.ean13Check(countBody));
  const dc = ScaleCore.decode(countCode, cfg);
  check(!!dc && dc.weight === 3, 'the 24 preset reads a piece count with no decimals');

  // ---- 12-digit, no check digit --------------------------------------------
  // The extra families ship present but switched off; the shop turns on the one
  // that matches the machine on its counter.
  eq(cfg.patterns.filter(p => !p.enabled).length, 3, 'three layouts ship ready but disabled (2*, 9*, 12-digit)');
  const cfg12 = ScaleCore.normalizeConfig({
    enabled: true, rejectBadCheck: true,
    patterns: [Object.assign({}, ScaleCore.PRESETS[6], { enabled: true })],
  });
  const c12 = '210012002500';
  const d12 = ScaleCore.decode(c12, cfg12);
  check(!!d12 && d12.patternId === 'ean12-21-weight', 'the 12-digit preset decodes without a check digit');
  near(d12.weight, 2.5, 'the 12-digit weight field reads 2.500');
  eq(d12.plu, '0012', 'the 12-digit layout reads a four-place PLU');

  // ---- wildcard family ------------------------------------------------------
  const wildCfg = ScaleCore.normalizeConfig({
    enabled: true, rejectBadCheck: true,
    patterns: [Object.assign({}, ScaleCore.PRESETS[4], { enabled: true })],
  });
  const wildBody = '250012300250';
  const wildCode = wildBody + String(ScaleCore.ean13Check(wildBody));
  const dw = ScaleCore.decode(wildCode, wildCfg);
  check(!!dw && dw.patternId === 'e13-2x-weight', 'the 2* pattern accepts 25 as a weight code');

  // ---- a shop-defined custom layout ----------------------------------------
  const custom = ScaleCore.normalizeConfig({
    enabled: true, rejectBadCheck: false,
    patterns: [{
      id: 'custom-shop', prefix: '77', digits: 13, check: false, enabled: true,
      plu: { start: 2, len: 4 }, weight: { start: 6, len: 5, decimals: 3 },
    }],
  });
  const dcu = ScaleCore.decode('7712340025099', custom);
  check(!!dcu && dcu.plu === '1234' && Math.abs(dcu.weight - 0.25) < 1e-9, 'a hand-written layout is honoured');
  eq(ScaleCore.PRESETS.length, 7, 'seven ready-made layouts ship with the engine');
  check(ScaleCore.PRESETS.every(p => typeof p.key === 'string' && dictT('ar', p.key)), 'every ready-made layout has a translated name');

  // ---- validation -----------------------------------------------------------
  const badOverlap = { id: 'x', prefix: '21', digits: 13, check: false, enabled: true, plu: { start: 2, len: 5 }, weight: { start: 5, len: 5, decimals: 3 } };
  eq(ScaleCore.validatePattern(badOverlap, 13), false, 'two fields sharing a digit position are refused');
  eq(badOverlap._error, 'scale.errOverlap', 'the overlap is reported with its own message');
  const badRange = { id: 'y', prefix: '21', digits: 13, check: false, enabled: true, plu: { start: 2, len: 5 }, weight: { start: 9, len: 5, decimals: 3 } };
  eq(ScaleCore.validatePattern(badRange, 13), false, 'a field running past the code length is refused');
  const badPref = { id: 'z', prefix: '21', digits: 13, check: false, enabled: true, plu: { start: 1, len: 5 } };
  eq(ScaleCore.validatePattern(badPref, 13), false, 'a field starting inside the prefix is refused');

  // ---- normalizeConfig keeps a stored config trustworthy --------------------
  const junk = ScaleCore.normalizeConfig({ enabled: true, patterns: [{ id: 'junk', prefix: '', digits: 13 }] });
  check(junk.patterns.length === 7, 'a config with only broken patterns falls back to the ready-made ones');
  const clamped = ScaleCore.normalizeConfig({
    enabled: true,
    patterns: [{ id: 'c', prefix: '21ab*', digits: 99, check: true, enabled: true, plu: { start: 99, len: 99 } }],
  });
  check(!clamped.patterns.some(p => p.id === 'c'), 'an out-of-range layout is dropped, not silently kept');
  eq(clamped.patterns.length, 7, 'a config left with nothing usable falls back to the ready-made layouts');
  eq(clamped.enabled, true, 'the master switch survives normalisation');
  eq(clamped.patterns[0].digits, 13, 'the digits of a kept layout are untouched');

  // ---- PLU keys -------------------------------------------------------------
  eq(ScaleCore.pluKey('00123'), '123', 'PLU key drops leading zeros');
  eq(ScaleCore.pluKey('000'), '0', 'an all-zero PLU still has a key');
  eq(ScaleCore.pluKey(''), '', 'an empty PLU has no key');
  check(ScaleCore.pluMatches('00123', '123'), 'a padded card code matches a bare scanned one');
}());

// ============================================================ 3. db.js PLU ===
section('3) الرمز في قاعدة البيانات (db.js الحقيقي)');

const store = {};
const localStorageStub = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const alerts = [];
// Page scripts register global listeners through window (which the sandbox is).
const winListeners = {};
const sandbox = {
  module: { exports: {} }, console, localStorage: localStorageStub, document: doc,
  Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
  RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  indexedDB: null, navigator: { onLine: false },
  fetch: () => Promise.reject(new Error('no network in tests')),
  alert: (m) => alerts.push(String(m)),
  confirm: () => true,
  addEventListener: (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); },
  removeEventListener: (type, fn) => {
    const l = winListeners[type] || [];
    const i = l.indexOf(fn);
    if (i !== -1) l.splice(i, 1);
  },
  CustomEvent: function (name, opts) { this.type = name; this.detail = opts && opts.detail; },
  Auth: {
    isLoggedIn: () => false, getUserCode: () => '', getCurrentUser: () => null,
    getCompanyId: () => '', getRole: () => 'manager', getStoreName: () => '',
    isManager: () => true, canEdit: () => true, currentUserId: () => 'u1', buyPriceVisible: () => true,
  },
  t,
  escHtml: (s) => String(s == null ? '' : s),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  normSearch: (s) => String(s || ''),
  productSearchScore: () => 1,
  debounce: (fn) => fn,
  getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
  getPharmacyMode: () => false,
  trackPageListener: () => {},
  navigateTo: () => {},
  renderInventory: () => {},
  BRANDS: { global: [], chinese: [] },
  ExtraPrices: { fields: () => [], readInputs: () => ({}), inputsHTML: () => '', COLORS: ['#111'], MAX: 5, saveFields: () => {} },
  cleanScannedCode: (v) => String(v || '').trim(),
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// db.js calls the app's own barcode normaliser (a global function declared in
// app.js, which the shipped page loads before any click can reach the DB).
// Take the real one out of app.js instead of stubbing a weaker copy.
function grabAppFn(name) {
  const i = appSrc.indexOf('function ' + name + '(');
  if (i === -1) throw new Error(name + ' is not a global function in app.js');
  const open = appSrc.indexOf('{', appSrc.indexOf(')', i));
  return appSrc.slice(i, open + sliceBalanced(appSrc, open, '{', '}').length);
}
// A run of adjacent top-level declarations taken verbatim: the layout maps are
// `var`s that the functions below them read, so they travel together.
function grabAppRange(startDecl, endFn) {
  const a = appSrc.indexOf(startDecl);
  if (a === -1) throw new Error(startDecl + ' is not in app.js');
  const b = appSrc.indexOf('function ' + endFn + '(');
  if (b < a) throw new Error(endFn + ' does not follow ' + startDecl + ' in app.js');
  const open = appSrc.indexOf('{', appSrc.indexOf(')', b));
  return appSrc.slice(a, open + sliceBalanced(appSrc, open, '{', '}').length);
}
const BARCODE_HELPERS = grabAppRange('function _mapChars(', 'barcodeVariants');
['normBarcode', 'canonBarcode'].forEach((n) => {
  vm.runInContext(grabAppFn(n), sandbox, { filename: 'app.js#' + n });
});
vm.runInContext(BARCODE_HELPERS, sandbox, { filename: 'app.js#barcode layout helpers' });

vm.runInContext(read('renderer/js/lib/units.js'), sandbox, { filename: 'units.js' });
vm.runInContext(read('renderer/js/purchase-core.js'), sandbox, { filename: 'purchase-core.js' });
vm.runInContext(read('renderer/js/sale-core.js'), sandbox, { filename: 'sale-core.js' });
vm.runInContext(read('renderer/js/scale-core.js'), sandbox, { filename: 'scale-core.js' });
vm.runInContext(read('renderer/js/db.js'), sandbox, { filename: 'db.js' });
vm.runInContext(read('renderer/js/pages/inventory.js'), sandbox, { filename: 'inventory.js' });

// db.js declares `const DB = {…}`: in a vm that lands in the context's lexical
// scope, not on the global object, so read it back the way a later script sees it.
const DB = vm.runInContext('DB', sandbox);

// Inline handlers (oninput="…") are attributes in the mini DOM, not listener
// registrations. Run one the way a browser does: in the page scope, with the
// element as `this`, so `this.checked` and the globals both resolve.
let inlineSeq = 0;
function runInline(el, name, event) {
  const code = el && el.getAttribute(name);
  if (!code) { bad('the element has no ' + name + ' handler'); return; }
  const key = '__inline' + (++inlineSeq);
  vm.runInContext('globalThis.' + key + ' = function (event) { return (function () {' + code + ' }).call(this, event); };',
    sandbox, { filename: 'inline-handler' });
  try { sandbox[key].call(el, event || { target: el, type: name.slice(2) }); }
  finally { delete sandbox[key]; }
}
check(!!DB && typeof DB.getProductByPlu === 'function', 'DB.getProductByPlu exists');
check(typeof DB.findProductsByPlu === 'function', 'DB.findProductsByPlu exists');

const tomato = DB.addProduct({ name: 'طماطم', barcode: '2100123002500', plu: '00123', quantity: 999999, buyPrice: 60, sellPrice: 90, unit: 'kg' });
DB.addProduct({ name: 'خضار', barcode: '2100999004501', plu: '45', quantity: 999999, buyPrice: 40, sellPrice: 70 });
DB.addProduct({ name: 'بلا رمز', barcode: '3000', quantity: 5, buyPrice: 10, sellPrice: 20 });

check(DB.getProductByPlu('123') && DB.getProductByPlu('123').id === tomato.id, 'a scanned 123 finds the card typed 00123');
check(DB.getProductByPlu('00123') && DB.getProductByPlu('00123').id === tomato.id, 'the padded form finds it too');
check(DB.getProductByPlu('١٢٣') && DB.getProductByPlu('١٢٣').id === tomato.id, 'Arabic-Indic digits are folded');
check(DB.getProductByPlu('045') && DB.getProductByPlu('045').plu === '45', 'a padded slice matches a bare card code');
eq(DB.getProductByPlu('999'), null, 'an unknown PLU returns null');
eq(DB.getProductByPlu(''), null, 'an empty PLU returns null');
eq(DB.getProductByPlu('3000'), null, 'a plain barcode is never read as a PLU');
eq(DB.findProductsByPlu('123').length, 1, 'findProductsByPlu returns the matching rows');
// The card keeps what the operator typed — only the comparison is canonical.
eq(tomato.plu, '00123', 'the stored card keeps the typed padding');

const createdCarrot = DB.addOrMergeProduct({ name: 'جزر', barcode: '2100777004501', plu: '777', buyPrice: 30, sellPrice: 50, quantity: 3 });
check(createdCarrot.ok && createdCarrot.product.plu === '777', 'a new product keeps its PLU');
const mergedCarrot = DB.addOrMergeProduct({ name: 'جزر', barcode: '2100777004501', plu: '888', buyPrice: 30, sellPrice: 50, quantity: 2 });
check(mergedCarrot.ok && mergedCarrot.product.plu === '777', 'restocking never overwrites an existing PLU');
const mergeBlank = DB.addOrMergeProduct({ name: 'بلا رمز', barcode: '3000', plu: '55', buyPrice: 10, sellPrice: 20, quantity: 1 });
check(mergeBlank.ok && mergeBlank.product.plu === '55', 'restocking adopts a PLU onto a card that had none');

// ====================================================== 4. settings modal ====
section('4) نافذة إعدادات الميزان في صفحة المخزون');

// The REAL shipped markup, so every id the modal reads is proven to exist.
(function () {
  const body = /<body[^>]*>([\s\S]*)$/i.exec(read('renderer/pages/inventory.html'));
  parseInto(body ? body[1] : read('renderer/pages/inventory.html'), doc.body);
  const page = /<div class="page" id="page-inventory">[\s\S]*?<\/div>\s*(?=<!--|<\/body>)/;
  void page;
}());
// The app appends the window to #pageContainer; give the sandbox that node.
if (!doc.getElementById('pageContainer')) {
  const pc = doc.createElement('div');
  pc.id = 'pageContainer';
  doc.body.appendChild(pc);
}

check(typeof sandbox.openScaleSettingsModal === 'function', 'openScaleSettingsModal is defined');
check(typeof sandbox.scaleCfgSave === 'function', 'scaleCfgSave is defined');
check(typeof sandbox.scaleCfgPreview === 'function', 'scaleCfgPreview is defined');

alerts.length = 0;
sandbox.openScaleSettingsModal();
const overlay = doc.getElementById('scaleCfgModal');
check(!!overlay, 'the settings window is created on the inventory page');
check(overlay && overlay.style.display === 'flex', 'the settings window opens');

(function () {
  const rows = overlay.querySelectorAll('[data-scale-row]');
  eq(rows.length, 7, 'the seven ready-made layouts are listed');
  const enabledBoxes = [];
  rows.forEach(r => { const b = r.querySelector('[data-f="enabled"]'); if (b && b.checked) enabledBoxes.push(r); });
  eq(enabledBoxes.length, 4, 'four layouts start enabled (21 weight / 22 price / 23 amount / 24 count)');
  check(overlay.innerHTML.indexOf(t('scale.settingsTitle')) !== -1, 'the window title is translated');
  check(overlay.innerHTML.indexOf(t('scale.enable')) !== -1, 'the master switch is offered');
  check(overlay.innerHTML.indexOf(t('scale.rejectBadCheck')) !== -1, 'the check-digit rule is offered');
}());

// ---- the live preview -------------------------------------------------------
(function () {
  const input = overlay.querySelector('.scale-preview-input');
  check(!!input, 'the window has a paste-a-code box');
  const weightBody = '210012300250';
  input.value = weightBody + String(ScaleCore.ean13Check(weightBody));
  runInline(input, 'oninput');
  const out = overlay.querySelector('.scale-preview-out');
  const text = out ? out.textContent : '';
  check(text.indexOf(t('scale.preset21Weight')) !== -1, 'the preview names the layout that matched');
  check(text.indexOf('00123') !== -1, 'the preview shows the PLU read from the code');
  check(text.indexOf(t('scale.colWeight')) !== -1, 'the preview shows the weight field');
  check(text.indexOf(t('scale.checkOk')) !== -1, 'the preview confirms the check digit');

  input.value = '210012300250' + String((ScaleCore.ean13Check('210012300250') + 1) % 10);
  runInline(input, 'oninput');
  check(overlay.querySelector('.scale-preview-out').textContent.indexOf(t('scale.previewNoMatch')) !== -1,
    'a code with a broken check digit says it matches nothing while the rule is on');

  input.value = '1234567890123';
  runInline(input, 'oninput');
  check(overlay.querySelector('.scale-preview-out').textContent.indexOf(t('scale.previewNoMatch')) !== -1,
    'an ordinary retail barcode is refused in the preview');

  input.value = '230012300500' + String(ScaleCore.ean13Check('230012300500'));
  runInline(input, 'oninput');
  const amountOut = overlay.querySelector('.scale-preview-out').textContent;
  check(amountOut.indexOf(t('scale.preset23Amount')) !== -1 && amountOut.indexOf(t('scale.fromLabel')) !== -1,
    'an amount label previews as money taken from the label');
}());

// ---- editing a layout -------------------------------------------------------
(function () {
  const rows = overlay.querySelectorAll('[data-scale-row]');
  const first = rows[0];
  const lenInput = first.querySelector('[data-f="weight.len"]');
  check(!!lenInput, 'each layout exposes the weight length');
  lenInput.value = '0';
  runInline(lenInput, 'oninput');
  check(!!first.querySelector('[data-scale-row-error]'), 'the row has a place to report an error');

  // Put the weight field on top of the PLU: the row must refuse to save.
  const startInput = first.querySelector('[data-f="weight.start"]');
  lenInput.value = '5';
  startInput.value = '2';
  runInline(lenInput, 'oninput');
  const err = first.querySelector('[data-scale-row-error]');
  check(err && String(err.textContent).indexOf(t('scale.errOverlap')) !== -1 && err.style.display !== 'none',
    'overlapping fields are reported on the row');
  const saveBtn = overlay.querySelector('[data-scale-save]');
  check(saveBtn && saveBtn.disabled === true, 'the save button is disabled while a layout is broken');

  startInput.value = '7';
  runInline(startInput, 'oninput');
  check(saveBtn && !saveBtn.disabled, 'fixing the position re-enables saving');
}());

// ---- add / remove a custom layout ------------------------------------------
(function () {
  const before = overlay.querySelectorAll('[data-scale-row]').length;
  sandbox.scaleCfgAddPattern();
  eq(overlay.querySelectorAll('[data-scale-row]').length, before + 1, 'a custom layout can be added');
  const last = overlay.querySelectorAll('[data-scale-row]')[before];
  const prefix = last.querySelector('[data-f="prefix"]');
  check(!!prefix, 'the custom row exposes its prefix');
  check(!!last.querySelector('[data-f="label"]'), 'the custom row can be named');
  prefix.value = '29';
  runInline(prefix, 'oninput');
  check(!last.querySelector('[data-scale-row-error]').textContent.trim(),
    'a custom layout becomes valid once its prefix is typed');
  check(!!last.querySelector('.btn-danger') || overlay.innerHTML.indexOf('scaleCfgRemovePattern') !== -1,
    'a custom layout can be removed');
  sandbox.scaleCfgRemovePattern(before);
  eq(overlay.querySelectorAll('[data-scale-row]').length, before, 'removing it takes it off the list');
}());

// ---- save -------------------------------------------------------------------
(function () {
  const master = overlay.querySelector('.scale-master input[data-f="enabled"]');
  check(!!master, 'the master switch is rendered');
  master.checked = true;
  runInline(master, 'onchange');

  alerts.length = 0;
  sandbox.scaleCfgSave();
  eq(alerts.length, 0, 'saving a valid config raises no error');

  const saved = DB.getMeta(ScaleCore.META_KEY);
  check(saved && saved.enabled === true, 'the config is stored under scale_barcode_cfg');
  eq(saved.rejectBadCheck, true, 'the check-digit rule is stored');
  check(Array.isArray(saved.patterns) && saved.patterns.length === 7, 'all seven layouts are stored');
  const weight = saved.patterns.find(p => p.id === 'e13-21-weight');
  check(weight && weight.weight && weight.weight.start === 7 && weight.weight.decimals === 3,
    'the edited weight positions are stored, not the defaults');
  eq(weight.plu.start, 2, 'the PLU position is stored');
  check(sandbox.closeScaleSettingsModal && doc.getElementById('scaleCfgModal').style.display === 'none',
    'the window closes after saving');

  // What was saved is what the engine reads back through the page helper.
  const cfgRead = sandbox.scaleConfig();
  eq(cfgRead.enabled, true, 'scaleConfig() reports the feature as enabled after saving');
  const body = '210012300250';
  const d = ScaleCore.decode(body + String(ScaleCore.ean13Check(body)), cfgRead);
  check(!!d && d.plu === '00123', 'the stored config decodes a real label with no further editing');

  // Turning it off must be persisted too.
  sandbox.openScaleSettingsModal();
  const o2 = doc.getElementById('scaleCfgModal');
  const m2 = o2.querySelector('.scale-master input[data-f="enabled"]');
  eq(m2.checked, true, 'reopening shows the saved state (enabled)');
  m2.checked = false;
  runInline(m2, 'onchange');
  sandbox.scaleCfgSave();
  eq(DB.getMeta(ScaleCore.META_KEY).enabled, false, 'switching the feature off is saved');
  eq(ScaleCore.decode(body + String(ScaleCore.ean13Check(body)), DB.getMeta(ScaleCore.META_KEY)), null,
    'a disabled feature decodes nothing');
}());

// ---- restore presets --------------------------------------------------------
(function () {
  sandbox.openScaleSettingsModal();
  const o = doc.getElementById('scaleCfgModal');
  const listBefore = o.querySelectorAll('[data-scale-row]').length;
  sandbox.scaleCfgAddPattern();
  eq(o.querySelectorAll('[data-scale-row]').length, listBefore + 1, 'a custom layout is on the list');
  sandbox.scaleCfgRestorePresets();
  eq(o.querySelectorAll('[data-scale-row]').length, 7, 'restoring brings back the seven ready-made layouts');
  check(o.innerHTML.indexOf('custom-') === -1, 'the custom layout is gone after restoring');
  sandbox.closeScaleSettingsModal();
}());

// ---- permission -------------------------------------------------------------
(function () {
  sandbox.closeScaleSettingsModal();
  const realManager = sandbox.Auth.isManager;
  const realCanEdit = sandbox.Auth.canEdit;
  sandbox.Auth.isManager = () => false;
  sandbox.Auth.canEdit = () => false;
  alerts.length = 0;
  sandbox.openScaleSettingsModal();
  eq(alerts.length, 1, 'a cashier without inventory rights gets exactly one refusal');
  eq(alerts[0], t('common.noPermission'), 'the refusal is the shared "no permission" message');
  const reopened = doc.getElementById('scaleCfgModal');
  check(!reopened || reopened.style.display !== 'flex', 'the window does not open for them');
  sandbox.Auth.isManager = realManager;
  sandbox.Auth.canEdit = realCanEdit;
}());

// ==================================================== 5. the register ========
section('5) قراءة اللاصقة عند الكاشير (pages/sales.js الحقيقية)');

// The real shipped sales page, its own document tree, so the modal ids the scan
// path opens are proven to exist in the markup the app actually loads.
const salesDoc = createDoc();
(function () {
  // The page files are fragments (no <body> of their own): parse what is there.
  const html = read('renderer/pages/sales.html');
  const body = /<body[^>]*>([\s\S]*)$/i.exec(html);
  parseInto(body ? body[1] : html, salesDoc.body);
  if (!salesDoc.getElementById('pageContainer')) {
    const pc = salesDoc.createElement('div');
    pc.id = 'pageContainer';
    salesDoc.body.appendChild(pc);
  }
}());

['salesScaleModal', 'salesScaleFacts', 'salesScaleQtyRow', 'salesScaleQty',
  'salesScalePriceRow', 'salesScalePrice', 'salesScaleTotal', 'salesScaleLinkRow',
  'salesScaleSearch', 'salesScaleResults', 'salesScaleAddBtn', 'salesBarcodeScan',
  'salesBarcodeStatus', 'salesCartItems', 'salesEmptyCart'].forEach(id => {
  check(!!salesDoc.getElementById(id), 'sales.html carries #' + id);
});

const salesBag = {};
const salesLS = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(salesBag, k) ? salesBag[k] : null),
  setItem: (k, v) => { salesBag[k] = String(v); },
  removeItem: (k) => { delete salesBag[k]; },
};
const salesAlerts = [];
const salesWinListeners = {};
// window.confirm is the cashier's yes/no: the test answers it on purpose.
const confirmLog = [];
let confirmAnswer = true;
const SS = {
  module: { exports: {} }, console, localStorage: salesLS, document: salesDoc,
  Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
  RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map, WeakMap,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  indexedDB: null, navigator: { onLine: false },
  fetch: () => Promise.reject(new Error('no network in tests')),
  alert: (m) => salesAlerts.push(String(m)),
  confirm: (m) => { confirmLog.push(String(m)); return confirmAnswer; },
  addEventListener: (type, fn) => { (salesWinListeners[type] = salesWinListeners[type] || []).push(fn); },
  removeEventListener: () => {},
  CustomEvent: function (name, opts) { this.type = name; this.detail = opts && opts.detail; },
  Auth: {
    isLoggedIn: () => true, getUserCode: () => 'T1', getCurrentUser: () => ({ name: 'مدير' }),
    getCompanyId: () => '', getRole: () => 'manager', getStoreName: () => 'المحل',
    isManager: () => true, canEdit: () => true, currentUserId: () => 'u1', buyPriceVisible: () => true,
  },
  t,
  escHtml: (s) => String(s == null ? '' : s),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  debounce: (fn) => fn,
  getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
  getPharmacyMode: () => false,
  trackPageListener: () => {},
  navigateTo: () => {},
  renderInventory: () => {},
  BRANDS: { global: [], chinese: [] },
  ExtraPrices: { fields: () => [], readInputs: () => ({}), inputsHTML: () => '', COLORS: ['#111'], MAX: 5, saveFields: () => {} },
  _currentPageId: 'sales',
};
SS.window = SS;
SS.self = SS;
SS.globalThis = SS;
vm.createContext(SS);
// The app's own text search and code cleaning — the register must match a label
// with the same intelligence it uses for everything else, not a weaker copy.
['normBarcode', 'canonBarcode', 'normSearch', 'normalizeSearchText', 'searchTokens', 'productSearchScore', 'cleanScannedCode']
  .forEach((n) => vm.runInContext(grabAppFn(n), SS, { filename: 'app.js#' + n }));
vm.runInContext(BARCODE_HELPERS, SS, { filename: 'app.js#barcode layout helpers' });
vm.runInContext(read('renderer/js/lib/units.js'), SS, { filename: 'units.js' });
vm.runInContext(read('renderer/js/purchase-core.js'), SS, { filename: 'purchase-core.js' });
vm.runInContext(read('renderer/js/sale-core.js'), SS, { filename: 'sale-core.js' });
vm.runInContext(read('renderer/js/scale-core.js'), SS, { filename: 'scale-core.js' });
vm.runInContext(read('renderer/js/db.js'), SS, { filename: 'db.js' });
vm.runInContext(read('renderer/js/pages/sales.js'), SS, { filename: 'sales.js' });
const SDB = vm.runInContext('DB', SS);
const SUnit = vm.runInContext('Unit', SS);
const SaleCore = vm.runInContext('SaleCore', SS);

check(typeof SS.salesScaleLookup === 'function', 'the register knows how to read a label');
check(typeof SS.openSalesScaleModal === 'function' && typeof SS.confirmSalesScaleLine === 'function',
  'the unknown-label dialog is wired');

// ---- the fixtures ----------------------------------------------------------
const ean13 = (body12) => body12 + String(ScaleCore.ean13Check(body12));
const WEIGHT_CODE = ean13('210012300250');   // PLU 00123, 0.250 kg
const AMOUNT_CODE = ean13('230012300500');   // PLU 00123, 5.00 DA printed
const PRICE_CODE = ean13('220012301500');    // PLU 00123, 15.00 DA per unit
const UNKNOWN_CODE = ean13('210099900300');  // PLU 999, 0.300 kg — no card owns it

const cfgOn = ScaleCore.defaultConfig();
cfgOn.enabled = true;
SDB.setMeta(ScaleCore.META_KEY, cfgOn);

const weighable = SDB.addProduct({ name: 'طماطم سلعة', barcode: '5551', plu: '00123',
  buyPrice: 60, sellPrice: 90, wholesalePrice: 120, quantity: 999999, fixed: true, unit: 'kg', createdAt: 1 });
const shelved = SDB.addProduct({ name: 'صابون', barcode: '5552', buyPrice: 100, sellPrice: 250,
  quantity: 8, unit: 'piece', createdAt: 1 });
// The till caches its products (init_sales takes the snapshot, getSalesGroups
// builds on it). A test that writes through the DB has to re-open the page the
// same way, or it would be testing a stale cache instead of the register.
const refreshTill = () => vm.runInContext('_salesProducts = DB.getProducts(); invalidateSalesGroupsCache();', SS);
refreshTill();

const scanField = salesDoc.getElementById('salesBarcodeScan');
const statusField = salesDoc.getElementById('salesBarcodeStatus');
const cart = SS._salesCart;
function scan(code) {
  scanField.value = code;
  SS.handleSalesBarcodeScan({ key: 'Enter', preventDefault() {} });
  return code;
}
const line = (name) => cart.find(c => c.name === name);

// ---- an ordinary barcode is untouched by any of this ----------------------
(function () {
  cart.length = 0;
  salesAlerts.length = 0;
  scan('5552');
  eq(cart.length, 1, 'a plain barcode still goes straight into the cart');
  eq(cart[0].name, 'صابون', 'the same card as always');
  eq(!!cart[0].scale, false, 'and no scale marks on an unweighed line');
  eq(salesDoc.getElementById('salesScaleModal').style.display, 'none', 'the label window stayed shut');
  eq(statusField.textContent, t('sales.scannerDone'), 'with the message the till has always said');
}());

// ---- the feature is off until the shop turns it on -------------------------
(function () {
  SDB.setMeta(ScaleCore.META_KEY, { enabled: false, patterns: cfgOn.patterns });
  cart.length = 0;
  salesAlerts.length = 0;
  scan(WEIGHT_CODE);
  eq(cart.length, 0, 'a disabled scale setting leaves the label unsold');
  eq(statusField.textContent, t('sales.scannerNotFound'), 'and the cashier is told the code is unknown');
  SDB.setMeta(ScaleCore.META_KEY, cfgOn);
}());

// ---- a LAN sub device never reads labels -----------------------------------
(function () {
  salesBag.zmt_lan_role = 'sub';
  cart.length = 0;
  scan(WEIGHT_CODE);
  eq(cart.length, 0, 'a secondary LAN device refuses the weighed code');
  eq(statusField.textContent, t('sales.scannerNotFound'), 'and says unknown rather than inventing a line');
  delete salesBag.zmt_lan_role;
}());

// ---- the weight on the label is the quantity -------------------------------
(function () {
  cart.length = 0;
  scan(WEIGHT_CODE);
  const l = line('طماطم سلعة');
  check(!!l, 'the label of a known PLU goes straight into the cart, no dialog');
  near(l.qty, 0.25, 'the line quantity is the weight printed on the label');
  near(l.price, 90, 'and the price is the product card — the label said nothing about money');
  near(l.total, 22.5, 'so the line total is card price times label weight');
  eq(l.scale.count, 1, 'the line remembers that it came off a scale');
  eq(l.scale.fromLabel, false, 'and that the money was not on the label');
  eq(salesDoc.getElementById('salesScaleModal').style.display, 'none', 'no window opened for it');
  check(salesDoc.getElementById('salesCartItems').innerHTML.indexOf(t('sales.scaleTag')) !== -1,
    'the cart marks the line as weighed');
  eq(l.scale.decimals, 3, 'the line keeps the three places the label printed');
  eq(SUnit.fmtQty(l.qty, l.scale.decimals), '0.250', 'and the weight reads as 0.250, not 0.25');

  scan(WEIGHT_CODE);
  near(l.qty, 0.5, 'a second label of the same article adds its weight to the same line');
  near(l.total, 45, 'and its money to the same total');
  eq(l.scale.count, 2, 'the line counts the labels it came from');
}());

// ---- the amount on the label is the authority ------------------------------
(function () {
  cart.length = 0;
  scan(AMOUNT_CODE);
  const l = line('طماطم سلعة');
  check(!!l, 'an amount label sells the known PLU');
  near(l.total, 5, 'the line total IS the money printed on the label');
  near(l.qty, 5 / 90, 'and the quantity is derived from it with the card price');
  eq(l.scale.fromLabel, true, 'the line is reported as label-money');
  eq(l.scale.decimals, null, 'a quantity derived from money is not a printed weight, so it keeps no places');
  const before = l.total;
  scan(AMOUNT_CODE);
  near(l.total, before + 5, 'two labels print twice their money, whatever the rounding');
}());

// ---- a price-only label asks for the weight -------------------------------
(function () {
  cart.length = 0;
  salesAlerts.length = 0;
  scan(PRICE_CODE);
  const m = salesDoc.getElementById('salesScaleModal');
  eq(m.style.display, 'flex', 'a label that carries a price but no weight opens the dialog');
  eq(statusField.textContent, t('sales.scaleNeedQty'), 'and the cashier is told what is missing');
  eq(salesDoc.getElementById('salesScaleQtyRow').style.display, '', 'the weight field is asked for');
  eq(salesDoc.getElementById('salesScaleLinkRow').style.display, 'none', 'the article is known, so no linking is offered');
  eq(salesDoc.getElementById('salesScalePrice').value, '15.00', 'the label unit price is prefilled');
  const add = salesDoc.getElementById('salesScaleAddBtn');
  eq(add.disabled, true, 'an empty weight cannot be added');
  salesDoc.getElementById('salesScaleQty').value = '0.25';
  SS.updateSalesScaleTotal();
  eq(salesDoc.getElementById('salesScaleTotal').textContent, 'DA' + (15 * 0.25).toFixed(2), 'the live total follows the typed weight');
  eq(add.disabled, false, 'a real weight makes the line addable');
  SS.confirmSalesScaleLine();
  const l = line('طماطم سلعة');
  check(!!l, 'the weighed line lands in the cart');
  near(l.qty, 0.25, 'with the weight the cashier typed');
  near(l.price, 15, 'and the price the label printed, not the card');
  near(l.total, 3.75, 'total = label price x typed weight');
  eq(m.style.display, 'none', 'and the dialog closed');
}());

// ---- an unknown PLU lets the cashier choose -------------------------------
(function () {
  cart.length = 0;
  salesAlerts.length = 0;
  scan(UNKNOWN_CODE);
  const m = salesDoc.getElementById('salesScaleModal');
  eq(m.style.display, 'flex', 'a valid label for an unknown PLU asks the cashier');
  eq(statusField.textContent, t('sales.scaleUnknownPlu'), 'and says the code has no card');
  eq(salesDoc.getElementById('salesScaleQtyRow').style.display, 'none', 'the weight is on the label, so it is not asked again');
  eq(salesDoc.getElementById('salesScaleLinkRow').style.display, '', 'linking is offered');
  const add = salesDoc.getElementById('salesScaleAddBtn');
  eq(add.disabled, true, 'nothing can be added before a product is chosen');

  // The same search the product grid uses: name, barcode, reference.
  const search = salesDoc.getElementById('salesScaleSearch');
  search.value = 'طماطم';
  SS.renderSalesScaleResults('طماطم');
  const hits = salesDoc.getElementById('salesScaleResults');
  check(hits.innerHTML.indexOf('طماطم سلعة') !== -1, 'the search finds the card by its name');
  check(hits.innerHTML.indexOf('صابون') === -1, 'and only offers what matches the words typed');

  SS.salesScaleLink(0);
  const l0 = line('طماطم سلعة');
  check(!!l0, 'linking then adding puts the weighed line in the cart');
  near(l0.qty, 0.3, 'with the weight off the label');
  near(l0.price, 90, 'priced from that card');
  eq(m.style.display, 'none', 'the dialog closes on the sale, not on the link');
  eq(SDB.getProduct(weighable.id).plu, '00999', 'the link is saved permanently on the product card, as the label prints it');
  eq(ScaleCore.pluKey(SDB.getProduct(weighable.id).plu), '999', 'and its key is the code the till looks up');
  eq(salesAlerts.length, 0, 'linking a free code raises no complaint');
  eq(confirmLog.length, 1, 'replacing the code the card already carried is asked first');
  check(confirmLog[0].indexOf('00123') !== -1 && confirmLog[0].indexOf('999') !== -1,
    'and the question names both codes — the one lost and the one gained');

  // A second label of the same code must not ask again.
  confirmLog.length = 0;
  scan(UNKNOWN_CODE);
  near(line('طماطم سلعة').qty, 0.6, 'the next label of that code goes straight in');
  eq(m.style.display, 'none', 'and no dialog opens for it');
  eq(confirmLog.length, 0, 'a code the card already owns is never re-asked');
}());

// ---- a refusal keeps the card's own code ----------------------------------
(function () {
  cart.length = 0;
  confirmAnswer = false;
  // The card now answers to 999; a label with 00123 asks about it again.
  scan(WEIGHT_CODE);
  eq(salesDoc.getElementById('salesScaleModal').style.display, 'flex', 'the orphaned old code is asked about');
  salesDoc.getElementById('salesScaleSearch').value = 'طماطم';
  SS.renderSalesScaleResults('طماطم');
  SS.salesScaleLink(0);
  eq(SDB.getProduct(weighable.id).plu, '00999', 'a refused replace changes nothing on the card');
  eq(cart.length, 0, 'and the cashier is still holding the label, not a sold line');
  SS.closeSalesScaleModal();
  confirmAnswer = true;
}());

// ---- a code another card already owns is never moved in silence ------------
(function () {
  salesDoc.getElementById('salesScaleResults').innerHTML = '';
  const other = SDB.addProduct({ name: 'خضار آخر', barcode: '5553', plu: '888', buyPrice: 10,
    sellPrice: 30, quantity: 999999, fixed: true, unit: 'kg', createdAt: 1 });
  refreshTill();
  const code = ean13('210088800200');
  cart.length = 0;
  confirmLog.length = 0;
  scan(code);
  eq(salesDoc.getElementById('salesScaleModal').style.display, 'none',
    'a code already on a card resolves to that card without asking');
  const l = line('خضار آخر');
  check(!!l, 'the label sold the card that owns the code');
  near(l.qty, 0.2, 'with the weight off the label');
  near(l.price, 30, 'and the price of that card');
  eq(confirmLog.length, 0, 'nothing is re-asked for a code that already has an owner');
  void other;
}());

// ---- «سطر حر»: the money stays, no card is invented -----------------------
(function () {
  cart.length = 0;
  salesAlerts.length = 0;
  SDB.updateProduct(weighable.id, { plu: '' });
  refreshTill();
  scan(AMOUNT_CODE);
  const m = salesDoc.getElementById('salesScaleModal');
  eq(m.style.display, 'flex', 'a label whose card lost its code asks again');
  eq(salesDoc.getElementById('salesScaleLinkRow').style.display, '', 'linking is offered');
  eq(salesDoc.getElementById('salesScalePriceRow').style.display, 'none',
    'the price is not asked: the label already printed the money');
  eq(salesDoc.getElementById('salesScaleTotal').textContent, 'DA5.00', 'the live total is the label amount');
  const freeBtnErr = salesAlerts.length;
  SS.confirmSalesScaleFree();
  eq(salesAlerts.length, freeBtnErr + 1, 'with no weight typed the free line is refused, not invented');
  salesDoc.getElementById('salesScaleQty').value = '0.25';
  SS.updateSalesScaleTotal();
  eq(salesDoc.getElementById('salesScaleTotal').textContent, 'DA5.00', 'the weight typed never moves the label money');
  SS.confirmSalesScaleFree();
  const free = cart.find(c => SS.isFreeSalesKey(c.key));
  check(!!free, 'the cashier can sell it as an unlisted line');
  near(free.total, 5, 'the label money is what the customer pays');
  near(free.qty, 0.25, 'at the weight the cashier typed');
  near(free.price, 20, 'and the unit price that money works out to');
  eq(free.free, true, 'and it is a free line: no product record behind it');
  eq(free.scale.fromLabel, true, 'the line still says the amount came off the label');
  eq(m.style.display, 'none', 'the dialog closes');
}());

// ---- Esc and the focus contract -------------------------------------------
(function () {
  cart.length = 0;
  scan(UNKNOWN_CODE);
  const m = salesDoc.getElementById('salesScaleModal');
  eq(m.style.display, 'flex', 'the dialog is open for the keyboard test');
  SS.salesScaleKeyNav({ key: 'Escape', target: salesDoc.getElementById('salesScaleSearch'),
    preventDefault() {}, stopPropagation() {} });
  eq(m.style.display, 'none', 'Esc closes it');
  eq(salesDoc._activeElement && salesDoc._activeElement.id, 'salesBarcodeScan',
    'and puts the focus back on the scan field for the next label');
  eq(cart.length, 0, 'closing adds nothing');
}());

// ---- no shelf stock moves -------------------------------------------------
(function () {
  cart.length = 0;
  // The card gets its code back — the previous block unlinked it on purpose.
  SDB.updateProduct(weighable.id, { plu: '00123' });
  refreshTill();
  scan(WEIGHT_CODE);
  const l = line('طماطم سلعة');
  check(!!l, 'the weighed line is there to sell');
  const qtyBefore = SDB.getProduct(weighable.id).quantity;
  // Exactly the payload the page builds at checkout.
  const r = SaleCore.computeSale(SDB, {
    lines: cart.map(c => ({
      entries: c.entries, lineDiscount: c.discount || 0,
      qtyDecimals: c.scale && c.scale.decimals != null ? c.scale.decimals : null,
    })),
  });
  check(r.ok, 'the weighed line passes the sale engine');
  eq(r.productUpdates.length, 0, 'a weighed card has no stock to deduct');
  near(r.invoiceItems[0].qty, 0.25, 'the invoice item carries the label weight as a decimal');
  near(r.invoiceItems[0].total, 22.5, 'at the label total');
  eq(r.invoiceItems[0].qtyDecimals, 3, 'and the item carries the label\'s place-count');
  eq(SUnit.qtyUnit(r.invoiceItems[0].qty, r.invoiceItems[0]), '0.250 كغ',
    'so the invoice reads 0.250 كغ, the way the customer weighed it');
  eq(SDB.getProduct(weighable.id).quantity, qtyBefore, 'the card quantity is untouched');
  void l;
}());

// ====================================================== 6. returns & edit ====
section('6) المرتجعات وتعديل الفاتورة (invoices.js + customer-detail.js الحقيقيتان)');

// One browser window, one global scope: the shipped app injects each page's
// script as it opens, so the invoice edit really does reach the register's
// salesScaleLookup. The harness mirrors that with sales.js + invoices.js +
// customer-detail.js loaded into the same sandbox over both page markups.
const cvDoc = createDoc();
(function () {
  ['renderer/pages/invoices.html', 'renderer/pages/customer-detail.html'].forEach((f) => {
    const html = read(f);
    const body = /<body[^>]*>([\s\S]*)$/i.exec(html);
    parseInto(body ? body[1] : html, cvDoc.body);
  });
}());

const cvBag = {};
const cvLS = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(cvBag, k) ? cvBag[k] : null),
  setItem: (k, v) => { cvBag[k] = String(v); },
  removeItem: (k) => { delete cvBag[k]; },
};
const cvAlerts = [];
const CV = {
  module: { exports: {} }, console, localStorage: cvLS, document: cvDoc,
  Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
  RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map, WeakMap,
  // The status field resets itself after 1500 ms; a test must not wait on a
  // real timer (and must not be woken by one between two assertions).
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  indexedDB: null, navigator: { onLine: false },
  fetch: () => Promise.reject(new Error('no network in tests')),
  alert: (m) => cvAlerts.push(String(m)),
  confirm: () => true,
  addEventListener: () => {}, removeEventListener: () => {},
  CustomEvent: function (name, opts) { this.type = name; this.detail = opts && opts.detail; },
  Auth: {
    isLoggedIn: () => true, getUserCode: () => 'T1', getCurrentUser: () => ({ name: 'مدير' }),
    getCompanyId: () => '', getRole: () => 'manager', getStoreName: () => 'المحل',
    isManager: () => true, canEdit: () => true, canView: () => true,
    currentUserId: () => 'u1', buyPriceVisible: () => true,
  },
  t,
  escHtml: (s) => String(s == null ? '' : s),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  debounce: (fn) => fn,
  getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
  getPharmacyMode: () => false,
  trackPageListener: () => {},
  navigateTo: () => {},
  renderInventory: () => {},
  BRANDS: { global: [], chinese: [] },
  ExtraPrices: { fields: () => [], readInputs: () => ({}), inputsHTML: () => '', COLORS: ['#111'], MAX: 5, saveFields: () => {} },
  _currentPageId: 'invoices',
};
CV.window = CV;
CV.self = CV;
CV.globalThis = CV;
vm.createContext(CV);
['normBarcode', 'canonBarcode', 'normalizeSearchText', 'searchTokens', 'productSearchScore',
  'cleanScannedCode', 'normSearch'].forEach((n) => vm.runInContext(grabAppFn(n), CV, { filename: 'app.js#' + n }));
vm.runInContext(BARCODE_HELPERS, CV, { filename: 'app.js#barcode layout helpers' });
['renderer/js/lib/units.js', 'renderer/js/purchase-core.js', 'renderer/js/sale-core.js',
  'renderer/js/scale-core.js', 'renderer/js/db.js', 'renderer/js/pages/sales.js',
  'renderer/js/pages/invoices.js', 'renderer/js/pages/customer-detail.js']
  .forEach((f) => vm.runInContext(read(f), CV, { filename: f }));

const CDB = vm.runInContext('DB', CV);
const CUnit = vm.runInContext('Unit', CV);
// The list re-renders through functions this test never loads (the whole
// invoices page lives behind them); the data effects are what is under test.
CV.showInvDetail = () => {};
CV.filterInvoices = () => {};
['renderCdStats', 'renderCdInvoices', 'renderCdHistory', 'renderCdPayments'].forEach((n) => { CV[n] = () => {}; });

const cfgCv = ScaleCore.defaultConfig();
cfgCv.enabled = true;
CDB.setMeta(ScaleCore.META_KEY, cfgCv);

const cvTomato = CDB.addProduct({ name: 'طماطم', barcode: '5551', plu: '00123', buyPrice: 60,
  sellPrice: 90, quantity: 999999, fixed: true, unit: 'kg', createdAt: 1 });
const cvSoap = CDB.addProduct({ name: 'صابون', barcode: '5552', buyPrice: 100, sellPrice: 250,
  quantity: 8, unit: 'piece', createdAt: 1 });
const cvBulk = CDB.addProduct({ name: 'موز سائب', barcode: '5560', buyPrice: 80, sellPrice: 120,
  quantity: 0, fixed: true, unit: 'kg', createdAt: 1 });
const cvCustomer = CDB.addCustomer({ name: 'زبون المتجر', phone: '0500000000', createdAt: 1 });
vm.runInContext('_salesProducts = DB.getProducts(); invalidateSalesGroupsCache();', CV);

const mkInvoice = (items, total) => CDB.addInvoice({
  type: 'customer', customerId: cvCustomer.id, date: '2026-10-01',
  items, totalAmount: total, paidAmount: total, profit: 0,
});
const openEdit = (invId) => {
  CV.ensureInvDetailModal();
  CV._invDetailId = invId;
  CV.showInvEditSection();
  return { scan: cvDoc.getElementById('editBarcodeScan'), status: cvDoc.getElementById('editScanStatus') };
};
const editScan = (ui, code) => {
  ui.scan.value = code;
  CV.handleEditBarcodeKey({ key: 'Enter', preventDefault() {} });
};

check(typeof CV.handleEditBarcodeKey === 'function' && typeof CV.saveInvEdit === 'function',
  'the invoice edit screen is the real shipped one');
check(typeof CV.editCdInvoice === 'function' && typeof CV.confirmCdEditInvoice === 'function',
  'the customer page edit is the real shipped one');
check(!!cvDoc.getElementById('editItemsBody') === false, 'nothing is rendered before an invoice is opened');

// ---- a weighed label stages its line on the edit --------------------------
(function () {
  const inv = mkInvoice([{ productId: cvSoap.id, barcode: '5552', name: 'صابون', qty: 2,
    price: 250, total: 500, unit: 'piece' }], 500);
  const ui = openEdit(inv.id);
  check(!!ui.scan && !!ui.status, 'the edit window carries its own scan field and status line');
  eq(CV._invEditNewItems.length, 0, 'a fresh edit starts with nothing staged');

  editScan(ui, WEIGHT_CODE);
  eq(CV._invEditNewItems.length, 1, 'a label off the scale stages a line on the invoice edit');
  const ni = CV._invEditNewItems[0];
  eq(ni.productId, cvTomato.id, 'the line belongs to the card that owns the PLU');
  near(ni.qty, 0.25, 'at the weight printed on the label');
  near(ni.price, 90, 'priced from that card');
  eq(ni.qtyDecimals, 3, 'and it remembers the three places of the label');
  const qtyEl = cvDoc.getElementById('editNewQty_' + ni._idx);
  check(!!qtyEl, 'the staged line is rendered inside the edit table');
  eq(qtyEl.value, '0.250', 'the weight field reads 0.250 — nothing for the cashier to retype');
  check(ui.status.textContent.indexOf(t('invoices.scanDone')) === 0, 'the status says the scan worked');
  check(ui.status.textContent.indexOf(t('sales.scaleTag')) !== -1, 'and marks the line as weighed');
  eq(CDB.getProduct(cvTomato.id).quantity, 999999, 'staging alone moves no stock');
}());

// ---- a secondary LAN device never reads labels -----------------------------
(function () {
  cvBag.zmt_lan_role = 'sub';
  const inv = CDB.getInvoice(CV._invDetailId);
  const ui = openEdit(inv.id);
  editScan(ui, WEIGHT_CODE);
  eq(CV._invEditNewItems.length, 0, 'a secondary LAN device stages nothing from a weighed label');
  eq(ui.status.textContent, t('invoices.scanNotFound'), 'and the edit screen calls that code unknown');
  editScan(ui, '5552');
  eq(CV._invEditNewItems.length, 1, 'an ordinary barcode still works on the same device');
  eq(CV._invEditNewItems[0].qty, 1, 'staged at the usual one unit');
  eq(CV._invEditNewItems[0].qtyDecimals, undefined, 'with no claim about decimal places');
  delete cvBag.zmt_lan_role;
}());

// ---- saving: the weighed line never drains the shelf -----------------------
(function () {
  const soapBefore = CDB.getProduct(cvSoap.id).quantity;
  const inv = mkInvoice([{ productId: cvSoap.id, barcode: '5552', name: 'صابون', qty: 2,
    price: 250, total: 500, unit: 'piece' }], 500);
  const ui = openEdit(inv.id);
  editScan(ui, WEIGHT_CODE);
  editScan(ui, '5552');
  cvAlerts.length = 0;
  CV.saveInvEdit();
  const saved = CDB.getInvoice(inv.id);
  eq(cvAlerts.length, 1, 'the save says one thing only');
  eq(cvAlerts[0], t('invoices.invoiceEdited'), 'and it is the usual confirmation');
  eq(saved.items.length, 3, 'both staged lines are on the invoice');
  const weighed = saved.items.find(it => it.productId === cvTomato.id);
  check(!!weighed, 'the weighed line was written');
  near(weighed.qty, 0.25, 'at the label weight');
  near(weighed.total, 22.5, 'for the card price');
  eq(weighed.qtyDecimals, 3, 'carrying the places the label printed');
  eq(CUnit.qtyUnit(weighed.qty, weighed), '0.250 كغ', 'and the saved invoice reads 0.250 كغ');
  near(saved.totalAmount, 500 + 22.5 + 250, 'the totals add up');
  eq(CDB.getProduct(cvTomato.id).quantity, 999999, 'a weighed card is never drained by an edited sale');
  eq(CDB.getProduct(cvSoap.id).quantity, soapBefore - 1, 'an ordinary card pays for the piece it sold');
  eq(CDB.getReturns().length, 0, 'adding lines is not a return');
}());

// ---- a return of a weighed line is recorded, never re-stocked --------------
(function () {
  const inv = mkInvoice([
    { productId: cvTomato.id, barcode: '5551', name: 'طماطم', qty: 0.5, price: 90, total: 45, unit: 'kg', qtyDecimals: 3 },
    { productId: cvSoap.id, barcode: '5552', name: 'صابون', qty: 2, price: 250, total: 500, unit: 'piece' },
  ], 545);
  const ui = openEdit(inv.id);
  eq(cvDoc.getElementById('editQty_0').value, '0.500', 'the weighed line reopens with the places it sold at');
  const tomatoBefore = CDB.getProduct(cvTomato.id).quantity;
  const soapBefore = CDB.getProduct(cvSoap.id).quantity;
  cvDoc.getElementById('editQty_0').value = '0.25';
  cvAlerts.length = 0;
  CV.saveInvEdit();
  const returns = CDB.getReturns();
  eq(returns.length, 1, 'half the weight handed back is one return record');
  eq(returns[0].productId, cvTomato.id, 'against the weighed card');
  near(returns[0].qty, 0.25, 'as the decimal the customer brought back, not rounded to a piece');
  eq(returns[0].invoiceId, inv.id, 'tied to the invoice it came off');
  eq(CDB.getProduct(cvTomato.id).quantity, tomatoBefore, 'and the shelf number is untouched by it');
  eq(CDB.getProduct(cvSoap.id).quantity, soapBefore, 'the untouched line moved nothing either');
  const saved = CDB.getInvoice(inv.id);
  near(saved.items[0].qty, 0.25, 'the invoice keeps the smaller weight');
  eq(saved.items[0].qtyDecimals, 3, 'and still prints it with the label\'s places');
  near(saved.totalAmount, 22.5 + 500, 'and the smaller total');
  eq(cvAlerts[0], t('invoices.invoiceEdited'), 'with the normal confirmation');
}());

// ---- «غير محدود» is never refused for quantity ----------------------------
(function () {
  const inv = mkInvoice([
    { productId: cvTomato.id, barcode: '5551', name: 'طماطم', qty: 0.5, price: 90, total: 45, unit: 'kg', qtyDecimals: 3 },
    { productId: cvSoap.id, barcode: '5552', name: 'صابون', qty: 1, price: 250, total: 250, unit: 'piece' },
  ], 295);
  const ui = openEdit(inv.id);
  const tomatoBefore = CDB.getProduct(cvTomato.id).quantity;
  // 900 kg is more than the sentinel stock of any card in this shop.
  cvDoc.getElementById('editQty_0').value = '900';
  cvAlerts.length = 0;
  CV.saveInvEdit();
  check(!cvAlerts.some(a => a === t('invoices.insufficientStock')),
    'a weighed line is never refused for wanting more than the shelf holds');
  near(CDB.getInvoice(inv.id).items[0].qty, 900, 'and the sale goes through at the weight asked for');
  eq(CDB.getProduct(cvTomato.id).quantity, tomatoBefore, 'while the shelf number stays exactly where it was');
  void ui;
}());

// ---- an unlimited card is not greyed out in the edit search ---------------
(function () {
  CV.renderEditProductSearch('موز');
  const box = cvDoc.getElementById('editSearchResults');
  check(box.innerHTML.indexOf('موز سائب') !== -1, 'the search finds the weighed card');
  eq(cvDoc.querySelectorAll('#editSearchResults .search-result-item:not(.disabled)').length, 1,
    'a «غير محدود» card with zero stock is offered, not marked out of stock');
  const staged = CV._invEditNewItems.length;
  cvAlerts.length = 0;
  CV.addEditProduct(cvBulk.id);
  eq(cvAlerts.length, 0, 'picking it raises no "not in stock" complaint');
  eq(CV._invEditNewItems.length, staged + 1, 'and the line stages');
}());

// ---- the customer page: the unit price on the line is the price ------------
(function () {
  const inv = mkInvoice([
    { productId: cvTomato.id, barcode: '5551', name: 'طماطم', qty: 0.5, price: 90, total: 45, unit: 'kg', qtyDecimals: 3 },
    { productId: cvSoap.id, barcode: '5552', name: 'صابون', qty: 3, price: 250, total: 750, unit: 'piece' },
  ], 795);
  CV._cdCustomerId = cvCustomer.id;
  CV._cdInvoices = [inv];
  CV._cdCurrentInvoiceId = inv.id;
  CV.editCdInvoice();
  eq(cvDoc.getElementById('cdEditInvoiceModal').style.display, 'flex', 'the customer page opens its edit window');
  eq(cvDoc.getElementById('cdEditItemQty_0').value, '0.500', 'showing the weighed line at its label weight');
  near(parseFloat(cvDoc.getElementById('cdEditItemUnitPrice_0').value), 90,
    'with the unit price the line carries — not the price divided by the quantity');
  eq(cvDoc.getElementById('cdEditItemTotal_0').textContent, 'DA45.00', 'and a line total of weight x unit price');
  near(parseFloat(cvDoc.getElementById('cdEditItemUnitPrice_1').value), 250,
    'the same on an ordinary multi-piece line');
  eq(cvDoc.getElementById('cdEditItemTotal_1').textContent, 'DA750.00', 'which is what the customer paid');

  const tomatoBefore = CDB.getProduct(cvTomato.id).quantity;
  const soapBefore = CDB.getProduct(cvSoap.id).quantity;
  const returnsBefore = CDB.getReturns().length;
  cvDoc.getElementById('cdEditItemQty_0').value = '0.25';
  cvAlerts.length = 0;
  CV.confirmCdEditInvoice();
  const added = CDB.getReturns().slice(returnsBefore);
  eq(added.length, 1, 'the halved weight is recorded as a return');
  near(added[0].qty, 0.25, 'to the last decimal');
  eq(added[0].invoiceId, inv.id, 'on the right invoice');
  eq(CDB.getProduct(cvTomato.id).quantity, tomatoBefore, 'and the weighed card is never restocked by it');
  eq(CDB.getProduct(cvSoap.id).quantity, soapBefore, 'the line nobody touched moved nothing');
  near(CDB.getInvoice(inv.id).totalAmount, 22.5 + 750, 'the invoice now totals the smaller weight plus the soap');
  eq(CDB.getInvoice(inv.id).items[0].qtyDecimals, 3, 'and the weighed line keeps its places after the edit');
  eq(cvDoc.getElementById('cdEditInvoiceModal').style.display, 'none', 'the window closed on the save');
  void tomatoBefore; void soapBefore;
}());

// ---- an increase on that page too: never refused, never deducted ----------
(function () {
  const inv = mkInvoice([
    { productId: cvTomato.id, barcode: '5551', name: 'طماطم', qty: 0.5, price: 90, total: 45, unit: 'kg', qtyDecimals: 3 },
  ], 45);
  CV._cdCustomerId = cvCustomer.id;
  CV._cdInvoices = [inv];
  CV._cdCurrentInvoiceId = inv.id;
  CV.editCdInvoice();
  const tomatoBefore = CDB.getProduct(cvTomato.id).quantity;
  cvDoc.getElementById('cdEditItemQty_0').value = '800';
  cvAlerts.length = 0;
  CV.confirmCdEditInvoice();
  check(!cvAlerts.some(a => String(a).indexOf('غير متوفر') !== -1 || String(a).indexOf('غير كافٍ') !== -1),
    'asking for 800 kg of a weighed article is never refused for stock');
  near(CDB.getInvoice(inv.id).items[0].total, 800 * 90, 'and it prices at the weight times the unit price');
  eq(CDB.getProduct(cvTomato.id).quantity, tomatoBefore, 'with the shelf number left alone');
}());

// ---- an unlisted line has no card, so it has no shelf to refuse from ------
(function () {
  const inv = mkInvoice([
    { productId: null, barcode: '', name: 'بلا اسم', qty: 1, price: 100, total: 100, unit: 'piece', freeLine: true },
  ], 100);
  CV._cdCustomerId = cvCustomer.id;
  CV._cdInvoices = [inv];
  CV._cdCurrentInvoiceId = inv.id;
  CV.editCdInvoice();
  cvDoc.getElementById('cdEditItemQty_0').value = '3';
  cvAlerts.length = 0;
  CV.confirmCdEditInvoice();
  eq(cvAlerts.length, 0, 'raising an unlisted line on the customer page raises no complaint');
  near(CDB.getInvoice(inv.id).items[0].qty, 3, 'and the line really takes the new quantity');
  near(CDB.getInvoice(inv.id).totalAmount, 300, 'with the total following it');
}());

// ---- the phone page stays a plain barcode reader --------------------------
(function () {
  const pdSrc = read('renderer/js/pages/price-display.js');
  check(pdSrc.indexOf('salesScaleLookup') === -1 && pdSrc.indexOf('ScaleCore') === -1,
    'the phone price page never loads the scale decoder');
  check(/getProductByBarcode/.test(pdSrc), 'it resolves ordinary barcodes only');
  eq(CDB.getProductByBarcode(WEIGHT_CODE), null, 'so a label code is unknown there, as designed');
  check(!!CDB.getProductByBarcode('5552'), 'while a real product barcode still answers');
}());

// ---- a bundle line returns its real components ----------------------------
(function () {
  const bA = CDB.addProduct({ name: 'مكوّن أ', barcode: '6001', buyPrice: 10, sellPrice: 30,
    quantity: 20, unit: 'piece', createdAt: 1 });
  const bB = CDB.addProduct({ name: 'مكوّن ب', barcode: '6002', buyPrice: 5, sellPrice: 20,
    quantity: 20, unit: 'piece', createdAt: 1 });
  const bundle = CDB.addBundle({ name: 'باقة تجريبية', barcode: '7001',
    components: [{ productId: bA.id, qty: 1 }, { productId: bB.id, qty: 2 }] });
  const sale = CV.SaleCore.computeSale(CDB, {
    lines: [{ entries: [{ productId: 'bundle:' + bundle.id, qty: 2, price: 50 }] }],
  });
  CDB.updateProductsBatch(sale.productUpdates);
  const item = sale.invoiceItems[0];
  check(Array.isArray(item.bundleComponents) && item.bundleComponents.length === 2,
    'a sold bundle snapshots its components on the invoice line');
  near(item.bundleComponents.reduce((s, c) => s + c.valuePerBundle, 0), 50,
    'whose value shares add up to the bundle price');
  const aBefore = CDB.getProduct(bA.id).quantity;
  const bBefore = CDB.getProduct(bB.id).quantity;
  const inv = mkInvoice([item], sale.totalAmount);
  // The sale was paid in full: a return must also trim the collected amount,
  // which is exactly what the net-account page counts as sales.
  CDB.addPayment({ invoiceId: inv.id, customerId: cvCustomer.id, amount: sale.totalAmount, method: 'cash' });
  openEdit(inv.id);
  cvDoc.getElementById('editQty_0').value = '1';
  cvAlerts.length = 0;
  CV.saveInvEdit();
  eq(cvAlerts.length, 1, 'decreasing a bundle line saves normally');
  eq(CDB.getProduct(bA.id).quantity, aBefore + 1, 'the first component comes back to stock');
  eq(CDB.getProduct(bB.id).quantity, bBefore + 2, 'and every second component too');
  const saved = CDB.getInvoice(inv.id);
  near(saved.totalAmount, 50, 'the sale total drops with the returned bundle');
  near(CDB.getInvoicePaidAmount(inv.id), 50, 'the collected (net-account) amount drops with it');
  eq(saved.items[0].bundleComponents.length, 2, 'the line keeps its component snapshot');

  // Partial return of a single component inside the remaining bundle.
  openEdit(inv.id);
  const compInput = cvDoc.getElementById('editCompReturn_0_0');
  check(!!compInput, 'the edit row offers a per-component return field');
  compInput.value = '1';
  cvAlerts.length = 0;
  CV.saveInvEdit();
  eq(cvAlerts.length, 1, 'a partial component return saves normally');
  eq(CDB.getProduct(bA.id).quantity, aBefore + 2, 'only the returned component goes back to stock');
  eq(CDB.getProduct(bB.id).quantity, bBefore + 2, 'the other component is untouched');
  const afterPartial = CDB.getInvoice(inv.id);
  near(afterPartial.totalAmount, 50 - item.bundleComponents[0].valuePerBundle,
    'and the line total loses exactly that component\'s share');
  const lastReturn = CDB.getReturns()[CDB.getReturns().length - 1];
  check(!!lastReturn && lastReturn.isBundleComponent === true,
    'the return is recorded against the bundle component');

  // Same behaviour through the customer page.
  CV._cdCustomerId = cvCustomer.id;
  CV._cdInvoices = [afterPartial];
  CV._cdCurrentInvoiceId = inv.id;
  CV.editCdInvoice();
  const cdComp = cvDoc.getElementById('cdEditCompReturn_0_1');
  check(!!cdComp, 'the customer page also offers component returns');
  cdComp.value = '1';
  const bBeforeCd = CDB.getProduct(bB.id).quantity;
  const totalBeforeCd = afterPartial.totalAmount;
  cvAlerts.length = 0;
  CV.confirmCdEditInvoice();
  eq(CDB.getProduct(bB.id).quantity, bBeforeCd + 1, 'the customer page restores that component');
  near(CDB.getInvoice(inv.id).totalAmount, totalBeforeCd - item.bundleComponents[1].valuePerBundle,
    'and credits its share from the invoice total');

  // Deleting the invoice gives back whatever components are still held.
  const aDeleteBefore = CDB.getProduct(bA.id).quantity;
  const bDeleteBefore = CDB.getProduct(bB.id).quantity;
  const sale2 = CV.SaleCore.computeSale(CDB, {
    lines: [{ entries: [{ productId: 'bundle:' + bundle.id, qty: 1, price: 50 }] }],
  });
  CDB.updateProductsBatch(sale2.productUpdates);
  const inv2 = mkInvoice([sale2.invoiceItems[0]], sale2.totalAmount);
  CV.closeInvDetail = () => {};
  CV.refreshInvoiceList = () => {};
  CV._invDetailId = inv2.id;
  CV.deleteInvoiceFromDetail();
  eq(CDB.getProduct(bA.id).quantity, aDeleteBefore, 'deleting a bundle invoice restores its first component');
  eq(CDB.getProduct(bB.id).quantity, bDeleteBefore, 'and all of its other components');
}());

// ==================================================== 7. PLU field in F1 ====
section('7) حقل PLU في نافذة الإدخال السريع F1 (quick-entry.js الحقيقية)');

const qeHtmlSrc = read('renderer/pages/quick-entry.html');
const qeJsSrc = read('renderer/js/pages/quick-entry.js');

// ---- the shipped markup, dictionary and grid agree on one new column ------
(function () {
  const at = (k) => qeHtmlSrc.indexOf('data-i18n="quickEntry.' + k + '"');
  check(at('plu') !== -1, 'quick-entry.html has a PLU header cell');
  check(at('reference') < at('plu') && at('plu') < at('barcode'),
    'the header stands between المرجع and الباركود, where the row paints its cell');

  const headBlock = /<div class="qe-grid-head">([\s\S]*?)<\/div>\s*<div id="qeRows">/.exec(qeHtmlSrc);
  check(!!headBlock, 'the header block of the F1 grid is readable');
  const cols = (headBlock[1].match(/<div class="qe-col/g) || []).length;

  const grid = /\.qe-grid-head, \.qe-row \{[^}]*grid-template-columns:([^;]+);[^}]*min-width:\s*(\d+)px/.exec(css);
  check(!!grid, 'main.css still declares the F1 grid rule');
  const tracks = grid[1].trim().split(/\s+/);
  eq(tracks.length, cols, 'the grid carries exactly one track per header column');
  const sum = tracks.reduce((s, tk) => s + (parseInt(tk, 10) || 0), 0);
  eq(sum, Number(grid[2]), 'and min-width is the sum of the tracks, so the sheet cannot clip a column');

  // The arrow path is the column order: PLU must be reachable right after the
  // reference and before the barcode, with the price band still the tail.
  const nav = /var QE_COLS = \[([^\]]+)\]/.exec(qeJsSrc)[1]
    .split(',').map((s) => s.trim().replace(/'/g, ''));
  eq(nav.indexOf('plu'), nav.indexOf('reference') + 1, 'the arrows step من المرجع إلى PLU');
  eq(nav.indexOf('barcode'), nav.indexOf('plu') + 1, 'and من PLU إلى الباركود');
  eq(nav[nav.length - 1], 'expiry', 'تاريخ الانتهاء يبقى آخر عمود قبل ذيل الأسعار الإضافية');

  // Every language the window speaks must name the new field.
  const i18nStart = qeJsSrc.indexOf('var QE_I18N = {');
  const i18n = sliceBalanced(qeJsSrc, qeJsSrc.indexOf('{', i18nStart), '{', '}');
  ['ar', 'en', 'fr', 'zh'].forEach((lang) => {
    const b = i18n.indexOf(lang + ': {');
    const slice = i18n.slice(b, i18n.indexOf(lang === 'zh' ? '}\n  };' : '},', b));
    check(/plu:/.test(slice) && /pluPlaceholder:/.test(slice),
      'quickEntry.plu is translated in ' + lang);
  });
  // The refusal message reuses the product card's own wording.
  ['ar', 'en', 'fr', 'zh'].forEach((lang) => {
    check(String(dictT(lang, 'inventory.pluConflict') || '').length > 0,
      'app.js defines inventory.pluConflict in ' + lang);
  });
}());

// ---- the window itself, running for real -----------------------------------
const qeDoc = createDoc();
(function () {
  const html = qeHtmlSrc;
  const body = /<body[^>]*>([\s\S]*)$/i.exec(html);
  parseInto(body ? body[1] : html, qeDoc.body);
}());
const qeBag = {};
const qeLS = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(qeBag, k) ? qeBag[k] : null),
  setItem: (k, v) => { qeBag[k] = String(v); },
  removeItem: (k) => { delete qeBag[k]; },
};
const qeAlerts = [];
const qeKeyHandlers = [];
const QS = {
  module: { exports: {} }, console, localStorage: qeLS, document: qeDoc,
  Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
  RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map, WeakMap,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  indexedDB: null, navigator: { onLine: false },
  fetch: () => Promise.reject(new Error('no network in tests')),
  alert: (m) => qeAlerts.push(String(m)),
  confirm: () => true,
  addEventListener: () => {}, removeEventListener: () => {},
  CustomEvent: function (name, opts) { this.type = name; this.detail = opts && opts.detail; },
  Auth: {
    isLoggedIn: () => true, getUserCode: () => 'T1', getCurrentUser: () => ({ name: 'مدير' }),
    getCompanyId: () => '', getRole: () => 'manager', getStoreName: () => 'المحل',
    isManager: () => true, canEdit: () => true, canView: () => true,
    currentUserId: () => 'u1', buyPriceVisible: () => true,
  },
  t,
  escHtml: (s) => String(s == null ? '' : s),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  debounce: (fn) => fn,
  getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
  getPharmacyMode: () => false,
  navigateTo: () => {},
  renderInventory: () => {},
  BRANDS: { global: [], chinese: [] },
  ExtraPrices: { fields: () => [], readInputs: () => ({}), inputsHTML: () => '', COLORS: ['#111'], MAX: 5, saveFields: () => {} },
  trackPageListener: (type, fn) => { if (type === 'keydown' && qeKeyHandlers.indexOf(fn) === -1) qeKeyHandlers.push(fn); },
  _currentPageId: 'quick-entry',
};
QS.window = QS;
QS.self = QS;
QS.globalThis = QS;
vm.createContext(QS);
['normBarcode', 'canonBarcode', 'normalizeSearchText', 'searchTokens', 'productSearchScore',
  'cleanScannedCode', 'normSearch'].forEach((n) => vm.runInContext(grabAppFn(n), QS, { filename: 'app.js#' + n }));
vm.runInContext(BARCODE_HELPERS, QS, { filename: 'app.js#barcode layout helpers' });
vm.runInContext(read('renderer/js/lib/units.js'), QS, { filename: 'units.js' });
vm.runInContext(read('renderer/js/purchase-core.js'), QS, { filename: 'purchase-core.js' });
vm.runInContext(read('renderer/js/sale-core.js'), QS, { filename: 'sale-core.js' });
vm.runInContext(read('renderer/js/scale-core.js'), QS, { filename: 'scale-core.js' });
vm.runInContext(read('renderer/js/db.js'), QS, { filename: 'db.js' });
vm.runInContext(read('renderer/js/pages/quick-entry.js'), QS, { filename: 'quick-entry.js' });
const QDB = vm.runInContext('DB', QS);
const QUnit = vm.runInContext('Unit', QS);

let qeInlineSeq = 0;
function qeInline(el, name, event) {
  const code = el && el.getAttribute(name);
  if (!code) { bad('the F1 element has no ' + name + ' handler'); return; }
  const key = '__qeInline' + (++qeInlineSeq);
  vm.runInContext('globalThis.' + key + ' = function (event) { return (function () {' + code + ' }).call(this, event); };',
    QS, { filename: 'inline-handler' });
  try { QS[key].call(el, event || { target: el, type: name.slice(2) }); }
  finally { delete QS[key]; }
}
const pluField = (uid) => qeDoc.getElementById('qePlu_' + uid);
const rowOf = (uid) => qeDoc.getElementById('qeRow_' + uid);
const pressArrow = (el, key) => {
  const ev = { key, code: key, target: el, preventDefault() {}, ctrlKey: false, altKey: false, metaKey: false };
  qeKeyHandlers.forEach((fn) => fn(ev));
};

check(typeof QS.QE === 'object' && typeof QS.QE.confirm === 'function', 'the F1 window is the real shipped one');

// ---- every function an inline command calls must really be published -------
// The whole page lives inside a closure, so an attribute like
// onchange="QE.setUnit(…)" can only reach a name the page put on window.QE.
// A missing one throws in the customer's app and keeps the old value silently.
(function () {
  const published = Object.keys(QS.QE);
  const unreachable = [];
  const attrRe = /\bon(?:input|change|blur|click|keydown)="([^"]*)"/g;
  let m;
  while ((m = attrRe.exec(qeJsSrc))) {
    const callRe = /\bQE\.([A-Za-z_][A-Za-z0-9_]*)/g;
    let c;
    while ((c = callRe.exec(m[1]))) {
      if (published.indexOf(c[1]) === -1 && unreachable.indexOf(c[1]) === -1) unreachable.push(c[1]);
    }
  }
  check(unreachable.length === 0,
    'كل أمر مضمّن في F1 يصل إلى دالة منشورة (' + unreachable.join(', ') + ')');
  check(['setUnit', 'setUnitLabel', 'unitBlur'].every((n) => published.indexOf(n) !== -1),
    'دوال الوحدة الثلاث منشورة في window.QE');
}());

QDB.addProduct({ name: 'طماطم السوق', barcode: '7001', plu: '00123', buyPrice: 60, sellPrice: 90,
  quantity: 500, unit: 'kg', createdAt: 1 });
QDB.addProduct({ name: 'صابون', barcode: '7002', buyPrice: 100, sellPrice: 250,
  quantity: 8, unit: 'piece', createdAt: 1 });

// ---- a fresh line offers the field with the card's own constraints ---------
(function () {
  QS.init_quick_entry();
  const uid = Number(rowOfFirst().dataset.uid);
  const inp = pluField(uid);
  check(!!inp, 'a new F1 line renders a PLU input');
  eq(inp.getAttribute('dir'), 'ltr', 'the code is typed left-to-right, the way the scale prints it');
  eq(inp.getAttribute('inputmode'), 'numeric', 'the numeric keypad opens for it');
  eq(inp.getAttribute('maxlength'), '8', 'and the same 8-digit cap as the product card stops a long barcode');
  eq(rowOf(uid).querySelectorAll('[data-col]').length, 17,
    'the row paints its 17 columns — the PLU is one more cell, not a replacement');

  inp.value = '456';
  qeInline(inp, 'oninput');
  const ref = rowOf(uid).querySelector('[data-col="reference"]');
  pressArrow(ref, 'ArrowLeft');
  eq(qeDoc._activeElement && qeDoc._activeElement.id, 'qePlu_' + uid,
    'اليسار من المرجق يقود إلى PLU');
  pressArrow(pluField(uid), 'ArrowRight');
  eq(qeDoc._activeElement && qeDoc._activeElement.id, 'qeReference_' + uid,
    'واليمين منه يعيد إلى المرجع');
  pressArrow(pluField(uid), 'ArrowLeft');
  eq(qeDoc._activeElement && qeDoc._activeElement.id, 'qeBarcode_' + uid,
    'وعلى يسار PLU يقف الباركود, كما في الشاشة');
}());

// ---- a chosen card shows its code and keeps it -----------------------------
(function () {
  QS.init_quick_entry();
  const uid = Number(rowOfFirst().dataset.uid);
  const tomato = QDB.getProducts().find((p) => p.barcode === '7001');
  QS.QE.selectProduct(uid, tomato.id);
  const inp = pluField(uid);
  eq(inp.value, '00123', 'selecting a card fills its scale code into the line');
  eq(inp.disabled, true, 'and locks it — the card owns the code, the receipt does not rewrite it');
  check(inp.classList.contains('qe-locked'), 'the locked field looks locked');
  // Retyping the product name drops the card, and its code with it.
  QS.QE.onProductInput(uid, 'طماطم سوق');
  eq(pluField(uid).value, '', 'un-selecting the card clears its code from the line');
}());

// ---- a code typed at goods receipt lands on the new card -------------------
(function () {
  QS.init_quick_entry();
  const uid = Number(rowOfFirst().dataset.uid);
  QS.QE.onProductInput(uid, 'جزر الميزان');
  const before = QDB.getProducts().length;
  const nameEl = rowOf(uid).querySelector('[data-col="product"]');
  nameEl.value = 'جزر الميزان';
  qeInline(nameEl, 'oninput');
  const set = (col, v) => {
    const el = rowOf(uid).querySelector('[data-col="' + col + '"]');
    el.value = v;
    qeInline(el, 'oninput');
  };
  set('barcode', '7003');
  set('plu', '00456');
  set('qty', '3');
  set('buy', '40');
  qeAlerts.length = 0;
  QS.QE.confirm();
  const created = QDB.getProducts().find((p) => p.barcode === '7003');
  check(!!created, 'the receipt created the new card');
  eq(created && created.plu, '00456', 'with the scale code written on it exactly as typed');
  eq(QDB.getProductByPlu('456') && QDB.getProductByPlu('456').id, created.id,
    'so the till finds it by 456 as well as by 00456');
  eq(QDB.getInvoices().length, 1, 'and the invoice went through');
}());

// ---- a code that already belongs to another article is refused -------------
(function () {
  const prodsBefore = QDB.getProducts().length;
  const invBefore = QDB.getInvoices().length;
  QS.init_quick_entry();
  const uid = Number(rowOfFirst().dataset.uid);
  const nameEl = rowOf(uid).querySelector('[data-col="product"]');
  nameEl.value = 'فلفل';
  qeInline(nameEl, 'oninput');
  const set = (col, v) => {
    const el = rowOf(uid).querySelector('[data-col="' + col + '"]');
    el.value = v;
    qeInline(el, 'oninput');
  };
  set('barcode', '7004');
  set('plu', '123');
  set('qty', '2');
  set('buy', '30');
  qeAlerts.length = 0;
  QS.QE.confirm();
  check(qeAlerts.some((a) => a.indexOf(t('inventory.pluConflict')) === 0),
    'borrowing the طماطم code is refused with the card\'s own wording');
  check(qeAlerts[0].indexOf('طماطم السوق') !== -1, 'and the message names the article that owns it');
  eq(QDB.getProducts().length, prodsBefore, 'nothing was created');
  eq(QDB.getInvoices().length, invBefore, 'and no invoice slipped through the half-written rows');
  eq(qeDoc._activeElement && qeDoc._activeElement.id, 'qePlu_' + uid,
    'the focus is put back on the field that is wrong');
}());

// ---- the same code twice inside one receipt ---------------------------------
(function () {
  const prodsBefore = QDB.getProducts().length;
  QS.init_quick_entry();
  const first = Number(rowOfFirst().dataset.uid);
  QS.QE.addRow();
  const second = Number(qeDoc.getElementById('qeRows').lastElementChild.dataset.uid);
  [['جزر', '7005', '00777', first], ['كوسة', '7006', '777', second]].forEach((cfg) => {
    const [name, code, plu, uid] = cfg;
    const nameEl = rowOf(uid).querySelector('[data-col="product"]');
    nameEl.value = name;
    qeInline(nameEl, 'oninput');
    const set = (col, v) => {
      const el = rowOf(uid).querySelector('[data-col="' + col + '"]');
      el.value = v;
      qeInline(el, 'oninput');
    };
    set('barcode', code); set('plu', plu); set('qty', '1'); set('buy', '20');
  });
  qeAlerts.length = 0;
  QS.QE.confirm();
  check(qeAlerts.some((a) => a.indexOf(t('inventory.pluConflict')) === 0),
    '00777 and 777 in one receipt are the same code, and the second is refused');
  eq(QDB.getProducts().length, prodsBefore, 'so neither of the two half-coded cards was written');
}());

// ---- the unit picker reaches the card it creates ----------------------------
// The defect this proves fixed: the cell called QE.setUnit while the page never
// published it, so picking «كغ» threw inside the event handler — invisible to the
// cashier — and the line kept Unit.DEFAULT. The card was born as «قطعة».
(function () {
  QS.init_quick_entry();
  const uid = Number(rowOfFirst().dataset.uid);
  const nameEl = rowOf(uid).querySelector('[data-col="product"]');
  nameEl.value = 'تمر هندي';
  qeInline(nameEl, 'oninput');
  const set = (col, v) => {
    const el = rowOf(uid).querySelector('[data-col="' + col + '"]');
    el.value = v;
    qeInline(el, 'oninput');
  };
  set('barcode', '7101'); set('qty', '0.25'); set('buy', '120'); set('sell', '200');

  const sel = rowOf(uid).querySelector('[data-col="unit"]');
  eq(sel && sel.tagName, 'SELECT', 'the unit column opens as the built-in list');
  sel.value = 'kg';
  let threw = null;
  try { qeInline(sel, 'onchange'); } catch (e) { threw = e.message; }
  eq(threw, null, 'اختيار «كغ» ينفّذ بلا استثناء');
  eq(rowOf(uid).querySelector('[data-col="unit"]').value, 'kg', 'ويبقى الحقل على كغ بعد إعادة رسم الخلية');

  const invBefore = QDB.getInvoices().length;
  qeAlerts.length = 0;
  QS.QE.confirm();
  const card = QDB.getProducts().find((p) => p.barcode === '7101');
  eq(card && card.unit, 'kg', 'البطاقة تُولد بوحدة الكيلو، لا بالافتراضي');
  eq(QDB.getInvoices().length, invBefore + 1, 'and the receipt went through');
  const line = QDB.getInvoices().slice(-1)[0].items[0];
  eq(QUnit.qtyUnit(line.qty, line), '0.25 كغ', 'وسطر الفاتورة يُطبع 0.25 كغ كما وزنها الزبون');
}());

// ---- the free-text unit («أخرى») keeps the name typed for it ---------------
(function () {
  QS.init_quick_entry();
  const uid = Number(rowOfFirst().dataset.uid);
  const set = (col, v) => {
    const el = rowOf(uid).querySelector('[data-col="' + col + '"]');
    el.value = v;
    qeInline(el, 'oninput');
  };
  const nameEl = rowOf(uid).querySelector('[data-col="product"]');
  nameEl.value = 'كيس إسمنت';
  qeInline(nameEl, 'oninput');
  set('barcode', '7102'); set('qty', '2'); set('buy', '900');
  const sel = rowOf(uid).querySelector('[data-col="unit"]');
  sel.value = 'custom';
  qeInline(sel, 'onchange');
  const free = rowOf(uid).querySelector('[data-col="unit"]');
  eq(free && free.tagName, 'INPUT', 'اختيار «أخرى» يحوّل الخلية إلى حقل حر');
  free.value = 'ربطة';
  qeInline(free, 'oninput');
  qeInline(free, 'onblur');
  QS.QE.confirm();
  const card = QDB.getProducts().find((p) => p.barcode === '7102');
  eq(card && card.unit, 'custom', 'البطاقة تُحفظ كوحدة مخصّصة');
  eq(card && card.unitLabel, 'ربطة', 'باسمها المكتوب، لا باسم «أخرى» الافتراضي');
}());

// ---- the edit screen round-trips the field ---------------------------------
(function () {
  QS._invQEAddResult = null;
  QS.window._qePrefill = {
    invoiceId: 'X1', invoiceNumber: '1', supplierName: '', rows: [
      { src: 'item', itemIdx: 0, productId: null, name: 'طماطم السوق', barcode: '7001',
        qty: 2, price: 60, plu: '00123' },
      { isNew: true, name: 'بصل', barcode: '7007', qty: 1, price: 50, plu: '00789' },
    ],
  };
  QS.window._qePrefill.rows[0].productId = QDB.getProducts().find((p) => p.barcode === '7001').id;
  QS.init_quick_entry();
  const rows = qeDoc.getElementById('qeRows').children;
  eq(rows.length, 2, 'the edit hands both lines to the window');
  const locked = pluField(Number(rows[0].dataset.uid));
  eq(locked.value, '00123', 'the invoice line comes back showing its card\'s code');
  eq(locked.disabled, true, 'locked, exactly like the rest of the card details');
  const fresh = pluField(Number(rows[1].dataset.uid));
  eq(fresh.value, '00789', 'and a staged new product keeps the code typed for it');
  eq(fresh.disabled, false, 'still editable, because no card owns it yet');
  qeAlerts.length = 0;
  QS.QE.confirm();
  const res = QS._invQEAddResult;
  check(!!res && res.additions.length === 1, 'the window returns the new line to the edit screen');
  eq(res.additions[0].payload.plu, '00789', 'with the scale code inside the create payload');
  eq(QDB.getProducts().find((p) => p.barcode === '7007'), undefined,
    'and nothing is created yet — the edit screen does that only on save');
}());

function rowOfFirst() { return qeDoc.getElementById('qeRows').firstElementChild; }

// ================================================================ report ====
console.log('');
console.log(pass + ' checks passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
