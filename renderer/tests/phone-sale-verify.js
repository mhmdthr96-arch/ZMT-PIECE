// Verify the phone POS payment fix actually shipped (source + built asars).
// Usage: node phone-sale-verify.js
//
// Regression covered here: the hidden #paidSingle field meant the desktop
// executed every phone sale with pay.total = 0 → invoices created "unpaid"
// even though the cashier typed an amount.
const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const root = path.join(__dirname, '..', '..') + path.sep;

let fails = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

const srcHtmlPath = path.join(root, 'renderer', 'phone-sales', 'index.html');
const srcJsPath = path.join(root, 'renderer', 'phone-sales', 'app.js');

const asars = [
  'dist/win-unpacked/resources/app.asar',
  'dist/win-ia32-unpacked/resources/app.asar',
  'dist-win7/win-unpacked/resources/app.asar',
  'dist-win7/win-ia32-unpacked/resources/app.asar',
];

// [file, needles that MUST be present, needles that must NOT be present]
const checks = [
  ['renderer/phone-sales/index.html', [
    'id="paidSingle"',
    'id="paidCash"',
  ]],
  ['renderer/phone-sales/app.js', [
    'paidTouched',
    'syncPaidToTotal',
    'autoPaidAmount',
    'setPayMethod(state.payMethod)',
    'total: Math.max(0, paidTotal())',
  ]],
];

function checkSource() {
  console.log('\n=== source ===');
  const html = fs.readFileSync(srcHtmlPath, 'utf8');
  const js = fs.readFileSync(srcJsPath, 'utf8');

  const lineOf = (src, needle) => {
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) if (lines[i].indexOf(needle) !== -1) return lines[i];
    return '';
  };

  const paidSingle = lineOf(html, 'id="paidSingle"');
  const paidCash = lineOf(html, 'id="paidCash"');
  const paidCcp = lineOf(html, 'id="paidCcp"');

  if (/display\s*:\s*none/.test(paidSingle)) bad('#paidSingle is hidden (the regression)');
  else ok('#paidSingle is visible by default');

  if (/display\s*:\s*none/.test(paidCash)) ok('#paidCash hidden by default');
  else bad('#paidCash must start hidden (it is only shown in mixed mode)');

  if (/display\s*:\s*none/.test(paidCcp)) ok('#paidCcp hidden by default');
  else bad('#paidCcp must start hidden (it is only shown in mixed mode)');

  const confirmBody = (() => {
    const start = js.indexOf('function confirmSale()');
    if (start === -1) return '';
    const end = js.indexOf('function mapErr', start);
    return end === -1 ? js.slice(start) : js.slice(start, end);
  })();

  const mustHave = [
    ['state.payMethod = m; before reading the old amount',
      /var before = paidTotal\(\);[^\n]*\n\s*state\.payMethod = m;/],
    ['boot() applies the default pay method',
      /function boot\(\) \{[\s\S]{0,400}setPayMethod\(state\.payMethod\)/],
    ['renderTotals auto-fills the untouched paid field',
      /if \(!state\.paidTouched\) syncPaidToTotal\(\);/],
    ['input events mark the paid field as hand-edited',
      /addEventListener\('input', function \(\) \{ state\.paidTouched = true;/],
    ['auto amount is floored to cents (avoids PAID_EXCEEDS)',
      /return Math\.floor\(owed \* 100\) \/ 100;/],
    ['successful sale resets paidTouched',
      /state\.cart = \[\];\s*\n\s*state\.paidTouched = false;/],
    ['emptyCart resets paidTouched',
      /function emptyCart\(\) \{[\s\S]{0,200}state\.paidTouched = false;/],
  ];
  for (const [label, re] of mustHave) {
    re.test(js) ? ok(label) : bad(label);
  }

  // confirmSale must read the shared paidTotal() helper...
  if (confirmBody.indexOf('paidTotal()') !== -1) ok('confirmSale reads paidTotal()');
  else bad('confirmSale must read paidTotal()');
  // ...and must NOT reach for the single field directly when building pay
  // (resetting it to '0' after a successful sale is fine).
  if (/\$\('paidSingle'\)\.value\s*(\)|\|\|)/.test(confirmBody)) {
    bad("confirmSale still reads $('paidSingle') directly");
  } else {
    ok("confirmSale never reads $('paidSingle') directly");
  }
  if (confirmBody.indexOf('total: Math.max(0, paidTotal())') !== -1) ok('confirmSale sends pay.total from paidTotal()');
  else bad('confirmSale must send pay.total from paidTotal()');
  if (!confirmBody.length) bad('function confirmSale not found');

  for (const [file, needles] of checks) {
    const src = file.indexOf('index.html') !== -1 ? html : js;
    const missing = needles.filter((n) => src.indexOf(n) === -1);
    missing.length ? bad(file + ' missing ' + JSON.stringify(missing)) : ok(file + ' markers present');
  }
}

const inListing = (p) => '\\' + p.split('/').join('\\');
const inArchive = (p) => p.split('/').join('\\');

function checkAsar(file) {
  const p = path.join(root, file);
  console.log('\n=== ' + file + ' ===');
  let listing;
  try {
    listing = asar.listPackage(p).map((x) => x.toLowerCase());
  } catch (e) {
    bad('cannot open asar: ' + e.message);
    return;
  }
  const has = (f) => listing.indexOf(inListing(f).toLowerCase()) !== -1;
  ok('asar readable (' + listing.length + ' entries)');

  for (const [f, needles] of checks) {
    if (!has(f)) { bad(f + ' NOT IN ASAR'); continue; }
    let s;
    try { s = asar.extractFile(p, inArchive(f)).toString('utf8'); }
    catch (e) { bad(f + ' unreadable: ' + e.message); continue; }
    const missing = needles.filter((n) => s.indexOf(n) === -1);
    missing.length ? bad(f + ' missing ' + JSON.stringify(missing)) : ok(f + ' (' + s.length + ' bytes, markers ok)');
  }

  // the exact regression must be gone inside the packaged copy too
  if (has('renderer/phone-sales/index.html')) {
    const s = asar.extractFile(p, inArchive('renderer/phone-sales/index.html')).toString('utf8');
    const lines = s.split('\n');
    const lineOf = (needle) => lines.find((l) => l.indexOf(needle) !== -1) || '';
    /display\s*:\s*none/.test(lineOf('id="paidSingle"'))
      ? bad('packaged #paidSingle is still hidden')
      : ok('packaged #paidSingle is visible');
    /display\s*:\s*none/.test(lineOf('id="paidCash"'))
      ? ok('packaged #paidCash hidden by default')
      : bad('packaged #paidCash must be hidden');
  }
}

checkSource();
for (const t of asars) {
  if (!fs.existsSync(path.join(root, t))) { console.log('\n=== ' + t + ' === (not built — skipped)'); continue; }
  checkAsar(t);
}

console.log('\n========================================');
console.log(fails === 0 ? 'PHONE SALE VERIFY PASSED' : 'PHONE SALE VERIFY FAILED: ' + fails);
console.log('========================================');
process.exit(fails ? 1 : 0);
