// Which document kinds each sales list shows and which kind its "New"
// button creates. The routes are the ones of the navigation (nav.js);
// every sales kind belongs to exactly one of them, so a document always
// opens under the list it is shown in.

export const LIST_ROUTES = Object.freeze({
  invoices: { kinds: ['INVOICE', 'ADVANCE_TAX_DOC'], newKinds: ['INVOICE'], title: 'nav.invoices', icon: 'file-text' },
  proformas: { kinds: ['PROFORMA'], newKinds: ['PROFORMA'], title: 'nav.proformas', icon: 'file-plus-2' },
  'credit-notes': { kinds: ['CREDIT_NOTE', 'DEBIT_NOTE'], newKinds: ['CREDIT_NOTE', 'DEBIT_NOTE'], title: 'nav.creditNotes', icon: 'file-minus' },
  quotes: { kinds: ['QUOTE'], newKinds: ['QUOTE'], title: 'nav.quotes', icon: 'clipboard-list' },
  orders: { kinds: ['ORDER_IN', 'ORDER_OUT'], newKinds: ['ORDER_IN', 'ORDER_OUT'], title: 'nav.orders', icon: 'shopping-cart' },
  'delivery-notes': { kinds: ['DELIVERY_NOTE'], newKinds: ['DELIVERY_NOTE'], title: 'nav.deliveryNotes', icon: 'truck' }
});

export const SALES_ROUTES = Object.freeze(Object.keys(LIST_ROUTES));
export const SALES_KINDS = Object.freeze(SALES_ROUTES.flatMap(r => LIST_ROUTES[r].kinds));

/** The list route a kind is shown in, or null for a kind sales does not handle. */
export function routeForKind(kind) {
  return SALES_ROUTES.find(r => LIST_ROUTES[r].kinds.includes(kind)) || null;
}

export function isSalesKind(kind) {
  return SALES_KINDS.includes(kind);
}

// Kinds whose amounts matter (quotes and orders too; a delivery note may
// be printed without prices, but its lines still carry them).
const PRICELESS = new Set(['DELIVERY_NOTE']);
export function showsPrices(kind) {
  return !PRICELESS.has(kind);
}

/**
 * The parts of a sales hash: "#/invoices", "#/invoices/new?contact=c1",
 * "#/invoices/<id>", "#/invoices/<id>/edit".
 * @returns {{route: string|null, id: string|null, mode: 'list'|'new'|'view'|'edit', params: Object<string, string>}}
 */
export function parseSalesHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(p => decodeURIComponent(p));
  const params = {};
  new URLSearchParams(query).forEach((value, key) => { params[key] = value; });
  const route = parts[0] || null;
  if (parts.length < 2) return { route, id: null, mode: 'list', params };
  if (parts[1] === 'new') return { route, id: null, mode: 'new', params };
  return { route, id: parts[1], mode: parts[2] === 'edit' ? 'edit' : 'view', params };
}

/** The hash of a document screen. */
export function salesHash(route, { id = null, mode = 'list', params = null } = {}) {
  let hash = `#/${route}`;
  if (mode === 'new') hash += '/new';
  else if (id) hash += `/${encodeURIComponent(id)}${mode === 'edit' ? '/edit' : ''}`;
  const query = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '')).toString() : '';
  return query ? `${hash}?${query}` : hash;
}
