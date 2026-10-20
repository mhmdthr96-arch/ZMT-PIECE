#!/usr/bin/env node
/* ============================================================================
 * ZMT PIECE — publish a release to GitHub (updates distribution)
 * ----------------------------------------------------------------------------
 * Client URLs:
 *   .../releases/latest/download/update.json
 *   .../releases/latest/download/<asset>.exe
 *
 * Because GitHub may sanitize uploaded asset names (spaces → dots, etc.),
 * this script first computes hashes, creates the release with installers only,
 * then reads back the actual asset names, writes update.json using those exact
 * names, and uploads update.json with --clobber.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPO = process.env.ZMT_REPO || 'mhmdthr96-arch/ZMT-PIECE';

function log(msg) { console.log('[publish] ' + msg); }
function fail(msg) { console.error('[publish] ERROR: ' + msg); process.exit(1); }

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const DRY_RUN = process.argv.includes('--dry-run');

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

function run(cmd, args, opts) {
  opts = opts || {};
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    shell: false,
  });
  if (res.status !== 0 && !opts.allowFail) {
    fail('`' + cmd + ' ' + args.join(' ') + '` failed:\n' + (res.stderr || res.stdout || ''));
  }
  return res;
}

function mapActualAsset(assetNames, key, version) {
  if (!assetNames || !assetNames.length) return null;
  const lower = assetNames.map((n) => n.toLowerCase());
  const find = (pred) => { const i = lower.findIndex(pred); return i < 0 ? null : assetNames[i]; };
  if (key === 'win7-x64') return find((n) => n.includes('win7') && n.endsWith('-x64.exe'));
  if (key === 'win7-ia32') return find((n) => n.includes('win7') && n.endsWith('-ia32.exe'));
  if (key === 'x64') return find((n) => !n.includes('win7') && n.endsWith('-x64.exe'));
  if (key === 'ia32') return find((n) => !n.includes('win7') && n.endsWith('-ia32.exe'));
  return null;
}

// Blocking sleep — spawnSync is synchronous, so we can't use setTimeout here.
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  catch (e) { const end = Date.now() + ms; while (Date.now() < end) { /* spin */ } }
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.version;
  const tag = 'v' + version;
  log('target repo : ' + REPO);
  log('version     : ' + version + '  (tag ' + tag + ')');

  const installers = {
    'x64': path.join(ROOT, 'dist', 'ZMT PIECE-Setup-' + version + '-x64.exe'),
    'ia32': path.join(ROOT, 'dist', 'ZMT PIECE-Setup-' + version + '-ia32.exe'),
    'win7-x64': path.join(ROOT, 'dist-win7', 'ZMT PIECE-Setup-' + version + '-win7-x64.exe'),
    'win7-ia32': path.join(ROOT, 'dist-win7', 'ZMT PIECE-Setup-' + version + '-win7-ia32.exe'),
  };

  const missing = Object.keys(installers).filter((k) => !fs.existsSync(installers[k]));
  if (missing.length) {
    fail('missing installer(s):\n' + missing.map((k) => '  - ' + installers[k]).join('\n') +
      '\nRun `npm run dist` and `npm run dist:win7` first.');
  }

  const localInfo = {};
  for (const key of Object.keys(installers)) {
    const file = installers[key];
    const stat = fs.statSync(file);
    const sha = await sha256File(file);
    localInfo[key] = { file, sha256: sha, size: stat.size, basename: path.basename(file) };
    log('  ' + key.padEnd(9) + ' ' + localInfo[key].basename + '  (' + (stat.size / 1048576).toFixed(1) + ' MB)');
  }

  let notes = argValue('--notes');
  if (notes && fs.existsSync(notes)) notes = fs.readFileSync(notes, 'utf8');
  if (!notes) {
    const notesFile = path.join(ROOT, 'release-notes.md');
    notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8') : ('ZMT PIECE ' + version);
  }

  if (DRY_RUN) {
    log('dry run — plan:');
    log('  1) detect the previous release tag (deletion is deferred until success)');
    log('  2) delete tag ' + tag + ' if it already exists (partial state)');
    log('  3) create release shell ' + tag + ', then upload the 4 installers one-by-one (retries each)');
    log('  4) read back actual asset names, write update.json, upload it (up to 3 attempts)');
    log('  5) only after full success: delete the previous release');
    return;
  }

  // gh auth status contacts the API — on a flaky connection a transient
  // network error here must not abort the publish before it even starts.
  let authOk = false;
  for (let attempt = 1; attempt <= 4 && !authOk; attempt++) {
    const auth = run('gh', ['auth', 'status'], { allowFail: true });
    authOk = auth.status === 0;
    if (!authOk && attempt < 4) { log('auth check failed (network?) — retrying in 8s…'); sleepSync(8000); }
  }
  if (!authOk && !process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
    fail('GitHub CLI not authenticated and no GITHUB_TOKEN/GH_TOKEN set.');
  }

  // Detect the previous release now, but DO NOT delete it yet: deleting first
  // and failing mid-upload (flaky connection) once left the repo with NO
  // release at all, breaking every installed client's update check. Old
  // releases are removed only after the new one is fully published.
  const latestRes = run('gh', ['release', 'view', '--repo', REPO, '--json', 'tagName', '-q', '.tagName'], { allowFail: true });
  const previousTag = (latestRes.stdout || '').trim();
  if (previousTag === tag) log('previous release is already ' + tag + '; refreshing it…');
  else if (previousTag) log('previous release ' + previousTag + ' will be deleted AFTER the new one is live');

  // Clear any partial/duplicate state of THIS tag (e.g. a failed prior run).
  run('gh', ['release', 'delete', tag, '--repo', REPO, '--yes', '--cleanup-tag'], { allowFail: true });

  const title = 'ZMT PIECE ' + version;

  // Create the release shell first (no assets), then upload each installer
  // INDIVIDUALLY with retries: a single 400 MB `release create` dies entirely
  // on one connection blip, while per-file retries keep finished files and
  // only re-ship the one that failed.
  let created = false;
  for (let attempt = 1; attempt <= 3 && !created; attempt++) {
    log('creating release ' + tag + ' (shell, attempt ' + attempt + '/3)…');
    const res = run('gh', ['release', 'create', tag, '--repo', REPO, '--title', title, '--notes', notes], { allowFail: true });
    created = res.status === 0;
    if (!created) {
      run('gh', ['release', 'delete', tag, '--repo', REPO, '--yes', '--cleanup-tag'], { allowFail: true });
      if (attempt < 3) { log('  create failed (network?) — retrying in 15s…'); sleepSync(15000); }
    }
  }
  if (!created) {
    fail('could not create release after 3 attempts — network problem. Previous release left untouched.');
  }

  let allUploaded = true;
  for (const key of Object.keys(installers)) {
    const file = installers[key];
    let up = false;
    for (let attempt = 1; attempt <= 4 && !up; attempt++) {
      log('uploading ' + key + ' (' + (localInfo[key].size / 1048576).toFixed(1) + ' MB, attempt ' + attempt + '/4)…');
      const res = run('gh', ['release', 'upload', tag, file, '--repo', REPO, '--clobber'], { allowFail: true });
      up = res.status === 0;
      if (!up && attempt < 4) { log('  upload failed (network?) — retrying in 15s…'); sleepSync(15000); }
    }
    if (!up) { allUploaded = false; break; }
  }
  if (!allUploaded) {
    // Remove the partial new release so the previous one stays 'latest' and
    // installed clients keep working until a later attempt succeeds.
    run('gh', ['release', 'delete', tag, '--repo', REPO, '--yes', '--cleanup-tag'], { allowFail: true });
    fail('installer upload failed after retries — previous release left untouched.');
  }
  // Note: --latest not always required; we'll let it be the newest. GitHub marks latest by default for newest non-prerelease.

  const assetsRes = run('gh', ['release', 'view', tag, '--repo', REPO, '--json', 'assets', '--jq', '.assets[].name'], { allowFail: true });
  const actualAssets = (assetsRes.stdout || '').split(/\r?\n/).filter(Boolean);
  log('found actual assets: ' + actualAssets.length);

  const channels = {};
  for (const key of Object.keys(localInfo)) {
    const actual = mapActualAsset(actualAssets, key, version);
    if (!actual) fail('could not map channel ' + key + ' to uploaded asset. Available: ' + actualAssets.join(', '));
    channels[key] = {
      asset: actual,
      sha256: localInfo[key].sha256,
      size: localInfo[key].size,
    };
    log('  ' + key.padEnd(9) + ' -> ' + actual);
  }

  const manifest = {
    version: version,
    releasedAt: new Date().toISOString(),
    notes: notes.trim(),
    channels: channels,
  };
  const manifestPath = path.join(ROOT, 'update.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  log('uploading update.json with --clobber…');
  let uploaded = false;
  for (let attempt = 1; attempt <= 3 && !uploaded; attempt++) {
    const up = run('gh', ['release', 'upload', tag, manifestPath, '--repo', REPO, '--clobber'], { allowFail: true });
    uploaded = up.status === 0;
    if (!uploaded && attempt < 3) { log('  upload failed — retrying in 10s…'); sleepSync(10000); }
  }
  if (!uploaded) fail('could not upload update.json after 3 attempts — release exists but has no manifest.');

  // Ensure it's marked as latest.
  try {
    run('gh', ['release', 'edit', tag, '--repo', REPO, '--latest'], { allowFail: true });
  } catch (e) {}

  // Only NOW, with the new release verified live, remove the previous one.
  if (previousTag && previousTag !== tag) {
    log('deleting previous release ' + previousTag + ' (tag + assets)…');
    run('gh', ['release', 'delete', previousTag, '--repo', REPO, '--yes', '--cleanup-tag'], { allowFail: true });
  }

  log('DONE. Stable client URLs:');
  log('  https://github.com/' + REPO + '/releases/latest/download/update.json');
}

main().catch((e) => fail((e && e.stack) || String(e)));
