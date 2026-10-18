// After a quick sale: what the seller types into the virtual cash register
// (VRP2) by hand, since stage 1 has no eKasa link. Lines with their price
// including VAT, the VAT summary, the rounding and the amount paid.
import { vrpSummary } from '@we-invoice/core';
import { h } from '../../../ui/dom.js';
import { t } from '../../../i18n/index.js';
import { openModal } from '../../../ui/modal.js';
import { formatDate } from '../../../components/dates.js';
import { qtyText, moneyText } from '../format.js';

const rateText = (rate) => (rate === null ? t('stock.sale.outsideVat') : `${qtyText(rate)} %`);

export function openSaleSummary(document, { warnings = [], itemName = () => '' } = {}) {
  const s = vrpSummary(document);
  const body = h('div', { class: 'stock-vrp', id: 'stock-vrp' },
    h('p', { class: 'muted' }, t('stock.sale.vrpIntro')),
    h('dl', { class: 'stock-vrp-head' },
      h('dt', {}, t('stock.sale.number')), h('dd', { id: 'stock-vrp-number' }, s.number || ''),
      h('dt', {}, t('stock.sale.date')), h('dd', {}, formatDate(s.date)),
      h('dt', {}, t('stock.sale.method')), h('dd', {}, t(`stock.sale.method.${s.method}`))),
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, t('stock.col.item')), h('th', { scope: 'col', class: 'num' }, t('stock.col.qty')),
        h('th', { scope: 'col', class: 'num' }, t('stock.sale.unitGross')), h('th', { scope: 'col', class: 'num' }, t('stock.sale.vatRate')),
        h('th', { scope: 'col', class: 'num' }, t('stock.sale.lineTotal')))),
      h('tbody', {}, s.lines.map(l => h('tr', {},
        h('td', {}, l.name), h('td', { class: 'num' }, qtyText(l.qty)), h('td', { class: 'num' }, moneyText(l.unitPrice)),
        h('td', { class: 'num' }, rateText(l.vatRate)), h('td', { class: 'num' }, moneyText(l.total)))))),
    h('table', { class: 'table stock-vrp-vat' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, t('stock.sale.vatRate')), h('th', { scope: 'col', class: 'num' }, t('stock.sale.base')),
        h('th', { scope: 'col', class: 'num' }, t('stock.sale.vat')), h('th', { scope: 'col', class: 'num' }, t('stock.sale.lineTotal')))),
      h('tbody', {}, s.vat.map(v => h('tr', {},
        h('td', {}, rateText(v.rate)), h('td', { class: 'num' }, moneyText(v.base)), h('td', { class: 'num' }, moneyText(v.vat)), h('td', { class: 'num' }, moneyText(v.total)))))),
    h('dl', { class: 'stock-vrp-totals' },
      h('dt', {}, t('stock.sale.total')), h('dd', {}, moneyText(s.total)),
      s.rounding !== '0.00' ? [h('dt', {}, t('stock.sale.rounding')), h('dd', {}, moneyText(s.rounding))] : null,
      h('dt', {}, t('stock.sale.payable')), h('dd', { id: 'stock-vrp-payable' }, moneyText(s.payable)),
      h('dt', {}, t('stock.sale.paid')), h('dd', {}, moneyText(s.paid))),
    warnings.length
      ? h('div', { class: 'callout callout-warning', role: 'status' }, warnings.map(w => h('p', {}, t('stock.warning.negative', { item: itemName(w.itemId), qty: qtyText(w.qty) }))))
      : null);
  return openModal({ title: t('stock.sale.doneTitle'), body, wide: true, actions: [{ label: t('common.close'), kind: 'primary', onClick: (m) => m.close() }] });
}
