const net = require('net');
const os = require('os');

let _role = '';
let _ip = '';
let _port = 4512;
let _activePort = 0;
let _server = null;
let _subSocket = null;
let _sockets = new Map();
let _getWindow = null;
let _reconnectTimer = null;
let _reconnectDelay = 2000;
let _subPingTimer = null;
let _stopped = false;

function setWindowGetter(fn) { _getWindow = fn; }

function getWin() {
  return _getWindow ? _getWindow() : null;
}

function sendToRenderer(payload) {
  const w = getWin();
  if (w && !w.isDestroyed()) {
    try { w.webContents.send('lan-message', payload); } catch (e) {}
  }
}

function getStatusPayload() {
  if (_role === 'main') {
    return {
      role: 'main',
      running: !!_server && _server.listening,
      clients: _sockets.size,
      port: _activePort || _port,
      localIps: getLocalIps(),
    };
  }
  if (_role === 'sub') {
    return {
      role: 'sub',
      running: false,
      connected: !!(_subSocket && !_subSocket.destroyed),
      ip: _ip,
      port: _port,
    };
  }
  return { role: '', running: false, connected: false };
}

function getStatus() {
  return getStatusPayload();
}

function sendStatus() {
  const w = getWin();
  if (!w || w.isDestroyed()) return;
  try { w.webContents.send('lan-status', getStatusPayload()); } catch (e) {}
}

// Periodic heartbeat: re-pushes status to the renderer so it never misses the
// initial connect event (which previously left the sub's _connected flag false).
let _heartbeatTimer = null;
function startHeartbeat() {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(() => {
    if (_role) sendStatus();
  }, 10000);
}

function stopHeartbeat() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
}

function getLocalIps() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

function parseLines(buffer, onLine) {
  let rest = buffer;
  let idx;
  while ((idx = rest.indexOf('\n')) !== -1) {
    const line = rest.slice(0, idx).trim();
    rest = rest.slice(idx + 1);
    if (line) {
      try { onLine(JSON.parse(line)); } catch (e) {}
    }
  }
  return rest;
}

function stop() {
  _stopped = true;
  _activePort = 0;
  stopHeartbeat();
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_subPingTimer) { clearInterval(_subPingTimer); _subPingTimer = null; }
  if (_server) { try { _server.close(); } catch (e) {} _server = null; }
  for (const s of _sockets.keys()) { try { s.destroy(); } catch (e) {} }
  _sockets.clear();
  if (_subSocket) { try { _subSocket.destroy(); } catch (e) {} _subSocket = null; }
}

function writeSocket(socket, payload) {
  if (!socket || socket.destroyed) return false;
  try { socket.write(JSON.stringify(payload) + '\n'); return true; } catch (e) { return false; }
}

function sendToPeers(payload, except) {
  if (_role === 'main') {
    for (const socket of _sockets.keys()) {
      if (socket !== except) writeSocket(socket, payload);
    }
  } else if (_role === 'sub') {
    writeSocket(_subSocket, payload);
  }
}

function startServer() {
  return new Promise((resolve) => {
    let tries = 0;
    const maxTries = 10;
    const tryListen = () => {
      const port = _port + tries;
      let server;
      try {
        server = net.createServer((socket) => {
          socket.setEncoding('utf8');
          socket.setNoDelay(true);
          socket.setKeepAlive(true, 10000);
          socket.setTimeout(20000);
          socket.on('timeout', () => { try { socket.destroy(); } catch (e) {} });
          let buffer = '';
          socket.on('data', (chunk) => {
            buffer = parseLines(buffer + chunk, (msg) => {
              if (msg.type === 'hello' && msg.role === 'test') return;
              if (msg.type === 'ping') {
                writeSocket(socket, { type: 'pong' });
                return;
              }
              if (msg.type === 'hello') {
                _sockets.set(socket, true);
                writeSocket(socket, { type: 'hello', role: 'main' });
                sendStatus();
              }
              sendToRenderer(msg);
              if (msg.type === 'ops' || msg.type === 'snapshot' ||
                  (typeof msg.type === 'string' && msg.type.indexOf('rest-') === 0)) {
                sendToPeers(msg, socket);
              }
            });
          });
          socket.on('close', () => {
            _sockets.delete(socket);
            sendStatus();
          });
          socket.on('error', () => {});
          _sockets.set(socket, true);
          sendStatus();
        });
        server.on('error', (err) => {
          if (err && err.code === 'EADDRINUSE') {
            tries++;
            if (tries <= maxTries) {
              tryListen();
            } else {
              console.error('[LAN] No free port found from', _port, 'to', _port + maxTries);
              _activePort = 0;
              sendStatus();
              resolve({ ok: false, error: 'NO_FREE_PORT' });
            }
          } else {
            console.error('[LAN] Server error:', err.message);
            _activePort = 0;
            sendStatus();
            resolve({ ok: false, error: err.message });
          }
        });
        server.listen(port, '0.0.0.0', () => {
          _server = server;
          _activePort = port;
          console.log('[LAN] Main server listening on port', port);
          sendStatus();
          resolve({ ok: true });
        });
      } catch (e) {
        console.error('[LAN] Server start failed:', e);
        _activePort = 0;
        sendStatus();
        resolve({ ok: false, error: e.message });
      }
    };
    tryListen();
  });
}

