const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

if (process.platform === 'win32' && require('os').release().startsWith('6.1')) {
  app.commandLine.appendSwitch('no-sandbox');
}
const License = require('./license');
const Firebird = require('./firebird');
const LAN = require('./lan-server');
const PrinterNet = require('./printer-net');
const PhoneScanner = require('./phone-scanner');

let mainWindow;
let splashWindow;
let quickEntryWindow;
let kioskOn = false;

// ===== FLUSH-ON-CLOSE =====
// The renderer persists writes through a debounced/batched IndexedDB queue. If
// the window is torn down while a write is still queued, the last edit (e.g. a
// price/quantity change) can be lost — the "edited last night, reverted this
// morning" symptom. Before closing we ask the renderer to flush and wait
// (bounded) for its ack.
let _flushRequested = false;
let _flushComplete = false;

// Log unhandled errors
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

console.log('App starting...');
console.log('__dirname:', __dirname);
console.log('Electron version:', process.versions.electron);

function createSplash() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const icon = fs.existsSync(iconPath) ? iconPath : undefined;

  splashWindow = new BrowserWindow({
    width: 520,
    height: 520,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.maximize();

  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'))
    .then(() => console.log('Splash loaded'))
    .catch(err => console.error('Splash load error:', err));

  splashWindow.on('closed', () => { splashWindow = null; });
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const icon = fs.existsSync(iconPath) ? iconPath : undefined;

  console.log('Creating window...');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: '#1a1a1a',
    show: false,
    icon,
    webSecurity: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.maximize();

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        'Access-Control-Allow-Origin': ['*'],
        ...details.responseHeaders,
      }
    });
  });

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
  });

  mainWindow.on('closed', () => {
    console.log('Window closed');
    mainWindow = null;
  });

  // Flush pending IndexedDB writes before the window is actually destroyed.
  mainWindow.on('close', (e) => {
    if (_flushComplete) return; // already flushed (or nothing to flush)
    const wc = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.webContents : null;
    if (!wc || wc.isDestroyed()) return; // no live renderer → let it close
    e.preventDefault();
    if (_flushRequested) return; // a flush is already in flight
    _flushRequested = true;
    const finish = () => {
      _flushComplete = true;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      else app.quit();
    };
    const timer = setTimeout(finish, 1500);
    ipcMain.once('app:flush-done', () => { clearTimeout(timer); finish(); });
    try { wc.send('app:flush'); } catch (err) { clearTimeout(timer); finish(); }
  });

  mainWindow.webContents.on('crashed', (e) => {
    console.error('RENDERER CRASHED:', e);
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`Renderer [${level}]: ${message}`);
  });

  // ===== DEVTOOLS + CASH DRAWER KEYS =====
  // Ctrl+Shift+I keeps toggling the inspector even in release installs, so a
  // support agent can read the renderer console on-site (e.g. to diagnose the
  // "white screen" after licence deletion) without a --dev relaunch.
  // F12 is now reserved for the cash drawer: it is forwarded to the renderer,
  // which asks the main process to send the ESC/POS pulse.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const isF12 = input.key === 'F12';
    const isDevShortcut = !!(input.control && input.shift && (input.key === 'I' || input.key === 'i'));

    if (isF12) {
      event.preventDefault();
      try { mainWindow.webContents.send('cash-drawer-hotkey'); } catch (e) {}
      return;
    }
    if (!isDevShortcut) return;
    event.preventDefault();
    const wc = mainWindow.webContents;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'detach' });
  });

  // ===== KIOSK SAFETY NET (price display) =====
  // While kiosk mode is on, Alt+F4 must not kill the app: it is forwarded to
  // the renderer as an "exit request" so the manager PIN dialog can open.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!kioskOn || !input.alt || input.key !== 'F4') return;
    event.preventDefault();
    try { mainWindow.webContents.send('pd-exit-request'); } catch (e) {}
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
    .then(() => console.log('Page loaded'))
    .catch((err) => console.error('Load error:', err));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  console.log('App ready');
  License.setUserDataPath(app.getPath('userData'));
  // 2.4.9: pin the machine identity at boot — the first fingerprint computed is
  // persisted to zmt_machine.dat and never recomputed, so no Win7 machine can
  // alternate identities across boots anymore (the root cause of the
  // "هذا المفتاح مربوط بجهاز آخر" / "تلاعب بالوقت" alternation after activation).
  try {
    const mid = License.getMachineFingerprint();
    console.log('Machine fingerprint:', mid);
  } catch (e) { console.warn('Machine fingerprint unavailable:', e && e.message); }
  createSplash();
  createWindow();
  ensureAnyDeskInstalled();
});

