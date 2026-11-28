const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  focusFix: () => ipcRenderer.send('window-focus-fix'),
  openFile: (options) => ipcRenderer.invoke('dialog-open-file', options),
  saveFile: (options) => ipcRenderer.invoke('dialog-save-file', options),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  writeFileBinary: (filePath, base64Data) => ipcRenderer.invoke('write-file-binary', filePath, base64Data),
  generateInvoicePdf: (html) => ipcRenderer.invoke('generate-invoice-pdf', html),
  sendEmail: (payload) => ipcRenderer.invoke('send-email', payload),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
  // Company isolation: shared base profile + launch context + dedicated process
  getBaseAppDataPath: () => ipcRenderer.invoke('get-base-app-data-path'),
  getLaunchContext: () => ipcRenderer.invoke('get-launch-context'),
  companyIpcStatus: () => ipcRenderer.invoke('company-ipc-status'),
  openCompanyWindow: (companyId) => ipcRenderer.invoke('company-open-window', companyId),
  prepareCompanySnapshot: (companyId, payload) => ipcRenderer.invoke('company-prepare-snapshot', companyId, payload),
  createCompanyShortcut: (companyId, name) => ipcRenderer.invoke('company-create-shortcut', companyId, name),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  openFileImport: () => ipcRenderer.invoke('open-file-import'),
  // Price display (شاشة عرض السعر): local media + kiosk + Windows auto start
  pdImportMedia: (srcPath, kind) => ipcRenderer.invoke('pd-import-media', srcPath, kind),
  pdRemoveMedia: (destPath) => ipcRenderer.invoke('pd-remove-media', destPath),
  // Business logo for invoices — LOCAL ONLY, never uploaded to the cloud
  invoiceLogoImport: (srcPath, previousPath) => ipcRenderer.invoke('invoice-logo-import', srcPath, previousPath),
  invoiceLogoRemove: (destPath) => ipcRenderer.invoke('invoice-logo-remove', destPath),
  invoiceLogoDataUrl: (logoPath) => ipcRenderer.invoke('invoice-logo-dataurl', logoPath),
  windowSetKiosk: (on) => ipcRenderer.invoke('window-set-kiosk', on),
  autoLaunchGet: () => ipcRenderer.invoke('auto-launch-get'),
  autoLaunchSet: (enabled) => ipcRenderer.invoke('auto-launch-set', enabled),
  onPdExitRequest: (cb) => ipcRenderer.on('pd-exit-request', () => cb()),
  // Firebird (.fdb/.gdb) reader
  firebirdDetect: (dbPath, options) => ipcRenderer.invoke('firebird-detect', dbPath, options),
  firebirdTables: (dbPath, options) => ipcRenderer.invoke('firebird-tables', dbPath, options),
  firebirdColumns: (dbPath, table, options) => ipcRenderer.invoke('firebird-columns', dbPath, table, options),
  firebirdCount: (dbPath, table, options) => ipcRenderer.invoke('firebird-count', dbPath, table, options),
  firebirdQuery: (dbPath, table, columns, from, to, options) => ipcRenderer.invoke('firebird-query', dbPath, table, columns, from, to, options),
  firebirdRestore: (backupPath, options) => ipcRenderer.invoke('firebird-restore', backupPath, options),
  // MSSQL .bak importer (Gestion Stock SQL Server backups)
  mssqlBakEnsure: () => ipcRenderer.invoke('mssql-bak-ensure'),
  mssqlBakDetect: (bakPath) => ipcRenderer.invoke('mssql-bak-detect', bakPath),
  mssqlBakExport: (bakPath) => ipcRenderer.invoke('mssql-bak-export', bakPath),
  mssqlBakReadTable: (bakPath, table) => ipcRenderer.invoke('mssql-bak-read-table', bakPath, table),
  mssqlBakDispose: (bakPath) => ipcRenderer.invoke('mssql-bak-dispose', bakPath),
  // Splash / App Ready
  splashClose: () => ipcRenderer.send('splash-close'),
  // App version (matches the installed package.json version)
  appVersion: () => ipcRenderer.invoke('app-version'),
  // License System
  licenseCheck: () => ipcRenderer.invoke('license-check'),
  licenseActivate: (payload) => ipcRenderer.invoke('license-activate', payload),
  licenseServerStatus: (code, password) => ipcRenderer.invoke('license-server-status', code, password),
  licenseTimeTamper: () => ipcRenderer.invoke('license-time-tamper'),
  licenseSyncTime: () => ipcRenderer.invoke('license-sync-time'),
  licenseRemaining: () => ipcRenderer.invoke('license-remaining'),
  licenseMachineId: () => ipcRenderer.invoke('license-machine-id'),
  licenseDeactivate: (payload) => ipcRenderer.invoke('license-deactivate', payload),
  licenseImport: (payload) => ipcRenderer.invoke('license-import', payload),
  licenseResetVerify: (password) => ipcRenderer.invoke('license-reset-verify', password),
  licenseHardReset: (password) => ipcRenderer.invoke('license-hard-reset', password),
  // LAN Sync (main/sub server)
  lanConfigure: (config) => ipcRenderer.invoke('lan-configure', config),
  lanSend: (payload) => ipcRenderer.invoke('lan-send', payload),
  lanGetLocalIp: () => ipcRenderer.invoke('lan-get-local-ip'),
  lanGetStatus: () => ipcRenderer.invoke('lan-get-status'),
  lanTestConnection: (ip, port) => ipcRenderer.invoke('lan-test-connection', ip, port),
  lanEnsureFirewall: () => ipcRenderer.invoke('lan-ensure-firewall'),
  onLanMessage: (cb) => ipcRenderer.on('lan-message', (_e, msg) => cb(msg)),
  onLanStatus: (cb) => ipcRenderer.on('lan-status', (_e, st) => cb(st)),
  // Phone barcode scanner (PWA over LAN)
  phsStatus: () => ipcRenderer.invoke('phs-get-status'),
  phsStart: () => ipcRenderer.invoke('phs-start'),
  phsStop: () => ipcRenderer.invoke('phs-stop'),
  phsDecide: (requestId, decision) => ipcRenderer.invoke('phs-decide', requestId, decision),
  phsListApproved: () => ipcRenderer.invoke('phs-list-approved'),
  phsRemoveDevice: (deviceId) => ipcRenderer.invoke('phs-remove-device', deviceId),
  phsEnsureFirewall: () => ipcRenderer.invoke('phs-ensure-firewall'),
  onPhsPairRequest: (cb) => ipcRenderer.on('phs-pair-request', (_e, p) => cb(p)),
  onPhsScan: (cb) => ipcRenderer.on('phs-scan', (_e, s) => cb(s)),
  onPhsClients: (cb) => ipcRenderer.on('phs-clients', (_e, c) => cb(c)),
  onPhsStatus: (cb) => ipcRenderer.on('phs-status', (_e, st) => cb(st)),
  // Phone POS («البيع»): enable flag + renderer executes forwarded requests
  psaleGetEnabled: () => ipcRenderer.invoke('psale-get-enabled'),
  psaleSetEnabled: (enabled) => ipcRenderer.invoke('psale-set-enabled', enabled),
  psaleRespond: (requestId, result) => ipcRenderer.send('psale-respond', requestId, result),
  psaleSetDeviceSell: (deviceId, sell) => ipcRenderer.invoke('psale-set-device-sell', deviceId, sell),
  psaleGetDeviceSell: (deviceId) => ipcRenderer.invoke('psale-get-device-sell', deviceId),
  onPsaleEnabled: (cb) => ipcRenderer.on('psale-enabled', (_e, st) => cb(st)),
  onPsaleRequest: (cb) => ipcRenderer.on('psale-request', (_e, p) => cb(p)),
  // Restaurant orders («المطعم»): hidden-window thermal/invoice printing
  restListPrinters: () => ipcRenderer.invoke('rest-list-printers'),
  restPrint: (payload) => ipcRenderer.invoke('rest-print', payload),
  // External & remote support
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openAnyDesk: () => ipcRenderer.invoke('open-anydesk'),
  openRustDesk: (savedPath) => ipcRenderer.invoke('open-rustdesk', savedPath),
  pickRustDesk: () => ipcRenderer.invoke('pick-rustdesk'),
  // LAN printer sharing / installation
  printerListLocal: () => ipcRenderer.invoke('printer-list-local'),
  printerListDrivers: () => ipcRenderer.invoke('printer-list-drivers'),
  printerGetDefault: () => ipcRenderer.invoke('printer-get-default'),
  printerComputerName: () => ipcRenderer.invoke('printer-computer-name'),
  printerRestartSpooler: () => ipcRenderer.invoke('printer-restart-spooler'),
  printerShare: (printerName, shareName) => ipcRenderer.invoke('printer-share', printerName, shareName),
  printerUnshare: (printerName) => ipcRenderer.invoke('printer-unshare', printerName),
  printerBrowse: (host) => ipcRenderer.invoke('printer-browse', host),
  printerInstallDriver: (infPath) => ipcRenderer.invoke('printer-install-driver', infPath),
  printerInstallDriverShare: (uncFolder) => ipcRenderer.invoke('printer-install-driver-share', uncFolder),
  printerConnect: (unc) => ipcRenderer.invoke('printer-connect', unc),
  printerSetDefault: (name) => ipcRenderer.invoke('printer-set-default', name),
  printerFix: (trustedHost) => ipcRenderer.invoke('printer-fix', trustedHost),
  // Cash drawer («درج النقود»): scan / test / open + per-device settings
  cashDrawerGet: () => ipcRenderer.invoke('cash-drawer-get'),
  cashDrawerSave: (patch) => ipcRenderer.invoke('cash-drawer-save', patch),
  cashDrawerScan: () => ipcRenderer.invoke('cash-drawer-scan'),
  cashDrawerTest: (cfg) => ipcRenderer.invoke('cash-drawer-test', cfg),
  cashDrawerOpen: (opts) => ipcRenderer.invoke('cash-drawer-open', opts),
  onCashDrawerHotkey: (cb) => ipcRenderer.on('cash-drawer-hotkey', () => cb()),
  // Scale link («مزامنة الميزان»): push the article list into the scale
  scaleSyncGet: () => ipcRenderer.invoke('scale-sync-get'),
  scaleSyncSave: (patch) => ipcRenderer.invoke('scale-sync-save', patch),
  scaleSyncScan: () => ipcRenderer.invoke('scale-sync-scan'),
  scaleSyncSend: (payload) => ipcRenderer.invoke('scale-sync-send', payload),
  // Quick Entry standalone window (F1 → separate, minimizable BrowserWindow)
  openQuickEntryWindow: () => ipcRenderer.invoke('quick-entry-open'),
  onQuickEntryRefresh: (cb) => ipcRenderer.on('quick-entry-refresh', () => cb()),
  // Cross-window DB change bus: a window announces local writes so every OTHER
  // window can re-sync its in-memory cache (F1 child ↔ main, no restart needed).
  dbChangedNotify: () => ipcRenderer.send('zmt-db-changed'),
  onDbChanged: (cb) => ipcRenderer.on('zmt-db-changed', () => cb()),
  // Flush-on-close: the main process asks the renderer to persist any pending
  // (debounced/batched) IndexedDB writes before the window tears down, then waits
  // for the ack. Prevents the last edit from being lost on a normal close.
  onAppFlush: (cb) => ipcRenderer.on('app:flush', () => cb()),
  appFlushDone: () => ipcRenderer.send('app:flush-done'),
  // Updates (GitHub Releases)
  updaterSystemInfo: () => ipcRenderer.invoke('update-system-info'),
  updaterCheck: (manifestUrl) => ipcRenderer.invoke('update-check', manifestUrl),
  updaterDownload: (payload) => ipcRenderer.invoke('update-download', payload),
  updaterInstall: (filePath) => ipcRenderer.invoke('update-install', filePath),
  updaterBeep: () => ipcRenderer.invoke('update-beep'),
  updaterOpenLog: () => ipcRenderer.invoke('update-open-log'),
  updaterOpenFolder: () => ipcRenderer.invoke('update-open-folder'),
  onUpdaterProgress: (cb) => ipcRenderer.on('update-progress', (_e, p) => cb(p)),
  relaunchApp: () => ipcRenderer.invoke('app-relaunch'),
  // AI keys and inference live in the main process. Only prompts/results cross
  // this bridge; the key itself is never returned to the page.
  aiSetKey: (provider, key) => ipcRenderer.invoke('ai-set-key', provider, key),
  aiClearKey: (provider) => ipcRenderer.invoke('ai-clear-key', provider),
  aiHasKey: (provider) => ipcRenderer.invoke('ai-has-key', provider),
  aiMigrateKey: (provider, key) => ipcRenderer.invoke('ai-migrate-key', provider, key),
  aiSetBaseUrl: (url) => ipcRenderer.invoke('ai-set-base-url', url),
  aiGetBaseUrl: () => ipcRenderer.invoke('ai-get-base-url'),
  aiCall: (request) => ipcRenderer.invoke('ai-call', request),
  // Cloud credentials and HTTP traffic are handled in the main process.
  cloudTokenStatus: () => ipcRenderer.invoke('cloud-token-status'),
  cloudTokenObtain: (args) => ipcRenderer.invoke('cloud-token-obtain', args),
  cloudTokenStore: (token, expiresAt) => ipcRenderer.invoke('cloud-token-store', token, expiresAt),
  cloudTokenClear: () => ipcRenderer.invoke('cloud-token-clear'),
  cloudBroadcast: (payload) => ipcRenderer.invoke('cloud-broadcast', payload),
  cloudBudget: () => ipcRenderer.invoke('cloud-budget'),
  cloudRequest: (descriptor) => ipcRenderer.invoke('cloud-request', descriptor),
});

