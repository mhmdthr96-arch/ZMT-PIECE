const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');

// ===== COMPANY-ISOLATED PROCESS MODE =====
// Every company must own a *separate Chromium profile*, not just a second
// BrowserWindow: IndexedDB and localStorage are per-origin/per-userData, so two
// windows in one process would still share one database and leak data/scopes.
// Capture the base profile BEFORE any override, then point this process's
// userData at the company's own folder. The licence remains shared (machine
// level, in the base profile), while business data + UI state stay isolated.
const BASE_USER_DATA = app.getPath('userData');
const COMPANY_PROFILES_DIR = path.join(BASE_USER_DATA, 'company-profiles');
const COMPANY_ARG_PREFIX = '--company=';
const _companyArg = (process.argv.find(a => a.startsWith(COMPANY_ARG_PREFIX)) || '').slice(COMPANY_ARG_PREFIX.length);
// Only filesystem-safe identifiers are accepted; the value comes from the
// command line (desktop shortcut / manual launch), never from trusted input.
const LAUNCH_COMPANY_ID = /^[A-Za-z0-9_-]{1,120}$/.test(_companyArg) ? _companyArg : '';
const IS_COMPANY_PROCESS = !!LAUNCH_COMPANY_ID;

function companyProfileDir(id) {
  const safe = /^[A-Za-z0-9_-]{1,120}$/.test(String(id || '')) ? String(id) : '';
  return safe ? path.join(COMPANY_PROFILES_DIR, safe) : '';
}

if (IS_COMPANY_PROCESS) {
  const dir = companyProfileDir(LAUNCH_COMPANY_ID);
  try {
    fs.mkdirSync(dir, { recursive: true });
    app.setPath('userData', dir);
    // Separate taskbar grouping as well as separate storage: two companies must
    // never be visually confused as the same app instance.
    app.setAppUserModelId('com.zmt.piece.company.' + LAUNCH_COMPANY_ID);
  } catch (e) {
    console.error('[Company] failed to bind isolated profile:', e);
  }
}

if (process.platform === 'win32' && require('os').release().startsWith('6.1')) {
  app.commandLine.appendSwitch('no-sandbox');
}
const License = require('./license');
const Firebird = require('./firebird');
const MssqlBak = require('./mssql-bak');
const LAN = require('./lan-server');
const PrinterNet = require('./printer-net');
const ScaleNet = require('./scale-net');
const PhoneScanner = require('./phone-scanner');

