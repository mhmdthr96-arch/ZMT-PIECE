// ============================================================================
// ZMT PIECE — LOCAL PHONE BARCODE SCANNER (PWA over HTTPS/WSS on the shop LAN)
// ============================================================================
// Turns any phone on the same network into a wireless barcode scanner that
// feeds the SAME decoded text the wired USB/HID scanner types. Flow:
//
//   1. The app generates a local CA + server certificate in pure JavaScript
//      (no admin, no PowerShell, no cert store) and serves a bundled PWA over
//      HTTPS on a port inside the existing firewall range (4512-4521).
//   2. The settings page shows a QR code of https://<local-ip>:<port>.
//   3. The phone opens the PWA, POSTs /api/pair { deviceId, deviceName }.
//   4. Electron shows an approval modal: Always / This-session / Refuse.
//   5. On approval the phone receives a pairing token and opens WSS /ws.
//   6. Scanned codes arrive as { type:'scan', code } and are forwarded to the
//      focused renderer window, which inserts them into the active barcode
//      field just like a physical scanner (Enter keydown path).
//
// Security model: every WS connection must present a valid token; a "Always"
// device keeps a persistent token across app restarts, a "session" token lives
// only in RAM. The HTTP layer is rate limited and only touches the renderer
// through the approval modal — a remote device can never read local data.
// ============================================================================

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

// Loaded defensively so a packaging problem can never crash the whole app on
// startup — certificate features simply report an error instead.
let PhoneCert = null;
try { PhoneCert = require('./phone-cert'); } catch (e) { PhoneCert = null; }

// ---- wire into the main window like the LAN module -------------------------

let _getWindow = null;
function setWindowGetter(fn) { _getWindow = fn; }
function getWin() { return _getWindow ? _getWindow() : null; }
function sendToRenderer(channel, payload) {
  const w = getWin();
  if (w && !w.isDestroyed()) {
    try { w.webContents.send(channel, payload); } catch (e) {}
  }
}

// ---- configuration ----------------------------------------------------------

// Ports are tried in order (all inside the existing firewall range 4512-4521,
// so no extra UAC prompt); the first free one is used and shown in the QR link.
let _port = 4520;
const PORT_CANDIDATES = [4520, 4519, 4518, 4517, 4516, 4515, 4514, 4513, 4512];
const PAIR_TIMEOUT_MS = 120000;                       // hold a pending /api/pair
const RATE_WINDOW_MS = 60000;                         // per-IP pair rates
const RATE_MAX = 10;                                  // max pair hits / minute / IP

let _userDataDir = '';
let _server = null;
let _wss = null;
let _status = 'stopped';                              // stopped | starting | running | error
let _statusError = '';

// Approval flow state
let _pendingApprovals = new Map();                    // requestId -> { resolve, deviceId, deviceName, ip, timer }
let _approvalCounter = 0;

// Security tokens
let _tokens = new Map();                              // token -> { deviceId, deviceName, permanent }
let _rateBuckets = new Map();                         // ip -> [timestamps]

// Live WebSocket sessions (for the "connected devices" badge)
let _clients = new Map();                             // ws -> { deviceId, deviceName, token, sell }

// Phone POS ("البيع") state
let _saleEnabled = false;
let _pendingPhoneReqs = new Map();                    // requestId -> { ws, timer }
const SALE_REQ_TIMEOUT_MS = 30000;

function setUserDataDir(dir) { _userDataDir = dir; }

// ---- small pieces of state that must be read out ---------------------------

function getLocalIps() {
  if (PhoneCert) return PhoneCert.getLocalIps();
  const os = require('os');
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) out.push(iface.address);
    }
  }
  return out;
}

function statusPayload() {
  const details = PhoneCert ? PhoneCert.getIpDetails() : [];
  const ips = details.length ? details.map((d) => d.ip) : getLocalIps();
  return {
    status: _status,
    error: _statusError,
    port: _port,
    ip: ips[0] || '127.0.0.1',
    ips,
    ipOptions: details.map((d) => ({ ip: d.ip, name: d.name, virtual: !!d.virtual })),
    https: true,
    saleEnabled: _saleEnabled,
    clients: _clients.size,
    connected: Array.from(_clients.values()).map((c) => ({ name: c.deviceName, id: c.deviceId, sell: !!c.sell })),
  };
}

