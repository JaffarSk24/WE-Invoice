// The totals of the editor, sticky at the bottom (07-ui-ux-i18n.md § 7.3):
// the VAT breakdown by rate, net, VAT, total, advances deducted, cash
// rounding and the amount to pay, all from computeTotals(). A draft that
// cannot be computed yet says why instead of showing wrong numbers.
import { h, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { formatAmount } from '../../components/decimal.js';
import { cmp } from '@we-invoice/core';

function row(label, value, cls = '') {
  return h('div', { class: `totals-row ${cls}`.trim() }, h('span', {}, label), h('span', { class: 'num' }, value));
}

function breakdownLabel(b) {
  return b.category === 'S' ? t('documents.totals.base', { rate: b.rate }) : t(`documents.editor.vat.${b.category}`);
}

export function createTotalsPanel({ payer }) {
  const el = h('section', { class: 'editor-totals card', 'aria-live': 'polite', 'aria-label': t('documents.totals.title') });
  return {
    el,
    show(totals, error, currency) {
      while (el.firstChild) el.removeChild(el.firstChild);
      if (!totals) {
        el.append(h('p', { class: 'muted' }, t(`errors.${error}`) !== `errors.${error}` ? t(`errors.${error}`) : t('documents.totals.notYet')));
        return;
      }
      const money = (v) => formatAmount(v, currency);
      if (payer) totals.breakdown.forEach(b => append(el, [row(breakdownLabel(b), money(b.base), 'totals-sub'), b.category === 'S' ? row(t('documents.totals.vatAt', { rate: b.rate }), money(b.vat), 'totals-sub') : null]));
      if (cmp(totals.allowances, '0') !== 0) el.append(row(t('documents.totals.discount'), money(`-${totals.allowances}`)));
      el.append(row(t('documents.totals.net'), money(totals.net)));
      if (payer) el.append(row(t('documents.totals.vat'), money(totals.vat)));
      el.append(row(t('documents.totals.gross'), money(totals.gross), 'totals-strong'));
      if (cmp(totals.prepaid, '0') !== 0) el.append(row(t('documents.totals.prepaid'), money(`-${totals.prepaid}`)));
      if (cmp(totals.rounding, '0') !== 0) el.append(row(t('documents.totals.rounding'), money(totals.rounding)));
      el.append(row(t('documents.totals.payable'), money(totals.payable), 'totals-payable'));
      if (totals.vatEur) el.append(row(t('documents.totals.vatEur'), formatAmount(totals.vatEur, 'EUR'), 'totals-sub'));
      const diffs = (totals.lines || []).filter(l => l.grossDiff);
      if (diffs.length) el.append(h('p', { class: 'muted small' }, t('vat.grossDiff', { amount: money(diffs[0].grossDiff) })));
    }
  };
}
