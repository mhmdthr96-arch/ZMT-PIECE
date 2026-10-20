// license-phone-test.js — exercises the OFFLINE phone-issued license path
// (*.zmtlic) of license.js end-to-end in plain Node.
//
//   * generates an EPHEMERAL RSA-4096 keypair inside the test (never touches
//     the production tools/keys), injects its public key via _appendPhoneKey,
//     and signs fixtures with the private key using the EXACT parameters the
//     Android app / tools/phone-signer.js use (RSA-PSS-SHA256, salt = digest);
//   * verifies the canonical payload, then the full acceptance / rejection
//     matrix: valid, renewal, machine mismatch, tampered signature, expired,
//     future issuedAt, malformed / unsigned / missing-store / bad-version;
//   * confirms a successful import produces a standard license file that then
//     PASSES checkLicense() unchanged (the design requirement).
//
//   run: node renderer/tests/license-phone-test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const License = require(path.join(ROOT, 'license.js'));
const hooks = License._testHooks;

let passed = 0;
let failed = 0;
function ok(m) { console.log('  ok  ' + m); passed++; }
function bad(m) { console.log('  FAIL ' + m); failed++; }
function assert(c, m) { if (c) ok(m); else bad(m); }
function section(t) { console.log('=== ' + t + ' ==='); }

// Trust-density invariant: in production the desktop app must trust EXACTLY
// one phone signing key — the distributor's phone Keystore key. Re-adding a
// second trusted key (e.g. the desktop reference tool) widens the attack
// surface, so this assertion guards the property at test time.
assert(hooks._phoneKeysSnapshot().length === 1, 'production trusts exactly 1 phone key (distributor phone only)');

// ---- fixture: temp userData dir + planted SMBIOS fingerprint ----------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zmt-lic-p-'));
const FP = 'cafe'.repeat(16);
License.setUserDataPath(TMP);
fs.writeFileSync(path.join(TMP, 'zmt_smbios.dat'), JSON.stringify({ fingerprint: FP }), 'utf-8');

// ---- ephemeral RSA-4096 pair + inject the public key ------------------------
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 4096 });
const PUB_PEM = publicKey.export({ type: 'spki', format: 'pem' });
assert(hooks._appendPhoneKey(PUB_PEM), 'injected test public key into _phoneKeys');

// MUST mirror tools/phone-signer.js sign() and license.js:_phonePayload.
function signFixture(f) {
  const payload = hooks._phonePayload(f);
  const s = crypto.createSign('sha256');
  s.update(payload, 'utf8');
  return s.sign({
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  }, 'base64');
}

function makeFile(overrides) {
  const now = Date.now();
  const f = Object.assign({
    v: 1,
    machineId: FP,
    storeCode: '1234567890',
    type: 'main',
    days: 30,
    serial: 'aabbccdd00112233',
    activatedAt: now,
    issuedAt: now,
    expiresAt: now + 30 * 86400000,
  }, overrides || {});
  f.sig = signFixture(f);
  return f;
}

function importFile(f, note) {
  return hooks.importPhoneLicense({ fileName: 'x.zmtlic', data: JSON.stringify(f) });
}

function importEnvelope(f) {
  const env = hooks._encryptFilePayload(JSON.stringify(f));
  return hooks.importPhoneLicense({ fileName: 'x.zmtlic', data: JSON.stringify(env) });
}

// An envelope from anything that does NOT know the real file key: must be
// rejected at decrypt even if the inner JSON is a perfect valid signed file.
function forgeEnvelope(plain) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHmac('sha256', Buffer.from('attacker-secret-fake', 'utf8'))
    .update('zmtlic-file-key-v2').digest();
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return JSON.stringify({ v: 2, iv: iv.toString('base64'), data: Buffer.concat([ct, c.getAuthTag()]).toString('base64') });
}