// ---- certificate store paths ------------------------------------------------

function certFiles() {
  const dir = _userDataDir;
  return {
    meta: path.join(dir, 'phone-scanner-meta.json'),
    pfx: path.join(dir, 'phone-server.pfx'),
    pfxPass: path.join(dir, 'phone-server-pass.txt'),
    ca: path.join(dir, 'phone-ca.crt'),
  };
}

// Cached PFX/pass so isRunning server can be re-created fast
let _pfxCache = null;
let _pfxPassCache = '';

// ---- certificate material (pure-JS, works on every Windows version) --------
// Delegated to phone-cert.js — no PowerShell, no admin, no PKI dependency.

// Ensure the CA + server cert exist for the current LAN IP set and cache the
// PFX material so an already-running server can be rebuilt fast.
async function ensureCert() {
  if (!PhoneCert) {
    _pfxCache = null;
    _pfxPassCache = '';
    return { success: false, error: 'CERT_ENGINE_MISSING' };
  }
  const r = PhoneCert.ensureCert(_userDataDir);
  if (!r || !r.success) {
    _pfxCache = null;
    _pfxPassCache = '';
    return { success: false, error: (r && r.error) || 'cert_generation_failed' };
  }
  _pfxCache = r.pfx;
  _pfxPassCache = r.pass;
  return { success: true };
}

// ---- persistent approved devices -------------------------------------------

function approvedStore() {
  return path.join(_userDataDir, 'phone-scanner.json');
}

function loadApproved() {
  try {
    const arr = JSON.parse(fs.readFileSync(approvedStore(), 'utf8'));
    if (Array.isArray(arr)) return arr;
  } catch (e) {}
  return [];
}

function saveApproved(list) {
  try { fs.writeFileSync(approvedStore(), JSON.stringify(list, null, 2), 'utf8'); } catch (e) {}
}

function loadTokens() {
  // restore persistent tokens into the live map at startup
  for (const d of loadApproved()) {
    if (d.token) _tokens.set(d.token, { deviceId: d.deviceId, deviceName: d.deviceName, permanent: true, sell: d.sell !== false });
  }
}

// ---- phone POS (sale) enable flag + per-device sell permission -----------

// Legacy devices (approved before the sale feature) are sell-enabled by default;
// the operator can switch this per device in the connection page.
function deviceSellOf(deviceId) {
  const d = loadApproved().find((x) => x.deviceId === deviceId);
  if (d) return d.sell !== false;
  return true;
}

function setSaleEnabled(enabled) {
  _saleEnabled = !!enabled;
  try { fs.writeFileSync(saleStore(), JSON.stringify({ enabled: _saleEnabled, updatedAt: Date.now() }), 'utf8'); } catch (e) {}
  sendToRenderer('phs-status', statusPayload());
  return _saleEnabled;
}

function getSaleEnabled() { return _saleEnabled; }

function saleStore() {
  return path.join(_userDataDir, 'phone-sales.json');
}

function loadSaleEnabled() {
  try {
    const j = JSON.parse(fs.readFileSync(saleStore(), 'utf8'));
    _saleEnabled = !!j.enabled;
  } catch (e) { _saleEnabled = false; }
  return _saleEnabled;
}

// Per-device sell toggle. Works for both approved (persisted) and current
// session tokens; the live WS client is told immediately so its UI can react.
function setDeviceSell(deviceId, sell) {
  const approved = loadApproved();
  const d = approved.find((x) => x.deviceId === deviceId);
  if (d) {
    d.sell = !!sell;
    saveApproved(approved);
  }
  for (const [token, v] of _tokens) {
    if (v.deviceId === deviceId) { v.sell = !!sell; _tokens.set(token, v); }
  }
  for (const [ws, c] of _clients) {
    if (c.deviceId === deviceId) {
      c.sell = !!sell;
      _clients.set(ws, c);
      try { ws.send(JSON.stringify({ type: 'sell' + (sell ? 'on' : 'off') })); } catch (e) {}
    }
  }
  broadcastClients();
  return { success: true };
}