function connectSub() {
  if (_stopped) return;
  if (_subSocket && !_subSocket.destroyed) return;
  try {
    const socket = net.connect({ host: _ip, port: _port });
    _subSocket = socket;
    socket.setEncoding('utf8');
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 10000);
    socket.setTimeout(20000);
    socket.on('timeout', () => { try { socket.destroy(); } catch (e) {} });
    let buffer = '';
    socket.on('connect', () => {
      _reconnectDelay = 2000;
      sendStatus();
      writeSocket(socket, { type: 'hello', role: 'sub' });
      if (_subPingTimer) clearInterval(_subPingTimer);
      _subPingTimer = setInterval(() => {
        if (_subSocket === socket && !socket.destroyed) writeSocket(socket, { type: 'ping', ts: Date.now() });
      }, 10000);
    });
    socket.on('data', (chunk) => {
      buffer = parseLines(buffer + chunk, (msg) => sendToRenderer(msg));
    });
    socket.on('close', () => {
      if (_subSocket === socket) _subSocket = null;
      if (_subPingTimer) { clearInterval(_subPingTimer); _subPingTimer = null; }
      sendStatus();
      scheduleReconnect();
    });
    socket.on('error', (err) => {
      if (_subSocket === socket) _subSocket = null;
      if (_subPingTimer) { clearInterval(_subPingTimer); _subPingTimer = null; }
      socket.destroy();
      sendStatus();
      scheduleReconnect();
    });
  } catch (e) {
    console.error('[LAN] Sub connect failed:', e);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (_stopped) return;
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    connectSub();
  }, _reconnectDelay);
  _reconnectDelay = Math.min(_reconnectDelay * 2, 15000);
}

async function configure(cfg) {
  stop();
  _stopped = false;
  _reconnectDelay = 2000;
  _activePort = 0;
  const role = (cfg && cfg.role) || '';
  _ip = (cfg && cfg.ip) || '';
  _port = parseInt((cfg && cfg.port) || '4512', 10) || 4512;
  _role = role;
  startHeartbeat();
  if (role === 'main') {
    return startServer();
  } else if (role === 'sub') {
    connectSub();
    return { ok: true };
  }
  sendStatus();
  return { ok: true };
}

function sendFromRenderer(payload) {
  if (_role === 'main') {
    sendToPeers(payload, null);
  } else if (_role === 'sub') {
    writeSocket(_subSocket, payload);
  }
}

function testConnection(ip, port) {
  return new Promise((resolve) => {
    if (!ip) return resolve({ ok: false, reason: 'NO_IP' });
    const p = parseInt(port, 10) || 4512;
    let socket;
    try {
      socket = net.connect({ host: ip, port: p });
    } catch (e) {
      return resolve({ ok: false, reason: 'INVALID' });
    }
    const timeout = setTimeout(() => {
      try { socket.destroy(); } catch (e) {}
      resolve({ ok: false, reason: 'TIMEOUT' });
    }, 3000);
    socket.on('connect', () => {
      try { socket.write(JSON.stringify({ type: 'hello', role: 'test' }) + '\n'); } catch (e) {}
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer = parseLines(buffer + chunk, (msg) => {
          if (msg.type === 'hello') {
            clearTimeout(timeout);
            try { socket.destroy(); } catch (e) {}
            resolve({ ok: true, role: msg.role || '' });
          }
        });
      });
      // If we connected but got no hello within the timeout, report partial success
      // (port open but not our server) — the outer timeout handles it as TIMEOUT.
    });
    socket.on('error', (err) => {
      clearTimeout(timeout);
      try { socket.destroy(); } catch (e) {}
      let reason = 'UNREACHABLE';
      if (err && err.code === 'ECONNREFUSED') reason = 'REFUSED';
      else if (err && err.code === 'ETIMEDOUT') reason = 'TIMEOUT';
      else if (err && err.code === 'EHOSTUNREACH') reason = 'UNREACHABLE';
      resolve({ ok: false, reason });
    });
  });
}

module.exports = {
  setWindowGetter,
  configure,
  sendFromRenderer,
  getStatus,
  getLocalIps,
  stop,
  testConnection,
};
