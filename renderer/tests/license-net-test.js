// license-net-test.js — exercises the REAL network layer of license.js with a
// stubbed `fetch` (plain Node: `_electronNet()` returns null, so the
// fetch fallback is used). No network, no server, no PowerShell.
//
// Covers the Win8 failure mode: the server ACCEPTED the activation but the
// response never came back → the user must NOT be told "no internet", the
// transport must be retried, and license_status must confirm the machine is
// already bound ("لن يُخصم المفتاح مرتين").
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const License = require(path.join(ROOT, 'license.js'));
const hooks = License._testHooks;
const LOG_FILE = hooks.NET_LOG_FILE;

let passed = 0;
let failed = 0;
function ok(m) { console.log('  ok  ' + m); passed++; }
function bad(m) { console.log('  FAIL ' + m); failed++; }
function assert(c, m) { if (c) ok(m); else bad(m); }
function section(t) { console.log('=== ' + t + ' ==='); }
function logText() {
  try { return fs.readFileSync(path.join(TMP, LOG_FILE), 'utf-8'); } catch (e) { return ''; }
}
function hasInLog(s) { return logText().indexOf(s) !== -1; }

// ---- fixture: temp userData dir + planted SMBIOS fingerprint (64 hex) -------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zmt-lic-'));
const FP = 'ab12'.repeat(16); // 64 lowercase hex chars
License.setUserDataPath(TMP);
fs.writeFileSync(path.join(TMP, 'zmt_smbios.dat'), JSON.stringify({ fingerprint: FP }), 'utf-8');

// Mirror isolation (same practice as license-phone-test): the activateOnline
// success path calls saveLicense -> saveLicenseMirror; a temp backend keeps
// those writes out of the REAL HKCU registry on the dev machine.
const MIRFILE = path.join(TMP, 'zmt_net_mirror.test');
hooks._setRegistryBackend({
  read() { try { return fs.readFileSync(MIRFILE, 'utf8'); } catch (e) { return null; } },
  write(b64) { fs.writeFileSync(MIRFILE, b64, 'utf8'); return true; },
  del() { try { fs.rmSync(MIRFILE, { force: true }); } catch (e) {} },
});

// ---- fetch stub -------------------------------------------------------------
// queue entries: {err} -> reject, {status, body} -> resolve.
let queue = [];
let calls = [];
const realFetch = global.fetch;
global.fetch = async function (url, opts) {
  calls.push({ url: String(url), body: opts && opts.body ? String(opts.body) : '' });
  const step = queue.shift();
  if (!step) throw new Error('fetch called with nothing queued -> ' + url);
  if (step.err) throw step.err;
  const status = step.status || 200;
  const body = step.body || {};
  return { status, text: async () => JSON.stringify(body) };
};
function netErr(code) {
  return Object.assign(new Error('fetch failed'), { cause: { code } });
}
function abortErr() {
  return Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
}
function activateBody(i) {
  return JSON.parse(calls[i].body);
}