function getDeviceSell(deviceId) { return { success: true, data: { deviceId, sell: deviceSellOf(deviceId) } }; }

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

// ---- approving a pairing ----------------------------------------------------

function approveDevice(deviceId, deviceName, mode) {
  if (mode === 'always') {
    const token = makeToken();
    const list = loadApproved().filter((d) => d.deviceId !== deviceId);
    list.push({ deviceId, deviceName, token, sell: true, createdAt: new Date().toISOString() });
    saveApproved(list);
    _tokens.set(token, { deviceId, deviceName, permanent: true, sell: true });
    return { status: 'approved', mode: 'always', token };
  }
  // 'session' — token lives in RAM until app exit
  const token = makeToken();
  _tokens.set(token, { deviceId, deviceName, permanent: false, sell: true });
  return { status: 'approved', mode: 'session', token };
}

function denyDevice(deviceId) {
  const list = loadApproved().filter((d) => d.deviceId !== deviceId);
  saveApproved(list); // also unbind a previously-approved device if present
  for (const [token, v] of _tokens) {
    if (v.deviceId === deviceId) { _tokens.delete(token); break; }
  }
  return { status: 'denied' };
}

// ---- HTTP layer -------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.crt': 'application/x-x509-ca-cert',
  '.txt': 'text/plain; charset=utf-8',
};

function rateLimited(ip) {
  const now = Date.now();
  const arr = (_rateBuckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) return true;
  arr.push(now);
  _rateBuckets.set(ip, arr);
  return false;
}

function readStatic(reqPath) {
  // /sale/* serves the phone POS PWA; anything else is the scanner app.
  const isSale = reqPath === '/sale' || reqPath.startsWith('/sale/');
  const root = path.join(__dirname, 'renderer', isSale ? 'phone-sales' : 'phone-scanner');
  let rel = decodeURIComponent(reqPath.replace(/^\/+/, ''));
  if (isSale) rel = rel.replace(/^sale\/?/, '');
  if (!rel) rel = 'index.html';
  rel = rel.replace(/^\/+/, '');
  if (rel.includes('\0')) return null;
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(root)) return null;
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  return p;
}

function handlePair(req, res) {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (rateLimited(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', error: 'rate_limited' }));
    return;
  }
  let body = '';
  req.on('data', (d) => { body += d; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    let deviceId = '', deviceName = '';
    try {
      const j = JSON.parse(body || '{}');
      deviceId = String(j.deviceId || '').slice(0, 64);
      deviceName = String(j.deviceName || 'Phone').slice(0, 64);
    } catch (e) {}
    if (!deviceId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', error: 'missing_device_id' }));
      return;
    }
    // Persistent devices are approved instantly (no modal spam on reconnect).
    const approved = loadApproved().find((d) => d.deviceId === deviceId);
    if (approved && approved.token && _tokens.has(approved.token)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'approved', mode: 'always', token: approved.token }));
      return;
    }
    // Fresh device -> wait for the operator's decision in the modal.
    const requestId = 'pr-' + (++_approvalCounter) + '-' + Date.now().toString(36);
    let done = false;
    const finish = (payload) => { if (done) return; done = true; clearTimeout(timer); _pendingApprovals.delete(requestId); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); };
    const timer = setTimeout(() => finish({ status: 'timeout' }), PAIR_TIMEOUT_MS);
    _pendingApprovals.set(requestId, { deviceId, deviceName, ip, finish });
    sendToRenderer('phs-pair-request', { requestId, deviceId, deviceName, ip });
  });
}

