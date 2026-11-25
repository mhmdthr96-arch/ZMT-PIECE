#!/usr/bin/env node
// ==========================================================================
// scripts/verify-upgrade.js — upgrade-path verifier.
//
// Reproduces what a user actually does: install the PREVIOUS release, then run
// the NEW installer on top of it (the same /S /D= flow the in-app updater
// starts). This catches the two regressions that broke 2.17.4 → 3.1.x:
//
//   1. the installer not replacing an existing copy (wrong directory, missing
//      uninstall step, old app.asar left behind),
//   2. the installer killing the running app too early / not starting at all.
//
// Usage:
//   node scripts/verify-upgrade.js                 # silent upgrade over a
//                                                  # freshly installed old build
//   node scripts/verify-upgrade.js --from=2.17.4   # explicit old version
//   node scripts/verify-upgrade.js --with-running-app
//                                                  # also reproduce an app that
//                                                  # is still open when the new
//                                                  # installer starts (opt-in:
//                                                  # it briefly opens a window)
//   node scripts/verify-upgrade.js --arch=ia32
//
// Exit code != 0 => the upgrade path is broken.
// ==========================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const asar = require('@electron/asar');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const VER = pkg.version;
const PRODUCT = pkg.productName || (pkg.build && pkg.build.productName) || 'ZMT PIECE';
const EXE = PRODUCT + '.exe';

const INSTALL_TIMEOUT = 300000;
const UNINSTALL_TIMEOUT = 180000;

let passed = 0;
let failed = 0;
function ok(m) { console.log('  ok  ' + m); passed++; }
function bad(m) { console.log('  FAIL ' + m); failed++; }
function section(t) { console.log(''); console.log('=== ' + t + ' ==='); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function argValue(name, fallback) {
  const hit = process.argv.slice(2).find((a) => a === '--' + name || a.startsWith('--' + name + '='));
  if (!hit) return fallback;
  const i = hit.indexOf('=');
  return i === -1 ? true : hit.slice(i + 1);
}

const ARCH = argValue('arch', 'x64');
const FROM_ARG = argValue('from', '');
const WITH_RUNNING_APP = !!argValue('with-running-app', false);

// Same spawn semantics as verify-installers.js: /D= must arrive unquoted and
// as the LAST argument, so windowsVerbatimArguments is required.
function run(exe, args, timeoutMs, opts) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let child;
    try {
      child = spawn(exe, args, Object.assign({ windowsVerbatimArguments: true, stdio: 'pipe' }, opts || {}));
    } catch (e) {
      resolve({ code: -1, error: String(e), out: '', ms: 0, child: null });
      return;
    }
    let out = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch (e) {}
    }, timeoutMs);
    if (child.stdout) child.stdout.on('data', (d) => { out += String(d); });
    if (child.stderr) child.stderr.on('data', (d) => { out += String(d); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, error: String(e), out, ms: Date.now() - t0, child });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? -2 : code, out, ms: Date.now() - t0, timedOut, child });
    });
  });
}

async function rmRecursive(p) {
  for (let i = 0; i < 20; i++) {
    try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 }); return true; }
    catch (e) { await sleep(500 + i * 300); }
  }
  if (fs.existsSync(p)) {
    let left = [];
    try { left = fs.readdirSync(p).slice(0, 6); } catch (e) {}
    bad('could not remove temp dir ' + p + (left.length ? ' (still holds: ' + left.join(', ') + ')' : ''));
    return false;
  }
  return true;
}

function headerCheck(file) {
  const st = fs.statSync(file);
  if (st.size < 1024 * 1024) { bad(path.basename(file) + ': implausibly small (' + st.size + ' bytes)'); return false; }
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(2);
  fs.readSync(fd, buf, 0, 2, 0);
  fs.closeSync(fd);
  if (buf.toString('latin1') !== 'MZ') { bad(path.basename(file) + ': not a PE executable (missing MZ)'); return false; }
  return true;
}

// @electron/asar memoises the parsed archive per path (filesystemCache), so a
// read taken while Windows was still flushing the freshly written archive
// poisons every later read in the same process. Read the entry directly from an
// uncached header instead.
function readPackedFileSync(asarPath, name) {
  const raw = asar.getRawHeader(asarPath); // uncached on purpose
  const entry = raw.header && raw.header.files && raw.header.files[name];
  if (!entry) throw new Error(name + ' not found in archive');
  const size = Number(entry.size) || 0;
  const offset = 8 + raw.headerSize + parseInt(String(entry.offset), 10);
  const buf = Buffer.alloc(size);
  const fd = fs.openSync(asarPath, 'r');
  try { fs.readSync(fd, buf, 0, size, offset); } finally { fs.closeSync(fd); }
  return buf;
}

function installedVersion(installDir) {
  const asarPath = path.join(installDir, 'resources', 'app.asar');
  if (!fs.existsSync(asarPath)) return { version: null, error: 'resources\\app.asar missing' };
  try {
    const packed = JSON.parse(readPackedFileSync(asarPath, 'package.json').toString('utf8'));
    return { version: packed.version || null, error: null };
  } catch (e) {
    return { version: null, error: 'cannot read packed package.json: ' + e };
  }
}

