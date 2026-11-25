const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const LICENSE_FILE = 'zmt_license.dat';
const TIME_FILE = 'zmt_time.dat';
const DEVICE_FILE = 'zmt_device.dat';
const SMB_CACHE_FILE = 'zmt_smbios.dat';
// 2.4.9: single sticky machine-identity cache (see getMachineFingerprint).
// Replaces the Wave-2 smbios-only cache; the old file is migrated, never deleted.
const MACHINE_CACHE_FILE = 'zmt_machine.dat';

// ===== TIME-TAMPER PROTECTION (local-only) =====
// A monotonic watermark W = the highest epoch time this machine has ever
// reached. W can only move forward and is HMAC-signed (with the machineId) so
// editing or deleting the saved state cannot reset the anchor. It is stored in
// TWO places: zmt_time.dat and a redundant copy inside the signed license file.
// Expiry is computed from max(now, W), so rolling the clock back — even while
// offline — cannot resurrect an expired license, and jumping forward expires
// it immediately (expiresAt is absolute). Small backward corrections within
// BACK_TOLERANCE_MS are tolerated (NTP/DST: epoch ms are unaffected by timezone).
const BACK_TOLERANCE_MS = 5 * 60 * 1000;
// Absolute floor for activation: a device clock before the build's era means a
// back-dated clock (or a broken CMOS). Refuse activation instead of minting a
// license from a fake past date.
const BUILD_TS = Date.parse('2026-01-01T00:00:00Z');

let _userDataPath = null;
let _memoryDeviceId = null;

function setUserDataPath(p) { _userDataPath = p; }

function getLicensePath() {
  return path.join(_userDataPath, LICENSE_FILE);
}

function getTimePath() {
  return path.join(_userDataPath, TIME_FILE);
}

function getDevicePath() {
  return path.join(_userDataPath, DEVICE_FILE);
}

// Stable per-installation device ID: generated once with crypto.randomBytes
// and persisted to userData. It never depends on network adapters/hostname,
// so unplugging Wi-Fi or changing networks cannot break an existing license.
// This is now the FALLBACK only — the primary fingerprint is SMBIOS-derived
// (see getMachineFingerprint below).
function legacyDeviceId() {
  try {
    const p = getDevicePath();
    if (fs.existsSync(p)) {
      const existing = JSON.parse(fs.readFileSync(p, 'utf-8'));
      // Only accept a full 64-char SHA-style id; stale 32-char ids from older
      // builds are discarded so a fresh, server-valid id is generated.
      if (existing && typeof existing.deviceId === 'string' && /^[0-9a-f]{64}$/.test(existing.deviceId)) {
        return existing.deviceId;
      }
    }
    const deviceId = crypto.randomBytes(32).toString('hex');
    if (_userDataPath) {
      fs.mkdirSync(_userDataPath, { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ deviceId }), 'utf-8');
    }
    return deviceId;
  } catch (e) {
    // Disk unavailable fallback: keep one ID for this process lifetime
    if (!_memoryDeviceId) _memoryDeviceId = crypto.randomBytes(32).toString('hex');
    return _memoryDeviceId;
  }
}

// ===== SMBIOS HARDWARE FINGERPRINT (Wave 2 + 2.4.9 hardening) =====
// Reads the motherboard's SMBIOS UUID (a physical hardware identifier that
// survives reinstalls but changes when the PC itself is replaced) and binds the
// license to sha256("zmt-smbios:" + UUID). The hash is cached so the query runs
// only once per machine. When SMBIOS is unavailable (rare VMs / locked-down OS)
// we fall back to the legacy random device id — the license then behaves exactly
// as before.
//
// 2.4.9: the identity is now STICKY. The first fingerprint ever computed for a
// machine is persisted to zmt_machine.dat and returned for the life of that
// install; it never flips afterwards. Before this, a Win7 box whose PowerShell
// CIM probe succeeded on one boot and failed on another could alternate between
// a SMBIOS id and a random id, making an already-activated license look like it
// belonged to "another device" (machine_mismatch) and, on the boots that passed,
// triggering the time-watermark/cloud clock path instead — the "تلاعب بالوقت /
// يخص جهاز آخر" alternation this fix kills. WMIC is also tried (Win7) so the
// hardware id is obtained far more often than PowerShell alone allows.
let _smbiosCache = null;
let _machineFpCache = null;

function _isUuidLike(v) {
  return typeof v === 'string' && /^[0-9a-fA-F-]{20,64}$/.test(v.trim());
}

function _readSmbiosUuidSync() {
  if (_smbiosCache !== null) return _smbiosCache;
  let uuid = '';
  // 1) Modern PowerShell CIM (Win10+; fast where available).
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID',
      ],
      { encoding: 'utf8', timeout: 15000, windowsHide: true }
    );
    uuid = String(out || '').trim();
  } catch (e) {
    uuid = '';
  }
  // 2) Legacy WMIC fallback (Windows 7 / restricted PowerShell): same field,
  //    different engine. Keeps Win7 installs on a hardware-bound id instead of
  //    silently degrading to the volatile random fallback.
  if (!_isUuidLike(uuid)) {
    try {
      const out = execFileSync('wmic.exe', ['csproduct', 'get', 'uuid'], {
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
      });
      const lines = String(out || '')
        .split(/[\r\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const found = lines.find((l) => _isUuidLike(l));
      uuid = found || '';
    } catch (e) {
      uuid = '';
    }
  }
  if (_isUuidLike(uuid)) {
    _smbiosCache = uuid.toUpperCase();
    return _smbiosCache;
  }
  _smbiosCache = '';
  return _smbiosCache;
}

function _machineCachePath() {
  return path.join(_userDataPath, MACHINE_CACHE_FILE);
}

function _readMachineCacheFile(p) {
  try {
    if (!fs.existsSync(p)) return null;
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (parsed && typeof parsed.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(parsed.fingerprint)) {
      return parsed.fingerprint;
    }
  } catch (e) {}
  return null;
}

function _loadMachineCache() {
  if (!_userDataPath) return null;
  const fp = _readMachineCacheFile(_machineCachePath());
  if (fp) return fp;
  // Migrate from the Wave-2 cache (2.3.x–2.4.8): same shape, older filename.
  const legacy = _readMachineCacheFile(path.join(_userDataPath, SMB_CACHE_FILE));
  if (legacy) {
    _saveMachineCache(legacy);
    return legacy;
  }
  return null;
}

function _saveMachineCache(fp) {
  try {
    if (!_userDataPath) return;
    fs.mkdirSync(_userDataPath, { recursive: true });
    fs.writeFileSync(_machineCachePath(), JSON.stringify({ fingerprint: fp }), 'utf-8');
  } catch (e) {}
}

// Primary machine identity: sha256 of the SMBIOS UUID when readable, otherwise
// the legacy random device id. Used for license binding AND time-watermark
// signing, so it must be deterministic for the life of the machine — the value
// pinned on the first call is persisted and returned forever after.
function getMachineFingerprint() {
  if (_machineFpCache) return _machineFpCache;
  const cached = _loadMachineCache();
  if (cached) {
    _machineFpCache = cached;
    return cached;
  }
  const smbios = _readSmbiosUuidSync();
  const fp = smbios
    ? crypto.createHash('sha256').update('zmt-smbios:' + smbios).digest('hex')
    : legacyDeviceId();
  _machineFpCache = fp;
  _saveMachineCache(fp);
  return fp;
}

// ===== OBFUSCATION =====
// Keys and secrets never appear in plaintext in the bundle. Each string is
// stored as hex char-codes XOR-ed with a rotating mask. This blocks naive
// extraction (strings/grep/asar read); full protection requires a server.
const _MASK = [0x5a, 0x33, 0xc7, 0x81, 0x1e];

function _deobf(hex) {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ _MASK[(i / 2) % _MASK.length]);
  }
  return out;
}

