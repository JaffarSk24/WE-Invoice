// The pokladničná kniha out of the app: a CSV for a spreadsheet and the
// browser's print window. The column names come from the dictionaries.
import { t } from '../../../i18n/index.js';
import { showError } from '../../../ui/toast.js';
import { cashBookRows, cashBookCsv } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { money, day } from '../shared/format.js';
import { printDocument } from '../shared/print.js';

function labels() {
  return {
    date: t('cash.col.date'), number: t('cash.col.number'), kind: t('cash.col.kind'), partner: t('cash.col.partner'),
    purpose: t('cash.col.purpose'), income: t('cash.col.income'), expense: t('cash.col.expense'), balance: t('cash.col.balance'),
    opening: t('cash.opening'), closing: t('cash.closing'), kindIn: t('cash.kindShort.CASH_IN'), kindOut: t('cash.kindShort.CASH_OUT')
  };
}

const slug = (s) => String(s || 'cash').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export async function exportCashBook(ctx, book, period) {
  try {
    const data = cashBookRows(book, moneyState().documents, period);
    const csv = cashBookCsv(data, labels());
    const name = `${slug(book.name)}-${period.from || 'start'}-${period.to || 'end'}.csv`;
    await ctx.transport.files.saveAs(name, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  } catch (e) {
    showError(e);
  }
}

export function printCashBook(book, period) {
  const data = cashBookRows(book, moneyState().documents, period);
  const l = labels();
  const m = (v) => (v === null ? '' : money(v, book.currency));
  printDocument({
    title: t('cash.printTitle', { name: book.name }),
    blocks: [{
      text: [t('cash.printPeriod', { from: period.from ? day(period.from) : '', to: period.to ? day(period.to) : '' })],
      table: {
        head: [l.date, l.number, l.kind, l.partner, l.purpose, l.income, l.expense, l.balance],
        rows: [
          ['', '', '', '', l.opening, '', '', m(data.opening)],
          ...data.rows.map(r => [day(r.date), r.number, r.kind === 'CASH_IN' ? l.kindIn : l.kindOut, r.partner, r.purpose, m(r.income), m(r.expense), m(r.balance)])
        ],
        foot: ['', '', '', '', l.closing, m(data.income), m(data.expense), m(data.closing)],
        num: [5, 6, 7]
      }
    }]
  });
}
