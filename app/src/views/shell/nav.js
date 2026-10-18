// The navigation tree (07-ui-ux-i18n.md § 7.2) as data. Every route here
// gets a view; until a work package provides it, a placeholder is shown.
// `when` hides tax items by company mode (WP-UI wires it to the company).

export const NAV = Object.freeze([
  { items: [{ route: 'dashboard', label: 'nav.dashboard', icon: 'layout-dashboard' }] },
  {
    title: 'nav.group.sales',
    items: [
      { route: 'invoices', label: 'nav.invoices', icon: 'file-text' },
      { route: 'proformas', label: 'nav.proformas', icon: 'file-plus-2' },
      { route: 'credit-notes', label: 'nav.creditNotes', icon: 'file-minus' },
      { route: 'quotes', label: 'nav.quotes', icon: 'clipboard-list' },
      { route: 'orders', label: 'nav.orders', icon: 'shopping-cart' },
      { route: 'delivery-notes', label: 'nav.deliveryNotes', icon: 'truck' },
      { route: 'recurring', label: 'nav.recurring', icon: 'repeat' }
    ]
  },
  {
    title: 'nav.group.purchase',
    items: [
      { route: 'received', label: 'nav.received', icon: 'file-check' },
      { route: 'expenses', label: 'nav.expenses', icon: 'receipt' },
      { route: 'inbox', label: 'nav.inbox', icon: 'inbox' }
    ]
  },
  {
    title: 'nav.group.efaktury',
    beta: true,
    items: [
      { route: 'efaktury-in', label: 'nav.efakturyIn', icon: 'mail-check' },
      { route: 'efaktury-out', label: 'nav.efakturyOut', icon: 'send' }
    ]
  },
  {
    title: 'nav.group.money',
    items: [
      { route: 'bank', label: 'nav.bank', icon: 'landmark' },
      { route: 'cash', label: 'nav.cash', icon: 'wallet' },
      { route: 'payments', label: 'nav.payments', icon: 'banknote' },
      { route: 'reminders', label: 'nav.reminders', icon: 'bell-ring' }
    ]
  },
  {
    items: [
      { route: 'contacts', label: 'nav.contacts', icon: 'users' },
      { route: 'items', label: 'nav.items', icon: 'boxes' }
    ]
  },
  {
    title: 'nav.group.tax',
    items: [
      { route: 'vat-records', label: 'nav.vatRecords', icon: 'calculator', when: 'vatPayer' },
      { route: 'kv', label: 'nav.kv', icon: 'file-spreadsheet', when: 'vatPayer' },
      { route: 'sv', label: 'nav.sv', icon: 'file-spreadsheet', when: 'vatPayer' },
      { route: 'vat-return', label: 'nav.vatReturn', icon: 'file-spreadsheet', when: 'vatRegistered' },
      { route: 'cash-journal', label: 'nav.cashJournal', icon: 'notebook-pen', when: 'bookkeeping' },
      { route: 'assets', label: 'nav.assets', icon: 'building-2', when: 'bookkeeping' },
      { route: 'closing', label: 'nav.closing', icon: 'lock', when: 'bookkeeping' }
    ]
  },
  {
    items: [
      { route: 'reports', label: 'nav.reports', icon: 'chart-column' },
      { route: 'settings', label: 'nav.settings', icon: 'settings' },
      { route: 'help', label: 'nav.help', icon: 'circle-help' }
    ]
  }
]);

export const ALL_ROUTES = Object.freeze(NAV.flatMap(g => g.items.map(i => i.route)).concat(['more']));

export function navItem(route) {
  for (const group of NAV) {
    const item = group.items.find(i => i.route === route);
    if (item) return item;
  }
  return null;
}

// Whether an item is shown for a company. Without a company (nothing loaded
// yet, or the sync package has not reported one) everything is shown.
export function navVisible(item, company) {
  if (!item.when || !company) return true;
  const vat = company.vatMode;
  const acc = company.accountingMode;
  if (item.when === 'vatPayer') return vat === 'PAYER';
  if (item.when === 'vatRegistered') return vat === 'PAYER' || vat === 'REGISTERED_7';
  if (item.when === 'bookkeeping') return acc === 'SIMPLE' || acc === 'TAX_RECORDS_FLAT';
  return true;
}

// The groups with only the items visible for the company; a group left
// without items disappears.
export function visibleNav(company) {
  return NAV
    .map(group => ({ ...group, items: group.items.filter(item => navVisible(item, company)) }))
    .filter(group => group.items.length);
}

// Phone bottom bar: Prehľad, Doklady, + (FAB), Nákup, Viac.
export const BOTTOM_BAR = Object.freeze([
  { route: 'dashboard', label: 'nav.dashboard', icon: 'layout-dashboard' },
  { route: 'invoices', label: 'nav.documents', icon: 'files' },
  { fab: true },
  { route: 'received', label: 'nav.purchase', icon: 'shopping-cart' },
  { route: 'more', label: 'nav.more', icon: 'ellipsis' }
]);

export const FAB_ACTIONS = Object.freeze([
  { id: 'invoice', label: 'fab.invoice', icon: 'file-plus-2', route: 'invoices' },
  { id: 'expense', label: 'fab.expense', icon: 'receipt', route: 'expenses' },
  { id: 'payment', label: 'fab.payment', icon: 'banknote', route: 'payments' },
  { id: 'scan', label: 'fab.scanReceipt', icon: 'scan-line', route: 'inbox' }
]);
