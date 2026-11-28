// ============================================================
// ZMT PIECE — cloud bridge (main process)
// ------------------------------------------------------------
// Supabase URL/key, the RLS access token and every cloud HTTP request now live
// here. The renderer only sends a validated request descriptor and receives a
// response; it can no longer read credentials from Sources, localStorage or
// the Network tab. A per-window byte/request budget stops a corrupted renderer
// (or a malicious command file) from draining the free Supabase quota.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { app, ipcMain, safeStorage } = require('electron');

const SUPABASE_URL = 'https://dzqiybhpevqoolsmatat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8dlWp7k7vDyZ2CZxa0kG8w_WRN_3yGZ';
const CLOUD_PLACEHOLDER = 'https://cloud.zmt.local';
const SITE_DEFAULT = 'https://zmt-website.vercel.app';

const USER_DATA = app.getPath('userData');
const TOKEN_FILE = path.join(USER_DATA, 'zmt_cloud_token.dat');
const BUDGET_FILE = path.join(USER_DATA, 'zmt_cloud_budget.json');

// Generous ceilings: normal stores never approach them, but a runaway loop is
// stopped long before it can exhaust the free tier.
const BUDGET_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20000;
const MAX_BYTES_OUT_PER_WINDOW = 2 * 1024 * 1024 * 1024;
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 128 * 1024 * 1024;
// Realtime broadcasts are not billed per request, but a compromised renderer
// could still flood the channel. Bound both the message size and the rate.
const MAX_BROADCAST_BYTES = 64 * 1024;
const MAX_BROADCASTS_PER_MINUTE = 300;
let _broadcastWindowStart = Date.now();
let _broadcastCount = 0;

let _token = null; // { token, expiresAt }
try {
  const raw = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  if (raw && raw.token && raw.expiresAt) {
    _token = {
      token: safeStorage && safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(raw.token, 'base64'))
        : Buffer.from(raw.token, 'base64').toString('utf8'),
      expiresAt: raw.expiresAt,
    };
  }
} catch (e) { _token = null; }

function _saveToken() {
  try {
    const payload = _token
      ? {
        token: safeStorage && safeStorage.isEncryptionAvailable()
          ? safeStorage.encryptString(_token.token).toString('base64')
          : Buffer.from(_token.token, 'utf8').toString('base64'),
        expiresAt: _token.expiresAt,
      }
      : {};
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(payload), { mode: 0o600 });
  } catch (e) {
    console.warn('[Cloud] token store failed:', e.message);
  }
}

function validToken() {
  return _token && _token.token && _token.expiresAt > Date.now() + 60 * 1000;
}

function _loadBudget() {
  let b = null;
  try { b = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8')); } catch (e) {}
  const now = Date.now();
  if (!b || !b.windowStart || now - b.windowStart > BUDGET_WINDOW_MS) {
    b = { windowStart: now, requests: 0, bytesOut: 0, bytesIn: 0 };
  }
  return b;
}

let _budget = _loadBudget();

function _saveBudget() {
  try { fs.writeFileSync(BUDGET_FILE, JSON.stringify(_budget), { mode: 0o600 }); } catch (e) {}
}

function _chargeBudget(bytesOut, bytesIn) {
  _budget.requests += 1;
  _budget.bytesOut += bytesOut;
  _budget.bytesIn += bytesIn;
  if ((_budget.requests % 50 === 0) || bytesOut > 1024 * 1024) _saveBudget();
}

function _checkBudget(bytesOut) {
  if (Date.now() - _budget.windowStart > BUDGET_WINDOW_MS) {
    _budget = { windowStart: Date.now(), requests: 0, bytesOut: 0, bytesIn: 0 };
  }
  if (_budget.requests >= MAX_REQUESTS_PER_WINDOW) {
    throw new Error('تم إيقاف المزامنة مؤقتاً لحماية رصيد السحابة المجاني (عدد طلبات مرتفع جداً).');
  }
  if (_budget.bytesOut + bytesOut > MAX_BYTES_OUT_PER_WINDOW) {
    throw new Error('تم إيقاف الرفع مؤقتاً لحماية رصيد السحابة المجاني (حجم بيانات مرتفع جداً).');
  }
  if (bytesOut > MAX_BODY_BYTES) {
    throw new Error('حجم الطلب أكبر من الحد المسموح به.');
  }
}

function _isLanHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const p = h.split('.').map(Number);
    if (p.some(n => n > 255)) return false;
    // Cloud metadata endpoints must never be reachable from the renderer.
    if (p[0] === 169 && p[1] === 254) return false;
    if (p[0] === 127 || p[0] === 10 || p[0] === 0) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  }
  return false;
}

