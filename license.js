const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENSE_FILE = 'zmt_license.dat';
const TIME_FILE = 'zmt_time.dat';
const DEVICE_FILE = 'zmt_device.dat';

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
function getMachineFingerprint() {
  try {
    const p = getDevicePath();
    if (fs.existsSync(p)) {
      const existing = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (existing && typeof existing.deviceId === 'string' && existing.deviceId.length >= 16) {
        return existing.deviceId;
      }
    }
    const deviceId = crypto.randomBytes(16).toString('hex');
    if (_userDataPath) {
      fs.mkdirSync(_userDataPath, { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ deviceId }), 'utf-8');
    }
    return deviceId;
  } catch (e) {
    // Disk unavailable fallback: keep one ID for this process lifetime
    if (!_memoryDeviceId) _memoryDeviceId = crypto.randomBytes(16).toString('hex');
    return _memoryDeviceId;
  }
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

function _hmac(key, machineId) {
  const secret = _deobf(_KSRC);
  const data = key.toUpperCase().trim() + '::' + machineId;
  return crypto.createHmac('sha512', secret).update(data).digest('hex');
}

const _VALID_KEYS_SRC = [
  { enc: '6b01f4b52b6b01f4b52b747088cc',        type: 'monthly', days: 30,   label: 'شهر واحد' },
  { enc: '0e728fc44c007695b828747088cc',        type: 'yearly',  days: 365,  label: 'سنة واحدة' },
  { enc: '0e728fc44c007695b82a1a',              type: '3years',  days: 1095, label: '3 سنوات' },
];

const VALID_KEYS = {};
for (const src of _VALID_KEYS_SRC) {
  VALID_KEYS[_deobf(src.enc)] = src;
}

function validateKey(key) {
  const norm = key.toUpperCase().trim();
  const machineId = getMachineFingerprint();
  const incomingHash = _hmac(norm, machineId);

  for (const [validKey, meta] of Object.entries(VALID_KEYS)) {
    const expectedHash = _hmac(validKey, machineId);
    if (expectedHash === incomingHash) {
      return { valid: true, ...meta, key: validKey, hash: incomingHash };
    }
  }
  return { valid: false };
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

function activate(key) {
  const result = validateKey(key);
  if (!result.valid) return { success: false, message: 'مفتاح التفعيل غير صالح' };

  const now = Date.now();
  if (now < BUILD_TS - 5 * 60 * 1000) {
    return {
      success: false,
      message: 'ساعة الجهاز أقدم من تاريخ إصدار البرنامج — صحّح التاريخ والوقت ثم أعد المحاولة',
    };
  }

  // Preserve the watermark: re-activating (new key) must NOT reset the anchor,
  // otherwise rolling the clock back and re-entering a key would cheat expiry.
  const prevWm = _loadWatermark();
  const w = Math.max(prevWm.maxTime, now);

  const licenseData = {
    keyHash: result.hash,
    machineId: getMachineFingerprint(),
    activatedAt: now,
    expiresAt: now + (result.days * 24 * 60 * 60 * 1000),
    type: result.type,
    label: result.label,
    w,
  };
  licenseData.sig = _licenseSig(licenseData);
  licenseData.wsig = _wmSig(w, licenseData.machineId);

  if (!saveLicense(licenseData)) {
    return { success: false, message: 'خطأ في حفظ بيانات التفعيل' };
  }

  saveTimeSnapshot(w);
  return { success: true, message: 'تم التفعيل بنجاح — ' + result.label, license: licenseData };
}

function checkLicense() {
  const license = loadLicense();
  if (!license) return { status: 'no_license', valid: false };

  const machineId = getMachineFingerprint();
  if (license.machineId !== machineId) {
    return { status: 'machine_mismatch', valid: false, message: 'هذا المفتاح مربوط بجهاز آخر' };
  }

  if (!_verifyLicenseSig(license)) {
    return { status: 'license_tampered', valid: false, message: 'تم اكتشاف تعديل في ملف الترخيص — أعد إدخال مفتاحك للاستمرار' };
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

module.exports = {
  setUserDataPath,
  getMachineFingerprint,
  activate,
  checkLicense,
  checkTimeTamper,
  saveTimeSnapshot,
  getRemainingTime,
  validateKey,
};