// On a slow disk (and while the antivirus scans the freshly written 120 MB
// archive) the asar can still be settling right after the installer exits.
// Retry for a few seconds instead of reporting a false "corrupt install".
async function installedVersionSettled(installDir, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 20000);
  let last = null;
  let attempts = 0;
  do {
    attempts++;
    last = installedVersion(installDir);
    if (last.version) return { version: last.version, error: null, attempts };
    if (!last.error || !/app\.asar missing/.test(last.error)) {
      const asarPath = path.join(installDir, 'resources', 'app.asar');
      // A wrong-but-readable package.json is the transient case we are waiting
      // out; a missing file means the install really did not happen.
      if (!fs.existsSync(asarPath)) return { version: null, error: last.error, attempts };
    }
    await sleep(500);
  } while (Date.now() < deadline);
  return { version: null, error: last && last.error, attempts };
}

// The upgraded app.asar must be byte-identical to the archive the installer was
// built from — a stale/damaged replacement is exactly what broke 2.17.4 → 3.1.x.
function referenceAsar(arch) {
  const candidates = arch === 'ia32'
    ? ['win-ia32-unpacked', 'win-unpacked']
    : ['win-unpacked', 'win-ia32-unpacked'];
  for (const d of candidates) {
    const p = path.join(ROOT, 'dist', d, 'resources', 'app.asar');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('data', (c) => hash.update(c));
    s.on('end', () => resolve(hash.digest('hex')));
    s.on('error', reject);
  });
}

function findInstaller(dir, version, suffix) {
  if (!fs.existsSync(dir)) return null;
  // `suffix` is the arch part only ("-x64", "-win7-ia32"), so the extension is
  // added here — forgetting it made every lookup silently return null.
  const want = (PRODUCT + '-Setup-' + version + suffix + '.exe').toLowerCase();
  const hit = fs.readdirSync(dir).find((n) => n.toLowerCase() === want);
  return hit ? path.join(dir, hit) : null;
}

function newestOlderInstaller() {
  const candidates = [];
  for (const dirName of ['dist', 'dist-win7']) {
    const dir = path.join(ROOT, dirName);
    if (!fs.existsSync(dir)) continue;
    for (const n of fs.readdirSync(dir)) {
      const m = new RegExp('^' + PRODUCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '-Setup-([0-9][0-9.]*)(-win7)?-(' + ARCH + ')\\.exe$', 'i').exec(n);
      if (!m) continue;
      if (m[1] === VER) continue;
      candidates.push({ file: path.join(dir, n), version: m[1], win7: !!m[2] });
    }
  }
  candidates.sort((a, b) => {
    const av = a.version.split('.').map(Number);
    const bv = b.version.split('.').map(Number);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      const x = av[i] || 0, y = bv[i] || 0;
      if (x !== y) return y - x;
    }
    return 0;
  });
  return candidates[0] || null;
}

async function killTree(child) {
  if (!child) return;
  try { child.kill(); } catch (e) {}
  if (process.platform === 'win32' && child.pid) {
    await run('taskkill', ['/PID', String(child.pid), '/T', '/F'], 15000);
  }
}

