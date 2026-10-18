// weinvoice:// links (08-desktop-web-release.md § 8.2, P2): a link from a
// website or an e-mail opens a screen of the app, for example
// weinvoice://invoices/new or weinvoice://settings?tab=peppol. The parsing
// is pure; the page decides whether the route exists.
const SCHEME = 'weinvoice';
const ROUTE = /^[a-z][a-z0-9-]*$/;
const MAX_PARAMS = 10;

// { route, path: [...], params: {...} } or null for anything that is not a
// well-formed link. weinvoice://host/segments: the host is the route.
function parseDeepLink(link) {
  let url;
  try {
    url = new URL(String(link || ''));
  } catch (e) {
    return null;
  }
  if (url.protocol !== `${SCHEME}:`) return null;
  const route = url.hostname.toLowerCase();
  if (!ROUTE.test(route)) return null;
  const path = url.pathname.split('/').filter(Boolean).map(decodeURIComponent).filter(s => ROUTE.test(s));
  const params = {};
  let count = 0;
  for (const [key, value] of url.searchParams) {
    if (count++ >= MAX_PARAMS) break;
    if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) params[key] = String(value).slice(0, 200);
  }
  return { route, path, params };
}

// The weinvoice:// link among the arguments of a (second) instance, if any.
function linkFromArgv(argv) {
  return (argv || []).find(a => typeof a === 'string' && a.toLowerCase().startsWith(`${SCHEME}://`)) || null;
}

// Makes this app the handler of the scheme and delivers links to `onLink`.
// macOS sends open-url; Windows starts a second instance with the link in
// its arguments, so the first instance takes it over and stays single.
function registerDeepLinks(app, onLink, { argv = process.argv, packaged = app.isPackaged } = {}) {
  const deliver = (link) => {
    const parsed = parseDeepLink(link);
    if (parsed) onLink(parsed);
    else console.warn('[deep-link] ignored', String(link).slice(0, 80));
  };
  if (packaged) {
    try { app.setAsDefaultProtocolClient(SCHEME); } catch (e) { console.warn('[deep-link] not registered', e.message); }
  }
  app.on('open-url', (event, url) => { event.preventDefault(); deliver(url); });
  app.on('second-instance', (_event, args) => {
    const link = linkFromArgv(args);
    if (link) deliver(link);
  });
  const initial = linkFromArgv(argv);
  return initial ? parseDeepLink(initial) : null;
}

module.exports = { SCHEME, parseDeepLink, linkFromArgv, registerDeepLinks };
