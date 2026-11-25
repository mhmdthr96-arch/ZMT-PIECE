'use strict';
/*
 * Permanent verifier for the thermal-printer release (2.9.0):
 *
 *   1) on-paper hygiene — the party balance and the "merged from delivery notes"
 *      observation stay on screen but are stripped from every printed copy,
 *      while the payment voucher keeps its balance;
 *   2) the invoices page gained the colour / black-and-white print choice;
 *   3) the sales page gained the thermal toggle + settings button, and the
 *      receipt is built exactly from the requested fields;
 *   4) the silent-print plumbing (main.js / preload.js) stays backward compat.;
 *   5) the thermal module is data-safe (localStorage only, no DB / network);
 *   6) the four languages expose every thermal.* key at runtime.
 *
 * Run:  npm run verify:thermal   (node renderer/tests/thermal-verify.js)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = (...p) => path.join(__dirname, '..', ...p);
const read = (...p) => fs.readFileSync(R(...p), 'utf8');

const invoicesHtml = read('pages', 'invoices.html');
const salesHtml = read('pages', 'sales.html');
const indexHtml = read('index.html');
const appJs = read('js', 'app.js');
const salesJs = read('js', 'pages', 'sales.js');
const invoicesJs = read('js', 'pages', 'invoices.js');
const thermalJs = read('js', 'thermal-print.js');
const css = read('css', 'main.css');
const mainJs = read('..', 'main.js');
const preloadJs = read('..', 'preload.js');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { fail++; failures.push(label); } }
function has(text, needle, label) { ok(text.indexOf(needle) !== -1, label); }
function hasNot(text, needle, label) { ok(text.indexOf(needle) === -1, label); }

// ===========================================================================
// 1) ON-PAPER HYGIENE (invoices)
// ===========================================================================
has(invoicesJs, 'function stripInvPrintHidden(', 'paper: stripInvPrintHidden() exists');
has(invoicesJs, '.inv-print-hide, .inv-screen-only', 'paper: strip removes .inv-print-hide nodes');
has(invoicesJs, "querySelectorAll('.inv-print-only')", 'paper: strip reveals .inv-print-only nodes');
has(invoicesJs, 'function invPartyBalanceBlockHTML(inv, party, noPrint)',
  'paper: balance block accepts a noPrint flag');
has(invoicesJs, '${invPartyBalanceBlockHTML(inv, party, true)}',
  'paper: the invoice detail hides the party balance on paper');
has(invoicesJs, '${invPartyBalanceBlockHTML(inv, party)}',
  'paper: the payment voucher keeps its balance (no flag)');
has(invoicesJs, "stripInvPrintHidden(content.outerHTML)",
  'paper: the detail print path strips the hidden blocks');
has(invoicesJs, 'const inner = stripInvPrintHidden(raw);',
  'paper: the PDF/email document strips the hidden blocks too');
ok(/mergedFrom && inv\.mergedFrom\.length\) \? ' class="inv-print-hide"'/.test(invoicesJs),
  'paper: the "merged from delivery notes" observation is hidden on paper only');
has(css, '.inv-print-hide { display: none !important; }', 'paper: a print rule hides .inv-print-hide');

// The merge note must still be *stored* (audit) — nothing was removed from data.
has(invoicesJs, 'inv.mergedFrom', 'paper: detection keys on mergedFrom, no data change');

// ===========================================================================
// 2) COLOUR / BLACK & WHITE ON THE INVOICES PAGE
// ===========================================================================
has(invoicesHtml, "printInvFromDetail('color')", 'colour: the dialog offers colour print');
has(invoicesHtml, "printInvFromDetail('bw')", 'colour: the dialog offers black & white print');
has(invoicesHtml, 'data-i18n="invoices.printBw"', 'colour: the B&W button label is translated');
has(invoicesJs, 'function printInvFromDetail(mode)', 'colour: printInvFromDetail takes a mode');
has(invoicesJs, 'function invBwCss()', 'colour: a monochrome override exists');
has(invoicesJs, "const bw = mode === 'bw' ? invBwCss() : '';", 'colour: the mode selects the override');
has(invoicesJs, 'color:#000 !important', 'colour: B&W forces black text');

// ===========================================================================
// 3) THERMAL UI HOOKS (sales page)
// ===========================================================================
has(indexHtml, '<script src="js/thermal-print.js"></script>', 'ui: index.html loads the thermal module');
has(salesHtml, 'id="salesThermalBtn"', 'ui: the thermal toggle button exists');
has(salesHtml, 'id="salesThermalFlag"', 'ui: the toggle shows an ON/OFF flag');
has(salesHtml, 'id="salesThermalCfgBtn"', 'ui: the thermal settings button exists');
has(salesHtml, 'onclick="ThermalPrintToggleFromHeader()"', 'ui: the toggle calls the public API');
has(salesHtml, 'onclick="ThermalPrintOpenSettings()"', 'ui: the settings button calls the public API');
has(salesHtml, 'data-i18n="thermal.toggleOn"', 'ui: the toggle label is translated');
has(salesHtml, 'data-i18n="thermal.settings"', 'ui: the settings label is translated');
ok(salesHtml.indexOf('salesThermalBtn') > salesHtml.indexOf('salesSupSaleBtn'),
  'ui: the two buttons sit next to the sales header buttons');

has(salesJs, 'window.ThermalPrint.isEnabled()', 'ui: checkout asks the thermal mode first');
has(salesJs, 'window.ThermalPrint.printSale(inv, res)', 'ui: checkout prints the receipt silently');
has(salesJs, 'showInvoicePreview(inv);', 'ui: the normal preview stays as the fallback');

// Everything the user asked for must live in the receipt builder.
['thermal.item', 'thermal.qty', 'thermal.price', 'thermal.total',
  'thermal.gross', 'thermal.discount', 'thermal.netTotal', 'thermal.thanks'].forEach(k => {
  has(thermalJs, "'" + k + "'", 'receipt: builder renders ' + k);
});

// ===========================================================================
// 4) SILENT-PRINT PLUMBING (backward compatible)
// ===========================================================================
has(preloadJs, "restPrint: (payload) => ipcRenderer.invoke('rest-print', payload)",
  'plumb: preload still exposes restPrint');
has(preloadJs, "restListPrinters: () => ipcRenderer.invoke('rest-list-printers')",
  'plumb: preload still exposes restListPrinters');
has(mainJs, 'if (payload && payload.copies) opts.copies', 'plumb: main.js forwards copies');
has(mainJs, 'if (payload && payload.landscape) opts.landscape = true;', 'plumb: main.js forwards landscape');
has(mainJs, 'mmToPx((payload && payload.paperWidth) || 80)', 'plumb: the hidden window honours the paper width');
has(mainJs, 'name: p.name, displayName: p.displayName, isDefault: !!p.isDefault',
  'plumb: the printer list is unchanged');

// ===========================================================================
// 5) DATA SAFETY OF THE THERMAL MODULE
// ===========================================================================
hasNot(thermalJs, 'DB.', 'safe: the module never touches the database');
hasNot(thermalJs, 'fetch(', 'safe: the module never talks to the network');
hasNot(thermalJs, 'ipcRenderer', 'safe: the module goes through the preload bridge only');
has(thermalJs, "var TP_KEY = 'zmt_thermal_settings';", 'safe: a single localStorage key');
ok((thermalJs.match(/localStorage\.setItem/g) || []).length === 1,
  'safe: localStorage is written in exactly one place');
hasNot(thermalJs, 'salesBarcodeScan', 'safe: the module has no side effects on the cart');

// ===========================================================================
// 6) i18n — thermal.* and invoices.printColour in all four languages
// ===========================================================================
const THERMAL_KEYS = ['toggleOn', 'settings', 'enabledToast', 'disabledToast', 'printed', 'title',
  'hint', 'printerSec', 'printer', 'printerDefault', 'noPrinters', 'test', 'printing', 'testOk',
  'testFail', 'noElectron', 'paperSec', 'paper', 'paperCustom', 'paperWidth', 'marginTop',
  'marginBottom', 'marginRight', 'marginLeft', 'fontSec', 'fontFamily', 'fontMono', 'fontSans',
  'fontSerif', 'fontWeight', 'weightNormal', 'weightBold', 'weightBlack', 'fontSize', 'lineHeight',
  'layoutSec', 'rotation', 'scale', 'copies', 'direction', 'contentSec', 'showStore', 'showAddress',
  'showDateTime', 'showFooter', 'footerText', 'preview', 'reset', 'save', 'saved', 'dirty', 'thanks',
  'item', 'qty', 'price', 'total', 'gross', 'discount', 'netTotal'];

try {
  const iifeStart = appJs.indexOf('(function thermalI18n');
  const iifeEnd = appJs.indexOf('\n})();', iifeStart);
  ok(iifeStart !== -1 && iifeEnd > iifeStart, 'i18n: thermalI18n block located');
  const code = appJs.slice(iifeStart, iifeEnd + 5);
  const LANG = { ar: { invoices: {} }, en: { invoices: {} }, fr: { invoices: {} }, zh: { invoices: {} } };
  vm.runInContext(code, vm.createContext({ LANG }));
  ['ar', 'en', 'fr', 'zh'].forEach(l => {
    const m = (LANG[l] || {}).thermal || {};
    const missing = THERMAL_KEYS.filter(k => !(k in m));
    ok(missing.length === 0, 'i18n: ' + l + ' resolves all ' + THERMAL_KEYS.length + ' thermal keys' +
      (missing.length ? ' (missing: ' + missing.join(',') + ')' : ''));
    const inv = (LANG[l] || {}).invoices || {};
    ok(!!inv.printBw && !!inv.printColor, 'i18n: ' + l + ' resolves invoices.printColour keys');
  });
  ok(LANG.ar.thermal.toggleOn === 'طباعة حرارية', 'i18n: ar toggle label resolves');
  ok(LANG.en.thermal.toggleOn === 'Thermal print', 'i18n: en toggle label resolves');
} catch (e) {
  fail++;
  failures.push('i18n: threw ' + (e && e.message ? e.message : e));
}

// ===========================================================================
// 7) BEHAVIOUR — execute the real module and assert the receipt content
// ===========================================================================
try {
  const mkEl = () => ({
    style: {}, value: '', textContent: '', innerHTML: '', checked: false, disabled: false,
    options: [], className: '',
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, setAttribute() {}, remove() {},
    querySelectorAll: () => [],
  });
  const sandbox = {
    console,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      readyState: 'complete',
      getElementById: () => null,
      createElement: mkEl,
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: { appendChild() {} },
    },
  };
  sandbox.window = sandbox;
  sandbox.t = () => '';
  sandbox.escHtml = (s) => String(s == null ? '' : s);
  sandbox.fmtMoney = (n) => Number(n || 0).toFixed(2);
  sandbox.getPrintInfo = () => ({ name: 'ZMT SHOP', address: 'Alger', phone: '0555' });
  vm.runInContext(thermalJs, vm.createContext(sandbox));

  const TP = sandbox.window.ThermalPrint;
  ok(!!TP, 'behaviour: window.ThermalPrint is exposed');
  ok(TP.isEnabled() === false, 'behaviour: thermal mode is off by default');

  const res = {
    totalAmount: 3200,
    items: [
      { name: 'فلتر زيت BOSCH', qty: 2, price: 800, total: 1600, originalPrice: 900 },
      { name: 'فلتر هواء MANN', qty: 1, price: 1600, total: 1600, originalPrice: 1700 },
    ],
  };
  const s = TP.defaults();
  const html = TP.buildReceiptHtml({ createdAt: Date.now() }, res, s);

  // The exact fields the user requested.
  has(html, 'ZMT SHOP', 'receipt: shows the shop name');
  has(html, 'فلتر زيت BOSCH', 'receipt: shows the product name');
  has(html, 'فلتر هواء MANN', 'receipt: shows every product');
  ok(/<td class="tp-c-qty">2<\/td>/.test(html), 'receipt: shows the quantity');
  has(html, '800.00', 'receipt: shows the unit price');
  has(html, '3500.00', 'receipt: shows the gross total (900*2 + 1700)');
  has(html, '300.00', 'receipt: shows the discount amount (3500 - 3200)');
  has(html, '3200.00', 'receipt: shows the total after discount');
  has(html, 'شكرًا لزيارتكم', 'receipt: ends with the thank-you line');
  has(html, '@page{ size:80mm auto;', 'receipt: defaults to an 80 mm roll');

  // The settings actually drive the CSS.
  const h58 = TP.buildReceiptHtml({ createdAt: Date.now() }, res, Object.assign({}, s, { paperWidth: 58 }));
  has(h58, 'size:58mm auto', 'settings: a 58 mm paper is honoured');
  const hm = TP.buildReceiptHtml({ createdAt: Date.now() }, res, Object.assign({}, s, { marginTop: 5, marginRight: 1, marginBottom: 3, marginLeft: 4 }));
  has(hm, 'margin:5mm 1mm 3mm 4mm', 'settings: the four margins are honoured');
  const hb = TP.buildReceiptHtml({ createdAt: Date.now() }, res, Object.assign({}, s, { scale: 150, rotation: 90 }));
  has(hb, 'zoom:1.5', 'settings: the print scale is applied');
  has(hb, 'rotate(90deg)', 'settings: the rotation is applied');
  const hclamp = TP.buildReceiptHtml({ createdAt: Date.now() }, res, Object.assign({}, s, { fontSize: 999 }));
  has(hclamp, 'font-size:24px', 'settings: the font size is clamped to the safe maximum');
  const hdir = TP.buildReceiptHtml({ createdAt: Date.now() }, res, Object.assign({}, s, { direction: 'ltr' }));
  has(hdir, '<html dir="ltr">', 'settings: the text direction is honoured');

  // Content toggles.
  const hNoStore = TP.buildReceiptHtml({ createdAt: Date.now() }, res, Object.assign({}, s, { showStore: false }));
  hasNot(hNoStore, 'ZMT SHOP', 'content: the shop name can be hidden');
  const hNoFoot = TP.buildReceiptHtml({ createdAt: Date.now() }, res, Object.assign({}, s, { showFooter: false }));
  hasNot(hNoFoot, 'شكرًا لزيارتكم', 'content: the thank-you line can be hidden');
  const hFoot = TP.buildReceiptHtml({ createdAt: Date.now() }, res, Object.assign({}, s, { footerText: 'مرحبا بكم' }));
  has(hFoot, 'مرحبا بكم', 'content: a custom thank-you text is used');

  // Browser fallback keeps the cashier unstuck.
  const p = TP.printSale({ createdAt: Date.now() }, res);
  ok(p && typeof p.then === 'function', 'print: printSale returns a promise');
} catch (e) {
  fail++;
  failures.push('behaviour: threw ' + (e && e.message ? e.message : e));
}

// ===========================================================================
const total = pass + fail;
console.log('\n' + '='.repeat(64));
console.log('thermal verifier: ' + pass + '/' + total + ' checks passed');
console.log('='.repeat(64));
if (fail) {
  console.log('\nFAILED:');
  failures.forEach(f => console.log('  x ' + f));
  process.exit(1);
}