// Fetch-compatible bridge used by supabase-js and the website API helpers.
// The real URL/key/token are appended in main.js; this side never holds them.
function zmtNormalizeHeaders(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === 'function') {
    headers.forEach((v, k) => { out[String(k)] = String(v); });
  } else if (Array.isArray(headers)) {
    headers.forEach((pair) => { if (Array.isArray(pair)) out[String(pair[0])] = String(pair[1]); });
  } else {
    Object.keys(headers).forEach((k) => { out[String(k)] = String(headers[k]); });
  }
  return out;
}

function zmtBytesToBase64(bytes) {
  const step = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function zmtBase64ToBytes(value) {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function zmtEncodeBody(body) {
  if (body == null) return '';
  // The renderer pre-encodes non-string bodies (multipart uploads, raw byte
  // payloads) into this plain descriptor because Web API objects such as
  // FormData/Blob/ArrayBuffer do not survive contextBridge reliably.
  if (body && typeof body === 'object' && typeof body.__zmtBinaryBase64 === 'string') {
    const encoded = body.__zmtBinaryBase64;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('جسم الطلب غير صالح');
    return encoded;
  }
  const enc = new TextEncoder();
  if (typeof body === 'string') return zmtBytesToBase64(enc.encode(body));
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) return zmtBytesToBase64(new Uint8Array(body));
  if (ArrayBuffer.isView && ArrayBuffer.isView(body)) {
    return zmtBytesToBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) return zmtBytesToBase64(new Uint8Array(await body.arrayBuffer()));
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return zmtBytesToBase64(enc.encode(body.toString()));
  return zmtBytesToBase64(enc.encode(String(body)));
}

function zmtMakeResponse(result) {
  const bytes = zmtBase64ToBytes(result.bodyBase64);
  const headers = result.headers || {};
  const find = (name) => {
    const key = String(name).toLowerCase();
    const hit = Object.keys(headers).find((k) => k.toLowerCase() === key);
    return hit === undefined ? null : String(headers[hit]);
  };
  const type = find('content-type') || '';
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    statusText: result.statusText || '',
    url: '',
    headers: { get: find, has: (name) => find(name) !== null, forEach: (cb) => Object.keys(headers).forEach((k) => cb(String(headers[k]), k)) },
    clone: () => zmtMakeResponse(result),
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
    text: async () => new TextDecoder().decode(bytes),
    blob: async () => new Blob([bytes], { type }),
    arrayBuffer: async () => bytes.buffer,
  };
}

contextBridge.exposeInMainWorld('zmtCloudFetch', async (url, options) => {
  const init = options || {};
  const target = typeof url === 'string' ? url : ((url && url.url) || '');
  let parsed = null;
  try { parsed = new URL(target); } catch (e) {}
  const isCloud = !!(parsed && parsed.origin === 'https://cloud.zmt.local');
  const scope = isCloud ? 'supabase' : 'site';
  // For site calls the origin is always taken from the URL, never from an
  // arbitrary `siteBase` supplied by page JavaScript.
  const siteBase = isCloud ? undefined : ((parsed && parsed.origin) || init.siteBase || undefined);
  const result = await ipcRenderer.invoke('cloud-request', {
    scope,
    url: target,
    method: init.method || (url && url.method) || 'GET',
    headers: zmtNormalizeHeaders(init.headers || (url && url.headers)),
    bodyBase64: await zmtEncodeBody(init.body != null ? init.body : (url && url.body)),
    siteBase,
    timeoutMs: init.timeoutMs,
  });
  if (!result || result.ok !== true) throw new Error((result && result.error) || 'فشل طلب السحابة');
  return zmtMakeResponse(result);
});
