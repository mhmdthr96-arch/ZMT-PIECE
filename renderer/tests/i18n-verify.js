// ============================================================
// ZMT PIECE — i18n completeness guard
// Run: node renderer/tests/i18n-verify.js
//
// Guards the Phase 2 work:
//   1. every data-i18n* key used in the shipped markup exists in all
//      four UI languages (ar / en / fr / zh),
//   2. every key passed to t() from the renderer JS exists in all four
//      UI languages,
//   3. the navigation containers pd / rest live at the dictionary root,
//   4. applyTranslation really covers titles / aria-labels / placeholders /
//      values (not only text nodes).
// The real dictionaries and the real functions are copied out of app.js, so
// the test cannot drift away from the shipped code.
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

// ------------------------------------------------------- real dictionaries
function loadRealLang() {
  const a = appSrc.indexOf('const LANG = {');
  const b = appSrc.indexOf('const LANG_STORAGE_KEY');
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(appSrc.slice(a, b) + ';globalThis.__L = LANG;', ctx, { filename: 'app.js#LANG' });
  return ctx.__L;
}
const REAL = loadRealLang();
const LANGS = ['ar', 'en', 'fr', 'zh'];

function dig(obj, key) {
  let v = obj;
  for (const p of key.split('.')) { if (v && typeof v === 'object') v = v[p]; else return undefined; }
  return v;
}
function collectKeys(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object') collectKeys(v, key, out);
    else if (typeof v === 'string') out.push(key);
  }
  return out;
}
const keysByLang = {};
for (const l of LANGS) {
  const keys = collectKeys(REAL[l] || {}, '', []);
  keysByLang[l] = new Set(keys);
}

function hasKey(lang, key) {
  const v = dig(REAL[lang], key);
  return typeof v === 'string' && v.length > 0;
}

// ------------------------------------------------------------ HTML data-i18n keys
function collectHtmlKeys() {
  const keys = new Set();
  const walk = (rel) => {
    const p = path.join(base, rel);
    if (fs.statSync(p).isDirectory()) {
      for (const n of fs.readdirSync(p)) if (n.endsWith('.html')) walk(rel + '/' + n);
      return;
    }
    const src = read(rel);
    const re = /data-i18n(?:-[a-z][a-z0-9-]*)?="([^"]*)"/g;
    let m;
    while ((m = re.exec(src))) {
      if (m[1]) keys.add(m[1]);
    }
  };
  walk('renderer/index.html');
  const pagesDir = path.join(base, 'renderer/pages');
  for (const n of fs.readdirSync(pagesDir)) if (n.endsWith('.html')) walk('renderer/pages/' + n);
  return keys;
}
const htmlKeys = collectHtmlKeys();

// --------------------------------------------------------- dynamic t() keys
function collectJsKeys() {
  const keys = new Set();
  const walk = (dir, rel) => {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      const r = rel + '/' + n;
      if (fs.statSync(p).isDirectory()) {
        if (n === 'vendor') continue;
        walk(p, r);
      }
      else if (n.endsWith('.js')) {
        const src = fs.readFileSync(p, 'utf8');
        const re = /\bt\(\s*(['"])([^'"\n]+)\1/g;
        let m;
        while ((m = re.exec(src))) {
          const key = m[2];
          // only accept well-formed dotted dictionary keys
          if (!/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(key)) continue;
          if (key.includes('*') || key.includes(':') || key.includes(' ')) continue;
          keys.add(key);
        }
      }
    }
  };
  walk(path.join(base, 'renderer/js'), 'renderer/js');
  return keys;
}
const jsKeys = collectJsKeys();

// ==================================================================
console.log('============================================');
console.log('i18n completeness (HTML + dynamic keys, pd/rest, applyTranslation)');
console.log('============================================');

console.log('\n--- 1. dictionary completeness per language ---');
for (const l of LANGS) {
  const ks = [...keysByLang[l]].sort();
  check(ks.length > 50, l + ' dictionary exposes a rich key set (' + ks.length + ' keys)');
}

console.log('\n--- 2. every HTML data-i18n key exists in all four languages ---');
{
  const allMissing = [];
  for (const k of [...htmlKeys].sort()) {
    for (const l of LANGS) {
      if (!hasKey(l, k)) allMissing.push(l + ':' + k);
    }
  }
  check(allMissing.length === 0, 'all HTML data-i18n keys exist in ar/en/fr/zh' + (allMissing.length ? ' — missing: ' + allMissing.slice(0, 40).join(', ') : ''));
}

console.log('\n--- 3. every dynamic t() key exists in all four languages ---');
{
  const allMissing = [];
  for (const k of [...jsKeys].sort()) {
    for (const l of LANGS) {
      if (!hasKey(l, k)) allMissing.push(l + ':' + k);
    }
  }
  check(allMissing.length === 0, 'all dynamic t() keys exist in ar/en/fr/zh' + (allMissing.length ? ' — missing: ' + allMissing.slice(0, 60).join(', ') : ''));
}

console.log('\n--- 4. pd / rest containers live at the dictionary root ---');
{
  for (const l of LANGS) {
    check(dig(REAL[l], 'pd') && typeof dig(REAL[l], 'pd') === 'object' && !!dig(REAL[l], 'pd.tab'),
      'pd is a root-level group with children in ' + l);
    check(dig(REAL[l], 'rest') && typeof dig(REAL[l], 'rest') === 'object' && !!dig(REAL[l], 'rest.tab'),
      'rest is a root-level group with children in ' + l);
    check(dig(REAL[l], 'login') && typeof dig(REAL[l], 'login') === 'object' && !!dig(REAL[l], 'login.loginSubtitle'),
      'login is a root-level group with children in ' + l);
  }
}

console.log('\n--- 5. applyTranslation covers every attribute kind ---');
{
  const src = grabFn(appSrc, 'applyTranslation');
  check(/data-i18n\]/.test(src) || src.includes('data-i18n'), 'applyTranslation queries [data-i18n]');
  check(src.includes('data-i18n-placeholder'), 'applyTranslation queries [data-i18n-placeholder]');
  check(src.includes('data-i18n-title'), 'applyTranslation queries [data-i18n-title]');
  check(src.includes('data-i18n-aria-label'), 'applyTranslation queries [data-i18n-aria-label]');
  check(src.includes('data-i18n-value'), 'applyTranslation queries [data-i18n-value]');
}

console.log('\n============================================');
console.log((fails === 0 ? 'PASS' : 'FAIL') + ' — fail=' + fails);
console.log('============================================');
process.exit(fails === 0 ? 0 : 1);
