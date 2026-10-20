// The VAT choice of a predajka line, as on a line of an invoice: each rate
// of the S category, the zero rate and the categories legislation gives
// an exemption reference for, reverse charge (§ 69 ods. 12) among them.
// A company that is not a VAT payer has nothing to choose.
import { salesReceiptVatChoices, salesReceiptVatChoiceOf } from '@we-invoice/core';
import { h } from '../../../ui/dom.js';
import { t } from '../../../i18n/index.js';
import { qtyText } from '../format.js';

/** Label of a VAT choice or of a line category and rate. */
export function vatLabel(category, rate) {
  if (category === 'S') return `${qtyText(rate ?? '0')} %`;
  return t(`vat.category.${category}`);
}

/**
 * @param {{item: object, vat?: string|null}} entry  a cart line
 * @param {{company: object|null, date: string, onChange: (value: string) => void}} options
 * @returns {HTMLSelectElement|null} null when there is only one choice
 */
export function vatSelect(entry, { company, date, onChange }) {
  let choices;
  try {
    choices = salesReceiptVatChoices(date, company);
  } catch (e) {
    console.warn('VAT choices are not available for the date', e);
    return null;
  }
  if (choices.length < 2) return null;
  const current = entry.vat || salesReceiptVatChoiceOf(entry.item, company);
  const options = choices.map(c => ({ value: c.value, label: vatLabel(c.category, c.rate) }));
  // An item rate that is no longer in force stays visible, so the seller sees it.
  if (!options.some(o => o.value === current)) options.push({ value: current, label: vatLabel(current.split(':')[0], current.split(':')[1]) });
  const select = h('select', {
    class: 'sale-vat', 'aria-label': t('stock.sale.vatFor', { item: entry.item.name }), dataset: { vatFor: entry.item.id },
    onchange: (e) => onChange(e.target.value)
  }, options.map(o => h('option', { value: o.value, selected: o.value === current }, o.label)));
  return select;
}