app.on('window-all-closed', () => {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('gpu-process-crashed', (e, killed) => {
  console.error('GPU process crashed, killed:', killed);
});

// Close splash and show main window when renderer is ready
ipcMain.on('splash-close', () => {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
  }
});

// Quick Entry standalone window: created once and kept alive so the operator
// can minimize it (unfinished invoice stays), do normal work in the main
// window, then come back and finish it. F1 focuses/reuses it.
function openQuickEntryWindow() {
  if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
    if (quickEntryWindow.isMinimized()) quickEntryWindow.restore();
    quickEntryWindow.show();
    quickEntryWindow.focus();
    return;
  }
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const icon = fs.existsSync(iconPath) ? iconPath : undefined;
  quickEntryWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 600,
    frame: false,
    resizable: true,
    backgroundColor: '#1a1a1a',
    show: false,
    icon,
    webSecurity: false,
    title: 'Quick Entry',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  quickEntryWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { standalone: 'quick-entry' } });
  quickEntryWindow.once('ready-to-show', () => {
    if (quickEntryWindow && !quickEntryWindow.isDestroyed()) quickEntryWindow.show();
  });
  // Even if ready-to-show never fires (e.g. slow boot), don't leave a ghost window.
  setTimeout(() => {
    if (quickEntryWindow && !quickEntryWindow.isDestroyed() && !quickEntryWindow.isVisible()) {
      quickEntryWindow.show();
    }
  }, 2500);
  quickEntryWindow.webContents.once('did-fail-load', (e, code, desc) => {
    console.error('[QE] Failed to load quick-entry page:', code, desc);
    if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
      quickEntryWindow.destroy();
      quickEntryWindow = null;
    }
  });
  // Re-sync the shared IndexedDB cache whenever the window regains focus so
  // sales made in the main window (stock, sold invoices) appear here too.
  quickEntryWindow.on('focus', () => {
    if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
      quickEntryWindow.webContents.send('quick-entry-refresh');
    }
  });
  quickEntryWindow.on('closed', () => { quickEntryWindow = null; });
}

ipcMain.handle('quick-entry-open', () => {
  try {
    openQuickEntryWindow();
    return true;
  } catch (e) {
    console.error('[QE] Failed to open quick-entry window:', e);
    return false;
  }
});

// Safety fallback: close splash after 10s no matter what
setTimeout(() => {
  if (splashWindow && !splashWindow.isDestroyed()) {
    console.log('[Splash] Force-close after timeout');
    splashWindow.close();
    splashWindow = null;
  }
  if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
  }
}, 10000);

// IPC handlers
// Window controls target the window that sent the request (so the dedicated
// sales-history child window controls itself, not the main window).
function senderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}
ipcMain.on('window-minimize', (event) => { const w = senderWindow(event); if (w) w.minimize(); });
ipcMain.on('window-maximize', (event) => {
  const w = senderWindow(event);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize();
  else w.maximize();
});
ipcMain.on('window-close', (event) => { const w = senderWindow(event); if (w) w.close(); });

// Fix: after a native dialog (alert/confirm/file) closes on Windows, the frameless
// window can keep visual focus without keyboard focus — inputs freeze until the
// user clicks outside and back. Force a blur+focus cycle to restore keyboard input.
function fixWindowFocus(win) {
  const target = win || mainWindow;
  if (!target || target.isDestroyed()) return;
  target.blur();
  setTimeout(() => {
    if (target && !target.isDestroyed()) target.focus();
  }, 10);
}
ipcMain.on('window-focus-fix', (event) => fixWindowFocus(senderWindow(event)));

// Cross-window DB change bus: relay a local write announcement to every OTHER
// BrowserWindow, so the F1 quick-entry child and the main window re-sync their
// in-memory caches live. The sender is excluded (its cache is already current).
ipcMain.on('zmt-db-changed', (event) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send('zmt-db-changed');
    }
  }
});

ipcMain.handle('dialog-open-file', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  fixWindowFocus();
  return result;
});

ipcMain.handle('dialog-save-file', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  fixWindowFocus();
  return result;
});

