// ============================================================
// ZMT PIECE — AI credentials + inference bridge (main process)
// ------------------------------------------------------------
// API keys are encrypted with Electron safeStorage (DPAPI/Keychain on the
// machine) and never handed to the renderer. The renderer builds the prompt;
// this module adds the secret and performs the HTTPS call itself, so the key
// cannot be read from DevTools, localStorage or the Network tab.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { app, ipcMain, safeStorage } = require('electron');

const STORE_PATH = path.join(app.getPath('userData'), 'zmt_ai_keys.dat');
const BASE_URL_PATH = path.join(app.getPath('userData'), 'zmt_ai_base_url.json');
const _keys = (() => {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
})();

function _persist() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(_keys), { mode: 0o600 });
  } catch (e) {
    console.warn('[AI] could not persist key store:', e.message);
  }
}

function _cleanProvider(provider) {
  return String(provider || '').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
}

// The custom endpoint is security-sensitive: the API key is attached to it in
// this process. If the page were allowed to choose the URL on every call, an
// injected script could point it at its own server and steal the key. Only the
// base URL explicitly saved in settings (main-owned file) is ever used.
function _validBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  let u;
  try { u = new URL(value.trim().replace(/\/+$/, '')); } catch (e) { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password) return '';
  return u.toString().replace(/\/+$/, '');
}

let _baseUrl = '';
try {
  const saved = JSON.parse(fs.readFileSync(BASE_URL_PATH, 'utf8'));
  _baseUrl = _validBaseUrl(saved && saved.url);
} catch (e) { _baseUrl = ''; }

function _saveBaseUrl(value) {
  _baseUrl = _validBaseUrl(value);
  try {
    fs.writeFileSync(BASE_URL_PATH, JSON.stringify({ url: _baseUrl }), { mode: 0o600 });
  } catch (e) {
    console.warn('[AI] could not persist base URL:', e.message);
  }
  return _baseUrl;
}

function putKey(provider, value) {
  const key = _cleanProvider(provider);
  if (!key) return false;
  if (!value) {
    delete _keys[key];
  } else if (safeStorage && safeStorage.isEncryptionAvailable()) {
    _keys[key] = safeStorage.encryptString(String(value)).toString('base64');
  } else {
    // Without OS encryption still keep an encoded file, never plaintext.
    _keys[key] = { none: true, value: Buffer.from(String(value), 'utf8').toString('base64') };
  }
  _persist();
  return true;
}

function hasKey(provider) {
  const key = _cleanProvider(provider);
  return !!(key && _keys[key]);
}

function readKey(provider) {
  const key = _cleanProvider(provider);
  const stored = key ? _keys[key] : null;
  if (!stored) return '';
  try {
    if (stored && stored.none) return Buffer.from(stored.value, 'base64').toString('utf8');
    const buf = Buffer.from(stored, 'base64');
    return safeStorage && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : '';
  } catch (e) {
    return '';
  }
}

function removeKey(provider) {
  putKey(provider, '');
}

