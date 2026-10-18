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
