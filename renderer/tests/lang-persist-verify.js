// ============================================================
// ZMT PIECE — UI language persistence + direction
// Run: node renderer/tests/lang-persist-verify.js
//
// Guards the fix for three field bugs:
//   1. the language choice now survives logout / restart (zmt_lang),
//   2. <html lang/dir> follow the choice instead of staying Arabic,
//   3. data-i18n-title / -aria-label / -value are translated too,
//      not only data-i18n / -placeholder.
// Everything is exercised through the REAL functions copied out of
// app.js, so the test cannot drift away from the shipped code.
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createDoc } = require('./dom-lite');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let fails = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
const check = (cond, m) => (cond ? ok(m) : bad(m));

const appSrc = read('renderer/js/app.js');
const indexHtml = read('renderer/index.html');
const settingsSrc = read('renderer/js/pages/settings.js');
const authSrc = read('renderer/js/auth.js');

// The exact function body as shipped, found by name with brace matching so a
// renamed or emptied function cannot silently pass.
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing function ' + name);
  let depth = 0, started = false, end = i;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { end = j + 1; break; } }
  }
  return src.slice(i, end);
}
function pickLine(src, needle, label) {
  const line = src.split(/\r?\n/).find((l) => l.indexOf(needle) !== -1);
  if (!line) throw new Error('missing source line: ' + label);
  return line.trim();
}

// Same shape as the shipped dictionaries: dotted keys are nested objects.
const DICT = {
  ar: { appTitle: 'ZMT عربي', common: { edit: 'تعديل', close: 'إغلاق' } },
  en: { appTitle: 'ZMT', common: { edit: 'Edit', close: 'Close' } },
  fr: { appTitle: 'ZMT', common: { edit: 'Modifier', close: 'Fermer' } },
  zh: { appTitle: 'ZMT', common: { edit: '编辑', close: '关闭' } },
};
const LABELS = { ar: 'AR', en: 'EN', fr: 'FR', zh: '中文' };

// ---------------------------------------------------------------- harness ----
function boot(initialStore) {
  const store = Object.assign({}, initialStore || {});
  const events = [];
  const doc = createDoc();
  doc.title = 'ZMT PIECE';
  doc.body.innerHTML =
    '<span id="appTitleText"></span>' +
    '<span id="langLabel"></span>' +
    '<select id="settingsLang"><option value="ar">AR</option><option value="en">EN</option>' +
    '<option value="fr">FR</option><option value="zh">中文</option></select>' +
    '<button id="ttl" data-i18n-title="common.edit" title="تعديل">e</button>' +
    '<button id="aria" data-i18n-aria-label="common.edit" aria-label="تعديل">a</button>' +
    '<input id="ph" data-i18n-placeholder="common.edit" placeholder="تعديل">' +
    '<input id="val" data-i18n-value="common.edit" value="تعديل">' +
    '<div id="pageContainer">' +
      '<span id="pgtxt" data-i18n="common.edit">تعديل</span>' +
      '<button id="pgttl" data-i18n-title="common.edit" title="تعديل">p</button>' +
    '</div>';

  const localStorageStub = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: localStorageStub,
    document: doc,
    LANG: DICT,
    LANG_ORDER: ['ar', 'en', 'fr', 'zh'],
    LANG_LABELS: LABELS,
    navigator: { onLine: true },
    setTimeout, clearTimeout,
    CustomEvent: function CustomEvent(type, opts) {
      this.type = type;
      this.detail = opts && opts.detail;
    },
    dispatchEvent(ev) { events.push(ev); return true; },
    renderChart: null,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const constKey = pickLine(appSrc, 'const LANG_STORAGE_KEY', 'LANG_STORAGE_KEY');
  const initLang = pickLine(appSrc, 'let __lang = readSavedLanguage()', 'saved-language init');
  const exposeLang = pickLine(appSrc, 'window.__lang = __lang;', 'window.__lang export');
  const src = [
    constKey,
    grabFn(appSrc, 'readSavedLanguage'),
    initLang,
    exposeLang,
    grabFn(appSrc, 'isRTL'),
    grabFn(appSrc, 't'),
    grabFn(appSrc, 'applyTranslation'),
    grabFn(appSrc, 'applyConnectionText'),
    grabFn(appSrc, 'setLanguage'),
    grabFn(appSrc, 'switchLanguage'),
  ].join('\n');
  vm.runInContext(src, sandbox, { filename: 'app.js#language' });

  return {
    store, events, doc, vm: sandbox,
    get lang() { return vm.runInContext('__lang', sandbox); },
    run(code) { return vm.runInContext(code, sandbox); },
    text(sel) {
      const el = doc.querySelector(sel);
      return el ? (el.textContent || '') : null;
    },
    el(id) { return doc.getElementById(id); },
  };
}