const PROVIDERS = {
  gemini: {
    endpoint(model) { return 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent'; },
    auth(key) { return { query: { key } }; },
    headers() { return { 'Content-Type': 'application/json' }; },
  },
  openai: {
    endpoint() { return 'https://api.openai.com/v1/chat/completions'; },
    auth(key) { return { headers: { Authorization: 'Bearer ' + key } }; },
    headers() { return { 'Content-Type': 'application/json' }; },
  },
  kimi: {
    endpoint() { return 'https://api.moonshot.ai/v1/chat/completions'; },
    auth(key) { return { headers: { Authorization: 'Bearer ' + key } }; },
    headers() { return { 'Content-Type': 'application/json' }; },
  },
  groq: {
    endpoint() { return 'https://api.groq.com/openai/v1/chat/completions'; },
    auth(key) { return { headers: { Authorization: 'Bearer ' + key } }; },
    headers() { return { 'Content-Type': 'application/json' }; },
  },
  custom: {
    endpoint(_model, baseUrl) {
      const base = String(baseUrl || '').replace(/\/+$/, '');
      return base ? base + '/chat/completions' : '';
    },
    auth(key) { return { headers: { Authorization: 'Bearer ' + key } }; },
    headers() { return { 'Content-Type': 'application/json' }; },
  },
};

function requestJson(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(url); } catch (e) { return reject(new Error('رابط AI غير صالح')); }
    if (target.protocol !== 'https:') return reject(new Error('فقط روابط HTTPS مسموحة لخدمة AI'));
    if (target.username || target.password) return reject(new Error('رابط AI يحتوي على بيانات دخول'));
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request({
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      method: 'POST',
      headers: Object.assign({}, headers, { 'Content-Length': payload.length }),
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) {
          req.destroy(new Error('استجابة AI كبيرة جداً'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(Math.min(Math.max(timeoutMs || 120000, 5000), 180000), () => {
      req.destroy(new Error('Timeout'));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function register() {
  ipcMain.handle('ai-set-key', async (_event, provider, key) => ({ ok: putKey(provider, key) }));
  ipcMain.handle('ai-clear-key', async (_event, provider) => { removeKey(provider); return { ok: true }; });
  ipcMain.handle('ai-has-key', async (_event, provider) => ({ ok: true, configured: hasKey(provider) }));
  ipcMain.handle('ai-set-base-url', async (_event, url) => ({ ok: true, url: _saveBaseUrl(url) }));
  ipcMain.handle('ai-get-base-url', async () => ({ ok: true, url: _baseUrl }));
  ipcMain.handle('ai-migrate-key', async (_event, provider, legacyKey) => {
    if (!hasKey(provider) && legacyKey) putKey(provider, legacyKey);
    return { ok: true };
  });

  ipcMain.handle('ai-call', async (_event, request) => {
    const req = request || {};
    const provider = _cleanProvider(req.provider);
    const cfg = PROVIDERS[provider];
    if (!cfg) return { ok: false, msg: 'مزود AI غير معروف: ' + provider };
    const key = readKey(provider);
    if (!key) return { ok: false, msg: 'no_key' };
    if (!req.body || typeof req.body !== 'object') return { ok: false, msg: 'طلب AI غير صالح' };
    const model = String(req.model || '');
    if (!model || model.length > 120 || /[\\\?\#]|(?:\.\.)/.test(model)) {
      return { ok: false, msg: 'نموذج AI غير صالح' };
    }
    let bodySize;
    try { bodySize = Buffer.byteLength(JSON.stringify(req.body), 'utf8'); } catch (e) {
      return { ok: false, msg: 'طلب AI غير صالح' };
    }
    if (bodySize > 2 * 1024 * 1024) return { ok: false, msg: 'طلب AI كبير جداً' };
    let endpoint;
    try {
      // `req.baseUrl` is deliberately ignored: only the settings-saved value
      // may receive the stored key.
      endpoint = cfg.endpoint(model, provider === 'custom' ? _baseUrl : '');
    } catch (e) {
      return { ok: false, msg: e.message };
    }
    if (!endpoint) return { ok: false, msg: 'رابط AI غير مضبوط' };
    const auth = cfg.auth(key);
    const url = auth.query
      ? endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') +
        Object.keys(auth.query).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(auth.query[k])).join('&')
      : endpoint;
    const headers = Object.assign({}, cfg.headers(), auth.headers || {});
    try {
      const res = await requestJson(url, headers, req.body, req.timeoutMs);
      if (res.status >= 200 && res.status < 300) return { ok: true, text: res.text };
      let msg = res.text;
      try {
        const parsed = JSON.parse(res.text);
        msg = (parsed && parsed.error && parsed.error.message) || JSON.stringify(parsed);
      } catch (e) {}
      return { ok: false, status: res.status, msg: String(msg).slice(0, 2000) };
    } catch (e) {
      return { ok: false, msg: 'Network error: ' + (e && e.message ? e.message : String(e)) };
    }
  });
}

module.exports = { register, putKey, hasKey, readKey, removeKey };
