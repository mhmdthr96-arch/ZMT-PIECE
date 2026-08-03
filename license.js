const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENSE_FILE = 'zmt_license.dat';
const TIME_FILE = 'zmt_time.dat';
const DEVICE_FILE = 'zmt_device.dat';

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
  const licenseData = {
    keyHash: result.hash,
    machineId: getMachineFingerprint(),
    activatedAt: now,
    expiresAt: now + (result.days * 24 * 60 * 60 * 1000),
    type: result.type,
    label: result.label,
  };
  licenseData.sig = _licenseSig(licenseData);

  if (!saveLicense(licenseData)) {
    return { success: false, message: 'خطأ في حفظ بيانات التفعيل' };
  }

  saveTimeSnapshot(now);
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
  if (now > license.expiresAt) {
    return { status: 'expired', valid: false, license, message: 'انتهت مدة التفعيل' };
  }

  const remainingMs = license.expiresAt - now;
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

function saveTimeSnapshot(now) {
  try {
    fs.writeFileSync(getTimePath(), JSON.stringify({ lastTime: now }), 'utf-8');
  } catch (e) {}
}

function loadTimeSnapshot() {
  try {
    const p = getTimePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) { return null; }
}

function checkTimeTamper() {
  const snapshot = loadTimeSnapshot();
  if (!snapshot) return { tampered: false };

  const now = Date.now();
  const lastTime = snapshot.lastTime;

  if (now < lastTime - 60000) {
    return {
      tampered: true,
      reason: 'clock_back',
      message: 'تم اكتشاف تلاعب بالوقت — يبدو أن ساعة الجهاز تم تعديلها للوراء',
    };
  }

  const license = loadLicense();
  if (license && license.expiresAt && now > license.expiresAt) {
    return { tampered: false };
  }

  saveTimeSnapshot(now);
  return { tampered: false };
}

function getRemainingTime() {
  const license = loadLicense();
  if (!license) return null;
  const remaining = license.expiresAt - Date.now();
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
