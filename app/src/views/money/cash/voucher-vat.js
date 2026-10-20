// The partner and VAT part of the cash voucher form: a contact to pick (it
// fills the name and the IČ DPH), the partner's name and IČ DPH, and the
// VAT choice from legislation on the voucher date (rates, reverse charge,
// exemption, no VAT). Reverse charge shows its legal reference and asks for
// the partner's Slovak IČ DPH; the check itself is the core's. A sale of a
// company that uses eKasa carries "predaj evidovaný v eKasa", ticked by
// default, so its VAT is not counted again next to the eKasa turnover.
import { h, append, clear } from '../../../ui/dom.js';
import { t } from '../../../i18n/index.js';
import { textField, selectField, checkboxField } from '../../../components/fields.js';
import { autocomplete } from '../../../components/autocomplete.js';
import { cashVatChoices, cashVatLine, cashVatProblems, ekasaExempt } from '@we-invoice/core';

/** The label of a VAT choice in the select. */
export function vatChoiceLabel(choice) {
  if (choice.category === 'S') return `${choice.rate} %`;
  if (choice.category === 'O') return t('cash.voucher.noVat');
  return t(`vat.category.${choice.category}`);
}

// The legal reference of AE or E on the date, for the hint under the select.
function lawOf(value, date) {
  try {
    return cashVatLine(value, date).exemptionReasonText || '';
  } catch (e) {
    console.warn('No legal reference for the VAT choice', e);
    return '';
  }
}

/**
 * @param {{state: object, kind: string, date: () => string}} options
 * @returns {{els: HTMLElement[], vat: () => string, partner: () => object|null, contactId: () => string|null, ekasaSale: () => boolean,
 *   refresh: () => void, validate: () => boolean}}
 */
export function voucherVatFields({ state, kind, date }) {
  let contactId = null;
  const name = textField({ label: t(kind === 'CASH_IN' ? 'cash.voucher.partnerIn' : 'cash.voucher.partnerOut') });
  const icDph = textField({ label: t('cash.voucher.icDph'), attrs: { autocomplete: 'off', spellcheck: 'false' } });
  const hint = h('p', { class: 'field-hint voucher-vat-hint', 'aria-live': 'polite' });
  let choices = cashVatChoices(state.company, date());
  const select = choices.length > 1
    ? selectField({ label: t('cash.voucher.vatRate'), options: choices.map(c => ({ value: c.value, label: vatChoiceLabel(c) })), value: 'O', onChange: () => update() })
    : null;
  const vat = () => (select ? select.value() : 'O');
  // Only a sale with VAT of a company that uses eKasa can be in its turnover.
  const ekasa = select && kind === 'CASH_IN' && !ekasaExempt(state.company)
    ? checkboxField({ label: t('cash.voucher.ekasaSale'), checked: true, hint: t('cash.voucher.ekasaSaleHint') })
    : null;

  function update() {
    const value = vat();
    const category = value.split(':')[0];
    if (category === 'AE') hint.textContent = t('cash.voucher.aeHint', { law: lawOf(value, date()) });
    else if (category === 'E') hint.textContent = t('cash.voucher.exemptHint', { law: lawOf(value, date()) });
    else hint.textContent = '';
    icDph.el.hidden = !select;
    icDph.setError(null);
    if (ekasa) ekasa.el.hidden = category === 'AE' || category === 'O';
  }

  // New rates on another date: the same choice stays when it still exists.
  function refresh() {
    if (!select) return;
    const current = vat();
    choices = cashVatChoices(state.company, date());
    append(clear(select.input), choices.map(c => h('option', { value: c.value }, vatChoiceLabel(c))));
    select.input.value = choices.some(c => c.value === current) ? current : 'O';
    update();
  }

  const picker = state.contacts.length ? autocomplete({
    label: t('cash.voucher.contact'), placeholder: t('cash.voucher.contactSearch'),
    search: (q) => {
      const query = q.toLowerCase();
      return state.contacts.filter(c => [c.name, c.ico, c.icDph].filter(Boolean).join(' ').toLowerCase().includes(query)).slice(0, 20)
        .map(c => ({ id: c.id, label: c.name, hint: c.icDph || c.ico || '' }));
    },
    onPick: (item) => {
      const contact = state.contacts.find(c => c.id === item.id);
      if (!contact) return;
      contactId = contact.id;
      name.input.value = contact.name || '';
      icDph.input.value = contact.icDph || '';
      icDph.setError(null);
    }
  }) : null;
  name.input.addEventListener('input', () => { contactId = null; });
  update();

  const partner = () => {
    const value = { name: name.value(), icDph: icDph.value() || null };
    const contact = state.contacts.find(c => c.id === contactId);
    if (contact) Object.assign(value, { ico: contact.ico || null, dic: contact.dic || null, address: contact.address || undefined });
    return value.name || value.icDph ? value : null;
  };

  const validate = () => {
    const [code] = cashVatProblems(vat().split(':')[0], partner());
    icDph.setError(code ? t(`errors.${code}`) : null);
    if (code) icDph.input.focus();
    return !code;
  };

  return {
    els: [picker ? picker.el : null, name.el, select ? h('div', { class: 'voucher-vat' }, select.el, hint) : null, icDph.el, ekasa ? ekasa.el : null].filter(Boolean),
    vat, partner, contactId: () => contactId, refresh, validate,
    ekasaSale: () => (ekasa ? ekasa.value() && !ekasa.el.hidden : false)
  };
}