(async function main() {
  section('fingerprint fixture');
  assert(License.getMachineFingerprint() === FP, 'planted smbios fingerprint is used (no powershell)');

  section('error classification (_connErrorMessage)');
  const certMsg = hooks._connErrorMessage(new Error('net::ERR_CERT_DATE_INVALID'));
  assert(/تاريخ الجهاز غير صحيح/.test(certMsg), 'CERT_DATE_INVALID -> date hint');
  assert(certMsg.indexOf('net::ERR_CERT_DATE_INVALID') !== -1, 'cert message keeps the raw detail');
  const dnsMsg = hooks._connErrorMessage(netErr('ENOTFOUND'));
  assert(/تعذّر تحويل عنوان الخادم/.test(dnsMsg), 'ENOTFOUND -> DNS hint (not "no internet")');
  assert(dnsMsg.indexOf('ENOTFOUND') !== -1, 'DNS message still shows the raw code');
  const genMsg = hooks._connErrorMessage(new Error('boom'));
  assert(/لا يمكن الاتصال بالخادم/.test(genMsg) && genMsg.indexOf('boom') !== -1, 'unknown error keeps detail');
  assert(hooks._classifyConnError(abortErr()).kind === 'timeout', 'AbortError -> timeout kind');

  section('transport failures are retried, then surfaced');
  queue = [{ err: netErr('ENOTFOUND') }, { err: netErr('ENOTFOUND') }, { err: netErr('ENOTFOUND') }];
  calls = [];
  let threw = null;
  try { await hooks._post('license_status', { code: 'ST1' }, { retries: 3, timeoutMs: 500 }); }
  catch (e) { threw = e; }
  assert(!!threw, 'failed _post throws after exhausting retries');
  assert(calls.length === 3, 'exactly 3 fetch attempts were made (got ' + calls.length + ')');
  assert(hasInLog('POST license_status attempt=3/3'), 'log records the last attempt');
  assert(hasInLog('kind=dns'), 'log records the classified kind');

  section('timeout surfaces as a real timeout message');
  queue = [{ err: abortErr() }];
  calls = [];
  let tErr = null;
  try { await hooks._post('license_activate', { key: 'K' }, { retries: 1, timeoutMs: 1000 }); }
  catch (e) { tErr = e; }
  assert(!!tErr && /انتهت مهلة الاتصال/.test(tErr.message), 'AbortError -> "انتهت مهلة الاتصال"');
  assert(/انتهت مهلة الاتصال/.test(hooks._connErrorMessage(tErr)), 'timeout message has a hint');

  section('HTTP replies are NOT treated as transport failures');
  queue = [{ status: 403, body: { error: 'bad key' } }];
  calls = [];
  const rep = await hooks._post('license_activate', { key: 'K' }, { retries: 3, timeoutMs: 500 });
  assert(rep.status === 403 && rep.data.error === 'bad key', '403 returned as-is');
  assert(calls.length === 1, 'no retry on an HTTP answer');

  section('certificate errors are not retried');
  queue = [{ err: netErr('CERT_DATE_INVALID') }];
  calls = [];
  let cErr = null;
  try { await hooks._post('license_status', { code: 'ST1' }, { retries: 3, timeoutMs: 500 }); }
  catch (e) { cErr = e; }
  assert(!!cErr && calls.length === 1, 'deterministic cert error -> exactly 1 attempt');
  assert(/تاريخ الجهاز غير صحيح/.test(hooks._connErrorMessage(cErr)), 'cert error gets the date hint');

  section('activateOnline: failed reply + NOT bound -> clean error');
  queue = [{ err: netErr('ENOTFOUND') }, { err: netErr('ENOTFOUND') }, { err: netErr('ENOTFOUND') },  // 3 attempts
    { status: 200, body: { ok: true, licenses: [] } }];                                               // probe
  calls = [];
  const r1 = await License.activateOnline({ key: 'AAAA-BBBB-CCCC-DDDD', code: 'ST1', password: 'pw' });
  assert(r1.success === false, 'activation reports failure');
  assert(hasInLog('PROBE license_status -> NOT bound'), 'status probe ran and found no binding');
  assert(/تعذّر تحويل عنوان الخادم/.test(r1.message), 'message is the classified hint, not a bare throw');
  assert(calls.length === 4, '3 activate attempts + 1 status probe (got ' + calls.length + ')');

  section('activateOnline: reply lost BUT machine already bound -> success');
  queue = [{ err: netErr('CERT_DATE_INVALID') },                               // attempt 1 (no retry)
    { status: 200, body: {                                                   // probe -> bound
      ok: true, licenses: [{
        key: 'ST1-LIC', status: 'active',
        expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
        devices: [{ device_smbios_hash: FP, status: 'active' }],
      }],
    } },
    { status: 200, body: {                                                   // retry -> success
      ok: true, license: {
        key: 'ST1-LIC', storeCode: 'ST1', type: 'main', days: 365,
        activatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
        deviceType: 'main', smbiosHash: FP,
      },
    } }];
  calls = [];
  const r2 = await License.activateOnline({ key: 'ST1-LIC', code: 'ST1', password: 'pw' });
  assert(r2.success === true, 'activation succeeds after the probe confirms binding');
  assert(r2.message && r2.message.indexOf('تم التفعيل بنجاح') !== -1, 'Arabic success message');
  assert(hasInLog('PROBE license_status -> bound'), 'log records the bound probe');
  const licFile = path.join(TMP, 'zmt_license.dat');
  assert(fs.existsSync(licFile), 'license file written to userData');
  assert(JSON.parse(fs.readFileSync(licFile, 'utf-8')).machineId === FP, 'license bound to this machine');
  assert(JSON.parse(calls[calls.length - 1].body).action === 'license_activate', 'retry re-sent license_activate');

  section('activateOnline: reply lost + bound + retry STILL fails -> honest message');
  try { fs.unlinkSync(licFile); } catch (e) {}
  queue = [{ err: netErr('CERT_DATE_INVALID') },
    { status: 200, body: {
      ok: true, licenses: [{
        key: 'ST1-LIC', status: 'active',
        expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
        devices: [{ device_smbios_hash: FP, status: 'active' }],
      }],
    } },
    { err: netErr('CERT_DATE_INVALID') }];
  calls = [];
  const r3 = await License.activateOnline({ key: 'ST1-LIC', code: 'ST1', password: 'pw' });
  assert(r3.success === false, 'reports failure when the retry cannot reach the server');
  assert(/لن يُخصم المفتاح مرتين/.test(r3.message), 'tells the user the key will not be charged twice');
  assert(/مُسجَّل بالفعل/.test(r3.message), 'tells the user the machine is already registered');
  assert(!fs.existsSync(licFile), 'no license file written on failure');
  assert(calls.length === 3, '1 activate + 1 probe + 1 retry (got ' + calls.length + ')');

  section('log file diagnostics');
  assert(hasInLog('ACTIVATE begin key=ST1-'), 'activation start is logged');
  assert(hasInLog('electron='), 'log lines carry the electron version');
  assert(/online=null/.test(logText()) || /online=(true|false)/.test(logText()), 'log lines carry online state');
  const big = 'x'.repeat(600 * 1024);
  fs.writeFileSync(path.join(TMP, LOG_FILE), big, 'utf-8');
  calls = [];
  queue = [{ status: 200, body: { ok: true } }];
  await hooks._post('license_status', { code: 'ST1' }, { retries: 1, timeoutMs: 500 });
  assert(fs.existsSync(path.join(TMP, LOG_FILE + '.old')), 'log rotates after 512KB');
  assert(fs.statSync(path.join(TMP, LOG_FILE)).size < 512 * 1024, 'new log starts empty after rotation');

  section('renderer UI never hangs on a rejected IPC call');
  const licUi = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'license.js'), 'utf-8');
  const bodyStart = licUi.indexOf('async function doLicenseActivate');
  const bodyEnd = licUi.indexOf('async function doFreezeActivate');
  const body = licUi.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd);
  assert(body.indexOf('try {') !== -1 && body.indexOf('finally') !== -1,
    'doLicenseActivate wraps the IPC call in try/finally (button always re-enables)');
  const freezeStart = licUi.indexOf('async function doFreezeActivate');
  const freezeEnd = licUi.indexOf('function doLicenseEnterApp');
  const freeze = licUi.slice(freezeStart, freezeEnd === -1 ? undefined : freezeEnd);
  assert(freeze.indexOf('catch (e)') !== -1, 'doFreezeActivate catches a rejected activation');

  // ---- cleanup -------------------------------------------------------------
  global.fetch = realFetch;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

  console.log('');
  console.log('license-net-test: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e && e.stack ? e.stack : e);
  global.fetch = realFetch;
  process.exit(1);
});
