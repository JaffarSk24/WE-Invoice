// "Add from the register": the user types an IČO (Slovak or Czech) or at
// least three letters of a Slovak company name, picks the company and the
// contact is created with the register details. The VAT checks (VIES and
// the FS lists) run right after, so the card opens with its traffic light.
// An existing contact with the same IČO is opened instead of a duplicate.
import { h, icon, selectEl } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { navigate } from '../../router.js';
import { openModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { lookupToContact, normalizeContact } from './model.js';
import { lookupByIco, searchByName, runVatChecks } from './checks.js';
import { listOf, write } from './source.js';

// Creates (or finds) the contact for a register answer; returns its id.
export async function createFromLookup(lookup, { transport }) {
  const existing = lookup.ico ? listOf('contacts').find(c => c.ico && c.ico.replace(/\s/g, '') === String(lookup.ico).replace(/\s/g, '')) : null;
  if (existing) {
    showToast(t('contacts.lookup.exists', { name: existing.name }));
    return existing.id;
  }
  const { contact } = normalizeContact(lookupToContact(lookup));
  const saved = await write(store => store.insert('contacts', contact));
  if (!saved) return null;
  if (saved.icDph) {
    runVatChecks(transport, saved)
      .then(patch => write(store => store.update('contacts', saved.id, patch)))
      .catch(e => console.warn('VAT check of a new contact failed', e));
  }
  return saved.id;
}

export function openLookupDialog({ transport }) {
  const country = selectEl([{ value: 'SK', label: t('contacts.lookup.sk') }, { value: 'CZ', label: t('contacts.lookup.cz') }], 'SK', { id: 'lookup-country', 'aria-label': t('contacts.field.country') });
  const query = h('input', { type: 'search', id: 'lookup-query', placeholder: t('contacts.lookup.placeholder'), 'aria-label': t('contacts.lookup.placeholder'), autocomplete: 'off' });
  const status = h('p', { class: 'muted small', id: 'lookup-status', 'aria-live': 'polite' });
  const results = h('ul', { class: 'lookup-results', id: 'lookup-results' });
  let modal = null;

  const pick = async (lookup) => {
    const id = await createFromLookup(lookup, { transport });
    if (!id) return;
    modal.close();
    navigate(`contacts/${encodeURIComponent(id)}`);
  };

  const show = (list) => {
    results.replaceChildren(...list.map(r => h('li', {}, h('button', { type: 'button', class: 'lookup-result', onclick: () => pick(r) },
      h('strong', {}, r.name), h('span', { class: 'muted small' }, [r.ico ? `${t('contacts.field.ico')} ${r.ico}` : '', r.address?.city || ''].filter(Boolean).join(', '))))));
  };

  const search = async () => {
    const q = query.value.trim();
    const digits = q.replace(/\s/g, '');
    results.replaceChildren();
    status.textContent = t('contacts.lookup.searching');
    try {
      if (/^\d{6,8}$/.test(digits)) {
        show([await lookupByIco(transport, digits, country.value)]);
        status.textContent = '';
      } else if (country.value === 'SK' && q.length >= 3) {
        const list = await searchByName(transport, q);
        show(list);
        status.textContent = list.length ? '' : t('contacts.lookup.none');
      } else {
        status.textContent = t('contacts.lookup.hint');
      }
    } catch (e) {
      console.warn('Register lookup failed', e);
      status.textContent = t(`errors.${e.code || 'UNKNOWN'}`);
    }
    refreshIcons(results);
  };

  query.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  modal = openModal({
    title: t('contacts.lookup.title'),
    body: h('div', { class: 'lookup-dialog' },
      h('p', { class: 'muted' }, t('contacts.lookup.text')),
      h('div', { class: 'lookup-row' }, country, query, h('button', { type: 'button', class: 'btn btn-primary', id: 'lookup-search', onclick: search }, icon('search'), t('contacts.lookup.search'))),
      status, results,
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { modal.close(); navigate('contacts/new'); } }, icon('pencil-line'), t('contacts.lookup.manual')))
  });
  return modal;
}