// Key-signing HMAC secret (v2 — obfuscated)
const _KSRC = '007e93de4e7b7684b2416803f5b541090084d32d0e6c8cb2470565f5';
// License-file signature secret (v2 — obfuscated, distinct from key secret)
const _SSRC = '007e93de4e7b7684b241090280cf2a0e6695b2410c0198b32e6805';
// Time-watermark signing secret (v2.1 — obfuscated, distinct from the two above)
const _WMSRC = '205eb3af693b47a2f3733b41acaf68681db3e4732a54b2e06c3e1df2b2276f0af0b0296300';
// At-rest file-encryption secret (v3 — obfuscated). Derives the AES-256-GCM key
// used by the v2 .zmtlic envelope (see _encryptFilePayload).
const _FILESRC = '205eb3ac6e3356a4e4317449aaf5723350e8f72c6056a9e2332904acb2';
// License-mirror HMAC secret (v3 — obfuscated). Signs the hidden registry mirror
// (see _mirrorSig) so a rollback of userData alone cannot rewrite history.
const _MIRSRC = '205eb3ac6e3356a4e431165aa4e47029568ae86c285cb5ae686b09afec7f391eacb8';

function _hmac(key, machineId) {
  const secret = _deobf(_KSRC);
  const data = key.toUpperCase().trim() + '::' + machineId;
  return crypto.createHmac('sha512', secret).update(data).digest('hex');
}

// ===== OFFLINE PHONE-ISSUED LICENSE (*.zmtlic) =====
// For stores with no internet at all. The distributor's phone app (or the
// desktop reference tool tools/phone-signer.js) holds an RSA-4096 PRIVATE key
// and signs a machine-bound license file off-contract. The desktop app only
// contains the matching PUBLIC keys (this list — never the private key), so a
// distributed binary alone can no longer mint licenses. Rotation is additive:
// keep old keys and append new ones with tools/embed-pubkey.js.
//
// File format (.zmtlic):
//   v1 (legacy, plaintext JSON, still accepted):
//     { v:1, machineId, storeCode, storeName?, type, days, serial,
//       issuedAt, activatedAt, expiresAt, sig }
//   v2 (current, envelope wrapping the exact same plaintext):
//     { v:2, iv: base64(12B), data: base64(ct || tag16) }
//     key = HMAC-SHA256(deobf(_FILESRC), "zmtlic-file-key-v2")
//     plaintext = the identical v1 object above. Encryption adds privacy at
//     rest (a Notepad glance shows only opaque bytes); the REAL integrity guard
//     is the RSA-PSS signature inside the plaintext, so v2 changes nothing in
//     _verifyPhoneSig — an attacker cannot smuggle their own sig either way.
//   sig = RSA-PSS-SHA256 (salt = digest length) over the canonical payload
//   built by _phonePayload(). Any drift in a single field breaks verification,
//   so the signer (Node + Android) and this verifier MUST build the exact same
//   bytes (see tools/phone-signer.js:payload).

function _obfStr(s) {
  let hex = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) ^ _MASK[i % _MASK.length];
    hex += (c < 16 ? '0' : '') + c.toString(16);
  }
  return hex;
}

// The canonical payload string; MUST stay byte-identical with
// tools/phone-signer.js:payload (and the Android signer).
function _phonePayload(f) {
  return [
    'v=' + String(f && f.v != null ? f.v : 1),
    'machineId=' + String(f && f.machineId ? f.machineId : ''),
    'storeCode=' + String(f && f.storeCode ? f.storeCode : ''),
    'type=' + String(f && f.type ? f.type : 'main'),
    'days=' + String(f && f.days ? f.days : 0),
    'serial=' + String(f && f.serial ? f.serial : ''),
    'activatedAt=' + String(f && f.activatedAt ? f.activatedAt : 0),
    'issuedAt=' + String(f && f.issuedAt ? f.issuedAt : 0),
    'expiresAt=' + String(f && f.expiresAt ? f.expiresAt : 0),
  ].join('\n');
}

// Accepted signing public keys, XOR-obfuscated (fills via tools/embed-pubkey.js).
const _PHONE_KEYS_OBF = [
  '771eeaac33187680c8507a6392c3521370e7ca5b031eeaac3377398ac857197aadc0501854acf076315a80b8696a7186d05b1c7286ce5d1b54ffc053137a84c279117086e65b1b4a97f9703d45a2d27c1062ace6772f7ebed6770d39a1f0483e18a0ae52035aaee7281c67a5eb75104280b8293745f7d635155a89c9761971f0ce763442f0e34a360a93fb26090a92d6263456b7c82c135091ec676239b0e56d390b93b3476f01bdca4c3f75a2d46b036689cb773e5085d675635681f57f1b65b5d6760076e8c55f2c40a9b64a0f02b2f1442860b4f6790d6493cb5c2239a9eb7f694b97c0266c76b4c54e6262add9520f62f4c8263c4189cb781860f4c526397993f772325789e96a1379bdf7666d5896c02e295df0c84e007bf7d25b0b39aab0263063acf135750aa1fb570a45a6c571135f93e47a314681c76e116382e9591746b2f17d7564a9b026685f91cb470c008dcf7d6e43a8f7446a78feb94a3f39f0f8471055a3f47b2e418fc871347dbfc2670269bfcc666977f2f46e6e78b4b7712803b6c94e00748cb9701243bed55c330af4e2576265b3d7500c0b8aaa7b3339b3ea5f0e64a4f62d6959b4cf786e5b96cd2b3340a0e07a2e019dc7586c7eb6b6640d7e85c9272e7891f9640361b2d4442d5dbdc87b7565aed764155295ee2a0b3980d45f1d0ab4b971364991d354166abfeb51106990f144150186b379306590b97a3c00f5ea46110beccd29195fb2c368105c89f66b3664a0f96b290382b87937399fb2782b03f2d9596900b0d74c6b4588db7211508ad55d10498bf52c2c70f4d92a187ef3c5546276aaed2d6e5aacee291340a9e94b1056fefb5d0f72f2b5441c3980e37f0375afb351326692c4781e468bd44c0976b5d1316b7eb7d54908578bb52f087694c57f0d438eea556955beea4634079ef85f1762b1c358117282ec6e36398ab92d7104f4e0766b0b93ea2d3862add97a285092b977166681f46f197ea5e9491866f3cf260842b4c95b2269a6eb26097aa5e75a6c5d91d2586254f0c4280b39beb17b2d1c84e65a6261a8f27d085f9eed5b1867a2f46d1972b0c45f1b62fabc14771eeaac331f7d83a14e0f718bc85d7a7882d833771eeaac'
];
const _phoneKeys = _PHONE_KEYS_OBF.map(_deobf);