function handleCert(req, res) {
  const c = certFiles();
  if (!fs.existsSync(c.ca)) { res.writeHead(404); res.end('not found'); return; }
  const buf = fs.readFileSync(c.ca);
  const total = buf.length;
  const base = {
    'Content-Type': 'application/octet-stream', // plain save; do not hand off to Android's cert installer mid-download
    'Content-Disposition': 'attachment; filename="ZMT-PHONE-CA.crt"',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  // Android's download manager requires Content-Length and a real 206 reply on
  // resume. Without them the progress bar waits forever and "Resume" loops.
  const range = (req.headers && req.headers.range) || '';
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m) {
    let start = m[1] === '' ? Math.max(0, total - parseInt(m[2] || '0', 10)) : parseInt(m[1], 10);
    let end = m[2] === '' ? total - 1 : (m[1] === '' ? total - 1 : parseInt(m[2], 10));
    if (isNaN(start) || isNaN(end) || start < 0 || end < start || start >= total) {
      res.writeHead(416, Object.assign({}, base, { 'Content-Range': 'bytes */' + total }));
      res.end();
      return;
    }
    end = Math.min(end, total - 1);
    const part = buf.slice(start, end + 1);
    res.writeHead(206, Object.assign({}, base, {
      'Content-Length': part.length,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
    }));
    res.end(part);
    return;
  }
  res.writeHead(200, Object.assign({}, base, { 'Content-Length': total }));
  res.end(buf);
}

// Serve the CA install guide with the certificate embedded in the HTML itself.
// Android DownloadManager does not inherit Chrome's "proceed anyway" exception,
// so an inline copy is the reliable path — no second network request at all.
function handleCertHelp(res) {
  const c = certFiles();
  const page = path.join(__dirname, 'renderer', 'phone-scanner', 'cert-help.html');
  let html = fs.existsSync(page) ? fs.readFileSync(page, 'utf8') : '<html lang="ar"><body>صفحة الدليل غير متوفرة.</body></html>';
  const pem = (fs.existsSync(c.ca) ? fs.readFileSync(c.ca, 'utf8') : '').trim();
  const safe = pem.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace('%%ZMT_CERT_PEM%%', safe || 'الشهادة غير متوفرة حالياً — شغّل خدمة الهاتف من الكمبيوتر ثم أعد فتح هذه الصفحة.');
  res.writeHead(200, {
    'Content-Type': MIME['.html'],
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(html);
}

// ---- WebSocket layer --------------------------------------------------------

// Minimal line-based JSON framing like the LAN module (keeps dep surface tiny
// and predictable over `ws`).
function broadcastClients() {
  sendToRenderer('phs-clients', { clients: _clients.size, list: Array.from(_clients.values()).map((c) => ({ name: c.deviceName, id: c.deviceId, sell: !!c.sell })) });
}

function setupWS() {
  _wss = new WebSocketServer({ server: _server, path: '/ws' });
  _wss.on('connection', (ws) => {
    ws._auth = { ok: false };
    ws.on('message', (raw) => {
      let msg = null;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
      if (!msg || typeof msg !== 'object') return;
      const { type } = msg;
      if (type === 'auth') {
        const tok = _tokens.get(String(msg.token || ''));
        if (!tok) {
          try { ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'bad_token' })); } catch (e) {}
          try { ws.close(); } catch (e) {}
          return;
        }
        ws._auth = { ok: true, token: String(msg.token), deviceId: tok.deviceId, deviceName: tok.deviceName };
        _clients.set(ws, { deviceId: tok.deviceId, deviceName: tok.deviceName, token: String(msg.token), sell: tok.sell !== false });
        try { ws.send(JSON.stringify({ type: 'auth', ok: true })); } catch (e) {}
        broadcastClients();
        return;
      }
      if (type === 'scan') {
        if (!ws._auth || !ws._auth.ok) {
          try { ws.send(JSON.stringify({ type: 'error', error: 'not_auth' })); } catch (e) {}
          return;
        }
        const code = String(msg.code === undefined ? '' : msg.code).slice(0, 256);
        if (!code) return;
        sendToRenderer('phs-scan', { code, deviceId: ws._auth.deviceId, deviceName: ws._auth.deviceName });
        return;
      }
      // Phone POS: a bookmark-style request executed against the DB by the
      // desktop renderer (single writer). Main only routes authentic, sell-
      // enabled devices and relays the renderer answer back to the phone.
      if (type === 'req') {
        handlePhoneRequest(ws, msg);
        return;
      }
      if (type === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong' })); } catch (e) {}
        return;
      }
    });
    ws.on('close', () => { _clients.delete(ws); broadcastClients(); });
    ws.on('error', () => { _clients.delete(ws); broadcastClients(); });
  });
}

