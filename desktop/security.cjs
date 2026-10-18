// Hardening of every web page the app opens. The page of the app may only
// show itself (app://bundle, or the Vite dev server in development); any
// other navigation is refused, and http(s) and mailto links open in the
// system browser or mail client instead. <webview> is never attached.
// Permissions a page asks for are refused unless the app needs them:
// notifications, writing to the clipboard and the camera (scanning QR codes
// of receipts and invoices).

const APP_ORIGIN = 'app://bundle';
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-sanitized-write', 'media']);
const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

function appOrigins(devPort) {
  const origins = [APP_ORIGIN];
  if (devPort) origins.push(`http://localhost:${devPort}`);
  return origins;
}

// True when a URL belongs to the app itself.
function isAppUrl(url, devPort) {
  try {
    const parsed = new URL(String(url));
    const origin = parsed.protocol === 'app:' ? `app://${parsed.host}` : parsed.origin;
    return appOrigins(devPort).includes(origin);
  } catch (e) {
    return false;
  }
}

// True when a URL may be handed to the operating system.
function isExternalUrl(url) {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(String(url)).protocol);
  } catch (e) {
    return false;
  }
}

function permissionAllowed(permission, details = {}) {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;
  // Camera yes, microphone no.
  if (permission === 'media') {
    const types = details.mediaTypes || [];
    return types.length > 0 && types.every(t => t === 'video');
  }
  return true;
}

// Applies the rules to one webContents: navigation, new windows, webviews.
function guardContents(contents, { shell, devPort }) {
  contents.on('will-navigate', (event, target) => {
    if (isAppUrl(target, devPort)) return;
    event.preventDefault();
    if (isExternalUrl(target)) shell.openExternal(target);
  });
  contents.on('will-redirect', (event, target) => {
    if (!isAppUrl(target, devPort)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

// Installs the rules for the whole app: every new webContents and the
// permission handlers of the default session.
function hardenApp({ app, session, shell, devPort }) {
  app.on('web-contents-created', (_event, contents) => guardContents(contents, { shell, devPort }));
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => callback(permissionAllowed(permission, details)));
  ses.setPermissionCheckHandler((_wc, permission, _origin, details) => permissionAllowed(permission, details));
}

module.exports = { hardenApp, guardContents, isAppUrl, isExternalUrl, permissionAllowed, APP_ORIGIN };
