#!/usr/bin/env node
// ==========================================================================
// scripts/verify-installers.js — silent self-check that runs after every build
// (wired into `npm run dist` / `npm run dist:win7`).
//
//   1. picks the installers of the CURRENT package.json version in dist/ and
//      dist-win7/ (older leftover builds are ignored),
//   2. sanity: real PE ("MZ") + plausible size,
//   3. SILENT-installs each one into a fresh temp dir (/S, 180s ceiling),
//   4. verifies what actually shipped: ZMT PIECE.exe, resources\app.asar,
//      required asar entries, the packed package.json version, and the phone
//      sale fix inside renderer/phone-sales/app.js, plus the phone-key
//      TRUST-DENSITY invariant (the packed license.js must trust exactly one
//      signing key — the distributor's phone — so an accidental re-embed of
//      the desktop reference key never ships),
//   5. silent-uninstalls ("Uninstall ZMT PIECE.exe" /S) and removes the temp
//      dir,
//   6. writes SHA256SUMS.txt next to the installers (verified later by
//      scripts\verify-copy.cmd after copying the files to a USB stick).
//
// Exit code != 0 => the build must not be shipped.
// ==========================================================================
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const asar = require('@electron/asar');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const VER = pkg.version;
const PRODUCT = pkg.productName || pkg.build.productName || 'ZMT PIECE';

// A silent install of a ~100 MB NSIS package takes ~90-120s on a busy disk,
// and verify runs BOTH architectures back-to-back, so the second one starts
// under load. 180s proved too tight (the x64 install was seen timing out at
// ~110s of real work, not hanging). 300s keeps a real hang detectable while
// never mistaking a slow-but-healthy install for a failure.
const INSTALL_TIMEOUT = 300000;
const UNINSTALL_TIMEOUT = 180000;
const REQUIRED_ASAR_ENTRIES = [
  'package.json',
  'main.js',
  'license.js',
  'preload.js',
  'renderer/phone-sales/app.js',
  'renderer/phone-sales/index.html',
  'renderer/js/license.js',
  'renderer/js/phone-sale-service.js',
];
// markers of the "paid sale" fix in the packed renderer code
const APP_JS_MARKERS = [
  'paidTouched',
  'syncPaidToTotal',
  'autoPaidAmount',
  'setPayMethod(state.payMethod)',
  'total: Math.max(0, paidTotal())',
];

let passed = 0;
let failed = 0;
function ok(m) { console.log('  ok  ' + m); passed++; }
function bad(m) { console.log('  FAIL ' + m); failed++; }
function section(t) { console.log(''); console.log('=== ' + t + ' ==='); }
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// @electron/asar wants OS separators in extractFile() (listPackage returns them too)
const inArchive = (p) => p.split('/').join('\\');

// spawn() with windowsVerbatimArguments so NSIS gets exactly what it wants:
// /D= must arrive unquoted and as the LAST parameter.
function run(exe, args, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let child;
    try {
      child = spawn(exe, args, { windowsVerbatimArguments: true, stdio: 'pipe' });
    } catch (e) {
      resolve({ code: -1, error: String(e), out: '', ms: 0 });
      return;
    }
    let out = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch (e) {}
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { out += String(d); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, error: String(e), out, ms: Date.now() - t0 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? -2 : code, out, ms: Date.now() - t0, timedOut });
    });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function rmRecursive(p) {
  // freshly-installed files are often still locked for a moment (antivirus /
  // indexer / a lingering NSIS helper), so retry with a growing backoff before
  // calling it a failure. ~60s of patience: a TEMP leftover is harmless anyway,
  // and the previous ~18s window was too short right after a big install.
  for (let i = 0; i < 20; i++) {
    try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 }); return; }
    catch (e) { await sleep(500 + i * 300); }
  }
  if (fs.existsSync(p)) {
    let left = [];
    try { left = fs.readdirSync(p).slice(0, 6); } catch (e) {}
    bad('could not remove temp dir ' + p + (left.length ? ' (still holds: ' + left.join(', ') + ')' : ''));
  }
}

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex').toUpperCase();
}

function headerCheck(file) {
  const st = fs.statSync(file);
  if (st.size < 1024 * 1024) { bad(path.basename(file) + ': implausibly small (' + st.size + ' bytes)'); return false; }
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(2);
  fs.readSync(fd, buf, 0, 2, 0);
  fs.closeSync(fd);
  if (buf.toString('latin1') !== 'MZ') { bad(path.basename(file) + ': not a PE executable (missing MZ)'); return false; }
  ok(path.basename(file) + ' — PE header ok, ' + Math.round(st.size / 1048576) + ' MB');
  return true;
}