function _siteBase(value) {
  let raw = String(value || SITE_DEFAULT).replace(/\/+$/, '');
  let u;
  try { u = new URL(raw); } catch (e) { throw new Error('رابط خادم الموقع غير صالح'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('رابط الموقع غير مدعوم');
  const lan = _isLanHost(u.hostname);
  // Public endpoints must be HTTPS; plain HTTP is allowed only for an explicit
  // LAN installation of the website (same exception used by open-external).
  if (u.protocol === 'http:' && !lan) throw new Error('رابط الموقع العام يجب أن يكون HTTPS');
  if (!lan && u.hostname !== 'zmt-website.vercel.app' && !u.hostname.endsWith('.vercel.app')) {
    throw new Error('نطاق خادم الموقع غير معروف');
  }
  if (u.username || u.password) throw new Error('رابط الموقع يحتوي على بيانات دخول');
  return raw;
}

function _supabaseTarget(descriptor) {
  let incoming;
  try { incoming = new URL(String(descriptor.url || '')); } catch (e) {
    throw new Error('رابط السحابة غير صالح');
  }
  if (incoming.origin !== CLOUD_PLACEHOLDER) throw new Error('رابط سحابة غير مسموح');
  const pathname = incoming.pathname;
  if (!pathname.startsWith('/') || pathname.indexOf('\\') >= 0 || pathname.indexOf('..') >= 0) {
    throw new Error('مسار السحابة غير صالح');
  }
  const target = new URL(pathname + incoming.search, SUPABASE_URL);
  return target;
}

function requestHttp(target, descriptor, bytes, extraHeaders) {
  return new Promise((resolve, reject) => {
    const client = target.protocol === 'http:' ? http : https;
    const timeout = Math.min(Math.max(Number(descriptor.timeoutMs) || 30000, 1000), 180000);
    const headers = Object.assign({}, descriptor.headers || {}, extraHeaders || {});
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];
    if (bytes && bytes.length) headers['Content-Length'] = bytes.length;
    const req = client.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: target.pathname + target.search,
      method: descriptor.method || 'GET',
      headers,
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy(new Error('استجابة السحابة كبيرة جداً'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        _chargeBudget(bytes ? bytes.length : 0, body.length);
        resolve({
          ok: true,
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers: Object.keys(res.headers || {}).reduce((acc, k) => {
            const v = res.headers[k];
            acc[k] = Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v);
            return acc;
          }, {}),
          bodyBase64: body.toString('base64'),
        });
      });
    });
    req.setTimeout(timeout, () => req.destroy(new Error('انتهت مهلة الاتصال بالسحابة')));
    req.on('error', (e) => {
      if (!_budget || _budget.requests === 0) _saveBudget();
      reject(e);
    });
    if (bytes && bytes.length) req.write(bytes);
    req.end();
  });
}

async function obtainToken(args) {
  const site = _siteBase(args && args.siteBase);
  const code = String((args && args.code) || '');
  const password = String((args && args.password) || '');
  const parent = String((args && args.parentCode) || '');
  if (!code || !password) return { ok: false, reason: 'رمز المحل أو كلمة المرور غير متوفرة' };
  const body = Buffer.from(JSON.stringify({
    action: 'token', mode: 'auth', code, password, parentCode: parent || undefined,
  }), 'utf8');
  try {
    _checkBudget(body.length);
    const res = await requestHttp(new URL(site + '/api/push-trigger'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    }, body, { 'Content-Type': 'application/json' });
    let data = null;
    try { data = JSON.parse(Buffer.from(res.bodyBase64, 'base64').toString('utf8')); } catch (e) {}
    if (res.status < 200 || res.status >= 300 || !data || !data.token) {
      return { ok: false, reason: (data && data.error) || ('الخادم رفض الطلب (' + res.status + ')') };
    }
    _token = { token: String(data.token), expiresAt: Number(data.expiresAt) || (Date.now() + 3600000) };
    _saveToken();
    return { ok: true, expiresAt: _token.expiresAt };
  } catch (e) {
    return { ok: false, reason: 'تعذر الوصول لخادم المصادقة: ' + (e && e.message ? e.message : String(e)) };
  }
}

