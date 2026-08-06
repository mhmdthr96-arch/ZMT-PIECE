const path = require('path');
const fs = require('fs');

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const License = require('./license');
const Firebird = require('./firebird');
const LAN = require('./lan-server');

let mainWindow;
let splashWindow;

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

  mainWindow.webContents.on('crashed', (e) => {
    console.error('RENDERER CRASHED:', e);
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`Renderer [${level}]: ${message}`);
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
  createSplash();
  createWindow();
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
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// Fix: after a native dialog (alert/confirm/file) closes on Windows, the frameless
// window can keep visual focus without keyboard focus — inputs freeze until the
// user clicks outside and back. Force a blur+focus cycle to restore keyboard input.
function fixWindowFocus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.blur();
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
  }, 10);
}
ipcMain.on('window-focus-fix', () => fixWindowFocus());

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

ipcMain.handle('get-appdata-path', () => {
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

// ===== LICENSE SYSTEM =====
ipcMain.handle('license-check', () => {
  return License.checkLicense();
});

ipcMain.handle('license-activate', (event, key) => {
  return License.activate(key);
});

ipcMain.handle('license-time-tamper', () => {
  return License.checkTimeTamper();
});

ipcMain.handle('license-remaining', () => {
  return License.getRemainingTime();
});

ipcMain.handle('license-machine-id', () => {
  return License.getMachineFingerprint();
});

ipcMain.handle('license-save-snapshot', (event, time) => {
  License.saveTimeSnapshot(time || Date.now());
  return true;
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

app.on('before-quit', () => {
  try { LAN.stop(); } catch (e) {}
});
