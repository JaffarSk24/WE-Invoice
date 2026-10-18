// The address book (Adresár): search over name, IČO, DIČ, e-mail and tag,
// a table on the desktop and cards on the phone, the VAT light and the
// amount due of each client, and the ways to add a contact: by hand or
// from the register by IČO. Duplicates found by IČO or name can be merged.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { todayLocal } from '../../components/dates.js';
import { searchContacts, contactBalance, findDuplicates, emailsFor } from './model.js';
import { vatBadge, balanceText } from './badges.js';
import { listOf, onData, go } from './source.js';

let lastQuery = '';

function columns(balances) {
  return [
    { id: 'name', label: t('contacts.field.name'), always: true, sortValue: (c) => c.name, render: (c) => h('span', { class: 'contact-name' }, c.anonymizedAt ? t('contacts.anonymizedName') : c.name, ' ', vatBadge(c)) },
    { id: 'ico', label: t('contacts.field.ico'), sortValue: (c) => c.ico || '', render: (c) => c.ico || '' },
    { id: 'city', label: t('contacts.field.city'), sortValue: (c) => c.billingAddress?.city || c.city || '', render: (c) => c.billingAddress?.city || c.city || '' },
    { id: 'email', label: t('contacts.field.email'), render: (c) => emailsFor(c, 'INVOICE')[0] || '' },
    { id: 'due', label: t('contacts.balance.due'), align: 'num', primary: true, render: (c) => balanceText(balances.get(c.id).byCurrency, 'due') },
    { id: 'turnover', label: t('contacts.balance.turnover'), align: 'num', hidden: true, render: (c) => balanceText(balances.get(c.id).byCurrency, 'turnover') }
  ];
}

export function renderContactList(root, { openLookup, openMerge }) {
  const header = h('header', { class: 'view-header' },
    h('h1', {}, t('nav.contacts')),
    h('div', { class: 'view-actions' },
      h('button', { type: 'button', class: 'btn', id: 'contacts-merge', onclick: () => openMerge() }, icon('files'), t('contacts.merge.open')),
      h('button', { type: 'button', class: 'btn', id: 'contacts-lookup', onclick: () => openLookup() }, icon('search'), t('contacts.lookup.open')),
      h('button', { type: 'button', class: 'btn btn-primary', id: 'contacts-new', onclick: () => go('contacts/new') }, icon('plus'), t('contacts.new'))));
  const search = h('input', { type: 'search', id: 'contacts-search', value: lastQuery, placeholder: t('contacts.search'), 'aria-label': t('contacts.search') });
  const body = h('div', { class: 'contacts-body' });
  root.append(header, h('div', { class: 'search-field contacts-search' }, icon('search'), search), body);

  let table = null;
  function draw() {
    const all = listOf('contacts');
    const documents = listOf('documents');
    const today = todayLocal();
    const balances = new Map(all.map(c => [c.id, contactBalance(c, documents, today)]));
    const rows = searchContacts(all, search.value);
    header.querySelector('#contacts-merge').hidden = findDuplicates(all).length === 0;
    if (!all.length) {
      table = null;
      body.replaceChildren(emptyState({
        title: t('contacts.empty.title'), text: t('contacts.empty.text'), iconName: 'users',
        actionLabel: t('contacts.lookup.open'), onAction: () => openLookup()
      }));
    } else if (!table) {
      table = createTable({
        key: 'contacts', columns: columns(balances), rows,
        onRowClick: (c) => go(`contacts/${encodeURIComponent(c.id)}`),
        empty: h('p', { class: 'muted' }, t('contacts.search.none'))
      });
      body.replaceChildren(table.el);
    } else {
      table.setRows(rows);
    }
    refreshIcons(root);
  }

  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { lastQuery = search.value; table = null; draw(); }, 120);
  });
  draw();
  onData(root, ['contacts', 'documents'], () => { table = null; draw(); });
}
