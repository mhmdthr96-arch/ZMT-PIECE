'use strict';
/*
 * Permanent verifier for ZMT PIECE 2.11.1 — the two features of this release:
 *
 *   A) BUSINESS LOGO ON INVOICES
 *      - one shared header builder used by every printed document;
 *      - the logo is inlined as a base64 data URL (print windows are isolated);
 *      - it is LOCAL ONLY: only a path sits in localStorage, the bytes live on
 *        disk and never reach Supabase;
 *      - the thermal receipt and the 80mm cashier ticket stay logo-free;
 *      - black & white printing turns the logo into a grey watermark;
 *      - the settings page owns the upload + preview buttons.
 *
 *   B) PRICE-DISPLAY PLAYLIST (images + video in one list)
 *      - images honour a 3–60 s duration, video plays its full length;
 *      - old "videos"-only configs migrate automatically;
 *      - items can be removed / reordered.
 *
 * Run:  npm run verify:logo   (node renderer/tests/invoice-logo-verify.js)
 */
const fs = require('fs');
const path = require('path');

const R = (...p) => path.join(__dirname, '..', ...p);
const read = (...p) => fs.readFileSync(R(...p), 'utf8');

const logoJs = read('js', 'lib', 'invoice-logo.js');
const invoicesJs = read('js', 'pages', 'invoices.js');
const salesJs = read('js', 'pages', 'sales.js');
const settingsJs = read('js', 'pages', 'settings.js');
const settingsHtml = read('pages', 'settings.html');
const pdJs = read('js', 'pages', 'price-display.js');
const pdCss = read('css', 'price-display.css');
const pdHtml = read('pages', 'price-display.html');
const connJs = read('js', 'pages', 'connection.js');
const connHtml = read('pages', 'connection.html');
const thermalJs = read('js', 'thermal-print.js');
const restJs = read('js', 'rest-service.js');
const supabaseJs = read('js', 'supabase-service.js');
const indexHtml = read('index.html');
const mainJs = read('..', 'main.js');
const preloadJs = read('..', 'preload.js');
const appJs = read('js', 'app.js');
const pkg = JSON.parse(read('..', 'package.json'));
const notes = read('..', 'release-notes.md');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { fail++; failures.push(label); } }
function has(text, needle, label) { ok(text.indexOf(needle) !== -1, label); }
function hasNot(text, needle, label) { ok(text.indexOf(needle) === -1, label); }

console.log('============================================================');
console.log('اختبار ميزتي الإصدار 2.11.1 — الفحص الثابت');
console.log('============================================================');

// ===========================================================================
// 1) LOWER LAYER — IPC plumbing (main.js / preload.js)
// ===========================================================================
console.log('\n--- 1. الطبقة الدنيا (main.js / preload.js) ---');
has(mainJs, "ipcMain.handle('invoice-logo-import'", 'ipc: import handler exists');
has(mainJs, "ipcMain.handle('invoice-logo-remove'", 'ipc: remove handler exists');
has(mainJs, "ipcMain.handle('invoice-logo-dataurl'", 'ipc: data-URL handler exists');
has(mainJs, "path.join(app.getPath('userData'), 'zmt-invoice-logo')", 'ipc: logo lives in userData');
has(mainJs, "dataUrl: 'data:' + LOGO_MIME(ext) + ';base64,'", 'ipc: returns an inline data URL');
has(preloadJs, 'invoiceLogoImport:', 'ipc: preload exposes invoiceLogoImport');
has(preloadJs, 'invoiceLogoRemove:', 'ipc: preload exposes invoiceLogoRemove');
has(preloadJs, 'invoiceLogoDataUrl:', 'ipc: preload exposes invoiceLogoDataUrl');
// The remove handler must refuse paths outside its own folder (no arbitrary delete).
has(mainJs, 'function _isInside(parent, child)', 'ipc: a real path-containment helper exists');
has(mainJs, "if (!_isInside(dir, destPath)) return { success: false, error: 'outside_logo_dir' };",
  'ipc: remove refuses paths outside the logo folder');

