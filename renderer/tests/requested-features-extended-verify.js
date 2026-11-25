// ============================================================
// ZMT PIECE — guards for the extended requests:
//   1. extra periods in «صافي الحساب» (yesterday / custom / single day)
//   2. optional per-product QR codes (off by default, remembered, gated)
//   3. fully isolated company processes (separate userData, scoped migration,
//      no cross-company LAN/cloud ownership)
// Run: node renderer/tests/requested-features-extended-verify.js
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log('  FAIL ' + m); } };
const section = (m) => console.log('\n=== ' + m + ' ===');

// ---------- 1) net-account periods ----------
section('1) صافي الحساب — extra periods');
const netHtml = read('renderer/pages/net-account.html');
const netJs = read('renderer/js/pages/net-account.js');
check(/data-period="yesterday"/.test(netHtml), 'yesterday button exists');
check(/data-period="custom"/.test(netHtml), 'custom range button exists');
check(/data-period="single-day"/.test(netHtml), 'specific-day button exists');
check(/id="netDateRange"/.test(netHtml) && /id="netSingleDay"/.test(netHtml), 'date input rows exist');
check(/data-i18n="net\.yesterday"/.test(netHtml), 'yesterday label is localised');
check(/case 'yesterday':/.test(netJs), 'yesterday range is computed');
check(/case 'custom':/.test(netJs), 'custom range is computed');
check(/case 'single-day':/.test(netJs), 'single-day range is computed');
check(/function _netParseLocalDate/.test(netJs), 'dates are parsed in local time (no UTC day shift)');
check(/const swap = from; from = to; to = swap;/.test(netJs), 'inverted custom range is normalised');

// Execute just the date-range helpers with a minimal DOM stub.
const netStart = netJs.indexOf('var _netPeriod =');
const netEnd = netJs.indexOf('function netRangeLabel');
const netSnippet = netJs.slice(netStart, netEnd) + '\n;globalThis.__net = { setNetPeriod, getNetDateRange };';
const netValues = {
  yesterday: '', single: '',
};
const netCtx = {
  console,
  Date,
  document: {
    getElementById(id) {
      if (id === 'netDateFrom') return { value: netValues.from || '' };
      if (id === 'netDateTo') return { value: netValues.to || '' };
      if (id === 'netSingleDate') return { value: netValues.single || '' };
      return null;
    },
    querySelectorAll() { return []; },
  },
  calculateNet() {},
};
vm.runInNewContext(netSnippet, netCtx);
netCtx.__net.setNetPeriod('yesterday');
const yRange = netCtx.__net.getNetDateRange();
check(!!yRange && yRange.to - yRange.from === 86399999, 'yesterday covers exactly one local day');
const now = new Date();
const expectedYest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
check(yRange.from === expectedYest, 'yesterday starts on the previous local midnight');

netCtx.__net.setNetPeriod('single-day');
netValues.single = '2026-11-25';
const sRange = netCtx.__net.getNetDateRange();
const expectedDay = new Date(2026, 10, 25).getTime();
check(sRange.from === expectedDay && sRange.to === expectedDay + 86399999, 'specific day uses local midnight + full day');

netCtx.__net.setNetPeriod('custom');
netValues.from = '2026-11-20';
netValues.to = '2026-11-15';
const cRange = netCtx.__net.getNetDateRange();
check(cRange.from === new Date(2026, 10, 15).getTime(), 'inverted custom range swaps start to earlier date');
check(cRange.to === new Date(2026, 10, 20, 23, 59, 59, 999).getTime(), 'inverted custom range ends at inclusive end of later date');