let mainWindow;
let splashWindow;
let quickEntryWindows = []; // up to MAX_QE_WINDOWS standalone F1 windows (kept alive)
const MAX_QE_WINDOWS = 5;
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
    title: 'ZMT PIECE',
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

  // Restore app name in taskbar; allow page title updates. Company processes
  // keep their own taskbar identity from the launch-context block above.
  if (!IS_COMPANY_PROCESS) {
    try { app.setAppUserModelId('com.zmt.piece'); } catch (e) {}
  }

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

  // Company processes MUST tell the renderer which company they own. The
  // renderer (company-profile.js) picks up `?company=<id>` synchronously before
  // auth/DB init — without it the child looks like a fresh empty main app and
  // never imports the scoped snapshot or binds the session.
  const loadOptions = IS_COMPANY_PROCESS
    ? { query: { company: LAUNCH_COMPANY_ID } }
    : undefined;
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), loadOptions)
    .then(() => console.log('Page loaded'))
    .catch((err) => console.error('Load error:', err));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  console.log('App ready');
  // Licence is machine-wide and must be read from the shared base profile in
  // BOTH main and company processes (company userData holds business data only).
  License.setUserDataPath(BASE_USER_DATA);
  // 2.4.9: pin the machine identity at boot — the first fingerprint computed is
  // persisted to zmt_machine.dat and never recomputed, so no Win7 machine can
  // alternate identities across boots anymore (the root cause of the
  // "هذا المفتاح مربوط بجهاز آخر" / "تلاعب بالوقت" alternation after activation).
  try {
    const mid = License.getMachineFingerprint();
    console.log('Machine fingerprint:', mid);
  } catch (e) { console.warn('Machine fingerprint unavailable:', e && e.message); }

  try {
    // Factory reset: put the machine back to "never installed". Everything this
    // app persists lives in userData — licence/time/device .dat files, the
    // zmt_piece_db IndexedDB business database, localStorage settings and
    // credentials, *.zmt-backup auto backups, phone-scanner certs and tokens,
    // price-display & invoice-logo media, cash-drawer and rustdesk configs —
    // plus the licence mirror in HKCU\Software\ZMT PIECE. The renderer releases
    // its IndexedDB handle (DB.close()) before calling, otherwise Chromium keeps
    // the database folder locked and the wipe silently leaves the data behind.
    ipcMain.handle('license-hard-reset', async () => {
      // An isolated company has no licence files of its own and must never
      // wipe the shared machine activation or the other companies' profiles.
      if (IS_COMPANY_PROCESS) {
        return { success: false, unavailable: true, message: 'تصفية الترخيص متاحة من النسخة الرئيسية فقط.', failed: [] };
      }
      const failed = [];

      try { LAN.stop(); } catch (e) {}
      try { PhoneScanner.stop(); } catch (e) {}

      // Popups share the origin, so each holds its own database connection.
      for (const w of [splashWindow, ...quickEntryWindows]) {
        try { if (w && !w.isDestroyed()) w.destroy(); } catch (e) {}
      }

      let lic = { success: false, message: 'license module unavailable' };
      try {
        if (typeof License.hardResetDevice === 'function') lic = License.hardResetDevice();
      } catch (e) {
        lic = { success: false, message: (e && e.message) || String(e) };
      }

      try {
        await session.defaultSession.clearStorageData();
      } catch (e) {
        failed.push('بيانات الواجهة (' + ((e && e.message) || String(e)) + ')');
      }

      // Entries that must never survive a reset. Chromium re-creates its own
      // cache folders on the next launch and clearStorageData() above already
      // erased what the app stored inside them (a failure there is reported on
      // its own), so a lock on e.g. "Cache" or "Local Storage" is not a failed
      // wipe — listing it would only look like one.
      const CRITICAL = new Set([
        'zmt_license.dat', 'zmt_time.dat', 'zmt_device.dat', 'zmt_smbios.dat', 'zmt_machine.dat',
        'zmt_license_net.log', 'zmt_license_net.log.old', 'zmt_site_url.txt',
        'IndexedDB',
      ]);

      try {
        const ud = app.getPath('userData');
        for (const name of fs.readdirSync(ud)) {
          try {
            fs.rmSync(path.join(ud, name), { recursive: true, force: true });
          } catch (e) {
            if (CRITICAL.has(name)) failed.push(name);
          }
        }
      } catch (e) {
        failed.push('مجلد البيانات (' + ((e && e.message) || String(e)) + ')');
      }

      if (!lic || lic.success !== true) {
        return { success: false, message: (lic && lic.message) || 'خطأ غير معروف', failed };
      }
      return { success: true, failed };
    });
  } catch (e) {}

  try {
    ipcMain.handle('app-relaunch', async () => {
      try {
        app.relaunch();
        app.exit(0);
        return true;
      } catch (e) {
        return false;
      }
    });
  } catch (e) {}

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
// Quick Entry standalone window(s): created on demand and kept alive so the
// operator can minimize (unfinished invoice stays), do normal work in the main
// window, then come back and finish it. F1 focuses/reuses an existing one when
// the cap is reached, otherwise opens a new window (up to MAX_QE_WINDOWS).
function openQuickEntryWindow() {
  // Reuse a minimized/hidden window if any, otherwise focus the most recent.
  for (let i = quickEntryWindows.length - 1; i >= 0; i--) {
    const w = quickEntryWindows[i];
    if (w && !w.isDestroyed() && (!w.isVisible() || w.isMinimized())) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
      w.moveTop();
      return true;
    }
  }
  // Focus an already-visible window if we are at the cap.
  if (quickEntryWindows.length >= MAX_QE_WINDOWS) {
    const w = quickEntryWindows[quickEntryWindows.length - 1];
    if (w && !w.isDestroyed()) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
      w.moveTop();
      return true;
    }
    // prune destroyed
    quickEntryWindows = quickEntryWindows.filter(x => x && !x.isDestroyed());
  }
  // Create a new window.
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const icon = fs.existsSync(iconPath) ? iconPath : undefined;
  const w = new BrowserWindow({
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
  quickEntryWindows.push(w);
  w.setTitle('ZMT Quick Entry - ' + Date.now());
  const qeQuery = { standalone: 'quick-entry' };
  if (IS_COMPANY_PROCESS) qeQuery.company = LAUNCH_COMPANY_ID;
  w.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: qeQuery });
  w.once('ready-to-show', () => {
    if (w && !w.isDestroyed()) {
      try { w.setAlwaysOnTop(true, 'screen-saver'); } catch (e) {}
      try { w.maximize(); } catch (e) { w.show(); }
      w.focus();
      w.moveTop();
      // Polling restore for 5s
      let polls = 0;
      const timer = setInterval(() => {
        polls++;
        if (!w || w.isDestroyed()) { clearInterval(timer); return; }
        if (w.isMinimized()) {
          console.log('[QE] poll restore at', Date.now());
          try { w.restore(); w.maximize(); w.focus(); w.moveTop(); } catch (e) {}
        }
        if (polls >= 50) { // 5s
          clearInterval(timer);
          try { w.setAlwaysOnTop(false); } catch (e) {}
        }
      }, 100);
    }
  });
  // Even if ready-to-show never fires (e.g. slow boot), don't leave a ghost window.
  setTimeout(() => {
    if (w && !w.isDestroyed() && !w.isVisible()) {
      try { w.maximize(); w.focus(); w.moveTop(); } catch (e) {}
    }
  }, 2500);
  w.webContents.once('did-fail-load', (e, code, desc) => {
    console.error('[QE] Failed to load quick-entry page:', code, desc);
    if (w && !w.isDestroyed()) {
      w.destroy();
    }
  });
  // Re-sync the shared IndexedDB cache whenever the window regains focus.
  w.on('focus', () => {
    if (w && !w.isDestroyed()) {
      w.webContents.send('quick-entry-refresh');
    }
    // Broadcast to all other quick-entry windows too.
    quickEntryWindows.forEach((ow) => {
      if (ow && !ow.isDestroyed() && ow !== w) {
        try { ow.webContents.send('quick-entry-refresh'); } catch (e) {}
      }
    });
  });
  w.on('minimize', () => {
    console.log('[QE] window minimized at', Date.now(), 'visible=', w.isVisible());
    // Auto-restore if it happens immediately after creation (Windows focus quirk).
    setTimeout(() => {
      if (w && !w.isDestroyed() && w.isMinimized()) {
        try { w.restore(); w.show(); w.focus(); w.moveTop(); } catch (e) {}
      }
    }, 50);
  });
  w.on('hide', () => {
    console.log('[QE] window hidden at', Date.now());
    setTimeout(() => {
      if (w && !w.isDestroyed() && !w.isVisible()) {
        try { w.show(); w.focus(); w.moveTop(); } catch (e) {}
      }
    }, 50);
  });
  w.on('blur', () => { console.log('[QE] window blur at', Date.now()); });
  w.on('focus', () => { console.log('[QE] window focus at', Date.now()); });
  // Extra safety: ensure the window is not left minimized/hidden after creation.
  w.on('show', () => { try { w.focus(); w.moveTop(); } catch (e) {} });
  return true;
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

