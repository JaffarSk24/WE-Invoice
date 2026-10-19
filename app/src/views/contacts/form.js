// The contact form, for a new contact and for editing one: identifiers
// (filled from the register by the IČO button), billing address, e-mails
// with their purpose, contact persons, delivery addresses and the client's
// own terms: due days, discount, currency, print language (empty = as the
// company), reminders on or off, price level. Errors are shown at the
// fields; nothing is saved until the card is valid.
import { h, icon, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t, currentLang } from '../../i18n/index.js';
import { schema } from '@we-invoice/core';
import { textField, textArea, selectField, checkboxField, numberField } from '../../components/fields.js';
import { languageInfo } from '../../i18n/languages.js';
import { showToast, showError } from '../../ui/toast.js';
import { blankContact, normalizeContact, lookupToContact } from './model.js';
import { lookupByIco, runAllChecks } from './checks.js';
import { emailEditor, personEditor, deliveryEditor } from './form-lists.js';
import { getOf, listOf, write, go } from './source.js';

export const COUNTRIES = Object.freeze(['SK', 'CZ', 'AT', 'DE', 'HU', 'PL', 'BE', 'BG', 'CY', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'RO', 'SE', 'SI', 'CH', 'GB', 'UA', 'US']);
export const CURRENCIES = Object.freeze(['EUR', 'CZK', 'USD', 'GBP', 'HUF', 'PLN', 'CHF']);

export function countryOptions(lang = currentLang()) {
  let names = null;
  try { names = new Intl.DisplayNames([lang], { type: 'region' }); } catch (e) { console.warn('Country names unavailable', e); }
  return COUNTRIES.map(code => ({ value: code, label: names ? `${names.of(code)} (${code})` : code }));
}

export function printLanguageChoices() {
  return [{ value: '', label: t('contacts.asCompany') }, ...schema.PRINT_LANGUAGES.map(code => ({ value: code, label: languageInfo(code).name }))];
}

