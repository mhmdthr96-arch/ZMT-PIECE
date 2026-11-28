// Narrow bridge for the main-process DevTools password dialog.
// This window is created by main.js only; it never has Node integration and
// cannot reach any other IPC channel. The password comparison itself happens
// in the main process — nothing here decides whether DevTools may open.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zmtDevtoolsAuth', {
  submit: (password) => ipcRenderer.invoke('devtools-auth-submit', password),
  cancel: () => ipcRenderer.invoke('devtools-auth-cancel'),
  onError: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('devtools-auth-error', (_event, message) => cb(message));
  },
});