// ---------- 2) product QR ----------
section('2) Product QR — optional, off by default, remembered');
const qrJs = read('renderer/js/product-qr.js');
const invJs = read('renderer/js/pages/inventory.js');
const salesJs = read('renderer/js/pages/sales.js');
const settingsHtml = read('renderer/pages/settings.html');
const settingsJs = read('renderer/js/pages/settings.js');
const indexHtml = read('renderer/index.html');
check(/zmt_product_qr_enabled/.test(qrJs), 'QR setting has a persisted key');
check(/return localStorage.getItem\(KEY\) === '1'/.test(qrJs), 'QR is OFF unless explicitly enabled');
check(/ZMT-PRODUCT\|/.test(qrJs), 'payload uses a stable identifier (no volatile name/price)');
check(/_cache\[payload\]/.test(qrJs), 'generated SVG is cached');
check(/js\/product-qr\.js/.test(indexHtml), 'helper is loaded by the app shell');
check(/ProductQR\.htmlOf\(p\)/.test(invJs), 'inventory cards render QR through the helper');
check(/ProductQR\.htmlOf\(rep\)/.test(salesJs), 'sales cards render QR through the helper');
check(/id="settingsProductQR"/.test(settingsHtml), 'settings checkbox exists');
check(/data-i18n="settings\.productQR"/.test(settingsHtml), 'settings checkbox is localised');
check(/ProductQR\.set\(productQrEl\.checked\)/.test(settingsJs), 'toggle persists immediately');
check(/ProductQR\.refreshCards\(\)/.test(settingsJs), 'toggle refreshes visible product cards');

const store = Object.create(null);
const qrCtx = {
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
  },
  window: {
    qrcodegen() {
      return {
        addData() {},
        make() {},
        getModuleCount() { return 21; },
        isDark(r, c) { return r === c || (r + c) % 7 === 0; },
      };
    },
  },
};
vm.runInNewContext(qrJs + '\n;globalThis.__qr = ProductQR;', qrCtx);
check(qrCtx.__qr.enabled() === false, 'fresh profile keeps QR disabled');
check(qrCtx.__qr.htmlOf({ id: 7, barcode: '123' }) === '', 'disabled QR emits no markup');
check(qrCtx.__qr.payloadOf({ id: 7, name: 'دواء', sellPrice: 99, barcode: '123' }) === 'ZMT-PRODUCT|7|123', 'payload excludes name and price');
qrCtx.__qr.set(true);
check(qrCtx.__qr.enabled() === true, 'enabled state is persisted');
const qrHtml = qrCtx.__qr.htmlOf({ id: 7, barcode: '123' });
check(/<svg/.test(qrHtml) && /prod-qr-svg/.test(qrHtml), 'enabled QR emits an inline SVG');
check(/event\.stopPropagation\(\)/.test(qrHtml), 'QR does not trigger card click handlers');