// Base profile is always the shared machine-level profile (licence, migration
// snapshots, update cache). Company processes get their own userData, so the
// renderer needs this explicit path to read a scoped snapshot on first launch.
ipcMain.handle('get-base-app-data-path', () => BASE_USER_DATA);

ipcMain.handle('get-launch-context', () => ({
  companyId: LAUNCH_COMPANY_ID,
  isolated: IS_COMPANY_PROCESS,
  baseAppDataPath: BASE_USER_DATA,
}));

// ===== COMPANY PROFILE: preparation, launch, shortcut =====
// A company process is a genuinely separate app process with its own userData.
// The main (shared) instance owns the single machine-level licence, the LAN
// server and the phone scanner; company processes are pure business profiles.
function _companyArgs(id) {
  return app.isPackaged
    ? ['--company=' + id]
    : ['--company=' + id, app.getAppPath()];
}

// Portable LAN/phone services bind fixed ports (4512-4521). Only the main
// instance may own them: two processes binding the same port would either
// crash or, worse, route a phone scan into the wrong company's database.
const _portServiceUnavailable = () => ({ success: false, unavailable: true, message: 'Services are owned by the main ZMT PIECE instance.' });

// Company IPC is registered in both the main and isolated processes. Re-register
// defensively so a dev reload / partial restart can never leave the renderer
// calling a channel whose handler vanished with an older main process.
const COMPANY_IPC_CHANNELS = [
  'company-ipc-status', 'company-prepare-snapshot',
  'company-open-window', 'company-create-shortcut',
];
function _companyIpcHandle(channel, handler) {
  try { ipcMain.removeHandler(channel); } catch (e) {}
  ipcMain.handle(channel, handler);
}

_companyIpcHandle('company-ipc-status', () => ({
  ok: true,
  version: app.getVersion(),
  isolated: IS_COMPANY_PROCESS,
  channels: COMPANY_IPC_CHANNELS,
}));

_companyIpcHandle('company-prepare-snapshot', async (event, companyId, payload) => {
  const dir = companyProfileDir(companyId);
  if (!dir) return { success: false, error: 'INVALID_COMPANY_ID' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'migration.json');
    // Backup-first: a previous snapshot is never silently lost when the user
    // refreshes a company profile. Keep one recoverable copy on disk.
    if (fs.existsSync(target)) {
      try { fs.copyFileSync(target, path.join(dir, 'migration.json.bak')); } catch (e) {}
    }
    const tmp = path.join(dir, 'migration.json.tmp');
    fs.writeFileSync(tmp, JSON.stringify(payload || {}, null, 2), 'utf8');
    fs.renameSync(tmp, target);
    return { success: true, path: target };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
});

