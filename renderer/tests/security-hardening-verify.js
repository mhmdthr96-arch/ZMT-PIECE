// ZMT PIECE — security hardening regression suite
// Run: node renderer/tests/security-hardening-verify.js
//
// Guards the four hardening layers: DevTools password gate, AI/cloud keys in
// main process, cloud quota/inbound-command limits, and the renderer FS/IPC
// allowlist. Static assertions are backed by a vm harness that really executes
// applyRemoteCommands() against poisoned command files.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (rel) => fs.readFileSync(path.join(base, rel), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const has = (src, needle, m) => check(src.indexOf(needle) >= 0, m);
const lacks = (src, needle, m) => check(src.indexOf(needle) < 0, m);

const main = read('main.js');
const preload = read('preload.js');
const cloudMain = read('cloud-bridge.js');
const aiMain = read('ai-bridge.js');
const cloudRenderer = read('renderer/js/supabase-service.js');
const aiRenderer = read('renderer/js/lib/ai-agent.js');
const licenseRenderer = read('renderer/js/license.js');
const authRenderer = read('renderer/js/auth.js');
const appRenderer = read('renderer/js/app.js');
const settingsRenderer = read('renderer/js/pages/settings.js');
const devtoolsPreload = read('devtools-auth-preload.js');

// ---------- Layer 1: DevTools gate ----------
has(main, "const DEVTOOLS_PASSWORD = '1234512345.com'", 'exact DevTools password lives in main only');
has(main, "ipcMain.handle('devtools-auth-submit'", 'password is checked by a main-process IPC handler');
has(main, 'event.sender !== _devtoolsAuthWindow.webContents', 'only the password dialog may answer the gate');
has(main, "win.webContents.on('devtools-opened'", 'unauthorised inspector openings are closed');
has(main, "key === 'F12'", 'F12 remains the cash-drawer hotkey, not the inspector');
has(main, 'Menu.setApplicationMenu(Menu.buildFromTemplate(template))', 'stock menu with DevTools entry is replaced');
has(devtoolsPreload, "ipcRenderer.invoke('devtools-auth-submit', password)", 'dialog bridge only submits, never decides');
check((main.match(/openDevTools\(/g) || []).length === 1,
  'the only openDevTools call is the verified unlock path');
check(!/--dev'\)[\s\S]{0,220}?openDevTools\(/.test(main), '--dev cannot auto-open the inspector');

// ---------- Layer 2: AI keys ----------
has(aiMain, 'safeStorage.encryptString', 'AI keys are encrypted with OS storage');
has(aiMain, "ipcMain.handle('ai-call'", 'AI inference happens in the main process');
has(aiMain, "target.protocol !== 'https:'", 'AI endpoints must be HTTPS');
has(main, "const AIBridge = require('./ai-bridge');", 'AI bridge is registered by main');
has(preload, 'aiCall: (request)', 'renderer receives only prompts/results');
has(aiRenderer, "async getApiKey() { return ''; }", 'renderer API key getter never returns a secret');
has(aiRenderer, 'api.aiCall({ provider, model, body, timeoutMs })', 'renderer calls AI through IPC');
lacks(aiRenderer, 'fetch(fullUrl', 'renderer no longer calls the AI provider directly');
has(aiMain, "ipcMain.handle('ai-set-base-url'", 'the custom AI endpoint is stored by main');
has(aiMain, 'cfg.endpoint(model, provider === \'custom\' ? _baseUrl : \'\')', 'a renderer-supplied AI endpoint is ignored');
has(aiMain, 'bodySize > 2 * 1024 * 1024', 'AI request bodies are capped');
has(preload, 'aiSetBaseUrl: (url)', 'settings can save the AI endpoint through IPC');
has(settingsRenderer, 'AIAgent.saveBaseUrl(baseUrl)', 'settings routes the AI endpoint to main');
lacks(aiRenderer, 'baseUrl, body, timeoutMs', 'no endpoint is passed with the AI prompt');

// ---------- Layer 3: cloud bridge + quota ----------
has(cloudMain, "const SUPABASE_KEY = 'sb_publishable_", 'real Supabase key lives in main only');
has(cloudMain, "const CLOUD_PLACEHOLDER = 'https://cloud.zmt.local'", 'renderer uses a fake cloud origin');
has(cloudMain, 'const MAX_REQUESTS_PER_WINDOW', 'cloud has a request budget');
has(cloudMain, 'const MAX_BODY_BYTES', 'cloud has an upload size limit');
has(cloudMain, "incoming.origin !== CLOUD_PLACEHOLDER", 'only the placeholder origin is rewritten');
has(cloudMain, "pathname.indexOf('..')", 'cloud path traversal is rejected');
has(cloudMain, 'Authorization: \'Bearer \' + auth', 'main injects the RLS token');
has(cloudMain, 'u.hostname.endsWith(\'.vercel.app\')', 'site origin is restricted to the known website');
has(cloudMain, 'const ALLOWED_METHODS', 'HTTP methods are allowlisted');
has(cloudMain, 'const MAX_BROADCAST_BYTES', 'realtime messages have a size limit');
has(cloudMain, 'const MAX_BROADCASTS_PER_MINUTE', 'realtime messages have a rate limit');
has(cloudRenderer, 'window.zmtCloudFetch', 'supabase-js uses the IPC fetch bridge');
has(cloudRenderer, '_bridge().cloudTokenObtain(', 'token minting is delegated to main');
has(cloudRenderer, 'api.cloudBroadcast(', 'realtime broadcast is delegated to main');
has(cloudRenderer, 'safePath.split(\'/\').some(p => p === \'..\' || p === \'.\')', 'cloud paths reject traversal segments');
has(cloudRenderer, 'MAX_COMMANDS_FILE_CHARS', 'command file has a hard size limit');
has(cloudRenderer, 'MAX_COMMANDS_PER_POLL', 'inbound commands are capped per poll');
has(cloudRenderer, 'MAX_COMMAND_JSON_CHARS', 'a single command has a hard size limit');
has(cloudRenderer, "cmd.op !== 'create' && cmd.op !== 'update' && cmd.op !== 'delete'", 'only explicit ops are accepted');
has(cloudRenderer, 'MAX_FUTURE_SKEW_MS', 'future-dated commands are rejected');
has(cloudRenderer, 'cmd.storeCode !== code', 'cross-store commands are rejected');
has(cloudRenderer, '_seenCommandKeys', 'duplicate commands are tracked');
has(preload, "parsed.origin === 'https://cloud.zmt.local'", 'renderer cannot forge the cloud scope');
has(preload, 'zmtMakeResponse', 'IPC responses are converted back to fetch-compatible objects');
has(authRenderer, 'window.zmtCloudFetch', 'auth site calls go through the bridge');
has(appRenderer, 'window.zmtCloudFetch', 'web-push notifications go through the bridge');
lacks(authRenderer, 'resp = await fetch(_getSiteBase() + path', 'auth no longer uses a direct site fetch');
lacks(appRenderer, 'fetch(siteUrl.replace(', 'push notifications no longer use a direct site fetch');
lacks(cloudRenderer, "const SUPABASE_KEY = 'sb_publishable_", 'renderer has no real Supabase key');
lacks(cloudRenderer, "const SUPABASE_URL = 'https://dzqiybhpevqoolsmatat", 'renderer has no real Supabase URL');

// ---------- Layer 4: reset password, external URLs, filesystem ----------
has(main, "const HARD_RESET_PASSWORD = '1234512345'", 'factory-reset password lives in main only');
has(main, "ipcMain.handle('license-reset-verify'", 'password-only probe has no side effects');
has(main, "ipcMain.handle('license-hard-reset', async (_event, password)", 'reset handler re-checks the password');
has(preload, 'licenseResetVerify: (password)', 'renderer can verify without destructive action');
lacks(licenseRenderer, "'1234512345'", 'factory-reset secret is removed from the renderer');
lacks(main, "'Access-Control-Allow-Origin': ['*']", 'wildcard CORS header is removed');
has(main, 'webSecurity: true', 'renderer webSecurity is enabled');
lacks(main, 'webSecurity: false', 'webSecurity is never disabled');
has(main, 'function _isAllowedExternalUrl', 'external URLs are allowlisted');
has(main, 'function assertAllowedPath', 'filesystem IPC has one central guard');
has(main, '_hasGrant(sender, resolved', 'dialog-granted paths are checked per sender');
has(main, 'DENY_WRITE_NAMES', 'critical credential/licence files cannot be overwritten');
has(main, 'DATA_IMPORT_EXT', 'drag-and-drop migration files are read-only with known extensions');
has(main, 'backupsOnly: true', 'delete-file only removes backup files');
has(main, 'A company process may only touch its OWN profile.', 'company processes are confined to their own profile');
has(main, "'zmt_ai_base_url.json'", 'the saved AI endpoint cannot be overwritten by write-file');
has(main, '_isInside(INVOICE_LOGO_DIR(), logoPath)', 'logo data-url cannot read arbitrary files');
has(main, 'targetDir: undefined, targetPath: undefined', 'firebird restore destination is main-owned');
has(main, "ipcMain.handle('open-rustdesk', async () =>", 'renderer can no longer pass an executable path');
has(main, 'findRustDesk(readSavedRustDeskPath())', 'RustDesk launches only a main-stored path');
has(main, "const UPDATE_HOSTS = ['github.com', 'githubusercontent.com']", 'updater downloads only from GitHub');
check((main.match(/_grantPath\(event\.sender/g) || []).length >= 3,
  'open/save/pick dialogs grant narrowly scoped path permissions');

// No production renderer file may contain either secret or the real cloud host.
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((out, e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return out.concat(e.name === 'vendor' ? [] : walk(p));
    return e.name.endsWith('.js') ? out.concat(p) : out;
  }, []);
}
for (const file of walk(path.join(base, 'renderer', 'js'))) {
  const src = fs.readFileSync(file, 'utf8');
  const label = path.relative(base, file).replace(/\\/g, '/');
  check(src.indexOf('sb_publishable_') < 0 && src.indexOf('dzqiybhpevqoolsmatat.supabase.co') < 0 &&
    src.indexOf('1234512345') < 0, 'no secret in ' + label);
}

// ---------- Behavioural harness: inbound command guard ----------
// Runs the real supabase-service.js with a stubbed fetch/DB and no electronAPI
// (the non-Electron fallback path). Every scenario below would have written
// arbitrary data to IndexedDB before this guard existed.
function makeCloudHarness() {
  const src = read('renderer/js/supabase-service.js');
  const now = 1000000;
  const store = {
    zmt_store_code: '123',
    zmt_store_type: 'main',
    zmt_cloud_token: JSON.stringify({ token: 'test-token', expiresAt: now + 3600000 }),
  };
  let fileText = '[]';
  let calls = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    Date: { now: () => now },
    Math, JSON, String, Number, parseInt, parseFloat, isFinite, Array, Object, Set,
    Blob: function () {}, URL,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 1, clearInterval: () => {},
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    fetch: async (url) => {
      if (String(url).indexOf('/storage/v1/object/') >= 0) {
        return {
          status: 200, ok: true,
          text: async () => fileText,
          json: async () => JSON.parse(fileText),
          blob: async () => ({ text: async () => fileText }),
        };
      }
      return { status: 200, ok: true, text: async () => '{}', json: async () => ({}) };
    },
    Auth: {
      isLoggedIn: () => true, getUserCode: () => '123', getStoreType: () => 'main',
      getParentCode: () => '', getStorePassword: () => '',
    },
    DB: {
      applyOrderCommand: (op, cmd) => {
        calls.push({ op, id: (cmd.order && cmd.order.id) || cmd.orderId || cmd.recordId });
        return true;
      },
    },
    supabase: { createClient: () => ({}) },
    document: { getElementById: () => null, createElement: () => ({ style: {} }), addEventListener() {} },
    location: { href: 'file:///renderer/index.html' },
    navigator: { onLine: true },
    CustomEvent: function () {}, dispatchEvent: () => {}, addEventListener: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'supabase-service.js' });
  const Cloud = vm.runInContext('CloudService', sandbox);
  return {
    Cloud,
    setCommands(cmds) { fileText = JSON.stringify(cmds); },
    setRawText(text) { fileText = text; },
    get calls() { return calls.slice(); },
  };
}

