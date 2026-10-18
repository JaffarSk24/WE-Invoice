// Merging duplicate contacts: the groups found by IČO or name are listed,
// the user picks the card to keep in each group, and the others are
// folded into it (empty fields filled, e-mails and addresses joined),
// their documents moved to it, and then deleted (tombstones, so the
// deletion syncs). Issued documents keep their buyer snapshot untouched.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { openModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { emptyState } from '../../components/empty-state.js';
import { findDuplicates, mergeContacts } from './model.js';
import { listOf, write } from './source.js';

// Applies one merge through the store; returns the number of moved documents.
export async function applyMerge(store, keepId, otherIds) {
  const keep = store.get('contacts', keepId);
  const others = otherIds.map(id => store.get('contacts', id)).filter(Boolean);
  const { patch, moveDocs } = mergeContacts(keep, others, store.list('documents'));
  await store.update('contacts', keepId, patch);
  for (const docId of moveDocs) await store.update('documents', docId, { contactId: keepId });
  for (const other of others) await store.remove('contacts', other.id);
  return moveDocs.length;
}

export function openMergeDialog() {
  const contacts = new Map(listOf('contacts').map(c => [c.id, c]));
  const groups = findDuplicates(Array.from(contacts.values()));
  const body = h('div', { class: 'merge-dialog' });
  let modal = null;

  const groupEl = (ids, index) => {
    const name = `merge-${index}`;
    const radios = ids.map((id, i) => {
      const c = contacts.get(id);
      return h('label', { class: 'checkbox-label' },
        h('input', { type: 'radio', name, value: id, checked: i === 0 }),
        h('span', {}, c.name, c.ico ? ` (${c.ico})` : '', c.billingAddress?.city ? `, ${c.billingAddress.city}` : ''));
    });
    const merge = async () => {
      const keepId = radios.map(r => r.querySelector('input')).find(r => r.checked).value;
      const moved = await write(store => applyMerge(store, keepId, ids.filter(id => id !== keepId)));
      if (moved === null) return;
      showToast(t('contacts.merge.done', { n: moved }), { type: 'success' });
      el.remove();
      if (!body.querySelector('.merge-group')) modal.close();
    };
    const el = h('fieldset', { class: 'merge-group' },
      h('legend', {}, t('contacts.merge.keep')),
      radios,
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: merge }, icon('files'), t('contacts.merge.apply')));
    return el;
  };

  body.append(groups.length
    ? [h('p', { class: 'muted' }, t('contacts.merge.text')), ...groups.map(groupEl)]
    : emptyState({ title: t('contacts.merge.none'), iconName: 'check' }));
  modal = openModal({ title: t('contacts.merge.title'), body, wide: true });
  refreshIcons(body);
  return modal;
}