async function installAndVerify(file, label) {
  const base = path.basename(file);
  const instDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zmt-verify-'));
  console.log('  ->  silent install of ' + base + ' into ' + instDir);
  const r = await run(file, ['/S', '/D=' + instDir], INSTALL_TIMEOUT);
  if (r.code !== 0) {
    bad(base + ': silent install failed (exit ' + r.code + (r.timedOut ? ', TIMEOUT' : '') + ')' +
      (r.error ? ' ' + r.error : ''));
    await rmRecursive(instDir);
    return;
  }
  ok(base + ': silent install exit 0 (' + Math.round(r.ms / 1000) + 's)');

  const exe = path.join(instDir, PRODUCT + '.exe');
  if (!fs.existsSync(exe)) bad('installed app missing: ' + PRODUCT + '.exe');
  else ok('installed ' + PRODUCT + '.exe');

  const asarPath = path.join(instDir, 'resources', 'app.asar');
  if (!fs.existsSync(asarPath)) {
    bad('installed resources\\app.asar missing');
  } else {
    let list = [];
    try { list = asar.listPackage(asarPath).map((p) => String(p).replace(/^[\\/]+/, '').replace(/\\/g, '/')); }
    catch (e) { bad('asar unreadable: ' + e); }
    const missing = REQUIRED_ASAR_ENTRIES.filter((n) => list.indexOf(n) === -1);
    if (missing.length) bad('asar missing entries: ' + missing.join(', '));
    else ok('asar contains all ' + REQUIRED_ASAR_ENTRIES.length + ' required entries');

    try {
      const shipped = JSON.parse(asar.extractFile(asarPath, inArchive('package.json')).toString('utf8'));
      if (shipped.version === VER) ok('packed package.json version = ' + VER);
      else bad('packed package.json version is ' + shipped.version + ', expected ' + VER);
    } catch (e) { bad('cannot read packed package.json: ' + e); }

    try {
      const appjs = asar.extractFile(asarPath, inArchive('renderer/phone-sales/app.js')).toString('utf8');
      const miss = APP_JS_MARKERS.filter((m) => appjs.indexOf(m) === -1);
      if (miss.length) bad('packed phone app.js is stale, missing: ' + miss.join(', '));
      else ok('packed renderer/phone-sales/app.js contains the full payment fix');
    } catch (e) { bad('cannot read packed renderer/phone-sales/app.js: ' + e); }

    try {
      const idx = asar.extractFile(asarPath, inArchive('renderer/phone-sales/index.html')).toString('utf8');
      const hidden = (id) => new RegExp('id="' + id + '"[^>]*style="display:\\s*none;?"').test(idx) ||
        new RegExp('style="display:\\s*none;?"[^>]*id="' + id + '"').test(idx);
      if (hidden('paidSingle')) bad('packed index.html still hides #paidSingle (bug not shipped)');
      else ok('packed index.html shows #paidSingle');
      if (hidden('paidCash') && hidden('paidCcp')) ok('packed index.html hides #paidCash/#paidCcp');
      else bad('packed index.html must keep #paidCash/#paidCcp hidden');
    } catch (e) { bad('cannot read packed renderer/phone-sales/index.html: ' + e); }

    try {
      const lic = asar.extractFile(asarPath, inArchive('license.js')).toString('utf8');
      const block = /_PHONE_KEYS_OBF\s*=\s*\[([\s\S]*?)\];/.exec(lic);
      const count = block
        ? (block[1].match(/^\s*'[0-9a-f]+'\s*,?$/gm) || []).length
        : -1;
      if (count !== 1) bad('packed license.js trusts ' + count + ' phone keys, expected exactly 1 (distributor phone only)');
      else ok('packed license.js trusts exactly 1 phone key (distributor phone only)');
    } catch (e) { bad('cannot read packed license.js phone-key trust: ' + e); }
  }

  const un = path.join(instDir, 'Uninstall ' + PRODUCT + '.exe');
  if (!fs.existsSync(un)) {
    bad('uninstaller missing: Uninstall ' + PRODUCT + '.exe');
  } else {
    const u = await run(un, ['/S'], UNINSTALL_TIMEOUT);
    if (u.code !== 0) bad('silent uninstall failed (exit ' + u.code + (u.timedOut ? ', TIMEOUT' : '') + ')');
    else ok('silent uninstall exit 0 (' + Math.round(u.ms / 1000) + 's)');
  }
  await rmRecursive(instDir);
}

