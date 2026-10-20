#!/usr/bin/env node
// ZMT PIECE — offline phone/edge license signer (reference implementation).
//
// The PRODUCTION signer is the Android app zmt-phone-editor: the RSA-4096
// private key is born inside Android Keystore and never leaves the phone. This
// Node CLI exists so the desktop import path can be developed and tested
// without building an APK, and it shares the EXACT file format and signing
// parameters the app and the desktop verifier use (see license.js:
// _phonePayload / importPhoneLicense).
//
//   node tools/phone-signer.js generate
//        -> creates tools/keys/phone-key.pem (PRIVATE, never commit it) and
//           prints the PUBLIC PEM which you feed to tools/embed-pubkey.js
//
//   node tools/phone-signer.js issue
//        --machine <64-hex machineId>   (as shown in the activation overlay)
//        --store <storeCode>
//        --days 30
//        [--type main|branch]
//        [--name "Store Name"]          (cosmetic, optional)
//        [--out file.zmtlic]
//        [--key path-to-private.pem]
//        [--plain]                      (emit the legacy v1 plaintext file)
//
// Output format: v2 = { v:2, iv, data } where `data` is the AES-256-GCM
// ciphertext (+tag) of the exact signed v1 JSON. The RSA-PSS signature stays
// INSIDE the plaintext, so a v1 -> v2 change alters zero signing bytes — the
// desktop verifier simply unwraps the envelope then verifies as always.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEYS_DIR = path.join(__dirname, 'keys');
const PRIVATE_KEY = path.join(KEYS_DIR, 'phone-key.pem');
const PUBLIC_KEY = path.join(KEYS_DIR, 'phone-key.pub.pem');

// ---- v2 envelope (must stay in lock-step with license.js:_encryptFilePayload)
const _MASK = [0x5a, 0x33, 0xc7, 0x81, 0x1e];
const _FILESRC = '205eb3ac6e3356a4e4317449aaf5723350e8f72c6056a9e2332904acb2';

function _deobf(hex) {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ _MASK[(i / 2) % _MASK.length]);
  }
  return out;
}

function _fileKey() {
  return crypto
    .createHmac('sha256', Buffer.from(_deobf(_FILESRC), 'utf8'))
    .update('zmtlic-file-key-v2')
    .digest();
}

function encryptLicenseFile(plain) {
  const src = typeof plain === 'string' ? plain : JSON.stringify(plain);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', _fileKey(), iv);
  const ct = Buffer.concat([c.update(src, 'utf8'), c.final()]);
  return JSON.stringify({
    v: 2,
    iv: iv.toString('base64'),
    data: Buffer.concat([ct, c.getAuthTag()]).toString('base64'),
  });
}

function payload(f) {
  // MUST stay byte-identical with license.js:_phonePayload
  return [
    'v=' + String(f.v != null ? f.v : 1),
    'machineId=' + String(f.machineId || ''),
    'storeCode=' + String(f.storeCode || ''),
    'type=' + String(f.type || 'main'),
    'days=' + String(f.days || 0),
    'serial=' + String(f.serial || ''),
    'activatedAt=' + String(f.activatedAt || 0),
    'issuedAt=' + String(f.issuedAt || 0),
    'expiresAt=' + String(f.expiresAt || 0),
  ].join('\n');
}

function randomSerial() {
  return crypto.randomBytes(8).toString('hex');
}

function signLicense(f, privateKey) {
  const signer = crypto.createSign('sha256');
  signer.update(payload(f), 'utf8');
  const sig = signer.sign(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    },
    'base64'
  );
  return sig;
}

function loadPrivateKey(file) {
  const p = file || PRIVATE_KEY;
  if (!fs.existsSync(p)) {
    throw new Error(
      'لا يوجد مفتاح خاص في ' + p + ' — نفّذ أولاً: node tools/phone-signer.js generate'
    );
  }
  return fs.readFileSync(p, 'utf8');
}

