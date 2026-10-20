// ============================================================
// ZMT PIECE — restaurant UI redesign static checks
// Run: node renderer/tests/rest-ui-verify.js
// Guards the restaurant redesign: no undefined CSS variables,
// no cramped fixed sizes, unique overlay ids, class contract,
// dead classes gone, i18n coverage in ar/en/fr/zh.
// ============================================================
const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', '..') + path.sep;
let fails = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

console.log('============================================');
console.log('اختبار rest-ui — فحص واجهة المطعم الثابت');
console.log('============================================');

// ---------- 1. no undefined CSS variables in the restaurant UI ----------
console.log('\n--- 1. متغيرات CSS غير معرّفة ---');
const uiFiles = [
  'renderer/css/rest.css',
  'renderer/pages/local-orders.html',
  'renderer/pages/connection.html',
  'renderer/js/rest-service.js',
  'renderer/js/pages/local-orders.js',
  'renderer/js/pages/sales.js'
];
const banned = ['var(--panel', 'var(--text', 'var(--line'];
for (const f of uiFiles) {
  const s = read(f);
  const hits = banned.filter(b => s.indexOf(b) !== -1);
  hits.length ? bad(f + ' -> ' + hits.join(', ')) : ok(f);
}

// ---------- 2. cramped / low-contrast leftovers ----------
console.log('\n--- 2. أحجام وتباين سيئة ---');
const cramped = [
  ['renderer/js/rest-service.js', 'max-width:360px'],
  ['renderer/css/rest.css', 'max-width:360px'],
  ['renderer/css/rest.css', 'width:330px'],
  ['renderer/css/rest.css', '#ffb74d'],
  ['renderer/js/rest-service.js', 'opacity:.55'],
  ['renderer/js/pages/local-orders.js', 'opacity:.55']
];
for (const [f, needle] of cramped) {
  read(f).indexOf(needle) === -1
    ? ok(f + ' — لا يحوي "' + needle + '"')
    : bad(f + ' — ما زال يحوي "' + needle + '"');
}

// ---------- 3. overlay ids are unique ----------
console.log('\n--- 3. معرّفات النوافذ ---');
const restSrc = read('renderer/js/rest-service.js');
for (const id of ['restPopupVeil', 'restOrderVeil', 'restConfirmVeil']) {
  const decl = (restSrc.match(new RegExp("veil\\.id = '" + id + "'", 'g')) || []).length;
  if (id === 'restPopupVeil') {
    decl === 0 ? ok('حُذف ' + id + ' القديم') : bad(id + ' ما زال موجودًا x' + decl);
  } else {
    decl === 1 ? ok(id + ' يُعلن مرة واحدة') : bad(id + ' يُعلن ' + decl + ' مرات');
  }
}

// ---------- 4. class contract (js/html -> css) ----------
console.log('\n--- 4. عقد الأصناف ---');
const css = ['renderer/css/rest.css', 'renderer/css/main.css', 'renderer/css/license.css']
  .map(read).join('\n');
const required = [
  'prod-card-badge.info', 'rest-btn-progress', 'rest-btn-done', 'rest-btn-confirm',
  'rest-btn-cancel', 'rest-btn-ghost', 'rest-drawer', 'rest-drawer-scrim', 'rest-fab',
  'rest-order-btn-primary', 'rest-order-btn-self', 'rest-lo-card', 'rest-lo-noact',
  'rest-popup-veil', 'rest-dialog-foot', 'rest-cart-price', 'rest-foot-total',
  'rest-orders-tab', 'rest-orders-empty', 'rest-icon-btn', 'rest-chip',
  'rest-popup-actions', 'rest-send-go', 'rest-head-ico', 'rest-lo-id', 'rest-lo-inv'
];
for (const c of required) {
  css.indexOf('.' + c) !== -1 ? ok('.' + c) : bad('.' + c + ' مفقود من CSS');
}

// ---------- 5. dead classes no longer emitted ----------
console.log('\n--- 5. أصناف ميتة ---');
const dead = [
  ['renderer/js/pages/local-orders.js', 'class="mono"'],
  ['renderer/js/pages/local-orders.js', 'btn btn-sm'],
  ['renderer/js/pages/local-orders.js', 'text-muted'],
  ['renderer/js/pages/sales.js', 'prod-card-oos-btn rest-order-btn']
];
for (const [f, needle] of dead) {
  read(f).indexOf(needle) === -1
    ? ok(f + ' خالٍ من "' + needle + '"')
    : bad(f + ' ما زال يُصدر "' + needle + '"');
}

// ---------- 6/7. i18n coverage in four languages ----------
console.log('\n--- 6. تغطية الترجمة ---');
const app = read('renderer/js/app.js');
const langBlocks = {};
const starts = [];
const re2 = /\n  (ar|en|fr|zh): \{/g;
let m2;
while ((m2 = re2.exec(app))) starts.push([m2[1], m2.index]);
for (let i = 0; i < starts.length; i++) {
  const end = i + 1 < starts.length ? starts[i + 1][1] : app.length;
  langBlocks[starts[i][0]] = app.slice(starts[i][1], end);
}
const langs = ['ar', 'en', 'fr', 'zh'];
function restSegment(L) {
  const body = langBlocks[L] || '';
  const s = body.indexOf('rest: {');
  if (s === -1) return '';
  const e = body.indexOf('\n    },', s);
  return e === -1 ? '' : body.slice(s, e);
}
function hasKey(L, short) {
  return new RegExp('^\\s*' + short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:', 'm').test(restSegment(L));
}

const keys = new Set();
for (const f of ['renderer/js/rest-service.js', 'renderer/js/pages/local-orders.js', 'renderer/js/pages/connection.js', 'renderer/js/pages/sales.js']) {
  let m; const re = /t\(\s*'(rest\.[A-Za-z0-9_]+)'\s*\)/g;
  while ((m = re.exec(read(f)))) keys.add(m[1]);
}
const missing = [];
for (const k of [...keys].sort()) {
  for (const L of langs) if (!hasKey(L, k.slice(5))) missing.push(k + ' @' + L);
}
missing.length ? bad(missing.join('; ')) : ok(keys.size + ' مفتاح rest موجود في اللغات الأربع');

console.log('\n--- 7. مفاتيح إعادة التصميم ---');
for (const k of ['rest.close', 'rest.itemsCount', 'rest.noActions', 'rest.confirmSub',
  'rest.cartSub', 'rest.emptyCartHint', 'rest.notesPlaceholder', 'rest.orderSent']) {
  const n = langs.filter(L => hasKey(L, k.slice(5))).length;
  n === 4 ? ok(k) : bad(k + ' في ' + n + '/4 لغات');
}

console.log('\n============================================');
console.log(fails === 0 ? 'نجح: كل الفحوصات الثابتة' : 'فشل: ' + fails + ' فحصًا');
console.log('============================================');
process.exit(fails ? 1 : 0);
