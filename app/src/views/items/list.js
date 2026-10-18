// The price list (Cenník): search and category filter, a table with the
// price without and with VAT, the VAT rate and the unit, cards on the
// phone, and the CSV import with a summary of skipped rows.
import { h, icon, selectEl } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { formatAmount } from '../../components/decimal.js';
import { openModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { searchItems, categoriesOf, bothPrices } from './model.js';
import { importItems } from './csv.js';
import { listOf, onData, write, companyOf, go } from '../contacts/source.js';

export function unitLabel(unit) {
  if (!unit) return '';
  if (unit.label) return unit.label;
  const key = `items.unit.${unit.code}`;
  const text = t(key);
  return text === key ? unit.code : text;
}

export function vatLabel(item) {
  return item.vatCategory === 'S' ? `${item.vatRate} %` : t(`items.vatCategory.${item.vatCategory}`);
}

function columns() {
  return [
    { id: 'name', label: t('items.field.name'), always: true, sortValue: (i) => i.name, render: (i) => i.name },
    { id: 'code', label: t('items.field.code'), sortValue: (i) => i.code || '', render: (i) => i.code || '' },
    { id: 'unit', label: t('items.field.unit'), render: (i) => unitLabel(i.unit) },
    { id: 'net', label: t('items.price.net'), align: 'num', primary: true, sortValue: (i) => Number(bothPrices(i).net), render: (i) => formatAmount(bothPrices(i).net, i.currency || 'EUR') },
    { id: 'gross', label: t('items.price.gross'), align: 'num', render: (i) => formatAmount(bothPrices(i).gross, i.currency || 'EUR') },
    { id: 'vat', label: t('items.field.vatRate'), render: vatLabel },
    { id: 'category', label: t('items.field.category'), hidden: true, render: (i) => i.accountingCategory || '' }
  ];
}

// Imports a CSV text: valid rows are saved, the rest listed.
export async function runImport(text) {
  const currency = companyOf()?.defaults?.currency || 'EUR';
  const { items, errors } = importItems(text, { currency });
  let saved = 0;
  if (items.length) {
    const done = await write(async (store) => { for (const item of items) { await store.insert('items', item); saved += 1; } return true; });
    if (!done && !saved) return { saved: 0, errors };
  }
  return { saved, errors };
}

function showImportResult({ saved, errors }) {
  if (!errors.length) { showToast(t('items.import.done', { n: saved }), { type: 'success' }); return; }
  openModal({
    title: t('items.import.title'),
    body: h('div', {},
      h('p', {}, t('items.import.done', { n: saved })),
      h('p', { class: 'muted' }, t('items.import.skipped', { n: errors.length })),
      h('ul', { class: 'import-errors' }, errors.slice(0, 50).map(e => h('li', {}, t('items.import.row', { row: e.row }), ' ', t(`crm.error.${e.code}`))))),
    actions: [{ label: t('common.ok'), kind: 'primary', onClick: (m) => m.close() }]
  });
}

export function renderItemList(root, { transport }) {
  const importBtn = h('button', {
    type: 'button', class: 'btn', id: 'items-import', onclick: async () => {
      const file = await transport.files.openFile({ accept: '.csv,text/csv' });
      if (!file) return;
      try {
        showImportResult(await runImport(await file.text()));
      } catch (e) {
        console.error('Price list import failed', e);
        showToast(t('crm.error.CSV_UNREADABLE'), { type: 'error' });
      }
    }
  }, icon('import'), t('items.import.open'));
  const search = h('input', { type: 'search', id: 'items-search', placeholder: t('items.search'), 'aria-label': t('items.search') });
  const category = selectEl([], '', { id: 'items-category', 'aria-label': t('items.field.category') });
  const body = h('div', {});
  root.append(
    h('header', { class: 'view-header' }, h('h1', {}, t('nav.items')),
      h('div', { class: 'view-actions' }, importBtn,
        h('button', { type: 'button', class: 'btn btn-primary', id: 'items-new', onclick: () => go('items/new') }, icon('plus'), t('items.new')))),
    h('div', { class: 'items-tools' }, h('div', { class: 'search-field' }, icon('search'), search), category),
    body);

  function draw() {
    const all = listOf('items');
    const chosen = category.value;
    category.replaceChildren(h('option', { value: '' }, t('items.category.all')), ...categoriesOf(all).map(c => h('option', { value: c }, c)));
    category.value = chosen;
    category.hidden = categoriesOf(all).length === 0;
    if (!all.length) {
      body.replaceChildren(emptyState({ title: t('items.empty.title'), text: t('items.empty.text'), iconName: 'boxes', actionLabel: t('items.new'), onAction: () => go('items/new') }));
    } else {
      const table = createTable({
        key: 'items', columns: columns(), rows: searchItems(all, search.value, category.value),
        onRowClick: (i) => go(`items/${encodeURIComponent(i.id)}`), empty: h('p', { class: 'muted' }, t('items.search.none'))
      });
      body.replaceChildren(table.el);
    }
    refreshIcons(root);
  }
  let timer = null;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 120); });
  category.addEventListener('change', draw);
  draw();
  onData(root, ['items'], draw);
}