ipcMain.handle('write-file', async (event, filePath, data) => {
  try {
    const dir = require('path').dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, data, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('write-file-binary', async (event, filePath, base64Data) => {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('generate-invoice-pdf', async (event, html) => {
  let win = null;
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const buf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    return { success: true, data: buf.toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (win) { try { win.destroy(); } catch (e) {} }
  }
});

ipcMain.handle('send-email', async (event, payload) => {
  if (!nodemailer) return { success: false, error: 'nodemailer_not_installed' };
  try {
    const smtp = payload.smtp || {};
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: parseInt(smtp.port, 10) || 587,
      secure: !!smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    const mailOptions = {
      from: smtp.from || smtp.user,
      to: payload.to,
      subject: payload.subject || '',
      text: payload.text || '',
      attachments: payload.attachment
        ? [{ filename: payload.attachment.filename, content: Buffer.from(payload.attachment.content, 'base64') }]
        : [],
    };
    const info = await transport.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.zmt-backup'));
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-app-data-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-file-buffer', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return { success: true, data: buffer.toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== PRICE DISPLAY — local media import (never uploaded) =====
const PD_MEDIA_DIR = () => path.join(app.getPath('userData'), 'zmt-pd');
const PD_SAFE_EXT = (p) => {
  const ext = path.extname(String(p || '')).toLowerCase();
  return /^\.[a-z0-9]{1,6}$/.test(ext) ? ext : '.bin';
};

ipcMain.handle('pd-import-media', async (event, srcPath, kind) => {
  try {
    if (!srcPath || typeof srcPath !== 'string') return { success: false, error: 'bad_path' };
    if (!fs.existsSync(srcPath)) return { success: false, error: 'missing_source' };
    const dir = PD_MEDIA_DIR();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const prefix = kind === 'image' ? 'img' : 'vid';
    const base = prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const dest = path.join(dir, base + PD_SAFE_EXT(srcPath));
    fs.copyFileSync(srcPath, dest);
    return { success: true, path: dest, size: fs.statSync(dest).size };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pd-remove-media', async (event, destPath) => {
  try {
    if (!destPath || typeof destPath !== 'string') return { success: false, error: 'bad_path' };
    const dir = PD_MEDIA_DIR();
    const resolved = path.resolve(destPath);
    if (resolved.toLowerCase().indexOf(dir.toLowerCase()) !== 0) return { success: false, error: 'outside_media_dir' };
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== PRICE DISPLAY — real kiosk (full-screen) window =====
ipcMain.handle('window-set-kiosk', async (event, on) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return { success: false, error: 'no_window' };
    const want = !!on;
    kioskOn = want;
    if (typeof win.setKiosk === 'function') win.setKiosk(want);
    else if (typeof win.setFullScreen === 'function') win.setFullScreen(want);
    if (!want && typeof win.maximize === 'function' && !win.isMaximized()) win.maximize();
    return { success: true, kiosk: want };
  } catch (err) {
    kioskOn = false;
    return { success: false, error: err.message };
  }
});

// ===== PRICE DISPLAY — auto start with Windows =====
ipcMain.handle('auto-launch-get', () => {
  try {
    const s = app.getLoginItemSettings();
    return { success: true, enabled: !!s.openAtLogin };
  } catch (err) {
    return { success: false, enabled: false, error: err.message };
  }
});

ipcMain.handle('auto-launch-set', async (event, enabled) => {
  try {
    const want = !!enabled;
    const opts = { openAtLogin: want };
    if (want) {
      opts.path = process.execPath;
      // In a packaged build launch the app itself; in dev re-open the project.
      if (app.isPackaged) opts.args = [];
      else opts.args = [__dirname];
    }
    app.setLoginItemSettings(opts);
    const after = app.getLoginItemSettings();
    return { success: true, enabled: !!after.openAtLogin };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle('open-file-import', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Supported', extensions: ['csv','tsv','txt','xlsx','xls','json','xml','sql','db','sqlite','sqlite3','mdb','accdb','gdb','fdb','fbk','dbf'] },
      { name: 'CSV/Text', extensions: ['csv','tsv','txt'] },
      { name: 'Excel', extensions: ['xlsx','xls'] },
      { name: 'Database', extensions: ['db','sqlite','sqlite3','mdb','accdb','gdb','fdb','fbk'] },
      { name: 'SQL Dump', extensions: ['sql'] },
      { name: 'dBASE', extensions: ['dbf'] },
      { name: 'JSON/XML', extensions: ['json','xml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  fixWindowFocus();
  return result;
});

// ===== FIREBIRD (.fdb/.gdb) READER =====
ipcMain.handle('firebird-detect', async (event, dbPath, options) => {
  try {
    return { success: true, data: await Firebird.detect(dbPath, options) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('firebird-tables', async (event, dbPath, options) => {
  try {
    return { success: true, data: await Firebird.listTables(dbPath, options) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('firebird-columns', async (event, dbPath, table, options) => {
  try {
    return { success: true, data: await Firebird.getColumns(dbPath, table, options) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('firebird-count', async (event, dbPath, table, options) => {
  try {
    return { success: true, data: await Firebird.getRowCount(dbPath, table, options) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('firebird-query', async (event, dbPath, table, columns, from, to, options) => {
  try {
    return { success: true, data: await Firebird.queryTable(dbPath, table, columns, from, to, options) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('firebird-restore', async (event, backupPath, options) => {
  try {
    const target = await Firebird.restoreBackup(backupPath, options);
    return { success: true, data: { path: target } };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== APP VERSION (matches the installed package.json version) =====
ipcMain.handle('app-version', () => {
  try {
    return app.getVersion();
  } catch (e) {
    return '2.1.0';
  }
});

// ===== UPDATES (GitHub Releases) =====
// Distribution channel detection: Windows 7 (kernel 6.1) gets the Electron 22
// builds, everything newer gets the modern build; each in x64 / ia32.
function _updateChannel() {
  const win7 = process.platform === 'win32' && os.release().startsWith('6.1');
  const arch = process.arch === 'ia32' ? 'ia32' : 'x64';
  const channelKey = win7 ? ('win7-' + arch) : arch;
  return { win7, arch, channel: win7 ? 'win7' : 'modern', channelKey };
}

function _parseVersion(v) {
  return String(v || '0').replace(/^v/i, '').split(/[.\-+]/).map(function (n) { return parseInt(n, 10) || 0; });
}
function _isNewer(latest, current) {
  const a = _parseVersion(latest), b = _parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function _httpsGet(url, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('too many redirects'));
    let u;
    try { u = new URL(url); } catch (e) { return reject(new Error('bad url')); }
    if (u.protocol !== 'https:') return reject(new Error('https required'));
    const req = https.get(u, { headers: { 'User-Agent': 'ZMT-PIECE-Updater', 'Accept': 'application/json,application/octet-stream' } }, (res) => {
      const s = res.statusCode;
      if (s >= 300 && s < 400 && res.headers.location) {
        res.resume();
        return resolve(_httpsGet(new URL(res.headers.location, u).toString(), redirects + 1));
      }
      if (s !== 200) { res.resume(); return reject(new Error('HTTP ' + s)); }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}

async function _fetchText(url) {
  const res = await _httpsGet(url);
  return await new Promise((resolve, reject) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve(data));
    res.on('error', reject);
  });
}

async function _downloadTo(url, destPath, onProgress) {
  const res = await _httpsGet(url);
  const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
  const hash = crypto.createHash('sha256');
  let received = 0, lastSent = 0;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destPath);
    res.on('data', (chunk) => {
      hash.update(chunk);
      received += chunk.length;
      const now = Date.now();
      if (onProgress && (now - lastSent > 250 || received === total)) {
        lastSent = now;
        onProgress({ received, total, percent: total ? Math.round((received / total) * 100) : 0 });
      }
    });
    res.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    res.pipe(out);
  });
  return { sha256: hash.digest('hex'), size: received };
}

ipcMain.handle('update-system-info', () => {
  let version = '0.0.0';
  try { version = app.getVersion(); } catch (e) {}
  const info = _updateChannel();
  return {
    version,
    arch: info.arch,
    channel: info.channel,
    channelKey: info.channelKey,
    platform: process.platform,
    osRelease: os.release(),
    electron: process.versions.electron,
  };
});

ipcMain.handle('update-check', async (event, manifestUrl) => {
  try {
    const info = _updateChannel();
    const current = app.getVersion();
    if (!manifestUrl || typeof manifestUrl !== 'string') throw new Error('no manifest url');
    const text = await _fetchText(manifestUrl);
    let manifest;
    try { manifest = JSON.parse(text); } catch (e) { throw new Error('invalid manifest'); }
    const latest = String(manifest.version || '');
    const channels = manifest.channels || {};
    const asset = channels[info.channelKey] || null;
    const hasUpdate = !!latest && _isNewer(latest, current) && !!asset;
    return {
      ok: true,
      current,
      latest,
      hasUpdate,
      channel: info.channel,
      channelKey: info.channelKey,
      asset: asset,
      notes: manifest.notes || '',
      releasedAt: manifest.releasedAt || '',
    };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
});

ipcMain.handle('update-download', async (event, payload) => {
  try {
    if (!payload || !payload.url) throw new Error('no url');
    const info = _updateChannel();
    const fileName = payload.fileName || (payload.name || ('ZMT-PIECE-' + info.channelKey + '.exe'));
    const dir = path.join(app.getPath('temp'), 'zmt-updates');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    const destPath = path.join(dir, fileName);
    const result = await _downloadTo(payload.url, destPath, (p) => {
      try { event.sender.send('update-progress', p); } catch (e) {}
    });
    if (payload.sha256 && result.sha256.toLowerCase() !== String(payload.sha256).toLowerCase()) {
      try { fs.unlinkSync(destPath); } catch (e) {}
      throw new Error('sha256 mismatch');
    }
    return { ok: true, filePath: destPath, sha256: result.sha256, size: result.size };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
});

ipcMain.handle('update-install', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) throw new Error('installer not found');
    // Launch the NSIS installer silently (it waits for the current process to
    // exit). Detach so this app can quit cleanly.
    const child = spawn(filePath, ['/S'], { detached: true, stdio: 'ignore' });
    child.unref();
    setTimeout(() => { try { app.quit(); } catch (e) {} }, 1500);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
});

ipcMain.handle('update-beep', () => {
  try { shell.beep(); return { ok: true }; } catch (e) { return { ok: false }; }
});

// ===== LICENSE SYSTEM =====
ipcMain.handle('license-check', () => {
  return License.checkLicense();
});

ipcMain.handle('license-activate', (event, payload) => {
  // Wave 2: activation is validated online against the website API and bound
  // to this machine's SMBIOS fingerprint. payload = { key, code, password, deviceType }.
  return License.activateOnline(payload || {});
});

ipcMain.handle('license-server-status', async (event, code, password) => {
  return await License.checkServerStatus(code, password);
});

ipcMain.handle('license-time-tamper', () => {
  return License.checkTimeTamper();
});

ipcMain.handle('license-sync-time', async () => {
  const syncResult = await License.syncSystemClock();
  // Re-check tamper after sync attempt so the renderer gets the fresh verdict
  const tamper = License.checkTimeTamper();
  return { ...syncResult, tampered: tamper.tampered, tamperReason: tamper.reason, tamperMessage: tamper.message };
});

ipcMain.handle('license-remaining', () => {
  return License.getRemainingTime();
});

ipcMain.handle('license-machine-id', () => {
  return License.getMachineFingerprint();
});

ipcMain.handle('license-deactivate', (event, payload) => {
  return License.deactivateLicense(payload || {});
});

ipcMain.handle('license-import', (event, payload) => {
  // Offline path: a *.zmtlic file signed by the distributor's phone (or the
  // desktop reference signer). payload = { fileName?, data: <JSON text> }.
  return License.importPhoneLicense(payload || {});
});

// ===== LAN SYNC (main/sub server) =====
LAN.setWindowGetter(() => mainWindow);

ipcMain.handle('lan-configure', async (event, config) => {
  return await LAN.configure(config || {});
});

ipcMain.handle('lan-send', (event, payload) => {
  LAN.sendFromRenderer(payload);
  return true;
});

ipcMain.handle('lan-get-local-ip', () => {
  return LAN.getLocalIps();
});

ipcMain.handle('lan-get-status', () => {
  return LAN.getStatus();
});

ipcMain.handle('lan-test-connection', (event, ip, port) => {
  return LAN.testConnection(ip, port);
});

// Proactively allow the app through Windows Firewall so the LAN server (main
// role) can accept inbound connections from sub devices. Adding a rule needs
// admin rights, so we self-elevate via PowerShell's -Verb RunAs (shows a UAC
// prompt). If the user denies elevation we just report it and the UI shows a
// manual hint instead.
ipcMain.handle('lan-ensure-firewall', async () => {
  try {
    const exe = process.execPath;
    const ruleName = 'ZMT PIECE LAN';
    // PowerShell script: add an inbound allow rule for this app on the LAN
    // ports, skipping if it already exists. Single quotes are safe because the
    // exe path never contains a single quote.
    const script =
      `if (-not (Get-NetFirewallRule -DisplayName '${ruleName}' -ErrorAction SilentlyContinue)) ` +
      `{ New-NetFirewallRule -DisplayName '${ruleName}' -Direction Inbound -Program '${exe}' ` +
      `-Protocol TCP -LocalPort 4512-4521 -Profile Private -Action Allow }`;
    const runas = `Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList "-Command ${script}"`;
    await new Promise((resolve, reject) => {
      const child = spawn('powershell', ['-Command', runas], { windowsHide: true, shell: true });
      let err = '';
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('error', (e) => reject(e));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('FIREWALL_ELEVATION_DENIED: ' + (err || code)));
      });
    });
    return { success: true };
  } catch (e) {
    console.warn('[LAN] firewall rule not added:', e.message);
    return { success: false, needsPermission: true, error: e.message };
  }
});

// ===== PHONE BARCODE SCANNER (PWA over the shop LAN) =====
PhoneScanner.setWindowGetter(() => mainWindow);
PhoneScanner.setUserDataDir(app.getPath('userData'));
PhoneScanner.loadTokens();
PhoneScanner.loadSaleEnabled();

ipcMain.handle('phs-get-status', () => PhoneScanner.getStatus());
ipcMain.handle('phs-start', async () => {
  return await PhoneScanner.start();
});
ipcMain.handle('phs-stop', () => PhoneScanner.stop());
ipcMain.handle('phs-decide', (event, requestId, decision) => PhoneScanner.decide(requestId, decision));
ipcMain.handle('phs-list-approved', () => PhoneScanner.listApproved());
ipcMain.handle('phs-remove-device', (event, deviceId) => PhoneScanner.removeApproved(deviceId));
ipcMain.handle('phs-ensure-firewall', async () => {
  try {
    const exe = process.execPath;
    // reuse the existing LAN rule (its port range already covers 4520); only
    // creates it if missing so first-time users still get a working listener.
    const hasRule = await new Promise((resolve) => {
      const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command',
        `if (Get-NetFirewallRule -DisplayName 'ZMT PIECE LAN' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`], { windowsHide: true, shell: false });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });
    if (hasRule) return { success: true, skipped: true };
    const script =
      `if (-not (Get-NetFirewallRule -DisplayName 'ZMT PIECE LAN' -ErrorAction SilentlyContinue)) ` +
      `{ New-NetFirewallRule -DisplayName 'ZMT PIECE LAN' -Direction Inbound -Program '${exe}' ` +
      `-Protocol TCP -LocalPort 4512-4521 -Profile Private -Action Allow }`;
    const runas = `Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList "-Command ${script}"`;
    await new Promise((resolve, reject) => {
      const child = spawn('powershell', ['-Command', runas], { windowsHide: true, shell: true });
      let err = '';
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('error', (e) => reject(e));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('FIREWALL_ELEVATION_DENIED: ' + (err || code)));
      });
    });
    return { success: true };
  } catch (e) {
    console.warn('[PhoneScanner] firewall rule not added:', e.message);
    return { success: false, needsPermission: true, error: e.message };
  }
});

// ===== PHONE POS («البيع» from a phone on the LAN) =====
// The phone's WSS /ws messages of type 'req' arrive here as 'psale-request',
// the renderer executes them (it owns the DB) and answers via 'psale-respond'.

ipcMain.on('psale-respond', (event, requestId, result) => {
  try { PhoneScanner.respondToPending(requestId, result); } catch (e) { console.warn('[PhonePOS] respond error', e.message); }
});

ipcMain.handle('psale-get-enabled', () => ({ enabled: PhoneScanner.getSaleEnabled() }));

ipcMain.handle('psale-set-enabled', (event, enabled) => {
  const st = PhoneScanner.setSaleEnabled(!!enabled);
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('psale-enabled', { enabled: st });
  } catch (e) {}
  return { enabled: st };
});

ipcMain.handle('psale-set-device-sell', (event, deviceId, sell) => PhoneScanner.setDeviceSell(String(deviceId || ''), !!sell));

ipcMain.handle('psale-get-device-sell', (event, deviceId) => PhoneScanner.getDeviceSell(String(deviceId || '')));

// ===== RESTAURANT ORDERS («المطعم») — hidden-window printing =====
// The restaurant flow prints two different kinds of pages:
//   - a KITCHEN TICKET (قيد التنفيذ) on a chosen thermal printer
//   - a full SALE INVOICE (تأكيد البيع) on the default printer
// Printing goes through a hidden BrowserWindow (webContents.print, silent)
// because the app has no ESC/POS driver — the thermal printer works as a
// normal Windows pass-through printer, exactly like the rest of the app.

function mmToPx(mm) {
  return Math.max(80, Math.round((mm || 80) * (96 / 25.4)));
}

function restPrintHidden(payload) {
  return new Promise((resolve) => {
    let win;
    try {
      win = new BrowserWindow({
        show: false,
        width: mmToPx((payload && payload.paperWidth) || 80),
        height: mmToPx(220),
        webPreferences: { backgroundThrottling: false }
      });
    } catch (e) {
      return resolve({ ok: false, error: String((e && e.message) || e) });
    }
    const done = (ok, extra) => {
      try { if (win && !win.isDestroyed()) win.destroy(); } catch (e) {}
      resolve(Object.assign({ ok: !!ok }, extra || {}));
    };
    const onFail = (err) => {
      const m = String((err && err.message) || err);
      console.warn('[RestPrinter] failed:', m);
      done(false, { error: m });
    };
    win.webContents.on('did-fail-load', () => onFail(new Error('load failed')));
    win.webContents.on('did-finish-load', () => {
      const opts = { silent: true, printBackground: true };
      if (payload && payload.deviceName && payload.deviceName !== 'default') opts.deviceName = payload.deviceName;
      // Optional, backward-compatible extras (used by the thermal printer panel).
      // Orientation is handled inside the receipt's own CSS (@page), so the
      // print preview and the paper always match.
      if (payload && payload.copies) opts.copies = Math.max(1, Math.min(9, parseInt(payload.copies, 10) || 1));
      if (payload && payload.landscape) opts.landscape = true;
      try {
        win.webContents.print(opts, (success, failureReason) => {
          if (!success) { onFail(new Error(failureReason || 'print failed')); return; }
          done(true);
        });
      } catch (e) { onFail(e); }
    });
    const htmlSrc = 'data:text/html;charset=utf-8,' + encodeURIComponent((payload && payload.html) || '');
    win.loadURL(htmlSrc);
  });
}

ipcMain.handle('rest-list-printers', async (event) => {
  try {
    const list = await event.sender.getPrintersAsync();
    return (list || []).map((p) => ({ name: p.name, displayName: p.displayName, isDefault: !!p.isDefault }));
  } catch (e) {
    console.warn('[RestPrinter] list printers failed:', e);
    return [];
  }
});

ipcMain.handle('rest-print', (event, payload) => restPrintHidden(payload));

// Open an external URL in the default browser
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (typeof url !== 'string' || !/^(https?:\/\/|mailto:|tel:)/i.test(url)) {
      return { success: false, error: 'رابط غير صالح' };
    }
    // The app window is always-on-top; otherwise the external window (e.g. Gmail)
    // would open hidden behind it. Temporarily disable it and restore on focus.
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (win && win.isAlwaysOnTop()) {
      win.setAlwaysOnTop(false);
      const onFocus = () => {
        try { win.setAlwaysOnTop(true); } catch (e) {}
        win.removeListener('focus', onFocus);
      };
      win.on('focus', onFocus);
    }
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Ensure AnyDesk is silently installed on first launch (bundled in resources).
function ensureAnyDeskInstalled() {
  try {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'AnyDesk', 'AnyDesk.exe'),
      'C:\\Program Files (x86)\\AnyDesk\\AnyDesk.exe',
      'C:\\Program Files\\AnyDesk\\AnyDesk.exe'
    ];
    if (candidates.some(c => c && fs.existsSync(c))) return;
    const bundled = path.join(process.resourcesPath || '', 'AnyDesk.exe');
    if (!bundled || !fs.existsSync(bundled)) return;
    const child = spawn(bundled, ['--install', '--silent'], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (e) {
    console.warn('ensureAnyDeskInstalled failed', e);
  }
}

// Launch AnyDesk (remote support). Falls back to the AnyDesk website if not installed.
ipcMain.handle('open-anydesk', async () => {
  try {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'AnyDesk', 'AnyDesk.exe'),
      'C:\\Program Files (x86)\\AnyDesk\\AnyDesk.exe',
      'C:\\Program Files\\AnyDesk\\AnyDesk.exe',
      path.join(process.resourcesPath || '', 'AnyDesk.exe')
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) {
        const child = spawn(c, [], { detached: true, stdio: 'ignore' });
        child.unref();
        return { success: true };
      }
    }
    await shell.openExternal('https://anydesk.com');
    return { success: true, fallback: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Locate the RustDesk executable: a remembered path first, then the copy shipped
// on D:\, then the usual RustDesk install folders (and the bundled resources).
function rustDeskConfigPath() {
  return path.join(app.getPath('userData'), 'rustdesk-path.txt');
}
function readSavedRustDeskPath() {
  try {
    const p = rustDeskConfigPath();
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '';
  } catch (e) { return ''; }
}
function writeSavedRustDeskPath(p) {
  try { fs.writeFileSync(rustDeskConfigPath(), p, 'utf8'); } catch (e) {}
}

function findRustDesk(savedPath) {
  const names = ['rustdesk-1.5.0-x86_64.exe', 'RustDesk.exe'];
  const candidates = [];
  if (savedPath) candidates.push(savedPath);
  for (const n of names) candidates.push('D:\\' + n);
  const dirs = [
    path.join(process.env.LOCALAPPDATA || '', 'RustDesk'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'RustDesk'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'RustDesk'),
    process.resourcesPath || '',
  ];
  for (const dir of dirs) {
    for (const n of names) candidates.push(path.join(dir, n));
  }
  return candidates.find(c => c && fs.existsSync(c)) || null;
}

// Launch RustDesk (remote support). Returns notFound so the renderer can offer to
// pick the executable manually, remembering the chosen path for later.
ipcMain.handle('open-rustdesk', async (_event, savedPath) => {
  try {
    const exe = findRustDesk(savedPath || readSavedRustDeskPath());
    if (!exe) return { success: false, notFound: true };
    const child = spawn(exe, [], { detached: true, stdio: 'ignore' });
    child.unref();
    return { success: true, path: exe };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Let the user choose the RustDesk executable once if it is not found.
ipcMain.handle('pick-rustdesk', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'حدّد ملف RustDesk',
      properties: ['openFile'],
      filters: [{ name: 'RustDesk', extensions: ['exe'] }],
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) {
      return { success: false, canceled: true };
    }
    writeSavedRustDeskPath(result.filePaths[0]);
    return { success: true, path: result.filePaths[0] };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

app.on('before-quit', (event) => {
  // If the app is quit while the main window is still open (menu/tray/other
  // path), give the renderer one chance to flush pending writes first.
  if (!_flushComplete && !_flushRequested) {
    const wc = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.webContents : null;
    if (wc && !wc.isDestroyed()) {
      event.preventDefault();
      _flushRequested = true;
      const finish = () => { _flushComplete = true; app.quit(); };
      const timer = setTimeout(finish, 1500);
      ipcMain.once('app:flush-done', () => { clearTimeout(timer); finish(); });
      try { wc.send('app:flush'); } catch (err) { clearTimeout(timer); finish(); }
      return;
    }
  }
  try { LAN.stop(); } catch (e) {}
  try { PhoneScanner.stop(); } catch (e) {}
});

// ===== LAN PRINTER SHARING (server ⇄ client print queue over the shop LAN) =====
// All operations resolve to { success, data?, error?, needsPermission?, hint? }
// so the renderer can map each failure to a clear, translated user message
// (elevation refusal, unreachable host, PrintNightmare, missing driver, …).
function printerHandle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.warn('[Printer]', channel, e.message);
      return { success: false, error: e.message || 'UNKNOWN' };
    }
  });
}

printerHandle('printer-list-local', () => PrinterNet.listLocalPrinters());
printerHandle('printer-list-drivers', () => PrinterNet.listLocalDrivers());
printerHandle('printer-get-default', () => PrinterNet.getDefaultPrinter());
printerHandle('printer-computer-name', () => PrinterNet.getComputerName());
printerHandle('printer-restart-spooler', () => PrinterNet.restartSpooler());
printerHandle('printer-share', (printerName, shareName) => PrinterNet.sharePrinter(printerName, shareName));
printerHandle('printer-unshare', (printerName) => PrinterNet.unsharePrinter(printerName));
printerHandle('printer-browse', (host) => PrinterNet.browseServerPrinters(host));
printerHandle('printer-install-driver', (infPath) => PrinterNet.installDriver(infPath));
printerHandle('printer-install-driver-share', (uncFolder) => PrinterNet.installDriverFromShare(uncFolder));
printerHandle('printer-connect', (unc) => PrinterNet.connectNetworkPrinter(unc));
printerHandle('printer-set-default', (name) => PrinterNet.setDefaultPrinter(name));
printerHandle('printer-fix', (trustedHost) => PrinterNet.fixPrintNightmare(trustedHost));

// ===== CASH DRAWER («درج النقود») =====
// Settings live per device in userData/cash-drawer.json (never in the DB, stock
// or LAN sync). Channels mirror the printer-* family and always resolve to a
// JSON object, so a missing printer or port can never crash the renderer.
const cashDrawerFile = () => path.join(app.getPath('userData'), 'cash-drawer.json');

function readCashDrawerConfig() {
  try {
    const raw = fs.readFileSync(cashDrawerFile(), 'utf8');
    const saved = JSON.parse(raw);
    return Object.assign(PrinterNet.drawerDefaults(), saved || {});
  } catch (e) {
    return PrinterNet.drawerDefaults();
  }
}

function writeCashDrawerConfig(patch) {
  try {
    const merged = Object.assign(readCashDrawerConfig(), patch || {});
    fs.writeFileSync(cashDrawerFile(), JSON.stringify(merged, null, 2), 'utf8');
    return { success: true, data: merged };
  } catch (e) {
    return { success: false, error: e.message || 'WRITE_FAILED' };
  }
}

function cashDrawerHandle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.warn('[CashDrawer]', channel, e.message);
      return { success: false, error: e.message || 'UNKNOWN' };
    }
  });
}

cashDrawerHandle('cash-drawer-get', () => ({ success: true, data: readCashDrawerConfig() }));
cashDrawerHandle('cash-drawer-save', (patch) => writeCashDrawerConfig(patch));
cashDrawerHandle('cash-drawer-scan', () => PrinterNet.scanDrawerTargets());
cashDrawerHandle('cash-drawer-test', (cfg) => PrinterNet.testDrawer(Object.assign(readCashDrawerConfig(), cfg || {})));
cashDrawerHandle('cash-drawer-open', async (opts) => {
  const cfg = readCashDrawerConfig();
  // `enabled` gates the AUTOMATIC open at sale time; a manual open (F12 or the
  // settings test button) must always work even when the toggle is off.
  if (!opts || opts.source !== 'manual') {
    if (!cfg.enabled) return { success: false, error: 'DISABLED', skipped: true };
  }
  const res = await PrinterNet.openDrawer(cfg);
  // Remember the winning path so the next sale is a single fast shot.
  if (res && res.success && res.transport) {
    writeCashDrawerConfig({
      lastGood: { transport: res.transport, pulseId: res.pulseId, hex: res.hex, at: Date.now() },
    });
  }
  return res;
});

