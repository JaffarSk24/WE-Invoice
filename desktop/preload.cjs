// Preload: the only bridge between the page and the main process. The
// page is sandboxed, so this file uses ipcRenderer only.
//   weStorage   the data file (userData/we-invoice-data.json) and its backups
//   weApp       app info, the close handshake, notifications, login item,
//               deep links
//   wePlatform  the operating system
//   weUpdates   update check, download and install
//   weNet       HTTP requests from the main process (no CORS, allowlist)
//   weMail      SMTP through nodemailer in the main process
//   weSecrets   small secrets sealed by the system keychain (safeStorage)
//   weTray      the tray state and its actions
//   weScheduler background wake-ups (recurring invoices, reminders, eFaktúry)
//   weCloud     Google sign-in and Drive from the main process (cloud.cjs)
const { contextBridge, ipcRenderer } = require('electron');

// Subscribes to a channel; returns the function that unsubscribes.
function listen(channel, callback) {
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('wePlatform', { os: process.platform });

contextBridge.exposeInMainWorld('weStorage', {
  // Synchronous read at start-up: the store initialises before the first render.
  load: () => ipcRenderer.sendSync('storage:load'),
  save: (json) => ipcRenderer.send('storage:save', json),
  keepCopy: (tag, json) => ipcRenderer.send('storage:keep-copy', tag, json),
  backupsFolder: () => ipcRenderer.invoke('storage:open-backups')
});

contextBridge.exposeInMainWorld('weApp', {
  info: () => ipcRenderer.invoke('app:info'),
  onBeforeClose: (callback) => listen('app:before-close', callback),
  closeReady: () => ipcRenderer.send('app:close-ready'),
  notify: (title, body) => ipcRenderer.invoke('app:notify', title, body),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getLoginItem: () => ipcRenderer.invoke('app:login-item:get'),
  setLoginItem: (enabled) => ipcRenderer.invoke('app:login-item:set', enabled),
  onDeepLink: (callback) => listen('app:deep-link', callback),
  pendingLink: () => ipcRenderer.invoke('app:pending-link')
});

contextBridge.exposeInMainWorld('weUpdates', {
  check: () => ipcRenderer.invoke('updates:check'),
  download: () => ipcRenderer.invoke('updates:download'),
  install: () => ipcRenderer.invoke('updates:install'),
  onProgress: (callback) => listen('updates:progress', callback)
});

contextBridge.exposeInMainWorld('weNet', {
  request: (request) => ipcRenderer.invoke('net:request', request),
  allowHost: (host) => ipcRenderer.invoke('net:allow-host', host),
  forgetHost: (host) => ipcRenderer.invoke('net:forget-host', host),
  hosts: () => ipcRenderer.invoke('net:hosts')
});

contextBridge.exposeInMainWorld('weMail', {
  test: (config) => ipcRenderer.invoke('mail:test', config),
  send: (config, message) => ipcRenderer.invoke('mail:send', config, message),
  setPassword: (value) => ipcRenderer.invoke('mail:set-password', value),
  hasPassword: () => ipcRenderer.invoke('mail:has-password')
});

contextBridge.exposeInMainWorld('weSecrets', {
  available: () => ipcRenderer.invoke('secrets:available'),
  get: (name) => ipcRenderer.invoke('secrets:get', name),
  set: (name, value) => ipcRenderer.invoke('secrets:set', name, value),
  delete: (name) => ipcRenderer.invoke('secrets:delete', name)
});

contextBridge.exposeInMainWorld('weTray', {
  setState: (state) => ipcRenderer.send('tray:state', state),
  onAction: (callback) => listen('tray:action', callback)
});

contextBridge.exposeInMainWorld('weScheduler', {
  onTick: (callback) => listen('scheduler:tick', callback),
  state: () => ipcRenderer.invoke('scheduler:state'),
  runNow: (kind) => ipcRenderer.invoke('scheduler:run-now', kind),
  setDisabled: (kinds) => ipcRenderer.invoke('scheduler:set-disabled', kinds)
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