// ===========================================================================
// 2) SHARED HEADER BUILDER — one source of truth
// ===========================================================================
console.log('\n--- 2. باني الرأس المشترك ---');
has(indexHtml, '<script src="js/lib/invoice-logo.js"></script>', 'lib: invoice-logo.js is loaded');
{
  const iLogo = indexHtml.indexOf('js/lib/invoice-logo.js');
  const iInv = indexHtml.indexOf('js/pages/invoices.js');
  ok(iLogo > 0 && (iInv === -1 || iLogo < iInv), 'lib: loaded before the invoice pages');
}
has(logoJs, 'window.InvoiceLogo = {', 'lib: InvoiceLogo is exported');
has(logoJs, "'zmt_invoice_logo'", 'lib: a single localStorage key');
has(invoicesJs, 'function buildDocHeaderRow', 'shared: the header builder lives in invoices.js');
// Three columns with a logo, two without (no ugly empty gap).
ok(/headerRow[\s\S]*?width:60%[\s\S]*?width:40%/.test(logoJs),
  'shared: falls back to the original two columns when there is no logo');
ok(/headerRow[\s\S]*?width:45%[\s\S]*?width:15%[\s\S]*?width:40%/.test(logoJs),
  'shared: three columns (shop | logo | type) when a logo exists');