export function renderContactForm(root, id, { transport }) {
  const existing = id ? getOf('contacts', id) : null;
  if (id && !existing) { go('contacts'); return; }
  const c = existing || blankContact();
  const f = {
    kind: selectField({ label: t('contacts.field.kind'), options: schema.CONTACT_KINDS.map(k => ({ value: k, label: t(`contacts.kind.${k}`) })), value: c.kind, attrs: { id: 'contact-kind' } }),
    name: textField({ label: t('contacts.field.name'), value: c.name, required: true, attrs: { id: 'contact-name' } }),
    country: selectField({ label: t('contacts.field.country'), options: countryOptions(), value: c.country || 'SK', attrs: { id: 'contact-country' } }),
    ico: textField({ label: t('contacts.field.ico'), value: c.ico || '', attrs: { id: 'contact-ico', inputmode: 'numeric' } }),
    dic: textField({ label: t('contacts.field.dic'), value: c.dic || '', attrs: { id: 'contact-dic' } }),
    icDph: textField({ label: t('contacts.field.icDph'), value: c.icDph || '', attrs: { id: 'contact-icdph' } }),
    street: textField({ label: t('contacts.field.street'), value: c.billingAddress?.street || '', attrs: { id: 'contact-street' } }),
    zip: textField({ label: t('contacts.field.zip'), value: c.billingAddress?.zip || '', attrs: { id: 'contact-zip' } }),
    city: textField({ label: t('contacts.field.city'), value: c.billingAddress?.city || '', attrs: { id: 'contact-city' } }),
    phone: textField({ label: t('contacts.field.phone'), value: c.phone || '', type: 'tel' }),
    iban: textField({ label: t('contacts.field.iban'), value: c.iban || '' }),
    dueDays: numberField({ label: t('contacts.field.dueDays'), value: c.dueDays === null || c.dueDays === undefined ? null : String(c.dueDays), hint: t('contacts.field.dueDaysHint'), attrs: { id: 'contact-due-days' } }),
    discountPct: numberField({ label: t('contacts.field.discountPct'), value: c.discountPct }),
    currency: selectField({ label: t('contacts.field.currency'), options: [{ value: '', label: t('contacts.asCompany') }, ...CURRENCIES.map(v => ({ value: v, label: v }))], value: c.currency || '' }),
    language: selectField({ label: t('contacts.field.language'), options: printLanguageChoices(), value: c.language || '', hint: t('contacts.field.languageHint'), attrs: { id: 'contact-language' } }),
    sendReminders: checkboxField({ label: t('contacts.field.sendReminders'), checked: c.sendReminders !== false }),
    tags: textField({ label: t('contacts.field.tags'), value: (c.tags || []).join(', '), hint: t('contacts.field.tagsHint') }),
    note: textArea({ label: t('contacts.field.note'), value: c.note || '' })
  };
  const levels = listOf('priceLevels');
  const priceLevel = levels.length
    ? selectField({ label: t('contacts.field.priceLevel'), options: [{ value: '', label: t('contacts.priceLevel.none') }, ...levels.map(l => ({ value: l.id, label: l.name }))], value: c.priceLevelId || '' })
    : null;
  const emails = emailEditor(c.emails);
  const persons = personEditor(c.persons);
  const delivery = deliveryEditor(c.deliveryAddresses);
  const lookupStatus = h('p', { class: 'muted small', id: 'contact-lookup-status', 'aria-live': 'polite' });

  const fill = (draft) => {
    ['name', 'ico', 'dic', 'icDph'].forEach(k => { if (draft[k]) f[k].input.value = draft[k]; });
    f.country.input.value = draft.country || f.country.input.value;
    f.street.input.value = draft.billingAddress.street; f.zip.input.value = draft.billingAddress.zip; f.city.input.value = draft.billingAddress.city;
  };
  const lookup = async () => {
    lookupStatus.textContent = t('contacts.lookup.searching');
    try {
      const country = f.country.input.value === 'CZ' ? 'CZ' : 'SK';
      fill(lookupToContact(await lookupByIco(transport, f.ico.input.value, country)));
      lookupStatus.textContent = t('contacts.lookup.filled');
    } catch (e) {
      console.warn('Register lookup failed', e);
      lookupStatus.textContent = t(`errors.${e.code || 'UNKNOWN'}`);
    }
  };

  const read = () => ({
    ...c,
    kind: f.kind.value(), name: f.name.value(), country: f.country.value(), ico: f.ico.value(), dic: f.dic.value(), icDph: f.icDph.value(),
    billingAddress: { street: f.street.value(), zip: f.zip.value(), city: f.city.value() },
    phone: f.phone.value(), iban: f.iban.value(), dueDays: f.dueDays.value(), discountPct: f.discountPct.value(),
    currency: f.currency.value() || null, language: f.language.value() || null, sendReminders: f.sendReminders.value(),
    priceLevelId: priceLevel ? priceLevel.value() || null : c.priceLevelId || null,
    tags: f.tags.value().split(',').map(s => s.trim()).filter(Boolean), note: f.note.value(),
    emails: emails.value(), persons: persons.value(), deliveryAddresses: delivery.value().map(a => ({ ...a, country: f.country.value() }))
  });

  const save = async () => {
    const { contact, errors } = normalizeContact(read());
    Object.entries(f).forEach(([k, field]) => field.setError(errors[k] ? t(`crm.error.${errors[k]}`) : null));
    if (errors.emails) showToast(t(`crm.error.${errors.emails}`), { type: 'error' });
    if (Object.keys(errors).length) { root.querySelector('[aria-invalid="true"]')?.focus(); return; }
    const idChanged = !existing || existing.icDph !== contact.icDph || existing.dic !== contact.dic;
    const saved = await write(store => (existing ? store.update('contacts', existing.id, contact) : store.insert('contacts', contact)));
    if (!saved) return;
    showToast(t('contacts.saved'), { type: 'success' });
    go(`contacts/${encodeURIComponent(saved.id)}`);
    if (idChanged && (saved.icDph || saved.dic)) {
      runAllChecks(transport, saved)
        .then(patch => write(store => store.update('contacts', saved.id, patch)))
        .catch(e => { console.warn('VAT check after saving failed', e); showError(e); });
    }
  };

  const section = (title, ...children) => h('fieldset', { class: 'form-section' }, h('legend', {}, title), h('div', { class: 'form-grid' }, children));
  append(root, [
    h('header', { class: 'view-header' },
      h('div', {},
        h('a', { href: existing ? `#/contacts/${encodeURIComponent(existing.id)}` : '#/contacts', class: 'back-link' }, icon('arrow-left'), t('contacts.back')),
        h('h1', {}, existing ? t('contacts.editTitle') : t('contacts.new')))),
    h('form', { class: 'card contact-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      section(t('contacts.section.ids'), f.kind.el, f.name.el, f.country.el,
        h('div', { class: 'ico-lookup' }, f.ico.el, h('button', { type: 'button', class: 'btn', id: 'contact-ico-lookup', onclick: lookup }, icon('search'), t('contacts.lookup.fill')), lookupStatus),
        f.dic.el, f.icDph.el),
      section(t('contacts.section.address'), f.street.el, f.zip.el, f.city.el, f.phone.el, f.iban.el),
      emails.el, persons.el,
      section(t('contacts.section.terms'), f.dueDays.el, f.discountPct.el, f.currency.el, f.language.el, priceLevel ? priceLevel.el : null, f.sendReminders.el),
      delivery.el,
      section(t('contacts.section.other'), f.tags.el, f.note.el),
      h('div', { class: 'form-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => history.back() }, t('common.cancel')),
        h('button', { type: 'submit', class: 'btn btn-primary', id: 'contact-save' }, icon('check'), t('common.save'))))]);
  refreshIcons(root);
  setTimeout(() => f.name.input.focus(), 0);
}