function _verifyPhoneSig(f, pubPem) {
  try {
    const key = crypto.createPublicKey(pubPem);
    const ver = crypto.createVerify('sha256');
    ver.update(_phonePayload(f), 'utf8');
    return ver.verify(
      {
        key,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      Buffer.from(String(f.sig), 'base64')
    );
  } catch (e) {
    return false;
  }
}

// ===== v2 ENVELOPE (AES-256-GCM, at-rest privacy for .zmtlic) =====
// The envelope does NOT add integrity on its own — the RSA-PSS signature inside
// the plaintext is the guard. Its job: bytes at rest look like noise, and any
// hand edit (or casual read) of serial/dates is impossible without the derived
// key. Key = HMAC-SHA256(secret, info) so the secret base is XOR-obfuscated and
// a single leak of one derivation never reveals the others. The Android signer
// mirrors these exact steps (see MainActivity.encryptLicenseFile).
const _FILE_KEY_INFO = 'zmtlic-file-key-v2';

function _fileKey() {
  return crypto
    .createHmac('sha256', Buffer.from(_deobf(_FILESRC), 'utf8'))
    .update(_FILE_KEY_INFO)
    .digest();
}

// { v:2, iv: b64(12B), data: b64(ct||tag16) } -> plaintext string | null
function _decryptFilePayload(env) {
  try {
    if (!env || typeof env !== 'object' || env.v !== 2) return null;
    const iv = Buffer.from(String(env.iv || ''), 'base64');
    const data = Buffer.from(String(env.data || ''), 'base64');
    if (iv.length !== 12 || data.length < 28) return null;
    const tag = data.subarray(data.length - 16);
    const ct = data.subarray(0, data.length - 16);
    const d = crypto.createDecipheriv('aes-256-gcm', _fileKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

function _encryptFilePayload(plain) {
  const src = typeof plain === 'string' ? plain : JSON.stringify(plain);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', _fileKey(), iv);
  const ct = Buffer.concat([c.update(src, 'utf8'), c.final()]);
  return {
    v: 2,
    iv: iv.toString('base64'),
    data: Buffer.concat([ct, c.getAuthTag()]).toString('base64'),
  };
}

// ===== HIDDEN SIGNED LICENSE MIRROR (registry, per-user) =====
// An extra signed anchor OUTSIDE the license files. Written from the single
// central save point (saveLicense) on every successful issue/renewal and
// deleted on deactivation, it survives a full userData-folder restore — the
// attacker would have to restore the registry too — and catches "roll back to a
// pre-expiry backup" attempts. Rules (baked to avoid false positives):
//   - write is best-effort; failure NEVER blocks activation.
//   - MISSING mirror = benign (fresh install, registry cleaner) -> no freeze.
//   - present + valid HMAC + machine match, but any business field differs from
//     the signed license file -> license_tampered freeze.
const REG_ROOT = 'HKCU\\Software\\ZMT PIECE';
const REG_NAME = 'LicenseMirror';
const MIRROR_VERSION = 1;
const _MIRROR_KEY_INFO = 'mirror-key-v1';

// Test seam: { read():string|null, write(b64):boolean, del():void }
let _mirrorBackend = null;
function _setRegistryBackend(backend) {
  _mirrorBackend = backend || null;
  return _mirrorBackend;
}

function _regWrite(valueB64) {
  if (_mirrorBackend) return !!_mirrorBackend.write(valueB64);
  try {
    execFileSync('reg.exe', ['add', REG_ROOT, '/v', REG_NAME, '/t', 'REG_SZ', '/d', valueB64, '/f'], { windowsHide: true, timeout: 8000 });
    return true;
  } catch (e) {
    return false;
  }
}

function _regRead() {
  if (_mirrorBackend) return _mirrorBackend.read();
  try {
    const out = execFileSync('reg.exe', ['query', REG_ROOT, '/v', REG_NAME], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    const lines = String(out).split(/[\r\n]+/);
    for (const line of lines) {
      const t = line.trim();
      if (t.indexOf(REG_NAME) === 0) {
        const m = t.match(/REG_SZ\s+(.*)$/);
        if (m) return m[1].trim();
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

function _regDel() {
  if (_mirrorBackend) {
    try { _mirrorBackend.del(); } catch (e) {}
    return;
  }
  try { execFileSync('reg.exe', ['delete', REG_ROOT, '/v', REG_NAME, '/f'], { windowsHide: true, timeout: 8000 }); } catch (e) {}
  try { execFileSync('reg.exe', ['delete', REG_ROOT, '/f'], { windowsHide: true, timeout: 8000 }); } catch (e) {}
}

function hardResetDevice() {
  try {
    const filesToRemove = [
      LICENSE_FILE,
      TIME_FILE,
      DEVICE_FILE,
      SMB_CACHE_FILE,
      MACHINE_CACHE_FILE,
      NET_LOG_FILE,
      'zmt_site_url.txt'
    ];
    if (_userDataPath) {
      for (const f of filesToRemove) {
        const p = path.join(_userDataPath, f);
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
      }
      try {
        const oldLog = path.join(_userDataPath, NET_LOG_FILE + '.old');
        if (fs.existsSync(oldLog)) fs.unlinkSync(oldLog);
      } catch (e) {}
    }
    try { _regDel(); } catch (e) {}
    _memoryDeviceId = null;
    _smbiosCache = null;
    _machineFpCache = null;
    return { success: true };
  } catch (e) {
    return { success: false, message: e && e.message ? e.message : String(e) };
  }
}

function _mirrorKey() {
  return crypto
    .createHmac('sha256', Buffer.from(_deobf(_MIRSRC), 'utf8'))
    .update(_MIRROR_KEY_INFO)
    .digest();
}

function _mirrorPayload(m) {
  return [
    String(m.machineId || ''),
    String(m.storeCode || ''),
    String(m.serial || ''),
    String(m.src || ''),
    String(m.type || ''),
    String(m.activatedAt || 0),
    String(m.expiresAt || 0),
  ].join('|');
}

function _mirrorSig(m) {
  return crypto.createHmac('sha256', _mirrorKey()).update(_mirrorPayload(m)).digest('hex');
}

// Central chokepoint used by every "issue" path (cloud + phone), so the mirror
// and the signed file can never drift apart accidentally.
function saveLicenseMirror(license) {
  try {
    if (!license || !license.machineId) return;
    const mirror = {
      v: MIRROR_VERSION,
      machineId: license.machineId,
      storeCode: String(license.storeCode || ''),
      serial: String(license.serial || ''),
      src: String(license.src || 'cloud'),
      type: String(license.type || 'main'),
      activatedAt: Number(license.activatedAt) || 0,
      expiresAt: Number(license.expiresAt) || 0,
    };
    mirror.sig = _mirrorSig(mirror);
    const b64 = Buffer.from(JSON.stringify(mirror), 'utf8').toString('base64');
    if (!_regWrite(b64)) _licLog('MIRROR write failed (non-fatal)');
  } catch (e) {}
}

function loadLicenseMirror() {
  try {
    const b64 = _regRead();
    if (!b64) return null;
    const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

// null = mirror agrees / absent / foreign (no freeze). Non-null = confirmed
// conflict that can only mean the license file was rolled back outside the
// signed+mirrored path.
function checkLicenseMirror(license) {
  const mirror = loadLicenseMirror();
  if (!mirror) return null;
  if (mirror.machineId !== license.machineId) return null;
  if (typeof mirror.sig !== 'string' || mirror.sig !== _mirrorSig(mirror)) {
    return { message: 'تناقض في سجل التفعيل المحمي — أعد تفعيل البرنامج من الموزّع أو إعادة تثبيت الرخص' };
  }
  const fields = ['storeCode', 'serial', 'src', 'type', 'activatedAt', 'expiresAt'];
  // Cloud licenses carry no `src`; normalize both sides to the same default so
  // a missing field can never fabricate a false-positive conflict.
  const norm = (v, k) => String(v || (k === 'src' ? 'cloud' : ''));
  for (const k of fields) {
    const a = norm(mirror[k], k);
    const b = norm(license[k], k);
    if (a !== b) {
      _licLog('MIRROR conflict field=' + k + ' mirror=' + a + ' file=' + b);
      return { message: 'تناقض في سجل التفعيل المحمي — أعد تفعيل البرنامج من الموزّع' };
    }
  }
  return null;
}

// { data: <.zmtlic JSON text> } — verifies a phone-issued license for THIS
// machine and, on success, stores it through the exact same signed +
// watermark-protected path activateOnline() uses, so checkLicense() needs no
// changes at all. Returns { success, message, license? }.
function importPhoneLicense(payload) {
  try {
    const raw = String(payload && payload.data != null ? payload.data : payload || '');
    if (!raw) return { success: false, message: 'لا يوجد ملف ترخيص' };

    let f;
    try {
      f = JSON.parse(raw);
    } catch (e) {
      return { success: false, message: 'ملف الترخيص غير صالح (ليس بصيغة JSON)' };
    }
    if (f && typeof f === 'object' && f.v === 2) {
      // Encrypted envelope: decrypt, then validate the same v1 schema inside.
      const plain = _decryptFilePayload(f);
      if (plain == null) {
        _licLog('PHONE import bad-envelope (wrong key / tampered bytes)');
        return { success: false, message: 'ملف الترخيص المشفّر تالف أو غير قابل للفتح — أعد استيراد ملف سليم من محرّر الرخص' };
      }
      try {
        f = JSON.parse(plain);
      } catch (e) {
        return { success: false, message: 'الملف المشفّر لا يحتوي بيانات ترخيص صالحة' };
      }
    }
    if (!f || typeof f !== 'object') {
      return { success: false, message: 'ملف الترخيص غير صالح' };
    }
    if (f.v !== 1) {
      return { success: false, message: 'نسخة ملف الترخيص غير مدعومة' };
    }
    if (!f.machineId || !f.storeCode) {
      return { success: false, message: 'ملف الترخيص ناقص (معرف الجهاز أو رمز المتجر)' };
    }
    if (!f.sig || typeof f.sig !== 'string') {
      return { success: false, message: 'ملف الترخيص غير موقّع' };
    }

    const smbiosHash = getMachineFingerprint();
    if (f.machineId !== smbiosHash) {
      return { success: false, message: 'ملف الترخيص مربوط بجهاز آخر — اطلب ملفاً بنفس معرف هذا الجهاز' };
    }

    const now = Date.now();
    const activatedAt = Number(f.activatedAt) || (Number(f.issuedAt) || now);
    const issuedAt = Number(f.issuedAt) || activatedAt;
    const expiresAt = Number(f.expiresAt) || 0;

    if (activatedAt <= 0 || expiresAt <= 0 || expiresAt <= activatedAt) {
      return { success: false, message: 'مدة الترخيص غير صالحة' };
    }
    // A file "issued in the future" most likely means the sender's clock was
    // wrong, or the customer back-dated their machine clock. Refuse quietly.
    if (issuedAt > now + BACK_TOLERANCE_MS) {
      return { success: false, message: 'ملف الترخيص يحمل وقتاً مستقبلياً — تأكد من تاريخ هذا الجهاز ووقت إصدار الملف' };
    }
    // Issued earlier but already expired is a dead file; accepting it would
    // just freeze the app one boot later with a confusing message.
    if (expiresAt <= now) {
      return { success: false, message: 'انتهت صلاحية ملف الترخيص هذا مسبقاً' };
    }

    if (!_phoneKeys.some((pem) => _verifyPhoneSig(f, pem))) {
      _licLog('PHONE import REJECTED bad-signature store=' + f.storeCode + ' serial=' + f.serial);
      return { success: false, message: 'ملف الترخيص مرفوض — التوقيع غير صالح (ليس صادراً من محرّر الرخص المعتمد)' };
    }

    const prevWm = _loadWatermark();
    const w = Math.max(prevWm.maxTime, now);
    const type = f.type === 'branch' ? 'branch' : 'main';
    const days = Math.max(1, Math.round((expiresAt - activatedAt) / 86400000)) || Number(f.days) || 30;

    const licenseData = {
      keyHash: _hmac('PHONE-OFFLINE', smbiosHash),
      machineId: smbiosHash,
      storeCode: String(f.storeCode),
      activatedAt,
      expiresAt,
      type,
      label: _typeLabel(type, days),
      src: 'phone',
      serial: f.serial ? String(f.serial) : undefined,
      storeName: f.storeName ? String(f.storeName) : undefined,
      w,
    };
    licenseData.sig = _licenseSig(licenseData);
    licenseData.wsig = _wmSig(w, smbiosHash);

    if (!saveLicense(licenseData)) {
      return { success: false, message: 'خطأ في حفظ بيانات التفعيل' };
    }
    saveTimeSnapshot(w);

    _licLog('PHONE import OK store=' + f.storeCode + ' days=' + days + ' until=' + expiresAt + ' serial=' + f.serial);
    return { success: true, message: 'تم التفعيل من محرّر الرخص بنجاح — ' + licenseData.label, license: licenseData };
  } catch (e) {
    _licLog('PHONE import ERROR ' + (e && e.message ? e.message : e));
    return { success: false, message: 'تعذّرت معالجة ملف الترخيص — تأكد أنه ملف .zmtlic سليم' };
  }
}

// Test-only injection point (see renderer/tests/license-phone-test.js): lets the
// suite register an ephemeral public key and validate the full rejection /
// acceptance matrix without mutating the production key list.
function _appendPhoneKey(pem) {
  try {
    _phoneKeys.push(String(pem));
    return true;
  } catch (e) {
    return false;
  }
}

function _phoneKeysSnapshot() {
  return _phoneKeys.slice();
}

function loadLicense() {
  try {
    const p = getLicensePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) { return null; }
}

function saveLicense(data) {
  try {
    fs.writeFileSync(getLicensePath(), JSON.stringify(data), 'utf-8');
    saveLicenseMirror(data);
    return true;
  } catch (e) { return false; }
}

// ===== LICENSE FILE INTEGRITY SIGNATURE =====
// The license file is signed so editing expiresAt (or any field) is detected.
function _sigPayload(license) {
  return [license.machineId, license.activatedAt, license.expiresAt, license.type, license.keyHash].join('|');
}

function _licenseSig(license) {
  return crypto.createHmac('sha256', _deobf(_SSRC)).update(_sigPayload(license)).digest('hex');
}

function _verifyLicenseSig(license) {
  if (!license || typeof license.sig !== 'string') return false;
  return license.sig === _licenseSig(license);
}

function checkLicense() {
  const license = loadLicense();
  if (!license) return { status: 'no_license', valid: false };

  const machineId = getMachineFingerprint();
  // Cloud-issued licenses always carry storeCode. Licenses created by the
  // pre-cloud embedded keys (builds <= 2.1.x) never did, and those keys are
  // retired: such a file is rejected outright, regardless of machine or
  // signature, so no legacy embedded key can ever unlock the app again.
  if (!license.storeCode) {
    return {
      status: 'invalid_legacy',
      valid: false,
      message: 'المفتاح القديم ملغي — استخدم المفتاح الجديد من الموزّع',
    };
  }
  if (license.machineId !== machineId) {
    _licLog('checkLicense machine_mismatch stored=' + license.machineId + ' current=' + machineId);
    return { status: 'machine_mismatch', valid: false, message: 'هذا المفتاح مربوط بجهاز آخر' };
  }

  if (!_verifyLicenseSig(license)) {
    return { status: 'license_tampered', valid: false, message: 'تم اكتشاف تعديل في ملف الترخيص — أعد إدخال مفتاحك للاستمرار' };
  }

  const mirrorConflict = checkLicenseMirror(license);
  if (mirrorConflict) {
    return { status: 'license_tampered', valid: false, message: mirrorConflict.message };
  }

  const now = Date.now();
  const effectiveNow = Math.max(now, _loadWatermark().maxTime);

  if (effectiveNow > license.expiresAt) {
    return { status: 'expired', valid: false, license, message: 'انتهت مدة التفعيل' };
  }

  const remainingMs = license.expiresAt - effectiveNow;
  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

  return {
    status: 'active',
    valid: true,
    license,
    remainingDays,
    remainingMs,
    expiresAt: license.expiresAt,
    showWatermark: remainingDays <= 12,
    urgent: remainingDays <= 3,
  };
}

// ===== TIME-WATERMARK STORAGE =====
// zmt_time.dat shape: { maxTime, machineId, sig } where sig = HMAC(maxTime).
// Legacy files written by older builds ({ lastTime }) are migrated on first read.

function _wmSig(maxTime, machineId) {
  const secret = _deobf(_WMSRC);
  const data = String(maxTime) + '::' + (machineId || '');
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function _verifyWmSig(maxTime, sig, machineId) {
  if (typeof maxTime !== 'number' || typeof sig !== 'string') return false;
  return sig === _wmSig(maxTime, machineId);
}

function loadTimeSnapshot() {
  try {
    const p = getTimePath();
    if (!fs.existsSync(p)) return null;
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (parsed && typeof parsed.maxTime === 'number') {
      return { maxTime: parsed.maxTime, machineId: parsed.machineId || '', sig: parsed.sig || '' };
    }
    if (parsed && typeof parsed.lastTime === 'number') {
      return { legacy: true, maxTime: parsed.lastTime };
    }
    return null;
  } catch (e) { return null; }
}

function saveTimeSnapshot(now) {
  // Only ever advances the watermark; a smaller value is ignored. This is the
  // single write path, so nothing outside the main process can lower the anchor.
  const snap = loadTimeSnapshot();
  const prev = snap ? snap.maxTime : 0;
  _writeTimeFile(Math.max(prev, now));
}

function _writeTimeFile(maxTime) {
  const machineId = getMachineFingerprint();
  const entry = { maxTime, machineId, sig: _wmSig(maxTime, machineId) };
  try {
    fs.writeFileSync(getTimePath(), JSON.stringify(entry), 'utf-8');
  } catch (e) {}
  _embedWatermarkInLicense(maxTime);
}

// Redundant signed copy of W inside the license file. The license's existing
// `sig` payload (machineId|activatedAt|expiresAt|type|keyHash) is unchanged, so
// older licenses stay valid; `w`/`wsig` are optional extra fields.
function _embedWatermarkInLicense(maxTime) {
  try {
    const license = loadLicense();
    if (!license) return;
    const machineId = getMachineFingerprint();
    const updated = { ...license, w: maxTime, wsig: _wmSig(maxTime, machineId) };
    if (updated.sig === _licenseSig(updated)) {
      fs.writeFileSync(getLicensePath(), JSON.stringify(updated), 'utf-8');
    }
  } catch (e) {}
}

// Effective watermark = max(time-file, license copy). A file that exists but has
// an invalid signature (for the current machine) signals tampering. A machineId
// mismatch only happens after the device file is regenerated (fresh re-activation)
// and is ignored rather than deadlocking the flow.
function _loadWatermark() {
  const machineId = getMachineFingerprint();
  let w = 0;
  let valid = true;

  const snap = loadTimeSnapshot();
  if (snap) {
    if (snap.legacy) {
      w = Math.max(w, snap.maxTime);
    } else if (snap.machineId === machineId) {
      if (_verifyWmSig(snap.maxTime, snap.sig, machineId)) {
        w = Math.max(w, snap.maxTime);
      } else {
        valid = false;
      }
    }
  }

  const license = loadLicense();
  if (license && typeof license.w === 'number' && license.machineId === machineId) {
    if (_verifyWmSig(license.w, license.wsig, machineId)) {
      w = Math.max(w, license.w);
    } else if (license.sig && license.sig === _licenseSig(license)) {
      // License itself is legitimate but its embedded watermark was altered.
      valid = false;
    }
  }

  return { maxTime: w, valid };
}

function checkTimeTamper() {
  const now = Date.now();
  const wm = _loadWatermark();

  if (!wm.valid) {
    return {
      tampered: true,
      reason: 'time_file_tampered',
      message: 'تم اكتشاف تعديل في بيانات الوقت المحفوظة — أعد ضبط ساعة الجهاز للوقت الصحيح ثم أعد تشغيل البرنامج',
    };
  }

  if (now < wm.maxTime - BACK_TOLERANCE_MS) {
    return {
      tampered: true,
      reason: 'clock_back',
      message: 'تم اكتشاف تلاعب بالوقت — يبدو أن ساعة الجهاز تم تعديلها للوراء. أعد ضبطها للوقت الحالي الصحيح ثم أعد تشغيل البرنامج',
    };
  }

  // Advance the watermark ALWAYS (even when expired) so the forward-then-back
  // toggle cannot resurrect a license. Forward jumps expire the license at once
  // because expiresAt is absolute, so there is no reason to restrict them here.
  if (now > wm.maxTime) {
    _writeTimeFile(now);
  }

  return { tampered: false, watermark: wm.maxTime, now };
}

function getRemainingTime() {
  const license = loadLicense();
  if (!license) return null;
  const effectiveNow = Math.max(Date.now(), _loadWatermark().maxTime);
  const remaining = license.expiresAt - effectiveNow;
  if (remaining <= 0) return { expired: true, days: 0, hours: 0, minutes: 0 };
  return {
    expired: false,
    days: Math.floor(remaining / 86400000),
    hours: Math.floor((remaining % 86400000) / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    totalMs: remaining,
  };
}

// ===== ONLINE ACTIVATION (Wave 2 — SMBIOS licenses) =====
// The license key is now issued per store by the admin tool and validated by
// the website API (/api/push-trigger action 'license_activate'), which binds it
// to this machine's SMBIOS fingerprint and enforces the store's device limit.
// On success the returned license is stored locally (signed, watermark-protected)
// exactly like before, so the app keeps working fully offline until expiry.
const SITE_URL_DEFAULT = 'https://zmt-website.vercel.app';

function _siteBase() {
  try {
    const p = path.join(_userDataPath, 'zmt_site_url.txt');
    if (fs.existsSync(p)) {
      const url = String(fs.readFileSync(p, 'utf-8') || '').trim();
      if (/^https:\/\/[A-Za-z0-9.-]+/.test(url)) return url.replace(/\/+$/, '');
    }
  } catch (e) {}
  return SITE_URL_DEFAULT;
}

// ===== HTTP TRANSPORT =====
// All license calls go through Electron's `net.request` (Chromium network
// stack) instead of Node's fetch/undici, because Chromium:
//   - honors the OS proxy configuration (Node fetch does NOT),
//   - validates TLS against the Windows certificate store (antivirus /
//     corporate TLS-inspection roots are trusted automatically),
//   - exists on BOTH builds (Electron 22/win7 has no global fetch at all —
//     Node 16 — which made every activation fail with "cannot connect"
//     despite a working internet connection).
// Node's fetch is kept only as a fallback for plain-node environments.
const CONN_TIMEOUT_MS = 15000;

function _electronNet() {
  try {
    const net = require('electron').net;
    return net && typeof net.request === 'function' ? net : null;
  } catch (e) {
    return null;
  }
}

// { url, payload, headers?, timeoutMs? } -> { status, data, raw }
function _httpPost(opts) {
  const url = opts.url;
  const payload = opts.payload || {};
  const headers = opts.headers || {};
  const timeoutMs = opts.timeoutMs || CONN_TIMEOUT_MS;
  const body = JSON.stringify(payload);

  const net = _electronNet();
  if (!net) {
    // Plain-node fallback (tests / unexpected hosts).
    const doFetch = typeof fetch === 'function' ? fetch : null;
    if (!doFetch) {
      return Promise.reject(new Error('لا توجد وسيلة اتصال بالشبكة في هذه البيئة'));
    }
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    return doFetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body,
      signal: ctrl ? ctrl.signal : undefined,
    }).then(async (resp) => {
      if (timer) clearTimeout(timer);
      const text = await resp.text().catch(() => '');
      let data = null;
      try { data = JSON.parse(text); } catch (e) { data = null; }
      return { status: resp.status, data, raw: text };
    }, (err) => {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new Error('انتهت مهلة الاتصال (' + Math.round(timeoutMs / 1000) + ' ثوانٍ)');
      }
      // undici wraps the real reason in err.cause ("fetch failed" is useless).
      const cause = err && err.cause ? err.cause : null;
      const detail = cause && (cause.code || cause.message) ? (cause.code || cause.message) : (err && err.message ? err.message : String(err));
      throw new Error(String(detail));
    });
  }

  return new Promise((resolve, reject) => {
    let req;
    try {
      req = net.request({ method: 'POST', url });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      try { if (typeof req.abort === 'function') req.abort(); } catch (e) {}
      finish(reject, new Error('انتهت مهلة الاتصال (' + Math.round(timeoutMs / 1000) + ' ثوانٍ)'));
    }, timeoutMs);

    req.on('error', (err) => {
      finish(reject, err instanceof Error ? err : new Error(String(err && err.message || err)));
    });
    req.on('response', (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('error', (err) => finish(reject, err instanceof Error ? err : new Error(String(err))));
      resp.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = JSON.parse(raw); } catch (e) { data = null; }
        // Cloud re-anchor: every HTTP reply carries the server's wall clock in
        // the RFC 7231 Date header — a trustworthy "now" that needs no server
        // change. Used to advance the local watermark exactly like a second
        // successfully-bound device would (see activateOnline).
        let serverNow = 0;
        try {
          const hd = resp.headers && resp.headers.date;
          if (typeof hd === 'string') {
            const t = Date.parse(hd);
            if (!isNaN(t)) serverNow = t;
          }
        } catch (e) {}
        finish(resolve, { status: resp.statusCode, data, raw, serverNow });
      });
    });

    try {
      req.setHeader('Content-Type', 'application/json');
      for (const k of Object.keys(headers)) req.setHeader(k, headers[k]);
      req.write(body);
      req.end();
    } catch (e) {
      finish(reject, e instanceof Error ? e : new Error(String(e)));
    }
  });
}

// ===== REQUEST WRAPPER (diagnostics + bounded retries) =====
// `license_activate` is idempotent for a given machine (the server re-uses the
// existing license_devices row for the same smbiosHash), and the server binds
// the device BEFORE replying — so a lost/timed-out response is safely retried.
const ACTIVATE_TIMEOUT_MS = 30000;
const ACTIVATE_RETRIES = 3;
const RETRY_DELAYS_MS = [1500, 3000];
const NET_LOG_FILE = 'zmt_license_net.log';
const NET_LOG_MAX = 512 * 1024;

function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function _isOnlineState() {
  try {
    const net = _electronNet();
    if (net && typeof net.isOnline === 'function') return net.isOnline();
  } catch (e) {}
  return null;
}

// Append-only diagnostics for every license call: action, attempt, timing and
// the raw low-level error. Screenshotting THIS file is enough to diagnose a
// failed activation remotely (it lives next to zmt_license.dat).
function _licLog(msg) {
  try {
    if (!_userDataPath) return;
    const p = path.join(_userDataPath, NET_LOG_FILE);
    try {
      const st = fs.statSync(p);
      if (st.size > NET_LOG_MAX) fs.renameSync(p, p + '.old');
    } catch (e) {}
    const ver = process.versions && process.versions.electron ? process.versions.electron : 'node';
    fs.appendFileSync(
      p,
      new Date().toISOString() + ' electron=' + ver + ' online=' + _isOnlineState() + ' ' + msg + '\n',
      'utf-8'
    );
  } catch (e) {}
}

// { kind, hint } — turns a raw Chromium/Node network error into something the
// shop owner can act on. The raw detail is always kept and surfaced too.
function _classifyConnError(e) {
  // undici hides the real reason in err.cause, and aborts only set `name`.
  const parts = [e && e.message ? e.message : String(e)];
  if (e && e.name === 'AbortError') parts.push('AbortError');
  if (e && e.cause) parts.push(e.cause.code || e.cause.message || '');
  const d = parts.join(' ').toUpperCase();
  const has = (s) => d.indexOf(s) !== -1;
  if (has('CERT_DATE_INVALID') || has('ERR_CERT_DATE_INVALID') || has('CERT_HAS_EXPIRED') ||
      has('CERT_NOT_YET_VALID') || has('ERR_CERT_VALIDITY_TOO_LONG')) {
    return { kind: 'cert-date', hint: 'تاريخ الجهاز غير صحيح أو شهادة الموقع منتهية — عدّل ساعة ويندوز ثم أعد المحاولة' };
  }
  if (has('ERR_CERT') || has('ERR_SSL') || has('SSL_PROTOCOL') || has('SELF_SIGNED') || has('ERR_CLIENT_HELLO')) {
    return { kind: 'cert', hint: 'مشكلة في شهادة الأمان — قد يكون برنامج مكافحة الفيروسات أو جهاز الشبكة يعترض الاتصال' };
  }
  if (has('ABORTERROR') || has('انتهت مهلة') || has('ETIMEDOUT') || has('ERR_TIMED_OUT') ||
      has('ERR_CONNECTION_TIMED_OUT') || has('ESOCKETTIMEDOUT')) {
    return { kind: 'timeout', hint: 'انتهت مهلة الاتصال بالخادم — قد يكون الخادم قد استلم الطلب؛ أعد المحاولة' };
  }
  if (has('ENOTFOUND') || has('EAI_AGAIN') || has('ERR_NAME_NOT_RESOLVED') || has('ERR_NAME_RESOLUTION_FAILED')) {
    return { kind: 'dns', hint: 'تعذّر تحويل عنوان الخادم — تحقق من الشبكة أو من ضبط DNS' };
  }
  if (has('ECONNREFUSED') || has('ECONNRESET') || has('ERR_CONNECTION_REFUSED') || has('ERR_CONNECTION_RESET') ||
      has('ERR_CONNECTION_CLOSED') || has('ERR_CONNECTION_FAILED') || has('ENETUNREACH') || has('EHOSTUNREACH') ||
      has('ERR_INTERNET_DISCONNECTED') || has('ERR_NETWORK_CHANGED') || has('ERR_ADDRESS_UNREACHABLE') ||
      has('ERR_CONNECTION_DISCONNECTED') || has('SOCKET HANG UP')) {
    return { kind: 'offline', hint: 'انقطاع مؤقت في الشبكة' };
  }
  return { kind: 'unknown', hint: '' };
}

// Cert/date failures are deterministic — retrying them only delays the message.
function _isRetryableNetError(e) {
  return _classifyConnError(e).kind !== 'cert-date';
}

// { url, payload, headers?, timeoutMs?, retries? } -> { status, data, raw }
// Retries ONLY transport-level throws; HTTP status replies are returned as-is.
async function _post(action, payload, opts) {
  opts = opts || {};
  const attempts = Math.max(1, opts.retries || 1);
  const timeoutMs = opts.timeoutMs || CONN_TIMEOUT_MS;
  const url = _siteBase() + '/api/push-trigger';
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    const t0 = Date.now();
    try {
      const r = await _httpPost({
        url,
        payload: Object.assign({ action }, payload || {}),
        timeoutMs,
      });
      _licLog('POST ' + action + ' attempt=' + i + '/' + attempts + ' status=' + r.status + ' ms=' + (Date.now() - t0));
      return r;
    } catch (e) {
      lastErr = e;
      const detail = _errDetail(e);
      _licLog('POST ' + action + ' attempt=' + i + '/' + attempts + ' kind=' + _classifyConnError(e).kind +
        ' ms=' + (Date.now() - t0) + ' detail=' + detail);
      if (i < attempts && _isRetryableNetError(e)) {
        await _sleep(RETRY_DELAYS_MS[i - 1] != null ? RETRY_DELAYS_MS[i - 1] : RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

// Is THIS machine already bound to a live license for this store? Used after a
// failed activation so the user is told the truth instead of "no internet".
// Returns { bound, key? }.
async function _probeActivation(code, password) {
  const empty = { bound: false };
  let r;
  try {
    r = await _post('license_status', { code, password }, { retries: 1, timeoutMs: CONN_TIMEOUT_MS });
  } catch (e) {
    return empty;
  }
  if (!r || r.status !== 200 || !r.data || !r.data.ok || !Array.isArray(r.data.licenses)) return empty;
  let fp = '';
  try { fp = getMachineFingerprint(); } catch (e) { return empty; }
  const now = Date.now();
  for (const lic of r.data.licenses) {
    if (!lic || lic.status === 'revoked') continue;
    if (lic.expires_at && Date.parse(lic.expires_at) <= now) continue;
    const devs = Array.isArray(lic.devices) ? lic.devices : [];
    const mine = devs.some((d) => d && String(d.device_smbios_hash || '').toLowerCase() === fp && d.status === 'active');
    if (mine) {
      _licLog('PROBE license_status -> bound key=' + String(lic.key || '').slice(0, 4) + '****');
      return { bound: true, key: lic.key };
    }
  }
  _licLog('PROBE license_status -> NOT bound (licenses=' + r.data.licenses.length + ')');
  return empty;
}

// Full raw reason: undici hides it in err.cause (message alone is "fetch failed").
function _errDetail(e) {
  const bits = [e && e.message ? e.message : String(e)];
  if (e && e.cause && (e.cause.code || e.cause.message)) bits.push(e.cause.code || e.cause.message);
  return bits.join(' / ');
}

// Human-readable network failure: surfaces the classified reason (date/cert/
// timeout/DNS) plus the real low-level detail so the screenshot alone is
// enough to diagnose remotely, and only claims "no internet" when the
// Chromium stack really says the machine is offline.
function _connErrorMessage(e) {
  const detail = _errDetail(e);
  const c = _classifyConnError(e);
  const online = _isOnlineState();
  const site = _siteBase();
  let msg;
  if (c.kind === 'cert-date' || c.kind === 'cert') {
    msg = c.hint + ' (' + detail + ')';
  } else if (online === false) {
    msg = 'لا يوجد اتصال بالإنترنت — تحقق من الشبكة ثم أعد المحاولة (' + detail + ')';
  } else if (c.hint) {
    msg = c.hint + ' (' + detail + ')';
  } else {
    msg = 'لا يمكن الاتصال بالخادم — تحقق من الإنترنت (' + detail + ')';
  }
  if (site !== SITE_URL_DEFAULT) msg += ' — العنوان المخصص: ' + site;
  return msg;
}

function _typeLabel(type, days) {
  switch (type) {
    case 'monthly':
      return 'شهر واحد';
    case 'yearly':
      return 'سنة واحدة';
    case '3years':
      return '3 سنوات';
    default:
      return (days || 30) + ' يوم';
  }
}

// { key, code, password, deviceType } — validates the key server-side and binds
// it to this machine. Returns { success, message, license? }.
async function activateOnline(payload) {
  const key = String(payload?.key || '').trim();
  const code = String(payload?.code || '').trim();
  const password = typeof payload?.password === 'string' ? payload.password : '';
  const deviceType = payload?.deviceType === 'branch' ? 'branch' : 'main';

  if (!key || !code || !password) {
    return { success: false, message: 'أدخل رمز المتجر وكلمة المرور ومفتاح التفعيل' };
  }

  const smbiosHash = getMachineFingerprint();
  const body = { key, code, password, smbiosHash, deviceType };
  _licLog('ACTIVATE begin key=' + key.slice(0, 4) + '**** store=' + code + ' type=' + deviceType +
    ' timeout=' + ACTIVATE_TIMEOUT_MS + ' retries=' + ACTIVATE_RETRIES);
  let result;
  try {
    result = await _post('license_activate', body, { retries: ACTIVATE_RETRIES, timeoutMs: ACTIVATE_TIMEOUT_MS });
  } catch (e) {
    // The request may have REACHED the server even though its reply was lost:
    // the server binds the device BEFORE responding, and re-running
    // license_activate for the same machine re-uses that row (idempotent).
    // So probe the status first and tell the user the truth.
    const probe = await _probeActivation(code, password);
    if (!probe.bound) {
      return { success: false, message: _connErrorMessage(e) };
    }
    try {
      result = await _post('license_activate', body, { retries: 1, timeoutMs: ACTIVATE_TIMEOUT_MS });
    } catch (e2) {
      _licLog('ACTIVATE retry-after-probe FAILED detail=' + (e2 && e2.message ? e2.message : e2));
      return {
        success: false,
        message: 'الخادم يؤكد أن هذا الجهاز مُسجَّل بالفعل، لكن رد التفعيل لم يصل — أعد الضغط على "تفعيل البرنامج" بعد قليل (لن يُخصم المفتاح مرتين). ' + _connErrorMessage(e2),
      };
    }
  }

  if (result.status !== 200 || !result.data || !result.data.ok || !result.data.license) {
    return { success: false, message: result.data?.error || 'فشل التفعيل — حاول مجدداً' };
  }

  const lic = result.data.license;
  const now = Date.now();
  const activatedAt = Date.parse(lic.activatedAt) || now;
  const expiresAt = Date.parse(lic.expiresAt) || now;
  const prevWm = _loadWatermark();
  // Cloud re-anchor: the server's Date header is an independent clock. Advancing
  // the watermark on every successful online activation means a rolled-back
  // clock re-anchors the moment this device goes online again — nothing the
  // attacker can do offline prevents the next successful sync.
  const serverNow = typeof result.serverNow === 'number' && result.serverNow > 0 ? result.serverNow : 0;
  const w = Math.max(prevWm.maxTime, now, serverNow);
  if (serverNow > now) _licLog('ACTIVATE serverNow=' + serverNow + ' (clock re-anchor +' + (serverNow - now) + 'ms)');

  const licenseData = {
    keyHash: _hmac(lic.key, smbiosHash),
    machineId: smbiosHash,
    storeCode: lic.storeCode,
    activatedAt,
    expiresAt,
    type: lic.type,
    label: _typeLabel(lic.type, lic.days),
    w,
  };
  licenseData.sig = _licenseSig(licenseData);
  licenseData.wsig = _wmSig(w, smbiosHash);

  if (!saveLicense(licenseData)) {
    return { success: false, message: 'خطأ في حفظ بيانات التفعيل' };
  }
  saveTimeSnapshot(w);

  return { success: true, message: 'تم التفعيل بنجاح — ' + licenseData.label, license: licenseData };
}

// { code, password } — server-side status for the current store: which license
// keys exist, expiry, and which devices are registered. Used by the UI to show
// the store owner whether their PC is already bound (e.g. after a PC change).
async function checkServerStatus(code, password) {
  try {
    const result = await _post('license_status', { code, password });
    if (result.status === 200 && result.data && result.data.ok) {
      return result.data;
    }
  } catch (e) {}
  return null;
}

// ===== CLOCK SYNC (user-initiated, requires admin UAC) =====
// Fetches server time and attempts to set the local system clock.
// 1) Tries non-elevated: `w32tm /resync /force` (requires Windows Time service running).
// 2) Falls back to elevated PowerShell: `Set-Date -Date '<serverTime>'` (UAC prompt).
// Returns { ok, driftMinutes, serverTime, method, message }.
// The caller should re-run checkTimeTamper() afterwards to confirm the freeze is gone.
// Note: if the watermark W > serverTime (i.e. clock was *ahead* before), syncing the
// clock forward does NOT clear clock_back — the watermark is the true anchor. The
// overlay must explain this explicitly; we do NOT provide any "reset watermark" button.
async function syncSystemClock() {
  // Fetch server time via the same endpoint (license_status returns server Date header)
  let serverNow = 0;
  let serverTimeSource = '';
  try {
    const result = await _post('license_status', { code: '', password: '' }, { timeoutMs: 8000 });
    // _post returns { status, data, raw, serverNow } where serverNow is from Date header
    if (result && typeof result.serverNow === 'number' && result.serverNow > 0) {
      serverNow = result.serverNow;
      serverTimeSource = 'license_status Date header';
    }
  } catch (e) {
    _licLog('SYNC_CLOCK license_status failed: ' + (e && e.message ? e.message : e));
  }
  if (!serverNow) {
    // Fallback: try a lightweight HEAD to the site base (server Date header)
    try {
      const net = _electronNet();
      if (net) {
        await new Promise((resolve, reject) => {
          const req = net.request({ method: 'HEAD', url: _siteBase() });
          req.on('response', (resp) => {
            const hd = resp.headers && resp.headers.date;
            if (typeof hd === 'string') {
              const t = Date.parse(hd);
              if (!isNaN(t)) { serverNow = t; serverTimeSource = 'HEAD Date header'; }
            }
            resolve();
          });
          req.on('error', reject);
          req.end();
        });
      }
    } catch (e) {
      _licLog('SYNC_CLOCK HEAD fallback failed: ' + (e && e.message ? e.message : e));
    }
  }
  if (!serverNow) {
    return { ok: false, driftMinutes: null, serverTime: null, method: 'none', message: 'تعذّر الحصول على وقت الخادم — تحقق من اتصالك بالإنترنت ثم أعد المحاولة' };
  }

  const localNow = Date.now();
  const driftMs = serverNow - localNow;
  const driftMinutes = Math.round(driftMs / 60000);

  // Method 1: w32tm (non-elevated, requires Windows Time service)
  let method = 'none';
  let w32tmOk = false;
  try {
    execFileSync('w32tm.exe', ['/resync', '/force'], { timeout: 10000, windowsHide: true });
    method = 'w32tm';
    w32tmOk = true;
    _licLog('SYNC_CLOCK w32tm /resync /force succeeded');
  } catch (e) {
    _licLog('SYNC_CLOCK w32tm failed: ' + (e && e.message ? e.message : e));
  }

  // Method 2: Elevated PowerShell Set-Date (UAC prompt)
  if (!w32tmOk) {
    try {
      // Use ISO 8601 UTC string for Set-Date - avoids locale/format ambiguity
      const iso = new Date(serverNow).toISOString();
      const psCmd = 'Set-Date -Date \'' + iso + '\'';
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process', 'powershell.exe', '-Verb', 'RunAs', '-ArgumentList', '\'-NoProfile -NonInteractive -Command ' + psCmd.replace(/'/g, "''") + '\''], { timeout: 35000, windowsHide: true });
      method = 'elevated Set-Date';
      _licLog('SYNC_CLOCK elevated Set-Date launched (UAC): ' + iso);
    } catch (e) {
      _licLog('SYNC_CLOCK elevated Set-Date failed: ' + (e && e.message ? e.message : e));
    }
  }

  const message = method === 'none'
    ? 'فشل تصحيح الساعة تلقائيًا. يرجى تصحيح وقت النظام يدويًا: إعدادات → الوقت واللغة → مزامنة الآن، أو من موجه أوامر مسؤول: w32tm /resync /force'
    : 'تم تصحيح ساعة النظام (' + method + '). الانحراف كان ' + Math.abs(driftMinutes) + ' دقيقة.';

  return { ok: method !== 'none', driftMinutes, serverTime: serverNow, method, message, serverTimeSource };
}

// ===== DEACTIVATION (delete the activation key permanently) =====
// { adminSecret? } — deactivates this machine:
//   1. If an admin secret is provided, asks the server to release the device
//      slot (license_release) so the store's device quota frees up.
//   2. Deletes the local signed license file, returning the app to the
//      activation screen.
// The time watermark (zmt_time.dat) is intentionally preserved: it is an
// anti-tamper anchor, not a key, and is required to keep the protection valid
// on a fresh activation.
async function deactivateLicense(payload) {
  const adminSecret = String(payload?.adminSecret || '').trim();
  const license = loadLicense();
  const smbiosHash = getMachineFingerprint();
  let released = false;

  if (license && adminSecret) {
    try {
      const resp = await _httpPost({
        url: _siteBase() + '/api/push-trigger',
        payload: { action: 'license_release', smbiosHash },
        headers: { 'x-zmt-admin': adminSecret },
      });
      released = resp.status === 200 && resp.data && resp.data.ok;
    } catch (e) {
      released = false;
    }
  }

  let deleted = false;
  try {
    const p = getLicensePath();
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      deleted = true;
    }
  } catch (e) {}

  // The hidden mirror anchors offline rollback — leaving it behind would lock
  // the store out after a legitimate re-activation on this same machine.
  _regDel();
  _licLog('DEACTIVATE mirror removed');

  if (!deleted) {
    return { success: false, message: 'لا يوجد مفتاح تفعيل لحذفه' };
  }
  if (adminSecret) {
    return {
      success: true,
      released,
      message: released
        ? 'تم إلغاء التفعيل وتحرير الجهاز وحذف المفتاح نهائياً'
        : 'حُذف المفتاح من الجهاز، لكن تعذّر تحرير الجهاز على الخادم — تحقق من السر الإداري',
    };
  }
  return { success: true, released: false, message: 'تم حذف مفتاح التفعيل نهائياً من هذا الجهاز' };
}

module.exports = {
  setUserDataPath,
  getMachineFingerprint,
  activateOnline,
  checkServerStatus,
  checkLicense,
  checkTimeTamper,
  saveTimeSnapshot,
  getRemainingTime,
  deactivateLicense,
  hardResetDevice,
  importPhoneLicense,
  syncSystemClock,
  // exposed for renderer/tests/*.js only (no production use)
  _testHooks: {
    _post, _connErrorMessage, _classifyConnError, _licLog, _probeActivation, NET_LOG_FILE,
    importPhoneLicense, _phonePayload, _verifyPhoneSig, _appendPhoneKey, _phoneKeysSnapshot, _obfStr,
    _setRegistryBackend, saveLicenseMirror, loadLicenseMirror, checkLicenseMirror,
    _encryptFilePayload, _decryptFilePayload, _mirrorSig, _mirrorPayload,
  },
};