// Printed labels use the same payload/generator but are NOT gated by the card
// switch, and accept a physical size in mm.
check(/function svgForPrint\(/.test(qrJs) && /svgForPrint: svgForPrint/.test(qrJs),
  'print-dialog QR entry point is exported');
check(/force: true/.test(qrJs) && /_printCache/.test(qrJs),
  'forced print QR uses its own cache and ignores the card switch');
qrCtx.__qr.set(false);
const printQr = qrCtx.__qr.svgForPrint({ id: 7, barcode: '123' }, 32);
check(/width="32mm" height="32mm"/.test(printQr), 'printed QR honours the chosen mm size');
check(qrCtx.__qr.enabled() === false && qrCtx.__qr.htmlOf({ id: 7, barcode: '123' }) === '',
  'card QR stays OFF even when a label prints a QR');
check(/ZMT-PRODUCT\|7\|123/.test(qrCtx.__qr.payloadOf({ id: 7, barcode: '123' })),
  'printed QR reuses the same stable payload');

// ---------- 3) isolated company processes ----------
section('3) Company isolation — process, profile, migration, services');
const mainJs = read('main.js');
const preload = read('preload.js');
const authJs = read('renderer/js/auth.js');
const appJs = read('renderer/js/app.js');
const loginJs = read('renderer/js/pages/login.js');
const profileJs = read('renderer/js/company-profile.js');
const cloudJs = read('renderer/js/supabase-service.js');
const dbJs = read('renderer/js/db.js');

check(/const BASE_USER_DATA = app\.getPath\('userData'\)/.test(mainJs), 'base profile captured before override');
check(/--company=/.test(mainJs) && /app\.setPath\('userData', dir\)/.test(mainJs), 'company process uses its own userData');
check(/com\.zmt\.piece\.company\./.test(mainJs), 'company process has a distinct taskbar identity');
check(/License\.setUserDataPath\(BASE_USER_DATA\)/.test(mainJs), 'licence stays machine-wide in base profile');
check(/_companyIpcHandle\('company-prepare-snapshot'/.test(mainJs), 'snapshot preparation IPC exists (safe re-registration)');
check(/_companyIpcHandle\('company-ipc-status'/.test(mainJs) &&
      /COMPANY_IPC_CHANNELS/.test(mainJs), 'main exposes a version/ready probe for company IPC');
check(/companyIpcStatus: \(\) => ipcRenderer\.invoke\('company-ipc-status'\)/.test(preload),
  'preload exposes the company IPC status probe');
check(/async function settingsCompanyIpcReady\(/.test(settingsJs) &&
      /await settingsCompanyIpcReady\(\);/.test(settingsJs),
  'settings checks main-process readiness before preparing a snapshot');
check(/t\('settings\.staleBuild'\)/.test(settingsJs) && /staleBuild:/.test(appJs),
  'stale installed build has a localised explanation');
check(/migration\.json\.bak/.test(mainJs), 'snapshot overwrite is backup-first');
check(/spawn\(process\.execPath, _companyArgs/.test(mainJs), 'company opens in a separate process');
check(/company-create-shortcut/.test(mainJs), 'desktop shortcut IPC exists');
check(/if \(IS_COMPANY_PROCESS\) return _portServiceUnavailable\(\)/.test(mainJs), 'company process cannot start LAN/phone ports');
check(/ipcMain\.handle\('get-launch-context'/.test(mainJs), 'renderer can read launch context');
check(mainJs.includes('query: { company: LAUNCH_COMPANY_ID }') && /loadFile\([^;]*loadOptions/.test(mainJs), 'company process passes ?company=<id> to the renderer');
check(/data-i18n="settings\.openIsolated"/.test(settingsJs), 'isolated-window action has a visible localised label');
check(/getBaseAppDataPath/.test(preload) && /openCompanyWindow/.test(preload) && /prepareCompanySnapshot/.test(preload), 'preload exposes company APIs');

check(/js\/company-profile\.js/.test(indexHtml) && indexHtml.indexOf('js/company-profile.js') < indexHtml.indexOf('js/auth.js'), 'company scope is pinned before auth/DB init');
check(/window\.__zmtCompanyIsolated = true/.test(profileJs), 'renderer marks isolated processes');
check(/zmt_active_company', COMPANY_ID/.test(profileJs), 'launch company pinned in localStorage');
check(/snap\.companyId !== COMPANY_ID/.test(profileJs), 'wrong-company snapshot is rejected');
check(/DB\.importAll\(_scopeDb\(snap\), \{ mergeNewer: false \}\)/.test(profileJs), 'migration imports scoped snapshot');
check(/row\.companyId === COMPANY_ID/.test(profileJs), 'only target-company rows are imported');
check(/!row\.companyId/.test(profileJs), 'default-company legacy rows are retained only for the default');
check(/_removeForeignCompanies\(\)/.test(profileJs), 'foreign company rows removed from isolated selector');
check(/'zmt_auth_user'/.test(profileJs), 'auth session is never copied between profiles');
check(!/zmt_remembered_company[^\n]*localStorage\.setItem/.test(profileJs.slice(profileJs.indexOf('_applyLocalStorage'), profileJs.indexOf('function _defaultCompanyId'))), 'remembered company mirror is excluded');

check(/function enforceLaunchCompany/.test(authJs), 'auth can re-bind session to launch company');
check(/enforceLaunchCompany\(\)/.test(loginJs) && /enforceLaunchCompany\(\)/.test(appJs), 'binding applied at login and boot');
check(/IS_COMPANY_PROCESS && id !== LAUNCH_COMPANY_ID/.test(authJs), 'in-company switching is blocked');
check(/window\.CompanyProfile\.isolated/.test(loginJs) && /window\.CompanyProfile\.isolated/.test(appJs), 'LAN/cloud starts skipped in isolated process');
check(/function _isIsolatedCompany/.test(cloudJs) && /if \(_isIsolatedCompany\(\)\) return/.test(cloudJs), 'cloud writes/polling blocked in isolated process');
check(/window\.__zmtCompanyIsolated\) return/.test(dbJs), 'DB cloud triggers blocked in isolated process');

check(/settingsOpenIsolated/.test(settingsJs) && /settingsCreateCompanyShortcut/.test(settingsJs), 'company card exposes isolated-window and shortcut actions');
check(/settingsPrepareCompanySnapshot/.test(settingsJs), 'snapshot prepared from main instance on demand');
check(/window\.CompanyProfile\.isolated\) return false/.test(settingsJs), 'company management hidden inside isolated process');
check(/data-i18n="settings\.isolatedHint"/.test(settingsHtml), 'isolation hint is localised');

// ---------- 4) performance fixes (values unchanged) ----------
section('4) Performance — navigation, settings, printer reads, net account');
check(appJs.includes('applyTranslation(container);'), 'navigation translates only the rebuilt page');
check(!/applyTranslation\(\);\s*\n\s*const pageRoot/.test(appJs), 'language change no longer translates the page twice');
check(!/runPageInit\(pageId\);\s*\n\s*setupBrandImages\(\);/.test(appJs), 'brand images are not initialised twice per page load');

check(/_printerReadCache = new Map\(\)/.test(mainJs), 'printer read results are cached');
check(mainJs.includes("printerHandle('printer-list-local', () => _cachedPrinterRead"), 'printer list IPC uses the cache');
check(mainJs.includes("printerHandle('printer-set-default', (name) => PrinterNet.setDefaultPrinter(name), true);"), 'default-printer change invalidates the cache');
check(mainJs.includes("printerHandle('printer-share', (printerName, shareName) => PrinterNet.sharePrinter(printerName, shareName), true);"), 'sharing a printer invalidates the cache');
check(mainJs.includes('if (invalidate) _invalidatePrinterCache();'), 'mutating printer channels clear cached reads');

const settingsInitBody = settingsJs.slice(
  settingsJs.indexOf('function init_settings()'),
  settingsJs.indexOf('const PROVIDER_INFO')
);
check(settingsInitBody.includes('_scheduleAuditLogLoad();'), 'audit log is loaded off the critical path');
check(!settingsInitBody.includes('settingsPopulateCompanyFields();'), 'company fields are not populated twice on init');
check(settingsInitBody.includes('settingsUpdateActiveCompanyBar();'), 'active company bar performs the single population');
check(settingsJs.includes('_auditRenderCache.key'), 'audit rows are cached between filter/data changes');
check(settingsJs.includes('_settingsLanWatchTimer'), 'LAN firewall watch timer is tracked');
check(settingsJs.includes("ev.detail.pageId !== 'settings'"), 'LAN watch timer is cleared when leaving settings');
check((settingsJs.match(/_settingsPageVisible\(\)/g) || []).length >= 4, 'hidden settings listeners skip their work');
check(settingsJs.includes('settingsSaveLogoLayoutSoon();'), 'logo sliders save through a debounce');
check(settingsJs.includes('sizeEl._zmtLogoSizeBound'), 'logo listeners are bound to the current DOM elements');
check(!settingsJs.includes('settingsInitInvoiceLogo._bound'), 'function-level _bound listener bug is gone');

check(netJs.includes('function _netSnapshot()'), 'net account reads all stores into one snapshot');
check(/const snap = suppliedSnap \|\| _netSnapshot\(\)/.test(netJs), 'net calculation shares the snapshot');
check(netJs.includes('renderNetTransactions(snap);'), 'transaction log reuses the same snapshot');

const summary = fails ? 'FAILED (' + fails + ')' : 'ALL PASS';
console.log('\n' + summary);
process.exitCode = fails ? 1 : 0;