// ---- phone POS request relay --------------------------------------------------

function wsSend(ws, payload) {
  try { ws.send(JSON.stringify(payload)); } catch (e) {}
}

function pendingFail(requestId, code, msg) {
  const p = _pendingPhoneReqs.get(requestId);
  if (!p) return;
  clearTimeout(p.timer);
  _pendingPhoneReqs.delete(requestId);
  wsSend(p.ws, { type: 'res', requestId, ok: false, error: { code, msg } });
}

function handlePhoneRequest(ws, msg) {
  if (!ws._auth || !ws._auth.ok) {
    wsSend(ws, { type: 'res', requestId: String(msg.requestId || ''), ok: false, error: { code: 'NOT_AUTH', msg: 'غير مصرح' } });
    return;
  }
  if (!_saleEnabled) {
    wsSend(ws, { type: 'res', requestId: String(msg.requestId || ''), ok: false, error: { code: 'DISABLED', msg: 'البيع من الهاتف غير مفعل' } });
    return;
  }
  if (!deviceSellOf(ws._auth.deviceId)) {
    wsSend(ws, { type: 'res', requestId: String(msg.requestId || ''), ok: false, error: { code: 'NOT_ALLOWED', msg: 'البيع معطّل لهذا الجهاز' } });
    return;
  }
  const requestId = String(msg.requestId || '');
  if (!requestId || _pendingPhoneReqs.has(requestId)) return; // duplicate
  const req = String(msg.req || '');
  if (!req) return;
  // Forward to the desktop renderer, which owns the DB and answers the request.
  const timer = setTimeout(() => pendingFail(requestId, 'TIMEOUT', 'انتهت المهلة'), SALE_REQ_TIMEOUT_MS);
  _pendingPhoneReqs.set(requestId, { ws, timer });
  sendToRenderer('psale-request', {
    requestId,
    deviceId: ws._auth.deviceId,
    deviceName: ws._auth.deviceName,
    req,
    payload: (msg.payload && typeof msg.payload === 'object') ? msg.payload : {},
  });
}

// The renderer calls back through ipcMain 'psale-respond' with the result of
// a request; deliver it to the awaiting phone and drop the pending entry.
function respondToPending(requestId, result) {
  const p = _pendingPhoneReqs.get(String(requestId || ''));
  if (!p) return { success: false, error: 'unknown_request' };
  clearTimeout(p.timer);
  _pendingPhoneReqs.delete(String(requestId));
  wsSend(p.ws, { type: 'res', requestId: String(requestId), ok: !!(result && result.ok), data: result && result.data, error: result && result.error });
  return { success: true };
}

// ---- public API -------------------------------------------------------------