async function upgradeOnce(oldFile, oldVersion) {
  let newFile;
  if (ARCH === 'x64') newFile = findInstaller(path.join(ROOT, 'dist'), VER, '-x64');
  else newFile = findInstaller(path.join(ROOT, 'dist'), VER, '-' + ARCH);
  // win7 builds live in dist-win7 with a "-win7" component in the name
  if (!newFile) {
    const win7Suffix = '-win7-' + ARCH;
    newFile = findInstaller(path.join(ROOT, 'dist-win7'), VER, win7Suffix);
  }
  if (!newFile) {
    bad('new installer for ' + VER + ' (' + ARCH + ') not found — build it first');
    return;
  }

  section('artifacts');
  if (headerCheck(oldFile)) ok(path.basename(oldFile) + ' — PE header ok');
  if (headerCheck(newFile)) ok(path.basename(newFile) + ' — PE header ok');

  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zmt-upgrade-'));
  section('1) install the previous release (' + oldVersion + ')');
  console.log('  ->  ' + path.basename(oldFile) + ' into ' + installDir);
  let r = await run(oldFile, ['/S', '/D=' + installDir], INSTALL_TIMEOUT);
  if (r.code !== 0) {
    bad('previous-version silent install failed (exit ' + r.code + (r.timedOut ? ', TIMEOUT' : '') + ')');
    await rmRecursive(installDir);
    return;
  }
  ok('previous version installed (exit 0 in ' + Math.round(r.ms / 1000) + 's)');
  const before = await installedVersionSettled(installDir, 10000);
  if (before.version !== oldVersion) bad('installed old version is ' + before.version + ', expected ' + oldVersion);
  else ok('installed package.json version = ' + oldVersion);

  section('2) upgrade to ' + VER + ' over the existing installation');
  let runningChild = null;
  if (WITH_RUNNING_APP) {
    const exe = path.join(installDir, EXE);
    if (!fs.existsSync(exe)) {
      bad('cannot run the old app: ' + EXE + ' missing');
    } else {
      console.log('  ->  starting the old app and leaving it open…');
      runningChild = spawn(exe, ['--no-sandbox'], { stdio: 'ignore', detached: false });
      await sleep(12000);
      if (runningChild.exitCode !== null) bad('old app exited on its own before the upgrade');
      else ok('old app is still running while the new installer starts');
    }
  }
  console.log('  ->  ' + path.basename(newFile) + ' into the SAME folder');
  r = await run(newFile, ['/S', '/D=' + installDir], INSTALL_TIMEOUT);
  if (runningChild) await killTree(runningChild);
  if (r.code !== 0) {
    bad('upgrade install failed (exit ' + r.code + (r.timedOut ? ', TIMEOUT' : '') + ')');
    await rmRecursive(installDir);
    return;
  }
  ok('upgrade install exit 0 in ' + Math.round(r.ms / 1000) + 's' +
    (WITH_RUNNING_APP ? ' (app was open)' : ''));

  const after = await installedVersionSettled(installDir, 20000);
  if (after.error) bad(after.error);
  else if (after.version !== VER) bad('after upgrade package.json is ' + after.version + ', expected ' + VER);
  else ok('after upgrade package.json is ' + VER + ' (old files replaced)' +
    (after.attempts > 1 ? ' [after ' + after.attempts + ' reads while the archive settled]' : ''));

  const upgradedAsar = path.join(installDir, 'resources', 'app.asar');
  const refAsar = referenceAsar(ARCH);
  if (!refAsar) {
    ok('app.asar integrity check skipped (no unpacked build in dist/)');
  } else if (!fs.existsSync(upgradedAsar)) {
    bad('upgraded resources\\app.asar missing');
  } else {
    const [a, b] = await Promise.all([sha256(refAsar), sha256(upgradedAsar)]);
    if (a !== b) bad('upgraded app.asar differs from the build (' + b.slice(0, 12) + ' vs ' + a.slice(0, 12) + ')');
    else ok('upgraded app.asar is byte-identical to the build (sha256 ' + a.slice(0, 12) + '…)');
  }

  const exe = path.join(installDir, EXE);
  if (!fs.existsSync(exe)) bad('upgraded app exe missing: ' + EXE);
  else ok('upgraded ' + EXE + ' present');

  section('3) silent uninstall of the upgraded copy');
  const un = path.join(installDir, 'Uninstall ' + PRODUCT + '.exe');
  if (!fs.existsSync(un)) {
    bad('uninstaller missing: Uninstall ' + PRODUCT + '.exe');
  } else {
    const u = await run(un, ['/S'], UNINSTALL_TIMEOUT);
    if (u.code !== 0) bad('silent uninstall failed (exit ' + u.code + (u.timedOut ? ', TIMEOUT' : '') + ')');
    else ok('silent uninstall exit 0 (' + Math.round(u.ms / 1000) + 's)');
  }
  await rmRecursive(installDir);
}

(async function main() {
  console.log('verify-upgrade: ' + VER + ' (' + ARCH + ')');

  section('installer guard');
  const mainNsh = path.join(ROOT, 'build', 'installer.nsh');
  const win7Nsh = path.join(ROOT, 'build', 'installer-win7.nsh');
  for (const f of [mainNsh, win7Nsh]) {
    if (!fs.existsSync(f)) { bad('missing ' + path.relative(ROOT, f)); continue; }
    const txt = fs.readFileSync(f, 'utf8');
    if (!/!macro customCheckAppRunning/.test(txt)) {
      bad(path.relative(ROOT, f) + ' does not define customCheckAppRunning');
      continue;
    }
    if (!/IntCmp \$R1 30/.test(txt)) {
      bad(path.relative(ROOT, f) + ' does not wait ~30 s for the app to close');
    } else {
      ok(path.relative(ROOT, f) + ': patient customCheckAppRunning (30 s before force-close)');
    }
    if (/Sleep 300\b/.test(txt) && !/Sleep 1500/.test(txt)) {
      bad(path.relative(ROOT, f) + ' still relies on the short 300 ms wait');
    }
  }

  let old = null;
  if (FROM_ARG && FROM_ARG !== true) {
    const v = String(FROM_ARG);
    old = findInstaller(path.join(ROOT, 'dist'), v, '-' + ARCH) ||
      findInstaller(path.join(ROOT, 'dist-win7'), v, '-win7-' + ARCH);
    if (!old) { bad('installer for version ' + v + ' (' + ARCH + ') not found'); }
    else old = { file: old, version: v };
  } else {
    old = newestOlderInstaller();
  }
  if (!old) {
    bad('no previous installer found (pass --from=<version> or build one first)');
  } else {
    ok('previous release: ' + path.basename(old.file));
    await upgradeOnce(old.file, old.version);
  }

  console.log('');
  console.log('verify-upgrade: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
