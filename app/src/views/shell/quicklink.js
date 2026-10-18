// Quick actions from a link, as src/quicklink.js in WE Budget: the web app
// opened with ?quick=invoice&contact=... goes to the invoices and asks for
// a new one for that contact (an iPhone Shortcut or a home screen shortcut
// opens such a link). The parameters are removed from the address so a
// reload does not repeat the action.
export const QUICK_PARAMS = ['quick', 'contact', 'amount', 'note'];
export const QUICK_KINDS = Object.freeze({ invoice: 'invoices', expense: 'expenses', payment: 'payments', scan: 'inbox' });
const TEXT_MAX = 200;

// The query string -> { kind, route, contact, amount, note } or null.
export function parseQuickLink(search) {
  let params;
  try { params = new URLSearchParams(search || ''); } catch (e) { return null; }
  const kind = String(params.get('quick') || '').trim().toLowerCase();
  if (!QUICK_KINDS[kind]) return null;
  const text = (name) => { const v = params.get(name); return v ? v.trim().slice(0, TEXT_MAX) : null; };
  const amount = text('amount');
  return {
    kind, route: QUICK_KINDS[kind], contact: text('contact'),
    amount: amount && /^\d+([.,]\d{1,2})?$/.test(amount) ? amount.replace(',', '.') : null,
    note: text('note')
  };
}

// The same address without the quick parameters; other parameters and the
// hash stay.
export function stripQuickParams(href) {
  const url = new URL(href);
  QUICK_PARAMS.forEach(p => url.searchParams.delete(p));
  return url.pathname + url.search + url.hash;
}

export function quickLinkFor(appUrl, kind = 'invoice', contact = null) {
  const url = new URL(appUrl);
  url.searchParams.set('quick', kind);
  if (contact) url.searchParams.set('contact', contact);
  return url.toString();
}

// Reads the address once at start: switches to the route and tells the
// module through the quick:<kind> event once the view is drawn.
export function initQuickLink({ navigate, emit, win = window }) {
  const quick = parseQuickLink(win.location.search);
  if (!quick) return null;
  try { win.history.replaceState(null, '', stripQuickParams(win.location.href)); } catch (e) { console.warn('Address could not be cleaned', e); }
  win.location.hash = `#/${quick.route}`;
  setTimeout(() => { navigate(quick.route); emit(`quick:${quick.kind}`, quick); }, 0);
  return quick;
}