// ============================================================
console.log('============================================');
console.log('language persistence + <html dir/lang> + titles');
console.log('============================================');

// ---------------------------------------------------------- 1. source ----
console.log('\n--- 1. persisted storage key ---');
check(appSrc.includes("const LANG_STORAGE_KEY = 'zmt_lang';"), 'app.js defines the zmt_lang storage key');
check(appSrc.includes('let __lang = readSavedLanguage();'), 'the language is read from storage at boot');
check(!/let __lang = 'ar';/.test(appSrc), 'no hard-coded Arabic language initializer remains');
check(/setItem\(LANG_STORAGE_KEY, __lang\)/.test(appSrc), 'setLanguage writes the choice to localStorage');
check(!/removeItem\(LANG_STORAGE_KEY\)/.test(appSrc), 'nothing clears the language key');
check(!/removeItem\([^)]*zmt_lang/.test(authSrc), 'sign-out never removes zmt_lang');
check(/localStorage\.getItem\('zmt_lang'\)/.test(indexHtml), 'index.html applies the saved language before first paint');
check(/__savedLang === 'ar' \? 'rtl' : 'ltr'/.test(indexHtml), 'pre-paint script sets the matching direction');
check(/window\.setLanguage = setLanguage/.test(appSrc), 'setLanguage is exposed for other pages');
check(/window\.isRTL = isRTL/.test(appSrc), 'isRTL is exposed for pages');
check(/typeof window\.setLanguage === 'function'/.test(settingsSrc) &&
  !/for \(let i = 0; i < diff; i\+\+\) window\.switchLanguage\(\)/.test(settingsSrc),
  'settings selector calls setLanguage directly (no repeat-click loop)');

// ---------------------------------------------------------- 2. readSaved ----
console.log('\n--- 2. reading the saved language ---');
{
  const h = boot({});
  check(h.run("readSavedLanguage()") === 'ar', 'no saved value falls back to Arabic');
  h.store.zmt_lang = 'fr';
  check(h.run("readSavedLanguage()") === 'fr', 'a saved fr is honoured');
  h.store.zmt_lang = 'de';
  check(h.run("readSavedLanguage()") === 'ar', 'an unknown code falls back to Arabic');
  h.store.zmt_lang = '';
  check(h.run("readSavedLanguage()") === 'ar', 'an empty value falls back to Arabic');
}
{
  const h = boot({ zmt_lang: 'en' });
  check(h.lang === 'en', 'the app boots in the saved language (en)');
  check(h.vm.window.__lang === 'en', 'window.__lang matches the saved language');
  h.run('applyTranslation()');
  check(h.doc.documentElement.dir === 'ltr', 'the first translation paints LTR, not Arabic RTL');
}