const cmd = (i, extra) => Object.assign({
  ts: 999000 + i, op: 'create', storeCode: '123', kind: 'order',
  orderId: 'o' + i, order: { id: 'o' + i },
}, extra || {});

(async function behaviouralChecks() {
  const good = makeCloudHarness();
  good.setCommands([cmd(1), cmd(2), cmd(3)]);
  eq(await good.Cloud.applyRemoteCommands(), 3, 'valid commands are applied');
  eq(await good.Cloud.applyRemoteCommands(), 0, 'replaying the same commands is a no-op');

  const many = makeCloudHarness();
  many.setCommands(Array.from({ length: 250 }, (_, i) => cmd(i + 1)));
  eq(await many.Cloud.applyRemoteCommands(), 100, 'at most 100 commands are applied per poll');
  eq(many.calls.length, 100, 'no hidden DB writes beyond the per-poll cap');

  const evil = makeCloudHarness();
  evil.setCommands([
    cmd(1, { op: 'drop' }),
    cmd(2, { op: 'truncate' }),
    cmd(3, { ts: 1000000 + 10 * 60 * 1000 }),
    cmd(4, { storeCode: '999' }),
    cmd(5, { ts: -1 }),
    cmd(6, { op: 'create', order: { id: 'o6', name: 'x'.repeat(600 * 1024) } }),
    cmd(7, { op: 'delete' }),
  ]);
  eq(await evil.Cloud.applyRemoteCommands(), 1, 'only the one valid command survives the guard');
  eq(evil.calls.length, 1, 'no poisoned command reaches DB.applyOrderCommand');
  eq(evil.calls[0] && evil.calls[0].id, 'o7', 'the applied command is the expected one');

  const dup = makeCloudHarness();
  const same = cmd(1);
  dup.setCommands([same, Object.assign({}, same)]);
  eq(await dup.Cloud.applyRemoteCommands(), 1, 'duplicates inside one file are applied once');

  const huge = makeCloudHarness();
  huge.setRawText('["' + 'x'.repeat(2 * 1024 * 1024 + 10) + '"]');
  eq(await huge.Cloud.applyRemoteCommands(), 0, 'an oversized command file is rejected before parsing');
  eq(huge.calls.length, 0, 'no DB write from an oversized file');

  console.log('\n============================================');
  if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
  else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
