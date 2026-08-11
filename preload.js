const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  focusFix: () => ipcRenderer.send('window-focus-fix'),
  openFile: (options) => ipcRenderer.invoke('dialog-open-file', options),
  saveFile: (options) => ipcRenderer.invoke('dialog-save-file', options),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  writeFileBinary: (filePath, base64Data) => ipcRenderer.invoke('write-file-binary', filePath, base64Data),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  openFileImport: () => ipcRenderer.invoke('open-file-import'),
  // Firebird (.fdb/.gdb) reader
  firebirdDetect: (dbPath, options) => ipcRenderer.invoke('firebird-detect', dbPath, options),
  firebirdTables: (dbPath, options) => ipcRenderer.invoke('firebird-tables', dbPath, options),
  firebirdColumns: (dbPath, table, options) => ipcRenderer.invoke('firebird-columns', dbPath, table, options),
  firebirdCount: (dbPath, table, options) => ipcRenderer.invoke('firebird-count', dbPath, table, options),
  firebirdQuery: (dbPath, table, columns, from, to, options) => ipcRenderer.invoke('firebird-query', dbPath, table, columns, from, to, options),
  firebirdRestore: (backupPath, options) => ipcRenderer.invoke('firebird-restore', backupPath, options),
  // Splash / App Ready
  splashClose: () => ipcRenderer.send('splash-close'),
  // App version (matches the installed package.json version)
  appVersion: () => ipcRenderer.invoke('app-version'),
  // License System
  licenseCheck: () => ipcRenderer.invoke('license-check'),
  licenseActivate: (payload) => ipcRenderer.invoke('license-activate', payload),
  licenseServerStatus: (code, password) => ipcRenderer.invoke('license-server-status', code, password),
  licenseTimeTamper: () => ipcRenderer.invoke('license-time-tamper'),
  licenseRemaining: () => ipcRenderer.invoke('license-remaining'),
  licenseMachineId: () => ipcRenderer.invoke('license-machine-id'),
  // LAN Sync (main/sub server)
  lanConfigure: (config) => ipcRenderer.invoke('lan-configure', config),
  lanSend: (payload) => ipcRenderer.invoke('lan-send', payload),
  lanGetLocalIp: () => ipcRenderer.invoke('lan-get-local-ip'),
  lanGetStatus: () => ipcRenderer.invoke('lan-get-status'),
  lanTestConnection: (ip, port) => ipcRenderer.invoke('lan-test-connection', ip, port),
  onLanMessage: (cb) => ipcRenderer.on('lan-message', (_e, msg) => cb(msg)),
  onLanStatus: (cb) => ipcRenderer.on('lan-status', (_e, st) => cb(st)),
});
