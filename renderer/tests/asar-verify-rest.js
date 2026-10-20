// Verify the restaurant redesign actually shipped inside the built asars.
// Usage: node asar-verify-rest.js
// NOTE: uses @electron/asar extractFile() — never `asar extract-file` CLI
// (that command overwrites sources in place).
const path = require('path');
const asar = require('@electron/asar');

const root = path.join(__dirname, '..', '..') + path.sep;
const targets = [
  'dist/win-unpacked/resources/app.asar',
  'dist/win-ia32-unpacked/resources/app.asar',
  'dist-win7/win-unpacked/resources/app.asar',
  'dist-win7/win-ia32-unpacked/resources/app.asar'
];

const checks = [
  ['renderer/css/rest.css', ['--r-accent-solid', '.rest-drawer {', '.rest-order-btn-primary', '.rest-lo-noact']],
  ['renderer/css/main.css', ['.prod-card-badge.info']],
  ['renderer/js/rest-service.js', ['restConfirmVeil', 'restOrderVeil', 'toggleSendPanel', 'rest-send-foot', 'state.orderEsc']],
  ['renderer/js/pages/local-orders.js', ['rest-btn-progress', 'rest-lo-noact', 'rest-lo-id']],
  ['renderer/js/pages/sales.js', ['rest-order-btn-primary', 'rest-order-btn-self']],
  ['renderer/pages/connection.html', ['--silver-200,#dfe4ec']],
  ['renderer/js/app.js', ['confirmSub:', 'emptyCartHint:', 'notesPlaceholder:', 'orderSent:', '__pdKioskMode']],
  ['renderer/pages/local-orders.html', ['restLoCount', 'rest-orders-empty']],
  // price display (شاشة عرض السعر)
  ['renderer/pages/price-display.html', ['pdScannerField', 'pdPriceLayer', 'pdLockVeil', 'ZMT SOFTWARE']],
  ['renderer/css/price-display.css', ['body.pd-kiosk .pd-stage', '--pd-ticker-ink', '.pd-grid']],
  ['renderer/js/pages/price-display.js', ['window.init_price_display', 'PRICE_MS', 'sellPrice']],
  ['renderer/js/pages/connection.js', ['function pdInit(', 'zmt_pd_settings']]
];

const forbidden = [
  ['renderer/css/rest.css', ['var(--panel', 'var(--text', 'var(--line', 'max-width:360px']],
  ['renderer/pages/connection.html', ['var(--line']],
  ['renderer/js/rest-service.js', ['restPopupVeil', 'max-width:360px']],
  ['renderer/js/pages/local-orders.js', ['class="mono"', 'btn btn-sm']],
  ['renderer/css/price-display.css', ['var(--panel', 'var(--text', 'var(--line']]
];

// listPackage() entries carry a leading backslash; extractFile() must not
const inListing = (p) => '\\' + p.split('/').join('\\');
const inArchive = (p) => p.split('/').join('\\');

function get(buf) { return buf.toString('utf8'); }

let fails = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

for (const t of targets) {
  const p = path.join(root, t);
  console.log('\n=== ' + t + ' ===');
  let listing;
  try {
    listing = asar.listPackage(p).map(x => x.toLowerCase());
  } catch (e) {
    bad('cannot open asar: ' + e.message);
    continue;
  }
  const has = (f) => listing.indexOf(inListing(f).toLowerCase()) !== -1;
  ok('asar readable (' + listing.length + ' entries)');
  for (const [file] of checks.concat(forbidden)) {
    if (!has(file)) bad(file + ' NOT IN ASAR');
  }

  for (const [file, needles] of checks) {
    if (!has(file)) continue;
    let s;
    try { s = get(asar.extractFile(p, inArchive(file))); }
    catch (e) { bad(file + ' unreadable: ' + e.message); continue; }
    const miss = needles.filter(n => s.indexOf(n) === -1);
    miss.length ? bad(file + ' missing ' + JSON.stringify(miss)) : ok(file + ' (' + s.length + ' bytes, markers ok)');
  }
  for (const [file, needles] of forbidden) {
    if (!has(file)) continue;
    let s;
    try { s = get(asar.extractFile(p, inArchive(file))); }
    catch (e) { bad(file + ' unreadable: ' + e.message); continue; }
    const hits = needles.filter(n => s.indexOf(n) !== -1);
    hits.length ? bad(file + ' still contains ' + JSON.stringify(hits)) : ok(file + ' free of ' + JSON.stringify(needles));
  }
}

console.log('\n========================================');
console.log(fails === 0 ? 'ASAR VERIFY PASSED' : 'ASAR VERIFY FAILED: ' + fails);
console.log('========================================');
process.exit(fails ? 1 : 0);
