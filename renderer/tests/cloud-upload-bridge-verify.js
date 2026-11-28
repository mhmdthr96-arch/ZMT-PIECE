// ZMT PIECE — cloud upload / IPC bridge regression suite
// Run: node renderer/tests/cloud-upload-bridge-verify.js
//
// supabase-js builds a real Headers object (carrying `x-upsert`) and a real
// FormData object (carrying the gzip Blob) for storage uploads. Neither can be
// handed to Electron's contextBridge unchanged. This suite executes the real
// renderer-side adapter extracted from supabase-service.js and verifies the
// descriptor that actually reaches preload.js.
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

const cloudSrc = read('renderer/js/supabase-service.js');
const preloadSrc = read('preload.js');
const cloudMain = read('cloud-bridge.js');

// ---------- static wiring ----------
has(cloudSrc, 'globalOpts.fetch = _bridgeFetch;', 'supabase-js uses the renderer-side adapter, not the raw bridge');
lacks(cloudSrc, 'globalOpts.fetch = window.zmtCloudFetch;', 'raw bridge is never handed directly to supabase-js');
has(cloudSrc, '_plainHeaders(options.headers)', 'Headers are converted before crossing contextBridge');
has(cloudSrc, 'body instanceof FormData', 'FormData is converted before crossing contextBridge');
has(cloudSrc, 'timeoutMs: 180000', 'storage writes keep the 180 s budget also in main');
has(cloudSrc, "headers['Content-Type'] = converted.contentType", 'multipart boundary is restored as a plain header');
has(preloadSrc, "typeof body.__zmtBinaryBase64 === 'string'", 'preload decodes the pre-encoded binary descriptor');
has(cloudMain, "delete headers['content-length']", 'main rebuilds content-length from decoded bytes');

const connSrc = read('renderer/js/pages/connection.js');
has(cloudSrc, 'async function uploadBackup(data, options)', 'upload API accepts a force option');
has(cloudSrc, 'const force = !!(options && options.force)', 'force flag is parsed inside the upload');
has(cloudSrc, 'if (!force && preHash === _lastSyncHash', 'force only bypasses the idle short-circuit');
has(cloudSrc, 'if (!force && hash === _lastSyncHash)', 'force only bypasses the unchanged short-circuit');
has(cloudSrc, "if (!hasData()) return { success: true, skipped: true, reason: 'no_data' }", 'empty data is still never uploaded');
has(connSrc, 'CloudService.uploadBackup(undefined, { force: true })', 'manual button forces a real re-upload');

// ---------- behavioural harness: run the real adapter ----------
const start = cloudSrc.indexOf('  const ZMT_BINARY_KEY = ');
const end = cloudSrc.indexOf('  // ===== CLOUD CREDENTIALS (main process only) =====');
check(start >= 0 && end > start, 'renderer adapter block is present');
const adapterSrc = cloudSrc.slice(start, end);

let captured = null;
const sandbox = {
  console, Date, Math, JSON, String, Number, Object, Array, Set,
  Blob, FormData, Headers, TextEncoder, Uint8Array, ArrayBuffer, btoa, atob,
  setTimeout, clearTimeout,
  window: {},
};
sandbox.window = sandbox;
sandbox.window.zmtCloudFetch = async (url, descriptor) => {
  captured = { url: String(url), descriptor };
  return { ok: true, status: 200, statusText: 'OK', json: async () => ({}) };
};
vm.createContext(sandbox);
vm.runInContext(adapterSrc, sandbox, { filename: 'cloud-fetch-adapter.js' });
const adapter = sandbox._bridgeFetch;
check(typeof adapter === 'function', 'adapter is callable');

const decode = (base64) => Buffer.from(base64, 'base64');

(async function behaviouralChecks() {
  const gzip = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x03, 0x00]);

  // 1) The exact call supabase-js makes for supabase.storage...upload(upsert:true)
  const fd = new FormData();
  fd.append('cacheControl', 'no-cache');
  fd.append('', new Blob([gzip], { type: 'application/gzip' }), 'blob');
  const headers = new Headers({ apikey: 'test-key', 'x-upsert': 'true' });
  captured = null;
  await adapter('https://cloud.zmt.local/storage/v1/object/zmt-backups/123/123_backup.json', {
    method: 'POST', headers, body: fd,
  });
  check(!!captured, 'adapter reached window.zmtCloudFetch');
  if (captured) {
    const d = captured.descriptor;
    eq(d.method, 'POST', 'HTTP method is preserved');
    eq(d.headers['x-upsert'], 'true', 'x-upsert survives the contextBridge (no "resource already exists")');
    eq(d.headers.apikey, 'test-key', 'other headers survive too');
    check(typeof d.headers.forEach !== 'function', 'headers are a plain object, not a Headers instance');
    eq(d.timeoutMs, 180000, 'main-process timeout matches the renderer upload timeout');
    check(typeof d.body === 'object' && typeof d.body.__zmtBinaryBase64 === 'string',
      'body is a plain binary descriptor, not a FormData instance');
    const bytes = decode(d.body.__zmtBinaryBase64);
    const text = bytes.toString('latin1');
    check(bytes.indexOf(Buffer.from([0x1f, 0x8b, 0x08, 0x00])) >= 0,
      'gzip magic bytes reach the bridge intact inside the multipart file part');
    check(text.indexOf('name="cacheControl"') >= 0 && text.indexOf('no-cache') >= 0,
      'cacheControl field is preserved in the multipart body');
    check(text.indexOf('name=""') >= 0 && text.indexOf('filename="blob"') >= 0,
      'supabase-js empty-name file field is preserved');
    check(text.indexOf('Content-Type: application/gzip') >= 0,
      'file part keeps its gzip content type');
    const boundary = String(d.headers['Content-Type'] || '').match(/boundary=(.+)$/);
    check(!!boundary && text.indexOf('--' + boundary[1]) >= 0 && text.indexOf('--' + boundary[1] + '--') >= 0,
      'Content-Type boundary matches the multipart framing');
  }

  // 2) Raw byte bodies (non-supabase callers) must also survive the bridge.
  captured = null;
  const raw = new Uint8Array([0x1f, 0x8b, 0x01, 0x02, 0xff]);
  await adapter('https://cloud.zmt.local/storage/v1/object/zmt-backups/x', {
    method: 'PUT', headers: { 'x-upsert': 'true' }, body: raw,
  });
  check(!!captured && captured.descriptor.body && typeof captured.descriptor.body.__zmtBinaryBase64 === 'string',
    'byte arrays are encoded into a bridge-safe descriptor');
  if (captured) {
    const bytes = decode(captured.descriptor.body.__zmtBinaryBase64);
    eq(bytes.length, raw.length, 'byte payload length is unchanged');
    check(bytes.every((b, i) => b === raw[i]), 'byte payload content is unchanged');
  }

  // 3) Plain JSON site-style bodies must not be wrapped.
  captured = null;
  await adapter('https://cloud.zmt.local/rest/v1/registries', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}',
  });
  eq(captured && captured.descriptor.body, '{"a":1}', 'string bodies are passed through untouched');

  console.log('\n============================================');
  if (fail === 0) console.log('كل فحوص رفع السحابة نجحت — pass=' + pass + ' fail=0');
  else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
