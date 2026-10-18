// Preload: the only bridge between the page and the main process.
//   wePlatform  the operating system
//   weApp       app info
// WP-DESKTOP adds weNet (requests without CORS), weMail (SMTP), weSecrets
// (safeStorage), weUpdates and the tray; WP-SYNC adds weCloud (Google, Drive).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wePlatform', { os: process.platform });

contextBridge.exposeInMainWorld('weApp', {
  info: () => ipcRenderer.invoke('app:info')
});

// Google sign-in and Drive from the main process (cloud.cjs); every call
// answers { ok, ... }.
contextBridge.exposeInMainWorld('weCloud', {
  status: () => ipcRenderer.invoke('cloud:status'),
  signIn: (texts) => ipcRenderer.invoke('cloud:sign-in', texts),
  signOut: () => ipcRenderer.invoke('cloud:sign-out'),
  getAccessToken: () => ipcRenderer.invoke('cloud:token'),
  list: (folder) => ipcRenderer.invoke('cloud:list', folder),
  get: (file) => ipcRenderer.invoke('cloud:get', file),
  put: (file, data) => ipcRenderer.invoke('cloud:put', file, data),
  delete: (file) => ipcRenderer.invoke('cloud:delete', file)
});