(async function main() {
  console.log('verify-installers: building for version ' + VER);

  section('NSIS configuration');
  const mainNshPath = path.join(ROOT, 'build', 'installer.nsh');
  const win7NshPath = path.join(ROOT, 'build', 'installer-win7.nsh');
  const pkgInc = pkg.build && pkg.build.nsis && pkg.build.nsis.include;
  if (pkgInc === 'build/installer.nsh') ok('package.json -> nsis.include = build/installer.nsh');
  else bad('package.json -> nsis.include is ' + pkgInc + ', expected build/installer.nsh');

  let win7Cfg = null;
  try { win7Cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'win7.builder.json'), 'utf8')); } catch (e) {}
  const win7Inc = win7Cfg && win7Cfg.nsis && win7Cfg.nsis.include;
  if (win7Inc === 'build/installer-win7.nsh') ok('win7.builder.json -> nsis.include = build/installer-win7.nsh');
  else bad('win7.builder.json -> nsis.include is ' + win7Inc + ', expected build/installer-win7.nsh');

  const mainNsh = fs.existsSync(mainNshPath) ? fs.readFileSync(mainNshPath) : Buffer.alloc(0);
  const win7Nsh = fs.existsSync(win7NshPath) ? fs.readFileSync(win7NshPath) : Buffer.alloc(0);
  const hasBom = (b) => b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
  // makensis reads a script without a BOM using the ANSI codepage, which turns
  // the Arabic message into mojibake on any machine with a different codepage.
  if (hasBom(mainNsh)) ok('build/installer.nsh starts with a UTF-8 BOM');
  else bad('build/installer.nsh must start with a UTF-8 BOM (Arabic text)');
  if (hasBom(win7Nsh)) ok('build/installer-win7.nsh starts with a UTF-8 BOM');
  else bad('build/installer-win7.nsh must start with a UTF-8 BOM');

  const mainTxt = mainNsh.toString('utf8');
  const win7Txt = win7Nsh.toString('utf8');
  if (/!macro customInit/.test(mainTxt) && /CurrentBuild/.test(mainTxt) &&
      /10239/.test(mainTxt) && /IfSilent/.test(mainTxt) && /SetErrorLevel/.test(mainTxt)) {
    ok('main build carries the Windows < 10 guard (silent-mode aware)');
  } else {
    bad('build/installer.nsh lost the Windows < 10 guard');
  }
  if (/customInit|CurrentBuild|10239/.test(win7Txt)) bad('build/installer-win7.nsh must NOT carry the Windows guard');
  else ok('win7 build has no Windows version guard');
  if (/\.onInstSuccess/.test(mainTxt) && /\.onInstSuccess/.test(win7Txt)) ok('both builds install the bundled AnyDesk');
  else bad('both builds must keep the AnyDesk .onInstSuccess hook');

  section('installers present (version ' + VER + ')');

  const dirs = [
    { dir: 'dist', re: new RegExp('^' + esc(PRODUCT) + '-Setup-' + esc(VER) + '-(x64|ia32)\\.exe$'), expect: 2 },
    { dir: 'dist-win7', re: new RegExp('^' + esc(PRODUCT) + '-Setup-' + esc(VER) + '-win7-(x64|ia32)\\.exe$'), expect: 2 },
  ];

  const targets = [];
  for (const d of dirs) {
    const abs = path.join(ROOT, d.dir);
    if (!fs.existsSync(abs)) { console.log('  --  ' + d.dir + ' not present, skipped'); continue; }
    const names = fs.readdirSync(abs).filter((n) => d.re.test(n));
    if (!names.length) { console.log('  --  ' + d.dir + ' has no ' + VER + ' installers yet, skipped'); continue; }
    if (names.length < d.expect) bad(d.dir + ': expected ' + d.expect + ' installers (x64+ia32), found ' + names.length);
    else ok(d.dir + ': ' + names.length + ' installer(s) for ' + VER);
    for (const n of names) targets.push({ dir: abs, file: path.join(abs, n) });
  }

  if (!targets.length) {
    bad('no installers found for version ' + VER + ' in dist/ or dist-win7/ — build first');
  }

  section('installer sanity');
  const sane = [];
  for (const t of targets) {
    if (fs.existsSync(t.file) && headerCheck(t.file)) sane.push(t);
  }

  section('silent install / content check / silent uninstall');
  for (const t of sane) {
    await installAndVerify(t.file, path.basename(t.dir));
  }

  section('SHA256SUMS.txt');
  const byDir = {};
  for (const t of sane) (byDir[t.dir] = byDir[t.dir] || []).push(t.file);
  for (const dir of Object.keys(byDir)) {
    const lines = byDir[dir]
      .sort()
      .map((f) => sha256(f) + '  ' + path.basename(f));
    const out = path.join(dir, 'SHA256SUMS.txt');
    fs.writeFileSync(out, lines.join('\r\n') + '\r\n', 'utf-8');
    ok('wrote ' + path.relative(ROOT, out) + ' (' + lines.length + ' file(s))');
  }

  console.log('');
  console.log('verify-installers: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
