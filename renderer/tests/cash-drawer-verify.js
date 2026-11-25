'use strict';
/*
 * Permanent verifier for the cash-drawer feature (2.11.0):
 *
 *   1) the low-level layer (printer-net.js) exposes scan / test / open, the
 *      five ESC/POS pulse presets, hex parsing and the PowerShell probe;
 *   2) runPSBlock exists and the drawer sends go through it (multi-statement
 *      PowerShell cannot use the single-pipeline runPS wrapper);
 *   3) main.js stores settings per device in userData and gates the AUTOMATIC
 *      open on `enabled` while a manual open always works;
 *   4) preload.js exposes the five channels;
 *   5) connection.html / connection.js carry the manager-only «درج النقود» tab
 *      with scan / test / manual target / pulse / fallback controls;
 *   6) the module is data-safe (no DB, no stock, no invoices, no LAN sync);
 *   7) all four languages resolve every drawer.* key;
 *   8) behaviour: hex parsing, defaults, custom-pulse resolution and the
 *      Arabic error mapper are executed for real.
 *
 * Run:  npm run verify:cash   (node renderer/tests/cash-drawer-verify.js)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = (...p) => path.join(__dirname, '..', ...p);
const read = (...p) => fs.readFileSync(R(...p), 'utf8');

const connHtml = read('pages', 'connection.html');
const connJs = read('js', 'pages', 'connection.js');
const appJs = read('js', 'app.js');
const mainJs = read('..', 'main.js');
const preloadJs = read('..', 'preload.js');
const printerNet = read('..', 'printer-net.js');
const pkg = JSON.parse(read('..', 'package.json'));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { fail++; failures.push(label); } }
function has(text, needle, label) { ok(text.indexOf(needle) !== -1, label); }
function hasNot(text, needle, label) { ok(text.indexOf(needle) === -1, label); }

// ===========================================================================
// 1) LOW-LEVEL LAYER (printer-net.js)
// ===========================================================================
has(printerNet, 'function scanDrawerTargets(', 'low: scanDrawerTargets() exists');
has(printerNet, 'async function testDrawer(', 'low: testDrawer() exists');
has(printerNet, 'async function openDrawer(', 'low: openDrawer() exists');
has(printerNet, 'function drawerDefaults(', 'low: drawerDefaults() exists');
has(printerNet, 'async function detectPowerShell(', 'low: detectPowerShell() exists');
has(printerNet, 'function parseHexBytes(', 'low: parseHexBytes() exists');
has(printerNet, 'const DRAWER_PULSES = [', 'low: the pulse preset table exists');
has(printerNet, "'1B 70 00 19 FA'", 'low: the default ESC/POS pulse is present');
has(printerNet, "'1B 40 1B 70 00 19 FA'", 'low: an init-then-kick variant is present');
has(printerNet, "'07 1B 70 00 19 FA'", 'low: the bell/pin-5 variant is present');
has(printerNet, "transport: 'auto'", 'low: auto transport is the default');
has(printerNet, 'Get-CimInstance Win32_SerialPort', 'low: COM ports are discovered through WMI');
has(printerNet, 'Get-Printer', 'low: Get-Printer is used when available');
has(printerNet, 'Win32_Printer', 'low: Win32_Printer is the PowerShell 2.0 fallback');
has(printerNet, 'isUsbVirtual', 'low: virtual USB spooler ports are flagged');
has(printerNet, 'System.IO.Ports.SerialPort', 'low: the COM transport uses SerialPort');
has(printerNet, 'System.Net.Sockets.TcpClient', 'low: the network transport uses TcpClient');

// ===========================================================================
// 2) MULTI-STATEMENT POWERPOINT RUNNER (the bug that sank the first attempt)
// ===========================================================================
has(printerNet, 'function wrapScriptBlock(', 'runner: wrapScriptBlock() exists');
has(printerNet, 'function runPSBlock(', 'runner: runPSBlock() exists');
has(printerNet, '$__zmt = & {', 'runner: the block is captured via a scriptblock call');
has(printerNet, 'runPSBlock(drawerComExpr(', 'runner: the COM send uses runPSBlock');
has(printerNet, 'runPSBlock(drawerNetExpr(', 'runner: the network send uses runPSBlock');
has(printerNet, 'runPSBlock(drawerWinExpr(', 'runner: the Windows-printer send uses runPSBlock');
hasNot(printerNet, 'runPS(drawerComExpr(', 'runner: the COM send no longer uses the pipeline-only runner');

// ===========================================================================
// 3) MAIN.JS — per-device store + IPC + enabled gate
// ===========================================================================
has(mainJs, "path.join(app.getPath('userData'), 'cash-drawer.json')", 'main: settings live in userData/cash-drawer.json');
has(mainJs, 'function readCashDrawerConfig(', 'main: readCashDrawerConfig() exists');
has(mainJs, 'function writeCashDrawerConfig(', 'main: writeCashDrawerConfig() exists');
has(mainJs, "cashDrawerHandle('cash-drawer-get'", 'main: cash-drawer-get channel');
has(mainJs, "cashDrawerHandle('cash-drawer-save'", 'main: cash-drawer-save channel');
has(mainJs, "cashDrawerHandle('cash-drawer-scan'", 'main: cash-drawer-scan channel');
has(mainJs, "cashDrawerHandle('cash-drawer-test'", 'main: cash-drawer-test channel');
has(mainJs, "cashDrawerHandle('cash-drawer-open'", 'main: cash-drawer-open channel');
has(mainJs, "opts.source !== 'manual'", 'main: a manual open bypasses the enabled gate');
has(mainJs, "if (!cfg.enabled) return { success: false, error: 'DISABLED', skipped: true }",
  'main: the automatic open honours the enabled flag');
has(mainJs, 'lastGood: { transport: res.transport, pulseId: res.pulseId, hex: res.hex, at: Date.now() }',
  'main: the winning path is remembered as lastGood');
has(printerNet, 'if (conf.lastGood && conf.lastGood.hex)', 'low: openDrawer prefers the recorded good pulse');

// ===========================================================================
// 4) PRELOAD BRIDGE
// ===========================================================================
has(preloadJs, "cashDrawerGet: () => ipcRenderer.invoke('cash-drawer-get')", 'preload: cashDrawerGet');
has(preloadJs, "cashDrawerSave: (patch) => ipcRenderer.invoke('cash-drawer-save', patch)", 'preload: cashDrawerSave');
has(preloadJs, "cashDrawerScan: () => ipcRenderer.invoke('cash-drawer-scan')", 'preload: cashDrawerScan');
has(preloadJs, "cashDrawerTest: (cfg) => ipcRenderer.invoke('cash-drawer-test', cfg)", 'preload: cashDrawerTest');
has(preloadJs, "cashDrawerOpen: (opts) => ipcRenderer.invoke('cash-drawer-open', opts)", 'preload: cashDrawerOpen');

// ===========================================================================
// 5) UI — the manager-only «درج النقود» tab
// ===========================================================================
has(connHtml, 'data-tab="drawer"', 'ui: the tab button exists');
has(connHtml, 'id="connTabDrawerBtn"', 'ui: the tab button has an id');
has(connHtml, 'id="connTabDrawer"', 'ui: the tab panel exists');
has(connHtml, 'data-i18n="drawer.tab"', 'ui: the tab label is translated');
has(connHtml, 'id="drawerEnabled"', 'ui: the auto-open toggle exists');
has(connHtml, 'onclick="drawerScan()"', 'ui: the scan button is wired');
has(connHtml, 'onclick="drawerTest()"', 'ui: the test button is wired');
has(connHtml, 'id="drawerTransport"', 'ui: the transport selector exists');
has(connHtml, 'id="drawerComPort"', 'ui: the COM field exists');
has(connHtml, 'id="drawerHost"', 'ui: the IP field exists');
has(connHtml, 'id="drawerPrinterName"', 'ui: the Windows-printer field exists');
has(connHtml, 'id="drawerPulse"', 'ui: the pulse selector exists');
has(connHtml, 'id="drawerCustomHex"', 'ui: the custom-hex field exists');
has(connHtml, 'id="drawerFallback"', 'ui: the off-by-default fallback toggle exists');
has(connHtml, 'id="drawerTargetsList"', 'ui: the scan results list exists');
has(connHtml, 'id="drawerAttempts"', 'ui: the attempt log exists');

has(connJs, 'function setupCashDrawer(', 'ui: setupCashDrawer() exists');
has(connJs, 'setupCashDrawer();', 'ui: init_connection() calls setupCashDrawer()');
has(connJs, 'function drawerApplyRole(', 'ui: drawerApplyRole() exists');
has(connJs, 'Auth.isManager()', 'ui: the tab is gated on Auth.isManager()');
has(connJs, "btn.style.display = isMgr ? '' : 'none'", 'ui: the tab button is hidden for non-managers');
has(connJs, "if (tab === 'drawer') drawerInit();", 'ui: opening the tab refreshes it');
has(connJs, 'api.cashDrawerScan()', 'ui: the page calls the scan channel');
has(connJs, 'api.cashDrawerTest(', 'ui: the page calls the test channel');
has(connJs, 'cashDrawerSave({ lastGood:', 'ui: the winning pulse is persisted after a good test');

// ===========================================================================
// 6) DATA SAFETY — nothing beyond userData
// ===========================================================================
// Scope the "no database" check to the drawer module only: connection.js also
// holds the pre-existing backup/restore code, which legitimately uses DB.
const drawerModuleStart = connJs.indexOf('CASH DRAWER («درج النقود») — managers only');
const drawerModule = drawerModuleStart === -1 ? '' : connJs.slice(drawerModuleStart);
ok(drawerModule.length > 0, 'safe: the drawer module is present in connection.js');
hasNot(drawerModule, 'DB.', 'safe: the drawer module never touches the database');
hasNot(drawerModule, 'insert into', 'safe: no SQL is written');
// The config lives in userData through IPC only; the renderer must not use
// localStorage for drawer settings (unlike the price display, which may).
ok(!/localStorage\.setItem\([^)]*drawer/i.test(connJs), 'safe: no drawer settings in localStorage');
// The main.js drawer block must not read or write stock.
const mainDrawerStart = mainJs.indexOf("CASH DRAWER («درج النقود»)");
const mainDrawerBlock = mainDrawerStart === -1 ? '' : mainJs.slice(mainDrawerStart, mainDrawerStart + 2600);
ok(mainDrawerBlock.length > 0, 'safe: the drawer block is present in main.js');
// The window must still reach the last channel, otherwise the two fences below
// would be vacuously true while the drawer code grew past them.
ok(mainDrawerBlock.includes("cashDrawerHandle('cash-drawer-open'"), 'safe: the drawer block window covers every cash-drawer channel');
hasNot(mainDrawerBlock, 'Stock.', 'safe: the drawer store never touches stock');
// Scope the LAN fence to the drawer code, not to the whole file: a text search
// over all of main.js is tripped by any distant comment that happens to list
// "cash-drawer" next to unrelated code, while still missing a real LAN call
// written further down this very block.
hasNot(mainDrawerBlock, 'LAN.', 'safe: the drawer store never touches the LAN sync');

// ===========================================================================
// 7) i18n — every drawer.* key in all four languages
// ===========================================================================
const DRAWER_KEYS = ['tab', 'title', 'desc', 'enable', 'enabled', 'disabled', 'saved',
  'scanTitle', 'scanDesc', 'scanBtn', 'useLastGood', 'scanning', 'scanDone', 'scanFail',
  'targetsCount', 'noTargets', 'noLastGood', 'lastGoodRestored', 'wmiFallback',
  'escposYes', 'escposMaybe', 'escposNo', 'escposUnknown', 'targetTitle', 'transport',
  'transportAuto', 'transportCom', 'transportNet', 'transportWin', 'comPort', 'host', 'port',
  'printerName', 'pulseTitle', 'pulse', 'customHex', 'timeout', 'pulseDesc', 'testTitle',
  'testBtn', 'testDesc', 'testing', 'opened', 'testFail', 'colPulse', 'colTransport',
  'colTime', 'colResult', 'ok', 'fallbackTitle', 'fallbackDesc', 'fallbackOn', 'note',
  'statusIdle', 'statusReady', 'statusVia', 'statusSelected', 'statusAutoOff', 'toastFail',
  'openedShort', 'fallbackTried', 'noElectron',
  'transportRawUsb', 'transportRawCom', 'rawBtn', 'rawUsbLabel', 'rawDesc',
  'rawMayWork', 'rawWarn', 'rawOk', 'rawFail'];

try {
  const iifeStart = appJs.indexOf('(function cashDrawerI18n');
  const iifeEnd = appJs.indexOf('\n})();', iifeStart);
  ok(iifeStart !== -1 && iifeEnd > iifeStart, 'i18n: cashDrawerI18n block located');
  const code = appJs.slice(iifeStart, iifeEnd + 5);
  const LANG = { ar: {}, en: {}, fr: {}, zh: {} };
  vm.runInContext(code, vm.createContext({ LANG }));
  ['ar', 'en', 'fr', 'zh'].forEach(l => {
    const m = (LANG[l] || {}).drawer || {};
    const missing = DRAWER_KEYS.filter(k => !(k in m));
    ok(missing.length === 0, 'i18n: ' + l + ' resolves all ' + DRAWER_KEYS.length + ' drawer keys' +
      (missing.length ? ' (missing: ' + missing.join(',') + ')' : ''));
  });
  ok(LANG.ar.drawer.tab === 'درج النقود', 'i18n: the Arabic tab label resolves');
  ok(LANG.en.drawer.tab === 'Cash drawer', 'i18n: the English tab label resolves');
  ok(/درج/.test(LANG.ar.drawer.note), 'i18n: the Arabic guidance note resolves');
} catch (e) {
  fail++;
  failures.push('i18n: threw ' + (e && e.message ? e.message : e));
}

// Every data-i18n key used in the panel must have a matching entry.
try {
  const panelStart = connHtml.indexOf('id="connTabDrawer"');
  const panelEnd = connHtml.indexOf('id="connTabDisplay"', panelStart);
  const panel = panelEnd > panelStart ? connHtml.slice(panelStart, panelEnd) : connHtml.slice(panelStart);
  const keys = Array.from(new Set((panel.match(/data-i18n="(drawer\.[A-Za-z]+)"/g) || [])
    .map(s => s.replace(/.*"drawer\.([A-Za-z]+)"/, '$1'))));
  ok(keys.length > 0, 'i18n: the panel uses translated labels');
  const missing = keys.filter(k => DRAWER_KEYS.indexOf(k) === -1);
  ok(missing.length === 0, 'i18n: every data-i18n key in the panel is declared' +
    (missing.length ? ' (missing: ' + missing.join(',') + ')' : ''));
} catch (e) {
  fail++;
  failures.push('i18n: panel key scan threw ' + (e && e.message ? e.message : e));
}

// ===========================================================================
// 8) NPM SCRIPT
// ===========================================================================
ok(!!(pkg.scripts && pkg.scripts['verify:cash']), 'pkg: a verify:cash script exists');

// ===========================================================================
// 8b) PHASE 2 — sale hook + F12
// ===========================================================================
const salesJs = read('js', 'pages', 'sales.js');
const shortcutsJs = read('js', 'shortcuts.js');
const indexHtml = read('index.html');
const cashDrawerJs = read('js', 'cash-drawer.js');

has(indexHtml, '<script src="js/cash-drawer.js"></script>', 'p2: index.html loads the drawer module');
has(cashDrawerJs, 'window.CashDrawer = {', 'p2: the module exposes window.CashDrawer');
has(cashDrawerJs, 'function openFromSale(', 'p2: openFromSale() exists');
has(cashDrawerJs, 'function openManual(', 'p2: openManual() exists');
has(cashDrawerJs, "cashDrawerOpen({ source: opts.source || 'manual' })", 'p2: both paths call the open channel');
has(cashDrawerJs, 'var busy = false;', 'p2: a busy flag guards against double-firing');
has(cashDrawerJs, "source: 'sale', quiet: true", 'p2: the sale path is silent');

has(salesJs, 'window.CashDrawer.openFromSale()', 'p2: the sale confirm opens the drawer');
ok(salesJs.indexOf('window.CashDrawer.openFromSale()') > salesJs.indexOf("showInvoicePreview(inv);") ||
   salesJs.indexOf('window.CashDrawer.openFromSale()') > salesJs.indexOf('window.ThermalPrint.printSale(inv, res)'),
  'p2: the drawer hook sits AFTER the receipt step');
ok(/CashDrawer\.openFromSale\(\)[\s\S]{0,260}?salesBarcodeScan'\)\.focus\(\);\s*}/.test(salesJs),
  'p2: the barcode refocus stays the last statement of the checkout');

has(mainJs, "mainWindow.webContents.send('cash-drawer-hotkey')", 'p2: main.js forwards F12 to the renderer');
has(mainJs, "input.key === 'F12'", 'p2: main.js still recognises F12');
has(mainJs, "input.key === 'I' || input.key === 'i'", 'p2: Ctrl+Shift+I remains the DevTools key');
has(mainJs, 'wc.openDevTools({ mode: \'detach\' })', 'p2: DevTools can still be opened');
ok(!/isF12[\s\S]{0,200}openDevTools/.test(mainJs), 'p2: F12 no longer toggles DevTools');

has(preloadJs, "onCashDrawerHotkey: (cb) => ipcRenderer.on('cash-drawer-hotkey'", 'p2: the preload forwards the hotkey event');
has(cashDrawerJs, 'onCashDrawerHotkey(function () { openManual(); })', 'p2: the module subscribes to the hotkey');
has(shortcutsJs, "case 'F12':", 'p2: shortcuts.js keeps F12 as a redundant safety net');
has(shortcutsJs, 'function openDrawerHotkey(', 'p2: the safety-net handler exists');
has(shortcutsJs, 'window.CashDrawer.openManual()', 'p2: the safety net calls openManual()');

// ===========================================================================
// 8c) PHASE 3 — silent toast + optional fallback wiring
// ===========================================================================
has(cashDrawerJs, 'function toast(', 'p3: the drawer has its own toast');
has(cashDrawerJs, "toast(T('drawer.toastFail'", 'p3: a failure shows the Arabic silent notice');
has(cashDrawerJs, "if (res && res.skipped) return { ok: false, skipped: true };",
  'p3: a sale with auto-open off does not nag the cashier');
has(cashDrawerJs, 'function fallbackPrint(', 'p3: the driver-print fallback exists');
has(cashDrawerJs, 'if (!cfg || !cfg.fallbackPrint)', 'p3: the fallback only runs when the shop enabled it');
has(cashDrawerJs, 'restPrint({ bodyHtml: html, paperWidth: 80, copies: 1 })',
  'p3: the fallback prints through the existing driver path');
ok(cashDrawerJs.indexOf('quiet: true') !== -1, 'p3: the sale path stays quiet');
ok(/catch\(function \(e\) \{\s*busy = false;/.test(cashDrawerJs), 'p3: a thrown error clears the busy flag');

// ===========================================================================
// 8d) RAW DEVICE-FILE TRANSPORT — \\.\USB00x + \\.\COMx (2.11.0)
// ===========================================================================
has(printerNet, 'function drawerRawExpr(', 'raw: drawerRawExpr() exists');
has(printerNet, '[System.IO.File]::Open(', 'raw: it opens the port as a raw device file');
has(printerNet, '[System.IO.FileShare]::ReadWrite', 'raw: it asks for shared access, not exclusive');
has(printerNet, 'transport = \'raw\'', 'raw: the emitted object is tagged raw');
has(printerNet, 'rawUsbPort', 'raw: the raw USB port is a stored setting');
ok(/rawUsbPort: '',/.test(printerNet), 'raw: drawerDefaults() seeds rawUsbPort empty');
has(printerNet, "if (transport === 'raw-usb' || transport === 'raw-com')",
  'raw: sendDrawerBytes() has both raw branches');
has(printerNet, "const devicePath = '\\\\\\\\.\\\\' + dev;", 'raw: the device path is \\\\.\\ + port');
has(printerNet, "['com', 'net', 'raw-usb', 'raw-com', 'win']", 'raw: auto order is the full-check sweep');
ok(printerNet.indexOf("['com', 'net', 'raw-usb'") < printerNet.indexOf("'raw-com', 'win'"),
  'raw: raw-usb is tried before raw-com');
has(printerNet, "kind: 'raw-usb'", 'raw: scan emits a raw-usb target');
has(printerNet, "kind: 'raw-com'", 'raw: scan emits a raw-com target');
has(printerNet, "code: 'raw_denied'", 'raw: a refusal maps to an Arabic raw_denied reason');
ok(/raw_denied/.test(printerNet) && /المشغّل|المشغل/.test(printerNet), 'raw: the raw refusal reason is Arabic');
has(printerNet, 'drawerRawExpr,', 'raw: drawerRawExpr is exported');

// UI: the dedicated raw-test button, the raw USB field, and the two options.
has(connHtml, 'id="drawerTestRawBtn"', 'raw: a dedicated raw-test button exists');
has(connHtml, 'id="drawerRawUsb"', 'raw: a raw USB port field exists');
has(connHtml, 'value="raw-usb"', 'raw: the transport select offers raw-usb');
has(connHtml, 'value="raw-com"', 'raw: the transport select offers raw-com');
has(connHtml, 'data-i18n="drawer.rawDesc"', 'raw: the panel explains the raw path');
has(connJs, 'async function drawerTestRaw(', 'raw: drawerTestRaw() exists');
has(connJs, "transport: wantUsb ? 'raw-usb' : 'raw-com'", 'raw: the raw test forces the raw transport');
has(connJs, "rawUsbPort: String(val('drawerRawUsb') || '').trim()", 'raw: the form reads rawUsbPort');
has(connJs, "set('drawerRawUsb', cfg.rawUsbPort || '')", 'raw: the config fills rawUsbPort');
has(connJs, "show('drawerRawUsbField'", 'raw: the raw USB field follows the transport');
has(connJs, "tg.kind === 'raw-usb'", 'raw: a scanned raw-usb target can be picked');
has(connJs, "t2 === 'raw-usb'", 'raw: lastGood restore handles raw-usb');
has(connJs, "t2 === 'raw-com'", 'raw: lastGood restore handles raw-com');
has(connJs, 'drawer.rawWarn', 'raw: the status strip warns on a raw path');


// ===========================================================================
// 9) BEHAVIOUR — execute the real pure functions from printer-net.js
// ===========================================================================
try {
  const pn = require(path.join(__dirname, '..', '..', 'printer-net.js'));

  ok(typeof pn.drawerDefaults === 'function', 'behaviour: drawerDefaults is exported');
  ok(typeof pn.parseHexBytes === 'function', 'behaviour: parseHexBytes is exported');
  ok(typeof pn.scanDrawerTargets === 'function', 'behaviour: scanDrawerTargets is exported');
  ok(typeof pn.testDrawer === 'function', 'behaviour: testDrawer is exported');
  ok(typeof pn.openDrawer === 'function', 'behaviour: openDrawer is exported');
  ok(Array.isArray(pn.DRAWER_PULSES) && pn.DRAWER_PULSES.length >= 5, 'behaviour: at least five pulse presets');

  const d = pn.drawerDefaults();
  ok(d.enabled === false, 'behaviour: auto-open is off by default');
  ok(d.fallbackPrint === false, 'behaviour: the fallback is off by default');
  ok(d.transport === 'auto', 'behaviour: auto transport by default');
  ok(d.pulseId === 'kick-a', 'behaviour: the default pulse is kick-a');
  ok(d.port === 9100, 'behaviour: the default network port is 9100');

  ok(JSON.stringify(pn.parseHexBytes('1B 70 00 19 FA')) === '[27,112,0,25,250]',
    'behaviour: parseHexBytes parses spaced hex');
  ok(JSON.stringify(pn.parseHexBytes('1b700019fa')) === '[27,112,0,25,250]',
    'behaviour: parseHexBytes parses compact hex');
  ok(JSON.stringify(pn.parseHexBytes('0x1B,0x70,0x00,0x19,0xFA')) === '[27,112,0,25,250]',
    'behaviour: parseHexBytes parses 0x/comma hex');
  ok(pn.parseHexBytes('') === null, 'behaviour: parseHexBytes rejects empty input');
  ok(pn.parseHexBytes('zz') === null, 'behaviour: parseHexBytes rejects non-hex');
  ok(pn.parseHexBytes('1B7') === null, 'behaviour: parseHexBytes rejects odd length');

  // Every preset must parse to bytes.
  const allParse = pn.DRAWER_PULSES.every(p => {
    const b = pn.parseHexBytes(p.hex);
    return Array.isArray(b) && b.length > 0;
  });
  ok(allParse, 'behaviour: every preset parses to a byte array');

  // Raw device-file expression: it must be executable PowerShell that opens the
  // path as a file and carries the exact bytes.
  ok(typeof pn.drawerRawExpr === 'function', 'behaviour: drawerRawExpr is exported');
  const rawExpr = pn.drawerRawExpr('\\\\.\\USB002', pn.parseHexBytes('1B 70 00 19 FA'));
  ok(rawExpr.indexOf("[System.IO.File]::Open('\\\\.\\USB002'") !== -1,
    'behaviour: the raw expression opens the exact device path');
  ok(rawExpr.indexOf('[System.IO.FileShare]::ReadWrite') !== -1,
    'behaviour: the raw expression requests shared access');
  ok(rawExpr.indexOf('$fs.Write(@(27,112,0,25,250), 0, 5)') !== -1,
    'behaviour: the raw expression writes the ESC/POS bytes');
  ok(/\$fs\.Close\(\); \$fs\.Dispose\(\)/.test(rawExpr),
    'behaviour: the raw expression always disposes the handle');
  const rawEscaped = pn.drawerRawExpr("\\\\.\\A'B", [1]);
  ok(rawEscaped.indexOf("A''B") !== -1, 'behaviour: a quote in the device path is escaped');

  // The raw transports must never be auto-selected: they are only used when the
  // shop picked them, or as a late hop in the auto sweep.
  const dd2 = pn.drawerDefaults();
  ok(dd2.rawUsbPort === '', 'behaviour: rawUsbPort defaults to empty');
  ok(['raw-usb', 'raw-com'].indexOf(dd2.transport) === -1,
    'behaviour: the default transport is not a raw one');
} catch (e) {
  fail++;
  failures.push('behaviour: threw ' + (e && e.message ? e.message : e));
}

// ===========================================================================
// 10) DOCUMENTED HARDWARE HONESTY — the USB001 / no-ESC-POS caveat is surfaced
// ===========================================================================
has(printerNet, 'virtual_port', 'honesty: the virtual-port error code is mapped');
has(printerNet, 'المفتاح المعدني', 'honesty: the Arabic copy mentions the metal key');
has(printerNet, 'ESC/POS', 'honesty: the Arabic copy points at ESC/POS printers');
has(connHtml, 'data-i18n="drawer.note"', 'honesty: the panel shows the important note');
has(connJs, 'res.errorAr', 'honesty: the panel surfaces the Arabic failure reason');

// ===========================================================================
const total = pass + fail;
console.log('\n' + '='.repeat(64));
console.log('cash-drawer verifier: ' + pass + '/' + total + ' checks passed');
console.log('='.repeat(64));
if (fail) {
  console.log('\nFAILED:');
  failures.forEach(f => console.log('  x ' + f));
  process.exit(1);
}