function cmdGenerate() {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  if (fs.existsSync(PRIVATE_KEY)) {
    console.log('المفتاح الخاص موجود مسبقاً: ' + PRIVATE_KEY + ' (لن يُستبدل)');
    fs.writeFileSync(PUBLIC_KEY, publicPemOf(PRIVATE_KEY), 'utf8');
  } else {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicExponent: 0x10001,
    });
    fs.writeFileSync(PRIVATE_KEY, privateKey.export({ type: 'pkcs8', format: 'pem' }), 'utf8');
    fs.writeFileSync(PUBLIC_KEY, publicKey.export({ type: 'spki', format: 'pem' }), 'utf8');
    console.log('أُنشئ زوج المفاتيح (RSA-4096):');
    console.log('  خاص:  ' + PRIVATE_KEY + '   <-- لا تشاركه أبداً، ولا تُرفع للـ git');
    console.log('  عام:  ' + PUBLIC_KEY);
  }
  console.log('\nالمفتاح العام (أرسله إلى embed-pubkey):');
  console.log(fs.readFileSync(PUBLIC_KEY, 'utf8'));
}

function publicPemOf(privatePemFile) {
  const priv = crypto.createPrivateKey(fs.readFileSync(privatePemFile, 'utf8'));
  return priv.export({ type: 'spki', format: 'pem' });
}

function cmdIssue(args) {
  const get = (name) => {
    const i = args.indexOf('--' + name);
    return i === -1 ? null : args[i + 1];
  };
  const hasFlag = (name) => args.indexOf('--' + name) !== -1;
  const flags = { plain: hasFlag('plain') };
  const machineId = get('machine');
  const store = get('store');
  const daysRaw = get('days');
  const type = get('type') || 'main';
  const storeName = get('name');
  const out = get('out');
  const keyFile = get('key');

  if (!machineId || !store || !daysRaw) {
    console.error('الاستخدام: node tools/phone-signer.js issue --machine <hex64> --store <code> --days N [--type main|branch] [--name "Name"] [--out file.zmtlic]');
    process.exit(1);
  }
  if (!/^[0-9a-f]{64}$/i.test(machineId)) {
    console.error('machineId يجب أن يكون 64 محرفاً hex (انسخه من شاشة التفعيل)');
    process.exit(1);
  }
  const days = parseInt(daysRaw, 10);
  if (!Number.isFinite(days) || days <= 0) {
    console.error('days يجب أن يكون رقماً موجباً');
    process.exit(1);
  }

  const now = Date.now();
  const expiresAt = now + days * 86400000;
  const f = {
    v: 1,
    machineId: machineId.toLowerCase(),
    storeCode: store,
    type: type === 'branch' ? 'branch' : 'main',
    days,
    storeName: storeName || '',
    serial: randomSerial(),
    activatedAt: now,
    issuedAt: now,
    expiresAt,
  };
  const priv = loadPrivateKey(keyFile);
  f.sig = signLicense(f, priv);

  const file = out || path.join(KEYS_DIR, 'license-' + machineId.slice(0, 8) + '-' + f.serial + '.zmtlic');
  const plain = flags.plain ? JSON.stringify(f, null, 2) : null;
  fs.writeFileSync(file, plain || encryptLicenseFile(f), 'utf8');
  console.log('حُفظ ملف الترخيص: ' + file);
  console.log('  format    : ' + (plain ? 'v1 (صريح)' : 'v2 (مشفّر)'));
  console.log('  machineId : ' + machineId);
  console.log('  storeCode : ' + store);
  console.log('  type      : ' + (type === 'branch' ? 'branch' : 'main'));
  console.log('  days      : ' + days);
  console.log('  expiresAt : ' + new Date(expiresAt).toISOString());
  console.log('  serial    : ' + f.serial);
}

const cmd = process.argv[2];
if (cmd === 'generate') {
  cmdGenerate();
} else if (cmd === 'issue') {
  cmdIssue(process.argv.slice(3));
} else {
  console.log('الاستخدام: node tools/phone-signer.js generate | issue ...');
  process.exit(1);
}