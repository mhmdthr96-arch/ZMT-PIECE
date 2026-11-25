// ZMT PIECE — Supabase command-poll backoff verify
// Run: node renderer/tests/supabase-backoff-verify.js
//
// Regression this guards against: pollCommands() asked Supabase for a
// commands.json that does not exist for most stores every 12 seconds, flooding
// the console with HTTP 400 errors. The service must now back off progressively
// (missing file: 1m → 2m → 5m) and return to 12 s as soon as the file exists.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const src = fs.readFileSync(path.join(base, 'renderer/js/supabase-service.js'), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

function makeSandbox() {
  let now = 1000000;
  let storageFetches = 0;
  let fileExists = false;
  let intervalCb = null;
  const store = {
    zmt_store_code: '123',
    zmt_store_type: 'main',
    zmt_cloud_token: JSON.stringify({ token: 'test-token', expiresAt: 1000000 + 3600000 }),
  };
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    Date: { now: () => now },
    Math, JSON, String, Number, parseInt, parseFloat, isFinite, Array, Object,
    Blob: function () {}, URL,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn) => { intervalCb = fn; return 1; },
    clearInterval: () => {},
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    fetch: async (url) => {
      if (String(url).indexOf('/storage/v1/object/') >= 0) {
        storageFetches++;
        if (fileExists) {
          return {
            status: 200, ok: true,
            text: async () => '[]',
            json: async () => [],
            blob: async () => ({ text: async () => '[]' }),
          };
        }
        return {
          status: 400, ok: false,
          text: async () => '{"statusCode":"404","error":"not_found","message":"Object not found"}',
          json: async () => ({}),
          blob: async () => null,
        };
      }
      return { status: 200, ok: true, text: async () => '{}', json: async () => ({}), blob: async () => null };
    },
    Auth: {
      isLoggedIn: () => true,
      getUserCode: () => '123',
      getStoreType: () => 'main',
      getParentCode: () => '',
      getStorePassword: () => '',
    },
    DB: {},
    supabase: { createClient: () => ({}) },
    document: { getElementById: () => null, createElement: () => ({ style: {} }), addEventListener() {} },
    location: { href: 'file:///renderer/index.html' },
    navigator: { onLine: true },
    CustomEvent: function () {},
    dispatchEvent: () => {},
    addEventListener: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.__state = {
    advance(ms) { now += ms; },
    get fetchCount() { return storageFetches; },
    set fileExists(v) { fileExists = v; },
    tickInterval() { if (intervalCb) return intervalCb(); return null; },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'supabase-service.js' });
  const Cloud = vm.runInContext('CloudService', sandbox);
  return { Cloud, state: sandbox.__state };
}

const wait = () => new Promise((r) => setTimeout(r, 15));

(async function main() {
  const { Cloud, state } = makeSandbox();

  Cloud.startCommandPolling();
  await wait();
  eq(state.fetchCount, 1, 'first poll requests commands.json once');

  // 12 s is too early after a confirmed miss: no new request.
  state.advance(12000);
  state.tickInterval();
  await wait();
  eq(state.fetchCount, 1, 'no request while the missing-file backoff is active');

  // First missing-file backoff is 60 s.
  state.advance(48000);
  state.tickInterval();
  await wait();
  eq(state.fetchCount, 2, 'retry after the first 60 s backoff');

  // Second miss backs off to 2 minutes.
  state.advance(119000);
  state.tickInterval();
  await wait();
  eq(state.fetchCount, 2, 'still waiting inside the 2 minute backoff');
  state.advance(1000);
  state.tickInterval();
  await wait();
  eq(state.fetchCount, 3, 'retry after the 2 minute backoff');

  // Third miss backs off to 5 minutes (cap).
  state.advance(299000);
  state.tickInterval();
  await wait();
  eq(state.fetchCount, 3, 'still waiting inside the 5 minute backoff');
  state.advance(1000);
  state.tickInterval();
  await wait();
  eq(state.fetchCount, 4, 'retry after the 5 minute backoff');

  // The file appears: the next poll succeeds and polling returns to 12 s.
  state.fileExists = true;
  state.advance(300000);
  state.tickInterval();
  await wait();
  eq(state.fetchCount, 5, 'a successful poll happens once the file exists');
  state.advance(12000);
  state.tickInterval();
  await wait();
  eq(state.fetchCount, 6, 'success resets the poll interval back to 12 s');

  // Static guarantees: the backoff must be part of the shipped source.
  check(/COMMAND_RETRY_STEPS\s*=\s*\[12000, 30000, 60000, 120000, 300000\]/.test(src),
    'real failures back off 12s → 30s → 1m → 2m → 5m');
  check(/COMMAND_MISSING_STEPS\s*=\s*\[60000, 120000, 300000\]/.test(src),
    'a missing commands.json backs off 1m → 2m → 5m');
  check(/if \(!force && now < _commandNextAt\) return;/.test(src),
    'pollCommands honours the next-allowed timestamp');
  check(/_lastCommandsFetch = 'missing'/.test(src),
    'a missing file is distinguished from a real error');
  check(/pollCommands\(true\)/.test(src),
    'the first poll of a session is immediate');
  check(/path !== _commandPath/.test(src),
    'switching store resets the backoff');

  console.log('\n============================================');
  if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
  else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