_companyIpcHandle('company-open-window', (event, companyId) => {
  const dir = companyProfileDir(companyId);
  if (!dir) return { success: false, error: 'INVALID_COMPANY_ID' };
  if (!fs.existsSync(path.join(dir, 'migration.json'))) {
    return { success: false, error: 'SNAPSHOT_MISSING' };
  }
  try {
    const child = spawn(process.execPath, _companyArgs(String(companyId)), {
      cwd: app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.on('error', (err) => console.error('[Company] spawn failed:', err));
    child.unref();
    return { success: true, pid: child.pid };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
});

_companyIpcHandle('company-create-shortcut', (event, companyId, companyName) => {
  const dir = companyProfileDir(companyId);
  if (!dir) return { success: false, error: 'INVALID_COMPANY_ID' };
  if (process.platform !== 'win32' || typeof shell.writeShortcutLink !== 'function') {
    return { success: false, error: 'SHORTCUT_UNSUPPORTED' };
  }
  try {
    const safeName = String(companyName || companyId).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || String(companyId);
    const linkPath = path.join(app.getPath('desktop'), 'ZMT PIECE - ' + safeName + '.lnk');
    const iconPath = path.join(__dirname, 'assets', 'icon.ico');
    const ok = shell.writeShortcutLink(linkPath, 'create', {
      target: process.execPath,
      args: _companyArgs(String(companyId)).join(' '),
      cwd: app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(),
      icon: fs.existsSync(iconPath) ? iconPath : process.execPath,
      iconIndex: 0,
      description: 'ZMT PIECE - ' + safeName,
    });
    return ok ? { success: true, path: linkPath } : { success: false, error: 'SHORTCUT_FAILED' };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
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

// ===== BUSINESS LOGO — invoices only, LOCAL-ONLY (never uploaded) =====
// The invoice logo lives on the device disk and only its PATH is kept in
// localStorage, so a cloud backup never carries image bytes and the free
// Supabase tier is never spent on it. Print windows are isolated popups (and
// the PDF path renders through a hidden `data:` URL), so the logo has to be
// inlined as a base64 data URL every time it is drawn — a `file://` src would
// simply not load there.
const INVOICE_LOGO_DIR = () => path.join(app.getPath('userData'), 'zmt-invoice-logo');
const LOGO_EXT = (p) => {
  const ext = path.extname(String(p || '')).toLowerCase();
  return /^\.(png|jpe?g|gif|webp|bmp|svg)$/.test(ext) ? ext : '.png';
};
// True when `child` is genuinely inside `parent` (not a sibling whose name
// merely starts with the same prefix, e.g. "zmt-invoice-logo-evil").
function _isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const LOGO_MIME = (ext) => ({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
}[ext] || 'image/png');

// Copy the picked file into the app's own folder so the logo survives the user
// moving/deleting the original, and delete the previous one to avoid leftovers.
ipcMain.handle('invoice-logo-import', async (event, srcPath, previousPath) => {
  try {
    if (!srcPath || typeof srcPath !== 'string') return { success: false, error: 'bad_path' };
    if (!fs.existsSync(srcPath)) return { success: false, error: 'missing_source' };
    const dir = INVOICE_LOGO_DIR();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = LOGO_EXT(srcPath);
    const dest = path.join(dir, 'logo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + ext);
    fs.copyFileSync(srcPath, dest);
    // best-effort cleanup of the replaced file (only ever inside our own dir)
    try {
      if (previousPath && typeof previousPath === 'string') {
        if (_isInside(dir, previousPath) && fs.existsSync(previousPath)) fs.unlinkSync(previousPath);
      }
    } catch (e) { /* a leftover file is harmless */ }
    return { success: true, path: dest, size: fs.statSync(dest).size };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('invoice-logo-remove', async (event, destPath) => {
  try {
    if (!destPath || typeof destPath !== 'string') return { success: true };
    const dir = INVOICE_LOGO_DIR();
    if (!_isInside(dir, destPath)) return { success: false, error: 'outside_logo_dir' };
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Read the stored logo and hand it back as a ready-to-inline data URL.
// Missing file is NOT an error result the UI should shout about — callers
// simply print the invoice without a logo (the sale must never be blocked).
ipcMain.handle('invoice-logo-dataurl', async (event, logoPath) => {
  try {
    if (!logoPath || typeof logoPath !== 'string') return { success: false, error: 'no_path' };
    if (!fs.existsSync(logoPath)) return { success: false, error: 'missing_file' };
    const ext = LOGO_EXT(logoPath);
    const buf = fs.readFileSync(logoPath);
    return { success: true, dataUrl: 'data:' + LOGO_MIME(ext) + ';base64,' + buf.toString('base64'), size: buf.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

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
    if (!_isInside(dir, destPath)) return { success: false, error: 'outside_media_dir' };
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
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
      { name: 'All Supported', extensions: ['csv','tsv','txt','xlsx','xls','json','xml','sql','db','sqlite','sqlite3','mdb','accdb','gdb','fdb','fbk','dbf','bak','gssp','zgssp'] },
      { name: 'CSV/Text', extensions: ['csv','tsv','txt'] },
      { name: 'Excel', extensions: ['xlsx','xls'] },
      { name: 'Database', extensions: ['db','sqlite','sqlite3','mdb','accdb','gdb','fdb','fbk','bak'] },
      { name: 'Legacy Backup', extensions: ['bak','gssp','zgssp','fdb','fbk','gdb','db','sqlite'] },
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

// ===== MSSQL .bak IMPORTER (Gestion Stock SQL Server backups) =====
ipcMain.handle('mssql-bak-ensure', async () => {
  try { return { success: true, data: await MssqlBak.ensureEngine() }; }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('mssql-bak-detect', async (event, bakPath) => {
  try { return await MssqlBak.detect(bakPath); }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('mssql-bak-export', async (event, bakPath) => {
  try { return await MssqlBak.exportAll(bakPath); }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('mssql-bak-read-table', async (event, bakPath, table) => {
  try { return await MssqlBak.readTable(bakPath, table); }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('mssql-bak-dispose', async (event, bakPath) => {
  try { return await MssqlBak.dispose(bakPath); }
  catch (err) { return { success: false, error: err.message }; }
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

// ---------- update download / install helpers ----------
const UPDATE_DIR = () => path.join(app.getPath('userData'), 'updates');
const UPDATE_LOG_FILE = () => path.join(app.getPath('userData'), 'update.log');
// Anything smaller than this cannot be a 100+ MB NSIS installer — most often it
// is an HTML error page saved under an .exe name.
const MIN_INSTALLER_BYTES = 1024 * 1024;

function _updateLog(message) {
  const line = '[' + new Date().toISOString() + '] ' + message + '\r\n';
  try {
    fs.mkdirSync(path.dirname(UPDATE_LOG_FILE()), { recursive: true });
    fs.appendFileSync(UPDATE_LOG_FILE(), line, 'utf8');
  } catch (e) {}
  try { console.log('[updater]', message); } catch (e) {}
}

function _ensureUpdateDir() {
  const dir = UPDATE_DIR();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function _safeSize(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() ? st.size : 0;
  } catch (e) { return 0; }
}

function _isPeFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const head = Buffer.alloc(2);
      const n = fs.readSync(fd, head, 0, 2, 0);
      return n === 2 && head[0] === 0x4d && head[1] === 0x5a; // "MZ"
    } finally { fs.closeSync(fd); }
  } catch (e) { return false; }
}

function _sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Reuse a previously downloaded installer only when it is complete and its
// hash (or at least its size + PE header) matches, so a retry never downloads
// another 120 MB over a working file.
async function _reuseDownloadedInstaller(destPath, expected) {
  expected = expected || {};
  const size = _safeSize(destPath);
  if (!size || size < MIN_INSTALLER_BYTES) return null;
  if (expected.size && Number(expected.size) !== size) return null;
  if (!_isPeFile(destPath)) return null;
  if (expected.sha256) {
    let actual = '';
    try { actual = await _sha256File(destPath); } catch (e) { return null; }
    if (actual.toLowerCase() !== String(expected.sha256).toLowerCase()) return null;
    return { sha256: actual, size, reused: true };
  }
  return { sha256: '', size, reused: true };
}

async function _downloadTo(url, destPath, onProgress, expectedSize) {
  const res = await _httpsGet(url);
  const total = parseInt(res.headers['content-length'] || '0', 10) || Number(expectedSize) || 0;
  const hash = crypto.createHash('sha256');
  // Download into a .part file: an interrupted download must never be mistaken
  // for a valid installer by the next run.
  const partPath = destPath + '.part';
  try { fs.unlinkSync(partPath); } catch (e) {}
  let received = 0, lastSent = 0;
  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(partPath);
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        try { out.destroy(); } catch (e) {}
        reject(err);
      };
      res.on('data', (chunk) => {
        if (settled) return;
        hash.update(chunk);
        received += chunk.length;
        const now = Date.now();
        if (onProgress && (now - lastSent > 250 || (total && received === total))) {
          lastSent = now;
          onProgress({ received, total, percent: total ? Math.min(100, Math.round((received / total) * 100)) : 0 });
        }
      });
      res.on('error', fail);
      out.on('error', fail);
      out.on('finish', () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      res.pipe(out);
    });
    if (total && received !== total) {
      throw new Error('download incomplete (' + received + '/' + total + ')');
    }
    const sha256 = hash.digest('hex');
    try { fs.unlinkSync(destPath); } catch (e) {}
    fs.renameSync(partPath, destPath);
    return { sha256, size: received };
  } catch (e) {
    try { fs.unlinkSync(partPath); } catch (err) {}
    throw e;
  }
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
    const rawName = String(payload.fileName || payload.name || ('ZMT.PIECE-Setup-' + info.channelKey + '.exe'));
    const fileName = path.basename(rawName).replace(/[^\w.\- ]+/g, '_') ||
      ('ZMT.PIECE-Setup-' + info.channelKey + '.exe');
    const dir = _ensureUpdateDir();
    const destPath = path.join(dir, fileName);
    _updateLog('download requested: ' + payload.url + ' -> ' + destPath);

    const cached = await _reuseDownloadedInstaller(destPath, payload);
    if (cached) {
      _updateLog('reusing verified installer (' + cached.size + ' bytes)');
      return { ok: true, filePath: destPath, sha256: cached.sha256, size: cached.size, reused: true };
    }
    try { fs.unlinkSync(destPath); } catch (e) {}

    const result = await _downloadTo(payload.url, destPath, (p) => {
      try { event.sender.send('update-progress', p); } catch (e) {}
    }, payload.size);

    if (payload.sha256 && result.sha256.toLowerCase() !== String(payload.sha256).toLowerCase()) {
      try { fs.unlinkSync(destPath); } catch (e) {}
      throw new Error('sha256 mismatch');
    }
    if (payload.size && Number(payload.size) !== result.size) {
      try { fs.unlinkSync(destPath); } catch (e) {}
      throw new Error('size mismatch (' + result.size + '/' + payload.size + ')');
    }
    if (!_isPeFile(destPath)) {
      try { fs.unlinkSync(destPath); } catch (e) {}
      throw new Error('downloaded file is not a Windows installer');
    }
    _updateLog('download ok: ' + result.size + ' bytes sha256=' + result.sha256);
    return { ok: true, filePath: destPath, sha256: result.sha256, size: result.size };
  } catch (e) {
    _updateLog('download failed: ' + ((e && e.message) || e));
    return { ok: false, error: (e && e.message) || String(e) };
  }
});

function _isInsideUpdateDir(filePath) {
  try {
    const dir = path.resolve(_ensureUpdateDir());
    const p = path.resolve(String(filePath || ''));
    return p === dir || p.startsWith(dir + path.sep);
  } catch (e) { return false; }
}

// Launch the NSIS installer and wait for the OS to actually accept it. The old
// code ignored both 'spawn' and 'error': when an antivirus quarantined the
// unsigned .exe in %TEMP%, nothing started, the app still quit 1.5 s later and
// the user only saw "فشل التحديث" with no reason.
function _spawnInstaller(filePath) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(filePath, ['/S', '--updated'], {
        cwd: path.dirname(filePath),
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch (e) {
      return resolve({ ok: false, code: (e && e.code) || 'SPAWN', error: (e && e.message) || String(e) });
    }
    let settled = false;
    let timer = null;
    const done = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    child.once('spawn', () => {
      try { child.unref(); } catch (e) {}
      done({ ok: true, pid: child.pid || 0 });
    });
    child.once('error', (err) => {
      done({ ok: false, code: (err && err.code) || 'SPAWN', error: (err && err.message) || String(err) });
    });
    // Safety net so the IPC call can never hang the panel forever.
    timer = setTimeout(() => done({ ok: true, pid: (child && child.pid) || 0, assumed: true }), 5000);
    if (timer && typeof timer.unref === 'function') timer.unref();
  });
}

ipcMain.handle('update-install', async (event, filePath) => {
  try {
    const p = String(filePath || '');
    _updateLog('install requested: ' + p);
    if (!p) throw new Error('installer not found');
    if (!_isInsideUpdateDir(p)) throw new Error('installer path rejected');
    const size = _safeSize(p);
    if (!size) throw new Error('installer not found');
    if (size < MIN_INSTALLER_BYTES) throw new Error('installer is incomplete (' + size + ' bytes)');
    if (!_isPeFile(p)) throw new Error('file is not a Windows installer');
    // An antivirus/restore operation sometimes clears the execute bit.
    try { fs.chmodSync(p, 0o666); } catch (e) {}

    let launch = await _spawnInstaller(p);
    if (!launch.ok) {
      _updateLog('first launch failed: ' + launch.code + ' ' + launch.error + ' — retrying from a clean copy');
      // Blocking execution in place is the usual antivirus behaviour; a fresh
      // copy with a new name in the app data folder normally goes through.
      const retryPath = path.join(_ensureUpdateDir(), 'ZMT-PIECE-Setup-latest-' + Date.now() + '.exe');
      try {
        fs.copyFileSync(p, retryPath);
        try { fs.chmodSync(retryPath, 0o666); } catch (e) {}
        launch = await _spawnInstaller(retryPath);
      } catch (e) {
        _updateLog('copy for retry failed: ' + ((e && e.message) || e));
      }
    }
    if (!launch.ok) {
      _updateLog('install failed: ' + launch.code + ' ' + launch.error);
      return { ok: false, error: launch.error || 'installer could not start', code: launch.code || '' };
    }
    _updateLog('installer started pid=' + launch.pid);
    // Give the installer time to initialise before the single-instance mutex
    // disappears, then quit so NSIS can replace the app files.
    setTimeout(() => { try { app.quit(); } catch (e) {} }, 1500);
    return { ok: true, pid: launch.pid || 0 };
  } catch (e) {
    _updateLog('install failed: ' + ((e && e.message) || e));
    return { ok: false, error: (e && e.message) || String(e) };
  }
});

ipcMain.handle('update-open-log', async () => {
  try {
    _updateLog('log opened by user');
    const err = await shell.openPath(UPDATE_LOG_FILE());
    return { ok: !err, error: err || '' };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
});

ipcMain.handle('update-open-folder', async () => {
  try {
    const err = await shell.openPath(_ensureUpdateDir());
    return { ok: !err, error: err || '' };
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
  if (IS_COMPANY_PROCESS) return _portServiceUnavailable();
  return await LAN.configure(config || {});
});

ipcMain.handle('lan-send', (event, payload) => {
  if (IS_COMPANY_PROCESS) return false;
  LAN.sendFromRenderer(payload);
  return true;
});

ipcMain.handle('lan-get-local-ip', () => {
  if (IS_COMPANY_PROCESS) return [];
  return LAN.getLocalIps();
});

ipcMain.handle('lan-get-status', () => {
  if (IS_COMPANY_PROCESS) return { role: '', running: false, connected: false, unavailable: true };
  return LAN.getStatus();
});

ipcMain.handle('lan-test-connection', (event, ip, port) => {
  if (IS_COMPANY_PROCESS) return _portServiceUnavailable();
  return LAN.testConnection(ip, port);
});

// Proactively allow the app through Windows Firewall so the LAN server (main
// role) can accept inbound connections from sub devices. Adding a rule needs
// admin rights, so we self-elevate via PowerShell's -Verb RunAs (shows a UAC
// prompt). If the user denies elevation we just report it and the UI shows a
// manual hint instead.
ipcMain.handle('lan-ensure-firewall', async () => {
  if (IS_COMPANY_PROCESS) return _portServiceUnavailable();
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
// A scan must land in the field the operator is actually using — including
// the standalone quick-entry child windows, not only the main window.
PhoneScanner.setWindowGetter(() => BrowserWindow.getFocusedWindow() || mainWindow);
PhoneScanner.setUserDataDir(IS_COMPANY_PROCESS ? app.getPath('userData') : BASE_USER_DATA);
if (!IS_COMPANY_PROCESS) {
  PhoneScanner.loadTokens();
  PhoneScanner.loadSaleEnabled();
}

ipcMain.handle('phs-get-status', () => {
  if (IS_COMPANY_PROCESS) return { status: 'unavailable', error: 'MAIN_INSTANCE_ONLY', port: 0, saleEnabled: false, clients: 0, connected: [], unavailable: true };
  return PhoneScanner.getStatus();
});
ipcMain.handle('phs-start', async () => {
  if (IS_COMPANY_PROCESS) return _portServiceUnavailable();
  return await PhoneScanner.start();
});
ipcMain.handle('phs-stop', () => {
  if (IS_COMPANY_PROCESS) return { success: true, skipped: true };
  return PhoneScanner.stop();
});
ipcMain.handle('phs-decide', (event, requestId, decision) => {
  if (IS_COMPANY_PROCESS) return _portServiceUnavailable();
  return PhoneScanner.decide(requestId, decision);
});
ipcMain.handle('phs-list-approved', () => {
  if (IS_COMPANY_PROCESS) return [];
  return PhoneScanner.listApproved();
});
ipcMain.handle('phs-remove-device', (event, deviceId) => {
  if (IS_COMPANY_PROCESS) return _portServiceUnavailable();
  return PhoneScanner.removeApproved(deviceId);
});
ipcMain.handle('phs-ensure-firewall', async () => {
  if (IS_COMPANY_PROCESS) return _portServiceUnavailable();
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
  if (IS_COMPANY_PROCESS) return;
  try { PhoneScanner.respondToPending(requestId, result); } catch (e) { console.warn('[PhonePOS] respond error', e.message); }
});

ipcMain.handle('psale-get-enabled', () => ({ enabled: !IS_COMPANY_PROCESS && PhoneScanner.getSaleEnabled() }));

ipcMain.handle('psale-set-enabled', (event, enabled) => {
  if (IS_COMPANY_PROCESS) return { enabled: false, unavailable: true };
  const st = PhoneScanner.setSaleEnabled(!!enabled);
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('psale-enabled', { enabled: st });
  } catch (e) {}
  return { enabled: st };
});

ipcMain.handle('psale-set-device-sell', (event, deviceId, sell) => {
  if (IS_COMPANY_PROCESS) return { success: false, unavailable: true };
  return PhoneScanner.setDeviceSell(String(deviceId || ''), !!sell);
});

ipcMain.handle('psale-get-device-sell', (event, deviceId) => {
  if (IS_COMPANY_PROCESS) return false;
  return PhoneScanner.getDeviceSell(String(deviceId || ''));
});

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
//
// The read-only queries each spawn PowerShell (Get-Printer, Get-PrinterDriver,
// CIM, $env:COMPUTERNAME). Opening Settings used to fire all four at once, so
// cache them briefly and share an in-flight query. Every mutating printer call
// clears this cache in `finally`, so the UI never shows stale data after a
// share/default/install/connect change. Failures are never cached.
const PRINTER_READ_CACHE_TTL = 30000;
const _printerReadCache = new Map(); // key -> { at, promise }

function _cachedPrinterRead(key, load) {
  const now = Date.now();
  const hit = _printerReadCache.get(key);
  if (hit && (now - hit.at) < PRINTER_READ_CACHE_TTL && hit.promise) return hit.promise;
  const entry = { at: now, promise: null };
  entry.promise = Promise.resolve()
    .then(load)
    .then(res => {
      entry.at = Date.now();
      if (!res || res.success === false) _printerReadCache.delete(key);
      return res;
    })
    .catch(err => {
      _printerReadCache.delete(key);
      throw err;
    });
  _printerReadCache.set(key, entry);
  return entry.promise;
}

function _invalidatePrinterCache() { _printerReadCache.clear(); }

// `invalidate` is set on every mutating channel below; `finally` also covers a
// partially applied change that threw before returning its JSON result.
function printerHandle(channel, fn, invalidate) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.warn('[Printer]', channel, e.message);
      return { success: false, error: e.message || 'UNKNOWN' };
    } finally {
      if (invalidate) _invalidatePrinterCache();
    }
  });
}

printerHandle('printer-list-local', () => _cachedPrinterRead('list-local', () => PrinterNet.listLocalPrinters()));
printerHandle('printer-list-drivers', () => _cachedPrinterRead('list-drivers', () => PrinterNet.listLocalDrivers()));
printerHandle('printer-get-default', () => _cachedPrinterRead('get-default', () => PrinterNet.getDefaultPrinter()));
printerHandle('printer-computer-name', () => _cachedPrinterRead('computer-name', () => PrinterNet.getComputerName()));
printerHandle('printer-restart-spooler', () => PrinterNet.restartSpooler(), true);
printerHandle('printer-share', (printerName, shareName) => PrinterNet.sharePrinter(printerName, shareName), true);
printerHandle('printer-unshare', (printerName) => PrinterNet.unsharePrinter(printerName), true);
printerHandle('printer-browse', (host) => PrinterNet.browseServerPrinters(host));
printerHandle('printer-install-driver', (infPath) => PrinterNet.installDriver(infPath), true);
printerHandle('printer-install-driver-share', (uncFolder) => PrinterNet.installDriverFromShare(uncFolder), true);
printerHandle('printer-connect', (unc) => PrinterNet.connectNetworkPrinter(unc), true);
printerHandle('printer-set-default', (name) => PrinterNet.setDefaultPrinter(name), true);
printerHandle('printer-fix', (trustedHost) => PrinterNet.fixPrintNightmare(trustedHost), true);

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

// ===== SCALE LINK («مزامنة الميزان») =====
// The shop's article list is pushed into the weighing scale so the machine can
// print the labels the register already reads (scale-core.js). Settings live per
// device in userData/scale-sync.json — never in the DB or the LAN sync, exactly
// like the cash drawer, because they describe THIS counter's cable/IP.
const scaleSyncFile = () => path.join(app.getPath('userData'), 'scale-sync.json');

function readScaleSyncConfig() {
  try {
    const raw = fs.readFileSync(scaleSyncFile(), 'utf8');
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

function writeScaleSyncConfig(patch) {
  try {
    const merged = Object.assign(readScaleSyncConfig(), patch || {});
    fs.writeFileSync(scaleSyncFile(), JSON.stringify(merged, null, 2), 'utf8');
    return { success: true, data: merged };
  } catch (e) {
    return { success: false, error: e.message || 'WRITE_FAILED' };
  }
}

function scaleSyncHandle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.warn('[ScaleSync]', channel, e.message);
      return { success: false, error: e.message || 'UNKNOWN' };
    }
  });
}

scaleSyncHandle('scale-sync-get', () => ({ success: true, data: readScaleSyncConfig() }));
scaleSyncHandle('scale-sync-save', (patch) => writeScaleSyncConfig(patch));
scaleSyncHandle('scale-sync-scan', () => ScaleNet.scanPorts());
scaleSyncHandle('scale-sync-send', (payload) => {
  const p = payload || {};
  return ScaleNet.sendText(p.cfg || {}, p.text || '', p.encoding || 'utf8');
});

