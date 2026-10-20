// The buyer of a quick sale, asked for only when a line needs one: reverse
// charge (AE, § 69 ods. 12 zákona o DPH) is possible only for a buyer who
// is a VAT payer, a supply to another member state (K) needs the IČ DPH
// of that state, and neither may be documented by a simplified invoice.
// The sale is then issued as a full invoice, which names the buyer with
// the address and the IČ DPH. The buyer can be taken from the contacts
// that have an IČ DPH or typed in.
import { h, append, clear } from '../../../ui/dom.js';
import { t } from '../../../i18n/index.js';

const FIELDS = Object.freeze([
  ['name', 'sale-buyer-name'], ['icDph', 'sale-buyer-icdph'], ['street', 'sale-buyer-street'],
  ['city', 'sale-buyer-city'], ['zip', 'sale-buyer-zip'], ['country', 'sale-buyer-country']
]);

/**
 * @param {{contacts: () => Array<object>}} options  the contacts of the company
 * @returns {{el: HTMLElement, show: (need: string|null) => void, value: () => object|null,
 *   setError: (field: string, message: string|null) => void, reset: () => void}}
 */
export function createBuyerForm({ contacts }) {
  let need = null;
  let picked = null;
  const hint = h('p', { class: 'field-hint', id: 'sale-buyer-hint' });
  const fields = {};
  for (const [key, id] of FIELDS) {
    const input = h('input', {
      type: 'text', id, autocomplete: 'off', maxlength: key === 'country' ? '2' : null, 'aria-describedby': `sale-buyer-hint ${id}-error`,
      oninput: () => { picked = null; pick.value = ''; setError(key, null); }
    });
    const error = h('span', { class: 'field-error', id: `${id}-error`, role: 'alert', hidden: true });
    fields[key] = { input, error, el: h('label', { class: `sale-buyer-field sale-buyer-${key}`, for: id }, h('span', {}, t(`stock.sale.buyer.${key}`)), input, error) };
  }
  // The core reports a missing address as one error; it is shown at the street.
  fields.address = fields.street;
  fields.country.input.value = 'SK';

  const pick = h('select', {
    id: 'sale-buyer-pick', 'aria-label': t('stock.sale.buyer.pick'),
    onchange: (e) => {
      picked = withVatId().find(c => c.id === e.target.value) || null;
      const address = (picked && picked.billingAddress) || {};
      fields.name.input.value = picked ? picked.name : '';
      fields.icDph.input.value = picked ? picked.icDph : '';
      fields.street.input.value = address.street || '';
      fields.city.input.value = address.city || '';
      fields.zip.input.value = address.zip || '';
      fields.country.input.value = address.country || (picked && picked.country) || 'SK';
      FIELDS.forEach(([key]) => setError(key, null));
    }
  });
  const pickField = h('label', { class: 'sale-buyer-field', for: 'sale-buyer-pick' }, h('span', {}, t('stock.sale.buyer.pick')), pick);
  const el = h('fieldset', { class: 'sale-buyer', id: 'sale-buyer', hidden: true },
    h('legend', {}, t('stock.sale.buyer.title')), hint, pickField,
    FIELDS.map(([key]) => fields[key].el));

  function withVatId() {
    return (contacts() || []).filter(c => c && !c.deleted && c.icDph).sort((a, b) => a.name.localeCompare(b.name));
  }

  function setError(key, message) {
    const f = fields[key];
    if (!f) return;
    f.error.textContent = message || '';
    f.error.hidden = !message;
    f.input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (message) f.input.focus();
  }

  function show(next) {
    need = next;
    el.hidden = !need;
    if (!need) return;
    hint.textContent = t(`stock.sale.buyer.hint.${need}`);
    // A buyer from another member state: the country follows the VAT number unless typed.
    if (need === 'K' && !picked && fields.country.input.value === 'SK') fields.country.input.value = '';
    if (need === 'AE' && !picked && !fields.country.input.value) fields.country.input.value = 'SK';
    const list = withVatId();
    append(clear(pick), [h('option', { value: '' }, t('stock.sale.buyer.manual')), list.map(c => h('option', { value: c.id, selected: picked?.id === c.id }, `${c.name} (${c.icDph})`))]);
    pickField.hidden = !list.length;
  }

  const text = (key) => fields[key].input.value.trim();

  return {
    el,
    show,
    setError,
    value() {
      if (!need) return null;
      return {
        name: text('name'), icDph: text('icDph'), contactId: picked ? picked.id : null, ico: picked ? picked.ico || null : null,
        dic: picked ? picked.dic || null : null,
        address: { street: text('street'), city: text('city'), zip: text('zip'), country: text('country') }
      };
    },
    reset() {
      picked = null;
      FIELDS.forEach(([key]) => { fields[key].input.value = ''; setError(key, null); });
      fields.country.input.value = 'SK';
    }
  };
}