// ---------------------------------------------------------- 3. applyTranslation ----
console.log('\n--- 3. applyTranslation covers every data-i18n* attribute ---');
{
  const h = boot({ zmt_lang: 'fr' });
  h.run('applyTranslation()');
  const doc = h.doc;
  check(doc.documentElement.dir === 'ltr', 'fr sets dir=ltr');
  check(doc.documentElement.lang === 'fr', 'html lang becomes fr');
  check(h.el('ttl').title === 'Modifier', 'data-i18n-title is translated');
  check(h.el('aria').getAttribute('aria-label') === 'Modifier', 'data-i18n-aria-label is translated');
  check(h.el('ph').placeholder === 'Modifier', 'data-i18n-placeholder is still translated');
  check(h.el('val').value === 'Modifier', 'data-i18n-value is translated');
  check(h.el('pgtxt').textContent === 'Modifier', 'pageContainer text is translated');
  check(h.el('pgttl').title === 'Modifier', 'pageContainer title is translated');
  check(h.el('langLabel').textContent === 'FR', 'the language badge shows FR');
  check(h.el('appTitleText').textContent === 'ZMT', 'the title text is translated');
}
{
  const h = boot({ zmt_lang: 'zh' });
  h.run('applyTranslation()');
  check(h.doc.documentElement.dir === 'ltr', 'zh sets dir=ltr');
  check(h.doc.documentElement.lang === 'zh', 'html lang becomes zh');
  check(h.el('ttl').title === '编辑', 'zh data-i18n-title is translated');
}
{
  const h = boot({ zmt_lang: 'ar' });
  h.run('applyTranslation()');
  check(h.doc.documentElement.dir === 'rtl', 'ar sets dir=rtl');
  check(h.el('ttl').title === 'تعديل', 'ar keeps the Arabic title');
}

// ---------------------------------------------------------- 4. setLanguage ----
console.log('\n--- 4. setLanguage: storage, direction, event, selector ---');
{
  const h = boot({});
  const out = h.run("setLanguage('en')");
  check(out === 'en' && h.lang === 'en', 'setLanguage changes the active language');
  check(h.vm.window.__lang === 'en', 'window.__lang is updated');
  check(h.store.zmt_lang === 'en', 'the choice is persisted under zmt_lang');
  check(h.doc.documentElement.dir === 'ltr', 'direction flips to LTR');
  check(h.el('settingsLang').value === 'en', 'the settings selector follows the language');
  check(h.events.length === 1 && h.events[0].type === 'zmt:language', 'a zmt:language event is emitted once');
  check(h.events[0].detail.lang === 'en' && h.events[0].detail.rtl === false, 'the event carries lang + rtl');

  h.run("setLanguage('ar')");
  check(h.store.zmt_lang === 'ar', 'switching back to Arabic is persisted');
  check(h.doc.documentElement.dir === 'rtl', 'direction flips back to RTL');
  check(h.events.length === 2 && h.events[1].detail.rtl === true, 'the Arabic event reports rtl=true');

  const before = h.events.length;
  h.run("setLanguage('ar')");
  check(h.events.length === before, 're-selecting the same language emits no duplicate event');

  h.run("setLanguage('nope')");
  check(h.lang === 'ar' && h.store.zmt_lang === 'ar', 'an unknown code degrades to Arabic safely');

  h.run('switchLanguage()');
  check(h.lang === 'en', 'the language button cycles ar -> en');
}

// ---------------------------------------------------------- 5. round-trip ----
console.log('\n--- 5. survives a restart (fresh context, same storage) ---');
{
  const first = boot({});
  first.run("setLanguage('fr')");
  const second = boot(first.store);
  check(second.lang === 'fr', 'a new app session restores fr');
  second.run('applyTranslation()');
  check(second.doc.documentElement.dir === 'ltr', 'the restored session paints LTR');
  second.run("setLanguage('zh')");
  const third = boot(second.store);
  check(third.lang === 'zh', 'a second restart restores zh');
}

// ---------------------------------------------------------- 6. isRTL ----
console.log('\n--- 6. isRTL helper ---');
{
  const h = boot({});
  check(h.run("isRTL('ar')") === true, "isRTL('ar') is true");
  check(h.run("isRTL('en')") === false, "isRTL('en') is false");
  check(h.run("isRTL('fr')") === false, "isRTL('fr') is false");
  check(h.run("isRTL('zh')") === false, "isRTL('zh') is false");
  check(h.run('isRTL()') === true, 'isRTL() reads the current language');
  h.run("setLanguage('en')");
  check(h.run('isRTL()') === false, 'isRTL() follows setLanguage');
}

console.log('\n============================================');
console.log((fails === 0 ? 'PASS' : 'FAIL') + ' — fail=' + fails);
console.log('============================================');
process.exit(fails === 0 ? 0 : 1);