// Supabase Realtime broadcast is kept alive in this process with the real key.
// It is best-effort: failure never affects the local application.
let _realtimeClient = null;
const _realtimeChannels = {};
async function broadcast(payload) {
  try {
    let size;
    try { size = JSON.stringify(payload || {}).length; } catch (e) { return; }
    if (size > MAX_BROADCAST_BYTES) return;
    const now = Date.now();
    if (now - _broadcastWindowStart >= 60000) {
      _broadcastWindowStart = now;
      _broadcastCount = 0;
    }
    if (_broadcastCount >= MAX_BROADCASTS_PER_MINUTE) return;
    _broadcastCount += 1;
    if (!_realtimeClient) {
      const { createClient } = require('@supabase/supabase-js');
      _realtimeClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } },
      });
    }
    const name = String((payload && payload.channel) || 'zmt-live-global');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(name)) return;
    if (!_realtimeChannels[name]) {
      const ch = _realtimeClient.channel(name, { config: { broadcast: { self: false } } });
      ch.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') delete _realtimeChannels[name];
      });
      _realtimeChannels[name] = ch;
    }
    const message = Object.assign({}, payload || {});
    delete message.channel;
    const p = _realtimeChannels[name].send({ type: 'broadcast', event: 'desktop-change', payload: message });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {
    console.warn('[Cloud] realtime broadcast skipped:', e.message);
  }
}

function register() {
  ipcMain.handle('cloud-token-status', async () => ({
    ok: true, valid: !!validToken(), expiresAt: _token ? _token.expiresAt : 0,
  }));

  ipcMain.handle('cloud-token-obtain', async (_event, args) => obtainToken(args));

  ipcMain.handle('cloud-token-store', async (_event, token, expiresAt) => {
    if (!token) { _token = null; } else {
      _token = { token: String(token), expiresAt: Number(expiresAt) || (Date.now() + 3600000) };
    }
    _saveToken();
    return { ok: true, valid: !!validToken() };
  });

  ipcMain.handle('cloud-token-clear', async () => { _token = null; _saveToken(); return { ok: true }; });

  ipcMain.handle('cloud-broadcast', async (_event, payload) => { await broadcast(payload); return { ok: true }; });

  ipcMain.handle('cloud-budget', async () => ({
    ok: true,
    windowStart: _budget.windowStart,
    requests: _budget.requests,
    bytesOut: _budget.bytesOut,
    bytesIn: _budget.bytesIn,
  }));

  ipcMain.handle('cloud-request', async (_event, descriptor) => {
    const d = descriptor || {};
    const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
    const method = String(d.method || 'GET').toUpperCase();
    if (ALLOWED_METHODS.indexOf(method) < 0) return { ok: false, error: 'طريقة طلب غير مسموحة' };
    d.method = method;
    let body = Buffer.alloc(0);
    if (d.bodyBase64) {
      try { body = Buffer.from(d.bodyBase64, 'base64'); } catch (e) { return { ok: false, error: 'جسم الطلب غير صالح' }; }
    }
    try {
      _checkBudget(body.length);
      if (d.scope === 'supabase') {
        const target = _supabaseTarget(d);
        const auth = validToken() ? _token.token : SUPABASE_KEY;
        const headers = Object.assign({}, d.headers || {}, {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + auth,
        });
        return await requestHttp(target, d, body, headers);
      }
      if (d.scope === 'site') {
        const base = _siteBase(d.siteBase);
        let target;
        try { target = new URL(String(d.url || '')); } catch (e) {
          return { ok: false, error: 'رابط الموقع غير صالح' };
        }
        if (target.origin !== new URL(base).origin) return { ok: false, error: 'رابط موقع غير مسموح' };
        if (target.username || target.password) return { ok: false, error: 'رابط الموقع يحتوي على بيانات دخول' };
        return await requestHttp(target, d, body, {});
      }
      return { ok: false, error: 'نوع طلب السحابة غير معروف' };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
}

module.exports = { register, validToken, SUPABASE_URL, SUPABASE_KEY, CLOUD_PLACEHOLDER, SITE_DEFAULT };