(async function main() {
  // Mirror isolation: NEVER let the tests touch the real HKCU registry. Install
  // a temp-file backend BEFORE any import/check so every saveLicense call (and
  // the mirror check inside checkLicense) runs against the sandbox.
  const MIRFILE = path.join(TMP, 'zmt_mirror.test');
  const mirrorBackend = {
    read() { try { return fs.readFileSync(MIRFILE, 'utf8'); } catch (e) { return null; } },
    write(b64) { fs.writeFileSync(MIRFILE, b64, 'utf8'); return true; },
    del() { try { fs.rmSync(MIRFILE, { force: true }); } catch (e) {} },
  };
  assert(hooks._setRegistryBackend(mirrorBackend) === mirrorBackend, 'temp registry backend installed (no real HKCU writes)');
  function writeMirror(obj) {
    fs.writeFileSync(MIRFILE, Buffer.from(JSON.stringify(obj), 'utf8').toString('base64'), 'utf8');
  }

  section('canonical payload');
  const sample = makeFile({});
  const expected = [
    'v=1',
    'machineId=' + FP,
    'storeCode=1234567890',
    'type=main',
    'days=30',
    'serial=aabbccdd00112233',
    'activatedAt=' + sample.activatedAt,
    'issuedAt=' + sample.issuedAt,
    'expiresAt=' + sample.expiresAt,
  ].join('\n');
  assert(hooks._phonePayload(sample) === expected, '_phonePayload is the canonical, deterministic string');

  section('valid 30-day import');
  fs.rmSync(path.join(TMP, 'zmt_license.dat'), { force: true });
  const r1 = importFile(sample);
  assert(r1.success === true, 'valid phone license imported');
  assert(r1.license && r1.license.storeCode === '1234567890', 'storeCode stored');
  assert(r1.license && r1.license.src === 'phone', 'license tagged src=phone');
  assert(fs.existsSync(path.join(TMP, 'zmt_license.dat')), 'zmt_license.dat written');
  const after = License.checkLicense();
  assert(after.status === 'active' && after.valid, 'checkLicense() -> active with the SAME code path');
  assert(after.remainingDays >= 29 && after.remainingDays <= 30, 'remainingDays ~30 (' + after.remainingDays + ')');

  section('renewal overwrites (phone issues a shorter extension)');
  const renew = makeFile({ days: 7, expiresAt: Date.now() + 7 * 86400000, serial: 'ffeeddcc11223344' });
  const r2 = importFile(renew);
  assert(r2.success === true, 'renewal import succeeded');
  const after2 = License.checkLicense();
  assert(after2.remainingDays >= 6 && after2.remainingDays <= 7, 'remainingDays ~7 after renewal (' + after2.remainingDays + ')');

  section('rejections');
  const wrongMachine = makeFile({ machineId: 'dead'.repeat(16) });
  const rm = importFile(wrongMachine);
  assert(rm.success === false && /مربوط بجهاز آخر/.test(rm.message), 'machine mismatch rejected');

  const tampered = makeFile({});
  tampered.expiresAt += 86400000 * 365; // edited AFTER signing
  const tp = importFile(tampered);
  assert(tp.success === false && /التوقيع غير صالح/.test(tp.message), 'tampered expiry rejected at the signature');

  const expired = makeFile({ activatedAt: Date.now() - 5 * 86400000, days: 1, expiresAt: Date.now() - 4 * 86400000 });
  const ex = importFile(expired);
  assert(ex.success === false && /انتهت صلاحية/.test(ex.message), 'already-expired file rejected');

  const future = makeFile({ issuedAt: Date.now() + 60 * 60 * 1000 });
  const fu = importFile(future);
  assert(fu.success === false && /وقتاً مستقبلياً/.test(fu.message), 'future issuedAt rejected');

  const noStore = makeFile({ storeCode: '' });
  const ns = importFile(noStore);
  assert(ns.success === false && /ناقص/.test(ns.message), 'missing storeCode rejected');

  // v2 is now a REAL format (encrypted envelope, tested below); v3+ is unknown.
  const vBad = makeFile({ v: 3 });
  const vv = importFile(vBad);
  assert(vv.success === false && /غير مدعومة/.test(vv.message), 'unsupported (future) version rejected');

  const noSig = makeFile({});
  delete noSig.sig;
  const sg = importFile(noSig);
  assert(sg.success === false && /غير موقّع/.test(sg.message), 'unsigned file rejected');

  const notJson = hooks.importPhoneLicense({ fileName: 'x.zmtlic', data: 'hello world' });
  assert(notJson.success === false && /غير صالح/.test(notJson.message), 'non-JSON rejected');

  section('signature must come from a TRUSTED key');
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 }); // attacker key
  const evilF = makeFile({});
  const evilSign = crypto.createSign('sha256');
  evilSign.update(hooks._phonePayload(evilF), 'utf8');
  evilF.sig = evilSign.sign({
    key: other.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  }, 'base64');
  const ev = importFile(evilF);
  assert(ev.success === false && /التوقيع غير صالح/.test(ev.message), 'a foreign key cannot sign valid files');

  section('E2E with the REAL production signer (tools/keys reference keypair)');
  // The desktop no longer TRUSTS the reference key (only the distributor's
  // phone key is embedded). The reference private key is kept locally as a
  // pure test fixture: derive its public half, register it through the test
  // injection hook (never the production list), and prove a file signed
  // exactly like `node tools/phone-signer.js issue ...` is accepted by
  // importPhoneLicense through the very same verification code path.
  const prodKey = path.join(ROOT, 'tools', 'keys', 'phone-key.pem');
  if (fs.existsSync(prodKey)) {
    const priv = crypto.createPrivateKey(fs.readFileSync(prodKey, 'utf8'));
    const refPub = crypto.createPublicKey(priv).export({ type: 'spki', format: 'pem' });
    assert(hooks._appendPhoneKey(refPub), 'injected the reference public key as a test-only trust anchor');
    const ef = {
      v: 1, machineId: FP, storeCode: '1234567890', type: 'main', days: 14,
      serial: '1122334455667788',
      activatedAt: Date.now(), issuedAt: Date.now(), expiresAt: Date.now() + 14 * 86400000,
    };
    const ps = crypto.createSign('sha256');
    ps.update(hooks._phonePayload(ef), 'utf8');
    ef.sig = ps.sign(
      { key: priv, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST },
      'base64'
    );
    const pr = hooks.importPhoneLicense({ fileName: 'v2.zmtlic', data: JSON.stringify(ef) });
    assert(pr.success === true, 'a file signed with the real production signer is accepted (reference key trusted via test hook only)');
    assert(License.checkLicense().status === 'active', 'reference-signed import checks out active');
  } else {
    console.log('  (تخطي: لا يوجد ' + prodKey + ' على هذه الآلة — نفّذ node tools/phone-signer.js generate لإجراء قسم E2E)');
  }

  section('v2 envelope (encrypted at rest) — acceptance + rollback via mirror');
  // 1) a REAL v2 envelope (same key derivation as _encryptFilePayload) imports fine;
  const v2a = makeFile({ days: 20, serial: 'eeeeffff00001111' });
  const ea = importEnvelope(v2a);
  assert(ea.success === true, 'v2 encrypted envelope accepted');
  assert(License.checkLicense().status === 'active', 'v2 import checks out active');
  const backup20 = fs.readFileSync(path.join(TMP, 'zmt_license.dat'), 'utf8'); // VALID app-signed snapshot of the 20-day file

  // 2) a renewal advances BOTH the file and the mirror;
  const v2b = makeFile({ days: 7, serial: 'ddddeeee0000ffff' });
  const eb = importEnvelope(v2b);
  assert(eb.success === true, 'v2 renewal accepted');
  const mirRenewal = hooks.loadLicenseMirror();
  assert(mirRenewal && mirRenewal.serial === 'ddddeeee0000ffff', 'mirror advanced with the renewal');

  // 3) restoring the OLD file (still perfectly signed + watermarked) while the
  //    mirror already moved is a userData rollback -> the mirror catches it.
  fs.writeFileSync(path.join(TMP, 'zmt_license.dat'), backup20, 'utf8');
  const rb = License.checkLicense();
  assert(rb.status === 'license_tampered' && /تناقض في سجل/.test(rb.message), 'rollback of a valid backup is caught by the registry mirror');
  const rv = importEnvelope(makeFile({ days: 5, serial: 'ccddccdd00001111' }));
  assert(rv.success === true, 'self-healing import (file + mirror) restores an active state');

  section('v2 envelope — tamper / foreign-key rejections');
  const lam = makeFile({ days: 9, serial: 'abcdefabcdef9999' });
  const good = hooks._encryptFilePayload(JSON.stringify(lam));
  const bitFlip = JSON.parse(JSON.stringify(good));
  const d1 = Buffer.from(bitFlip.data, 'base64');
  d1[0] ^= 0xff;
  bitFlip.data = d1.toString('base64');
  const tf = hooks.importPhoneLicense({ fileName: 'x.zmtlic', data: JSON.stringify(bitFlip) });
  assert(tf.success === false && /تالف|غير قابل للفتح/.test(tf.message), 'bit-flip inside the envelope rejected at decrypt');
  const fk = hooks.importPhoneLicense({ fileName: 'x.zmtlic', data: forgeEnvelope(JSON.stringify(lam)) });
  assert(fk.success === false && /تالف|غير قابل للفتح/.test(fk.message), 'envelope sealed with a foreign key rejected at decrypt');
  const badEnv = JSON.parse(JSON.stringify(good));
  delete badEnv.iv;
  const noIv = hooks.importPhoneLicense({ fileName: 'x.zmtlic', data: JSON.stringify(badEnv) });
  assert(noIv.success === false, 'malformed envelope (missing iv) rejected');

  section('registry mirror — conflict / absence / integrity');
  // corrupted HMAC (file untouched) must freeze:
  const cur = hooks.loadLicenseMirror();
  cur.sig = '0'.repeat(64);
  writeMirror(cur);
  const bm = License.checkLicense();
  assert(bm.status === 'license_tampered' && /تناقض في سجل/.test(bm.message), 'corrupted mirror HMAC freezes the app');
  // realign file+mirror via import, then prove ABSENT mirror is benign:
  importEnvelope(makeFile({ days: 11, serial: 'bbbbcccc0000dddd' }));
  mirrorBackend.del();
  assert(License.checkLicense().status === 'active', 'absent mirror is benign (fresh install / registry cleaner)');
  // a mirror from ANOTHER machine (valid HMAC but foreign) must be ignored:
  const foreign = { v: 1, machineId: '1111'.repeat(16), storeCode: 'X', serial: '', src: 'phone', type: 'main', activatedAt: 1, expiresAt: 2 };
  foreign.sig = hooks._mirrorSig(foreign);
  writeMirror(foreign);
  assert(License.checkLicense().status === 'active', 'foreign-machine mirror is ignored (no false positive)');

  section('legacy v1 plaintext still accepted (backward compatibility)');
  const v1again = makeFile({ days: 3, serial: 'abcdefabcdef1234' });
  const lv = importFile(v1again);
  assert(lv.success === true && License.checkLicense().status === 'active', 'v1 files continue to import and pass checks');

  section('deactivation prunes the mirror');
  const dl = await License.deactivateLicense({});
  assert(dl.success === true, 'deactivation deletes the license');
  assert(hooks.loadLicenseMirror() === null, 'mirror pruned on deactivation');
  assert(License.checkLicense().status === 'no_license', 'app returns to no_license');

  console.log('\nlicense-phone-test: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();