async function start() {
  if (_server && _status === 'running') return { success: true, data: statusPayload() };
  _status = 'starting';
  _statusError = '';
  const cert = await ensureCert();
  if (!cert.success) {
    _status = 'error';
    _statusError = cert.error || 'cert_generation_failed';
    return { success: false, error: _statusError };
  }
  if (!(_pfxPassCache && _pfxCache)) {
    _status = 'error';
    _statusError = 'no_cert_material';
    return { success: false, error: _statusError };
  }
  _wss = null;
  _server = null;
  const opts = { pfx: _pfxCache, passphrase: _pfxPassCache };
  const handler = (req, res) => {
    try {
      let url = (req.url || '/').split('?')[0];
      if (url === '/api/pair') { handlePair(req, res); return; }
      if (url === '/cert') { handleCert(req, res); return; }
      // Arabic CA guide served from the phone itself, with the certificate
      // embedded in the HTML so no separate download request is required.
      if (url === '/cert-help') { handleCertHelp(res); return; }
      const file = readStatic(url);
      if (!file) { res.writeHead(404); res.end('Not found'); return; }
      const ext = (path.extname(file) || '').toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(file).pipe(res);
    } catch (e) { try { res.writeHead(500); res.end('Internal error'); } catch (e2) {} }
  };
  // Try the preferred port first, then every other port in the firewall range
  // so an unrelated program holding 4520 no longer blocks the scanner.
  const ports = PORT_CANDIDATES.slice();
  if (ports.indexOf(_port) === -1) ports.unshift(_port);
  let lastErr = 'PORT_IN_USE';
  for (const port of ports) {
    const httpServer = https.createServer(opts, handler);
    const res = await new Promise((resolve) => {
      const onErr = (e) => { try { httpServer.removeListener('error', onErr); } catch (e2) {} resolve({ ok: false, code: e.code, message: e.message }); };
      httpServer.once('error', onErr);
      httpServer.listen(port, '0.0.0.0', () => { try { httpServer.removeListener('error', onErr); } catch (e2) {} resolve({ ok: true, port }); });
    });
    if (res.ok) {
      _port = port;
      _server = httpServer;
      httpServer.on('error', (e) => {
        _status = 'error';
        _statusError = e.code === 'EADDRINUSE' ? 'PORT_IN_USE' : e.message;
        try { if (_server) _server.close(); } catch (e2) {}
        _server = null;
      });
      setupWS();
      _status = 'running';
      sendToRenderer('phs-status', statusPayload());
      return { success: true, data: statusPayload() };
    }
    lastErr = res.code === 'EADDRINUSE' ? 'PORT_IN_USE' : (res.message || 'listen_failed');
    try { httpServer.close(); } catch (e2) {}
  }
  _status = 'error';
  _statusError = lastErr;
  return { success: false, error: _statusError };
}

function stop() {
  try { if (_wss) { _wss.close(); _wss = null; } } catch (e) {}
  try { if (_server) { _server.close(); _server = null; } } catch (e) {}
  _clients.clear();
  _status = 'stopped';
  _statusError = '';
  return { success: true, data: statusPayload() };
}

// Renderer answers the approval modal.
function decide(requestId, decision) {
  const p = _pendingApprovals.get(requestId);
  if (!p) return { success: false, error: 'unknown_request' };
  if (decision === 'always') {
    p.finish(approveDevice(p.deviceId, p.deviceName, 'always'));
    return { success: true };
  }
  if (decision === 'session') {
    p.finish(approveDevice(p.deviceId, p.deviceName, 'session'));
    return { success: true };
  }
  p.finish(denyDevice(p.deviceId));
  return { success: true };
}

// The scanner UI: list approved devices + revoke them.
function listApproved() {
  return { success: true, data: loadApproved().map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName, sell: d.sell !== false, createdAt: d.createdAt })) };
}

function removeApproved(deviceId) {
  const list = loadApproved().filter((d) => d.deviceId !== deviceId);
  saveApproved(list);
  for (const [token, v] of _tokens) { if (v.deviceId === deviceId) _tokens.delete(token); }
  for (const [ws, c] of _clients) { if (c.deviceId === deviceId) { try { ws.send(JSON.stringify({ type: 'unpaired' })); } catch (e) {} try { ws.close(); } catch (e) {} } }
  return { success: true };
}

module.exports = {
  setWindowGetter,
  setUserDataDir,
  ensureCert,
  loadTokens,
  loadSaleEnabled,
  getSaleEnabled,
  setSaleEnabled,
  setDeviceSell,
  getDeviceSell,
  respondToPending,
  start,
  stop,
  decide,
  listApproved,
  removeApproved,
  getStatus: () => statusPayload(),
  getLocalIps,
  certFiles,
};