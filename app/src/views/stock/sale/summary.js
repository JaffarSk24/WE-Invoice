// After a quick sale: what the seller types into the virtual cash register
// (VRP2) by hand, since stage 1 has no eKasa link. Lines with their price
// including VAT and their VAT category (reverse charge and exemptions by
// name, not as a zero rate), the VAT summary per category, the buyer's
// IČ DPH of a reverse-charge sale, the rounding and the amount paid. A sale
// issued as an invoice (reverse charge, a supply to another member state)
// is recorded in VRP2 as the payment of that invoice, which the summary
// says first.
import { vrpSummary } from '@we-invoice/core';
import { h } from '../../../ui/dom.js';
import { t } from '../../../i18n/index.js';
import { openModal } from '../../../ui/modal.js';
import { formatDate } from '../../../components/dates.js';
import { moneyText, qtyText } from '../format.js';
import { vatLabel } from './vat-select.js';

const rateText = (category, rate) => (category === 'O' ? t('stock.sale.outsideVat') : vatLabel(category, rate));

export function openSaleSummary(document, { warnings = [], itemName = () => '' } = {}) {
  const s = vrpSummary(document);
  const body = h('div', { class: 'stock-vrp', id: 'stock-vrp' },
    s.entry === 'INVOICE_PAYMENT'
      ? h('p', { class: 'callout callout-warning', id: 'stock-vrp-invoice' }, t('stock.sale.invoicePaymentNote', { number: s.number || '', amount: moneyText(s.paid) }))
      : h('p', { class: 'muted' }, t('stock.sale.vrpIntro')),
    h('dl', { class: 'stock-vrp-head' },
      h('dt', {}, t(s.entry === 'INVOICE_PAYMENT' ? 'stock.sale.invoiceNumber' : 'stock.sale.number')), h('dd', { id: 'stock-vrp-number' }, s.number || ''),
      h('dt', {}, t('stock.sale.date')), h('dd', {}, formatDate(s.date)),
      h('dt', {}, t('stock.sale.method')), h('dd', {}, t(`stock.sale.method.${s.method}`)),
      s.buyer ? [h('dt', {}, t('stock.sale.buyerLabel')), h('dd', { id: 'stock-vrp-buyer' }, `${s.buyer.name}, ${s.buyer.icDph}`)] : null),
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, t('stock.col.item')), h('th', { scope: 'col', class: 'num' }, t('stock.col.qty')),
        h('th', { scope: 'col', class: 'num' }, t('stock.sale.unitGross')), h('th', { scope: 'col', class: 'num' }, t('stock.sale.vatRate')),
        h('th', { scope: 'col', class: 'num' }, t('stock.sale.lineTotal')))),
      h('tbody', {}, s.lines.map(l => h('tr', {},
        h('td', {}, l.name), h('td', { class: 'num' }, qtyText(l.qty)), h('td', { class: 'num' }, moneyText(l.unitPrice)),
        h('td', { class: 'num', dataset: { category: l.category } }, rateText(l.category, l.vatRate)), h('td', { class: 'num' }, moneyText(l.total)))))),
    h('table', { class: 'table stock-vrp-vat' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, t('stock.sale.vatRate')), h('th', { scope: 'col', class: 'num' }, t('stock.sale.base')),
        h('th', { scope: 'col', class: 'num' }, t('stock.sale.vat')), h('th', { scope: 'col', class: 'num' }, t('stock.sale.lineTotal')))),
      h('tbody', {}, s.vat.map(v => h('tr', {},
        h('td', {}, rateText(v.category, v.rate)), h('td', { class: 'num' }, moneyText(v.base)), h('td', { class: 'num' }, moneyText(v.vat)), h('td', { class: 'num' }, moneyText(v.total)))))),
    h('dl', { class: 'stock-vrp-totals' },
      h('dt', {}, t('stock.sale.total')), h('dd', {}, moneyText(s.total)),
      s.rounding !== '0.00' ? [h('dt', {}, t('stock.sale.rounding')), h('dd', {}, moneyText(s.rounding))] : null,
      h('dt', {}, t('stock.sale.payable')), h('dd', { id: 'stock-vrp-payable' }, moneyText(s.payable)),
      h('dt', {}, t('stock.sale.paid')), h('dd', {}, moneyText(s.paid))),
    s.texts.length ? h('p', { class: 'muted', id: 'stock-vrp-texts' }, s.texts.map(x => x.text).join(', ')) : null,
    warnings.length
      ? h('div', { class: 'callout callout-warning', role: 'status' }, warnings.map(w => h('p', {}, t('stock.warning.negative', { item: itemName(w.itemId), qty: qtyText(w.qty) }))))
      : null);
  return openModal({ title: t(s.entry === 'INVOICE_PAYMENT' ? 'stock.sale.doneInvoiceTitle' : 'stock.sale.doneTitle'), body, wide: true, actions: [{ label: t('common.close'), kind: 'primary', onClick: (m) => m.close() }] });
}
