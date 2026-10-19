// The buyer of a predajka, asked for only when a line needs one: reverse
// charge (AE, § 69 ods. 12 zákona o DPH) is possible only for a buyer who
// is a VAT payer, and the receipt then names the buyer with the IČ DPH; a
// supply to another member state (K) needs the IČ DPH of that state. The
// buyer can be taken from the contacts that have an IČ DPH or typed in.
import { h, append, clear } from '../../../ui/dom.js';
import { t } from '../../../i18n/index.js';

/**
 * @param {{contacts: () => Array<object>}} options  the contacts of the company
 * @returns {{el: HTMLElement, show: (need: string|null) => void, value: () => object|null,
 *   setError: (field: string, message: string|null) => void, reset: () => void}}
 */
export function createBuyerForm({ contacts }) {
  let need = null;
  let picked = null;
  const hint = h('p', { class: 'field-hint', id: 'sale-buyer-hint' });
  const field = (id, label) => {
    const input = h('input', { type: 'text', id, autocomplete: 'off', 'aria-describedby': `sale-buyer-hint ${id}-error`, oninput: () => { picked = null; pick.value = ''; setError(id, null); } });
    const error = h('span', { class: 'field-error', id: `${id}-error`, role: 'alert', hidden: true });
    return { input, error, el: h('label', { class: 'sale-buyer-field', for: id }, h('span', {}, label), input, error) };
  };
  const name = field('sale-buyer-name', t('stock.sale.buyer.name'));
  const icDph = field('sale-buyer-icdph', t('stock.sale.buyer.icDph'));
  const fields = { name, icDph, 'sale-buyer-name': name, 'sale-buyer-icdph': icDph };
  const pick = h('select', {
    id: 'sale-buyer-pick', 'aria-label': t('stock.sale.buyer.pick'),
    onchange: (e) => {
      picked = withVatId().find(c => c.id === e.target.value) || null;
      name.input.value = picked ? picked.name : '';
      icDph.input.value = picked ? picked.icDph : '';
      setError('name', null);
      setError('icDph', null);
    }
  });
  const pickField = h('label', { class: 'sale-buyer-field', for: 'sale-buyer-pick' }, h('span', {}, t('stock.sale.buyer.pick')), pick);
  const el = h('fieldset', { class: 'sale-buyer', id: 'sale-buyer', hidden: true },
    h('legend', {}, t('stock.sale.buyer.title')), hint, pickField, name.el, icDph.el);

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
    const list = withVatId();
    append(clear(pick), [h('option', { value: '' }, t('stock.sale.buyer.manual')), list.map(c => h('option', { value: c.id, selected: picked?.id === c.id }, `${c.name} (${c.icDph})`))]);
    pickField.hidden = !list.length;
  }

  return {
    el,
    show,
    setError,
    value() {
      if (!need) return null;
      return {
        name: name.input.value, icDph: icDph.input.value, contactId: picked ? picked.id : null, ico: picked ? picked.ico || null : null,
        address: picked && picked.billingAddress ? picked.billingAddress : {}
      };
    },
    reset() {
      picked = null;
      name.input.value = '';
      icDph.input.value = '';
      setError('name', null);
      setError('icDph', null);
    }
  };
}