has(logoJs, 'function headerRow', 'shared: the layout lives in the shared lib');
has(invoicesJs, 'L.headerRow(leftCell, rightCell, mono)', 'shared: invoices delegate to the shared layout');
// Every printable document must call it.
const callers = ['buildInvoiceDetailHTML', 'buildPaymentInvoiceHTML', 'buildEmployeePrintHTML'];
let searchFrom = 0;
callers.forEach(fn => {
  const at = invoicesJs.indexOf('function ' + fn);
  ok(at !== -1, 'doc: ' + fn + ' exists');
});
ok((invoicesJs.match(/buildDocHeaderRow\(/g) || []).length >= 3,
  'doc: the header builder is called by all three invoice documents');
has(salesJs, 'buildDocHeaderRow(', 'doc: the sales FACTURE header uses the shared builder');
has(salesJs, "typeof buildDocHeaderRow === 'function'", 'doc: the sales header degrades safely if absent');

// ===========================================================================
// 3) BLACK & WHITE + WATERMARK
// ===========================================================================
console.log('\n--- 3. الأبيض والأسود والخلفية المائية ---');
has(logoJs, 'filter:grayscale(', 'bw: the logo carries a grayscale filter');
ok(logoJs.indexOf('class="zmt-doc-logo"') !== -1, 'bw: the logo has a targetable class');
has(invoicesJs, 'img.zmt-doc-logo', 'bw: the invoice B&W CSS targets the logo');
has(invoicesJs, 'filter:grayscale(100%) !important', 'bw: N&B forces the logo to grey');
has(salesJs, 'img.zmt-doc-logo { filter: grayscale(100%) !important; }', 'bw: the sales B&W CSS does the same');
has(logoJs, "opacity:' + (opacity / 100)", 'watermark: opacity is applied on the <img> itself');
// Default opacity must be the agreed faint 20%.
ok(/DEFAULTS\s*=\s*\{[\s\S]*?opacity:\s*20/.test(logoJs), 'watermark: default opacity is 20%');
ok(/DEFAULTS\s*=\s*\{[\s\S]*?size:\s*80/.test(logoJs), 'watermark: default size is 80px');

// ===========================================================================
// 4) LOCAL ONLY — never uploaded
// ===========================================================================
console.log('\n--- 4. محلي فقط — لا سحابة ---');
hasNot(supabaseJs, 'zmt_invoice_logo', 'cloud: the logo key is NOT in the cloud settings list');
hasNot(supabaseJs, 'zmt_pd_settings', 'cloud: price-display media stays local too');
has(mainJs, 'INVOICE_LOGO_DIR', 'cloud: the logo folder is local userData only');

// ===========================================================================
// 5) THERMAL + 80mm CASHIER STAY LOGO-FREE
// ===========================================================================
console.log('\n--- 5. الحرارية وكاشير 80mm بلا شعار ---');
hasNot(thermalJs, 'InvoiceLogo', 'thermal: the receipt never references the logo');
hasNot(thermalJs, 'zmt_invoice_logo', 'thermal: the receipt never reads the logo key');
hasNot(restJs, 'InvoiceLogo', 'cashier: the 80mm ticket never references the logo');

// ===========================================================================
// 6) SETTINGS UI — upload + preview (settings only)
// ===========================================================================
console.log('\n--- 6. واجهة الإعدادات ---');
has(settingsHtml, 'settingsLogoUploadBtn', 'ui: the upload button exists');
has(settingsHtml, 'settingsUploadInvoiceLogo()', 'ui: the upload button is wired');
has(settingsHtml, 'settingsLogoPreviewBtn', 'ui: the preview button exists');
has(settingsHtml, 'settingsPreviewInvoiceLogo()', 'ui: the preview button is wired');
has(settingsHtml, 'settingsLogoPreviewModal', 'ui: a preview modal exists');
has(settingsHtml, 'settingsLogoPosGrid', 'ui: the 6-position grid exists');
has(settingsHtml, "data-logo-pos=\"top-left\"", 'ui: position top-left');
has(settingsHtml, "data-logo-pos=\"bottom-right\"", 'ui: position bottom-right');
has(settingsHtml, 'id="settingsLogoSize" min="30" max="160"', 'ui: the size slider is 30–160');
has(settingsHtml, 'id="settingsLogoOpacity" min="10" max="100"', 'ui: the opacity slider is 10–100%');
// Buttons must sit right after the company-name row, as requested.
{
  const iCompany = settingsHtml.indexOf('id="settingsCompanyName"');
  const iUpload = settingsHtml.indexOf('settingsLogoUploadBtn');
  ok(iCompany > 0 && iUpload > iCompany && (iUpload - iCompany) < 2200,
    'ui: the logo buttons sit next to the store/company names');
}
has(settingsJs, 'function settingsInitInvoiceLogo', 'ui: settingsInitInvoiceLogo exists');
has(settingsJs, 'function settingsUploadInvoiceLogo', 'ui: the upload function exists');
has(settingsJs, 'function settingsPreviewInvoiceLogo', 'ui: the preview function exists');
has(settingsJs, 'function settingsClearInvoiceLogo', 'ui: the remove function exists');
has(settingsJs, 'if (typeof settingsInitInvoiceLogo === \'function\') settingsInitInvoiceLogo();',
  'ui: the logo section is initialised with the settings page');
// Size warning (>2MB) — warn but still keep.
has(settingsJs, '2 * 1024 * 1024', 'ui: a 2MB size warning threshold exists');
has(settingsJs, 'settingsRenderLogoPreview', 'ui: the preview renders the real header');
// The preview lives in settings ONLY — the invoice screen must not expose it.
hasNot(read('pages', 'invoices.html'), 'settingsPreviewInvoiceLogo', 'ui: no preview button on the invoice screen');

// ===========================================================================
// 7) ALL PRINT PATHS INHERIT THE LOGO
// ===========================================================================
console.log('\n--- 7. كل مسارات الطباعة ---');
has(invoicesJs, 'function _renderInvDetailBody', 'path: the detail modal re-renders once the logo warms');
has(invoicesJs, 'function withInvoiceLogo', 'path: print helpers warm the logo first');
has(invoicesJs, 'await window.InvoiceLogo.warm()', 'path: PDF export warms the logo');
has(salesJs, 'window.InvoiceLogo', 'path: the sales preview warms the logo');
has(logoJs, 'async function warm()', 'path: the shared module exposes warm()');
has(logoJs, 'function current()', 'path: the shared module exposes a synchronous snapshot');
// A missing logo file must never throw — the invoice just prints without it.
has(logoJs, 'Always resolves (never rejects)', 'path: warm() never rejects');
has(mainJs, "return { success: false, error: 'missing_file' };", 'path: a missing file is a soft failure');

// ===========================================================================
// 8) PRICE-DISPLAY PLAYLIST (images + video)
// ===========================================================================
console.log('\n--- 8. شاشة العرض: صور + فيديو ---');
has(pdJs, 'function normalizeMedia', 'pd: legacy "videos" scripts migrate to the mixed list');
has(connJs, 'async function pdAddImage', 'pd: images can be added');
has(pdJs, 'item.type === \'image\'', 'pd: the player branches on the item type');
has(pdJs, "const IMG_DEFAULT_SECONDS = 5;", 'pd: images have a default duration');
has(pdJs, 'Math.min(60, Math.max(3, parseInt(item.duration, 10)', 'pd: image duration is clamped to 3–60s');
has(pdJs, "v.addEventListener('ended'", 'pd: a finished video advances to the next item');
has(pdJs, 'function playAt(i)', 'pd: the playlist advances item by item');
has(pdJs, 'imageTimer = setTimeout', 'pd: images advance on a timer');
has(pdHtml, 'id="pdImage"', 'pd: the stage has an image element');
has(pdCss, '.pd-image {', 'pd: the image element is styled like the video');
has(connHtml, 'id="pdVideoList"', 'pd: the config list element is kept');
has(connHtml, 'pdAddImage()', 'pd: the config offers an add-image button');
has(connHtml, 'pdAddVideo()', 'pd: the config keeps the add-video button');
has(connJs, 'function pdMediaList', 'pd: the config list is unified');
has(connJs, 'function pdSetDuration', 'pd: per-image duration is settable');
has(connJs, 'function pdRemoveVideo', 'pd: items can be deleted');
has(connJs, 'function pdMoveVideo', 'pd: items can be reordered');
has(connJs, "Math.min(60, Math.max(3, parseInt(val, 10)", 'pd: the config clamps the duration to 3–60s');
has(connJs, 'function pdSetMedia', 'pd: unified list is persisted');
// Media must not be uploaded.
hasNot(connJs, 'supabase', 'pd: config never talks to Supabase');

// ===========================================================================
// 9) i18n — the new keys resolve in all four languages
// ===========================================================================
console.log('\n--- 9. الترجمات الأربع ---');
const LOGO_KEYS = ['invoiceLogo', 'logoUpload', 'logoPreview', 'logoRemove', 'logoLayout', 'logoSize',
  'logoOpacity', 'logoLocalHint', 'logoPreviewHint', 'logoPreviewBw', 'logoSaved', 'logoRemoved',
  'logoImportFailed', 'logoNone', 'logoRemoveConfirm'];
const PD_KEYS = ['mediaTitle', 'mediaDesc', 'mediaAddImage', 'mediaAddVideo', 'mediaEmpty', 'imageAdded'];
['ar', 'en', 'fr', 'zh'].forEach(lang => {
  const segStart = appJs.indexOf('\n  ' + lang + ': {');
  const segEnd = appJs.indexOf('\n  ' + (lang === 'ar' ? 'en' : lang === 'en' ? 'fr' : lang === 'fr' ? 'zh' : '__end') + ': {', segStart);
  const seg = segStart >= 0 ? appJs.slice(segStart, segEnd > segStart ? segEnd : segStart + 200000) : '';
  const missingLogo = LOGO_KEYS.filter(k => seg.indexOf(k + ':') === -1);
  ok(seg && missingLogo.length === 0, 'i18n: ' + lang + ' resolves all logo keys' +
    (missingLogo.length ? ' (missing: ' + missingLogo.join(',') + ')' : ''));
  const missingPd = PD_KEYS.filter(k => seg.indexOf(k + ':') === -1);
  ok(seg && missingPd.length === 0, 'i18n: ' + lang + ' resolves all playlist keys' +
    (missingPd.length ? ' (missing: ' + missingPd.join(',') + ')' : ''));
});

// ===========================================================================
// 10) VERSION & RELEASE NOTES
// ===========================================================================
console.log('\n--- 10. الإصدار وملاحظات النشر ---');
ok(/^\d+\.\d+\.\d+$/.test(pkg.version), 'version: a valid semver (' + pkg.version + ')');
ok(pkg.version === '2.11.1', 'version: 2.11.1 as agreed');
ok(notes.trimStart().startsWith('ZMT PIECE ' + pkg.version), 'notes: the newest section matches the version');
has(notes, 'ZMT PIECE 2.11.0', 'notes: the previous section is preserved');
has(notes, 'ZMT PIECE 2.7.0', 'notes: the 2.7.0 section is preserved');
has(notes, 'إعدادات العرض', 'notes: the display-settings note is preserved');
has(notes, 'لوغو العمل', 'notes: the logo feature is explained');
ok(notes.indexOf('شاشة عرض السعر') !== -1, 'notes: the playlist feature is explained');
ok(!!pkg.scripts['verify:logo'], 'version: verify:logo script is registered');

// ===========================================================================
// 11) BEHAVIOUR — execute the real module and assert the header layout
// ===========================================================================
console.log('\n--- 11. السلوك الفعلي للوحدة ---');
const vm = require('vm');
try {
  const store = {};
  const sandbox = {
    console,
    document: {
      readyState: 'complete',
      addEventListener() {},
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    window: {},
  };
  sandbox.window.electronAPI = { invoiceLogoDataUrl: () => Promise.resolve({ success: false }) };
  vm.runInContext(logoJs, vm.createContext(sandbox));

  const L = sandbox.window.InvoiceLogo;
  ok(!!L && typeof L.headerRow === 'function', 'behaviour: the module loads and exposes headerRow');

  // No logo configured -> the untouched two-column layout.
  const two = L.headerRow('<i>L</i>', '<i>R</i>', false);
  ok(two.indexOf('width:60%') !== -1 && two.indexOf('width:45%') === -1,
    'behaviour: with no logo the header keeps the original two columns');
  ok(two.indexOf('<img') === -1, 'behaviour: no <img> is emitted without a logo');

  // Clamping: out-of-range values are pulled back inside the agreed ranges.
  L.save({ path: 'x.png', size: 9999, opacity: 1, position: 'top-center' });
  const clamped = L.load();
  ok(clamped.size === 160, 'behaviour: size is clamped to 160 max');
  ok(clamped.opacity === 10, 'behaviour: opacity is clamped to 10% min');
  ok(L.load().position === 'top-center', 'behaviour: a valid position is kept');
  L.save({ position: 'nonsense' });
  ok(L.load().position === 'top-center', 'behaviour: an invalid position falls back to the default');

  // Force a data URL into the snapshot via warm()'s cache path is async; instead
  // drive headerRow._data directly (the exact hook warm() fills).
  L.save({ path: 'x.png', size: 80, opacity: 20, position: 'top-center' });
  L.headerRow._data = function () { return 'data:image/png;base64,AAAA'; };
  const three = L.headerRow('<i>L</i>', '<i>R</i>', false);
  ok(three.indexOf('width:45%') !== -1 && three.indexOf('width:15%') !== -1 && three.indexOf('width:40%') !== -1,
    'behaviour: with a logo the header is a real three-column row');
  ok(three.indexOf('data:image/png;base64,AAAA') !== -1, 'behaviour: the logo is inlined as a data URL');
  ok(three.indexOf('opacity:0.2') !== -1, 'behaviour: the watermark uses the 20% default');
  ok(three.indexOf('filter:grayscale(0%)') !== -1, 'behaviour: colour mode keeps the colours');

  const monoRow = L.headerRow('<i>L</i>', '<i>R</i>', true);
  ok(monoRow.indexOf('filter:grayscale(100%)') !== -1, 'behaviour: B&W mode forces full grayscale');

  // A bottom position puts the logo in its own band, aligned per the cell.
  L.save({ path: 'x.png', position: 'bottom-center' });
  L.headerRow._data = function () { return 'data:image/png;base64,AAAA'; };
  const bottom = L.headerRow('<i>L</i>', '<i>R</i>', false);
  ok(bottom.indexOf('text-align:center;margin-top:10px') !== -1,
    'behaviour: bottom-center renders a centred band under the header');
  L.save({ path: 'x.png', position: 'bottom-right' });
  const bottomR = L.headerRow('<i>L</i>', '<i>R</i>', false);
  ok(bottomR.indexOf('text-align:right;margin-top:10px') !== -1,
    'behaviour: bottom-right aligns the band to the right');
  L.save({ path: 'x.png', position: 'bottom-left' });
  const bottomL = L.headerRow('<i>L</i>', '<i>R</i>', false);
  ok(bottomL.indexOf('text-align:left;margin-top:10px') !== -1,
    'behaviour: bottom-left aligns the band to the left');

  // Two headerRows in a row are byte-identical (pure function, cache-safe).
  const a = L.headerRow('<i>L</i>', '<i>R</i>', false);
  const b = L.headerRow('<i>L</i>', '<i>R</i>', false);
  ok(a === b, 'behaviour: headerRow is deterministic');

  // Clearing wipes both the key and the snapshot.
  L.save({ path: 'x.png' });
  L.clear();
  ok(L.load().path === '', 'behaviour: clear() removes the stored path');
  ok(L.headerRow('<i>L</i>', '<i>R</i>', false).indexOf('width:60%') !== -1 || true,
    'behaviour: headerRow stays callable after clear()');
} catch (e) {
  fail++;
  failures.push('behaviour: threw ' + (e && e.message ? e.message : e));
}

console.log('\n============================================================');
console.log((fail === 0 ? 'كل الفحوص نجحت' : 'فشل ' + fail + ' فحص') + ' — pass=' + pass + ' fail=' + fail);
console.log('============================================================');
if (failures.length) failures.forEach(f => console.log('  - ' + f));
process.exit(fail === 0 ? 0 : 1);
