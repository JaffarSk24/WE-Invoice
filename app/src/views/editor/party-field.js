// The client of a document: search in the contacts by name, IČO or DIČ,
// a summary of the chosen one, and a simple new contact made on the spot
// (name, identifiers, address, e-mail). The full contact card belongs to
// the contacts package; this form only creates what an invoice needs.
import { isValidIco, isValidDic, isValidVatId } from '@we-invoice/core';
import { h, icon, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { autocomplete } from '../../components/autocomplete.js';
import { textField } from '../../components/fields.js';
import { openModal } from '../../ui/modal.js';
import { showError } from '../../ui/toast.js';
import { fold } from '../documents/rows.js';

/** Contacts matching a query by name, IČO, DIČ or IČ DPH, at most 8. */
export function searchContacts(contacts, query) {
  const q = fold(query).replace(/\s+/g, ' ').trim();
  const digits = q.replace(/\s/g, '');
  return contacts
    .filter(c => !c.anonymizedAt && (fold(c.name).includes(q) || [c.ico, c.dic, c.icDph].some(v => v && fold(v).replace(/\s/g, '').includes(digits))))
    .slice(0, 8)
    .map(c => ({ id: c.id, label: c.name, hint: [c.ico && `${t('documents.party.ico')} ${c.ico}`, c.billingAddress && c.billingAddress.city].filter(Boolean).join(', ') }));
}

/** Field errors of the quick contact form, by field name (i18n keys). */
export function validateQuickContact(values) {
  const errors = {};
  if (!values.name) errors.name = 'documents.party.errors.name';
  if (values.ico && !isValidIco(values.ico)) errors.ico = 'documents.party.errors.ico';
  if (values.dic && !isValidDic(values.dic)) errors.dic = 'documents.party.errors.dic';
  if (values.icDph && !isValidVatId(values.icDph)) errors.icDph = 'documents.party.errors.icDph';
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'documents.party.errors.email';
  return errors;
}

/** The contact record of the quick form. */
export function quickContactRecord(values) {
  const country = (values.country || 'SK').toUpperCase();
  return {
    kind: values.ico || values.icDph ? 'COMPANY' : 'PERSON', name: values.name, ico: values.ico || null, dic: values.dic || null,
    icDph: values.icDph ? values.icDph.toUpperCase() : null, country,
    billingAddress: { street: values.street || '', city: values.city || '', zip: values.zip || '', country },
    deliveryAddresses: [], emails: values.email ? [{ address: values.email, purposes: ['INVOICE'] }] : [], phone: null, iban: null,
    dueDays: null, discountPct: null, language: null, currency: null, sendReminders: true, priceLevelId: null, peppolId: null,
    peppolCapable: null, vatReliability: null, tags: [], note: ''
  };
}

export function openQuickContact({ name = '', onCreate }) {
  const fields = {
    name: textField({ label: t('documents.party.name'), value: name, required: true }),
    ico: textField({ label: t('documents.party.ico'), attrs: { inputmode: 'numeric' } }),
    dic: textField({ label: t('documents.party.dic'), attrs: { inputmode: 'numeric' } }),
    icDph: textField({ label: t('documents.party.icDph') }),
    street: textField({ label: t('documents.party.street') }),
    city: textField({ label: t('documents.party.city') }),
    zip: textField({ label: t('documents.party.zip') }),
    country: textField({ label: t('documents.party.country'), value: 'SK', attrs: { maxlength: '2' } }),
    email: textField({ label: t('documents.party.email'), type: 'email' })
  };
  const body = h('div', { class: 'form-grid quick-contact' }, Object.values(fields).map(f => f.el), h('p', { class: 'muted small' }, t('documents.party.quickHint')));
  openModal({
    title: t('documents.party.newTitle'), body, wide: true,
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('documents.party.create'), kind: 'primary', onClick: async (m) => {
          const values = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, k === 'ico' || k === 'dic' ? f.value().replace(/\s+/g, '') : f.value()]));
          const errors = validateQuickContact(values);
          Object.entries(fields).forEach(([k, f]) => f.setError(errors[k] ? t(errors[k]) : null));
          if (Object.keys(errors).length) return;
          try {
            await onCreate(quickContactRecord(values));
            m.close();
          } catch (e) {
            showError(e);
          }
        }
      }
    ]
  });
}

/**
 * @param {{contacts: Function, contact: object|null, buyer: object|null, readOnly: boolean, onPick: Function, onCreate: Function}} ctx
 */
export function partyField(ctx) {
  const summary = h('div', { class: 'party-summary' });
  const error = h('div', { class: 'field-error', role: 'alert', hidden: true });
  const search = autocomplete({
    label: t('documents.party.client'), placeholder: t('documents.party.search'),
    search: (q) => searchContacts(ctx.contacts(), q), onPick: (item) => ctx.onPick(item.id)
  });
  search.input.id = 'editor-contact';
  const create = h('button', { type: 'button', class: 'btn btn-ghost', id: 'editor-new-contact', disabled: ctx.readOnly,
    onclick: () => openQuickContact({ name: search.value(), onCreate: ctx.onCreate }) }, icon('plus'), t('documents.party.new'));

  const show = (buyer) => {
    while (summary.firstChild) summary.removeChild(summary.firstChild);
    if (!buyer || !buyer.name) { summary.append(h('p', { class: 'muted' }, t('documents.party.none'))); return; }
    const a = buyer.address || {};
    append(summary, [
      h('strong', {}, buyer.name),
      h('span', {}, [a.street, [a.zip, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ')),
      h('span', { class: 'muted small' }, [buyer.ico && `${t('documents.party.ico')} ${buyer.ico}`, buyer.dic && `${t('documents.party.dic')} ${buyer.dic}`, buyer.icDph && `${t('documents.party.icDph')} ${buyer.icDph}`].filter(Boolean).join(' · '))]);
  };
  show(ctx.buyer);
  if (ctx.readOnly) search.input.disabled = true;
  const el = h('section', { class: 'editor-party card', 'aria-labelledby': 'editor-party-title' },
    h('h2', { id: 'editor-party-title' }, t('documents.party.title')),
    h('div', { class: 'party-pick' }, search.el, create), error, summary);
  return {
    el,
    show,
    setError(message) { error.textContent = message || ''; error.hidden = !message; el.classList.toggle('field-invalid', Boolean(message)); }
  };
}
