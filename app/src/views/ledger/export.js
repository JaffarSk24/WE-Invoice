// Output of the ledger tables: a CSV file (core ledgerCsv, saved through
// the transport) and a printable page for "Save as PDF" in the print
// dialog of the browser or the desktop app. The print page is built in a
// container that the print style shows alone, then removed.
import { ledgerCsv } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { showError } from '../../ui/toast.js';
import { formatNumber } from '../../components/decimal.js';
import { formatDate, todayLocal } from '../../components/dates.js';
import { ledgerCompany } from './state.js';

let transport = null;

export function setLedgerTransport(value) {
  transport = value;
}

/** A table for CSV and print: header labels, rows of cells, optional foot. */
export function tableSpec(caption, columns, rows, foot = null) {
  return {
    caption,
    header: columns.map(c => c.label),
    rows: rows.map(r => columns.map(c => c.value(r))),
    foot: foot ? columns.map(c => (c.foot ? c.foot(foot) : '')) : null,
    numeric: columns.map(c => Boolean(c.num))
  };
}

/** Saves the tables as one CSV (tables after each other, a blank line between). */
export async function saveCsv(fileName, tables) {
  const parts = tables.map(tb => ledgerCsv(tb.header, [...tb.rows, ...(tb.foot ? [tb.foot] : [])], { bom: false }));
  const text = `\uFEFF${tables.map((tb, i) => (tables.length > 1 ? `${tb.caption}\r\n` : '') + parts[i]).join('\r\n')}`;
  try {
    await transport.files.saveAs(fileName, new Blob([text], { type: 'text/csv;charset=utf-8' }));
  } catch (e) {
    showError(e, 'ledger.export.error');
  }
}

// Dates and amounts for people; the CSV keeps the raw values.
function display(value, numeric) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatDate(text);
  if (numeric && /^-?\d+(\.\d+)?$/.test(text)) return formatNumber(text, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return text;
}

function printTable(tb, format) {
  const cell = (v, i) => h('td', { class: tb.numeric[i] ? 'num' : null }, format(v, i));
  return h('div', { class: 'ledger-print-block' },
    h('h2', {}, tb.caption),
    h('table', { class: 'ledger-print-table' },
      h('thead', {}, h('tr', {}, tb.header.map(label => h('th', {}, label)))),
      h('tbody', {}, tb.rows.map(r => h('tr', {}, r.map(cell))), tb.foot ? h('tr', { class: 'is-total' }, tb.foot.map(cell)) : null)));
}

/**
 * Prints a statement: title, company and the tables.
 */
export function printTables({ title, subtitle = null, tables }) {
  const company = ledgerCompany();
  const ids = [company?.ico ? `${t('ledger.print.ico')} ${company.ico}` : null, company?.dic ? `${t('ledger.print.dic')} ${company.dic}` : null].filter(Boolean).join(', ');
  const page = h('section', { class: 'ledger-print', 'aria-hidden': 'true' },
    h('h1', {}, title),
    h('p', { class: 'ledger-print-company' }, [company?.name, ids].filter(Boolean).join(', ')),
    subtitle ? h('p', {}, subtitle) : null,
    tables.map(tb => printTable(tb, (v, i) => display(v, tb.numeric[i]))),
    h('p', { class: 'ledger-print-foot' }, t('ledger.print.made', { date: formatDate(todayLocal()) })));
  document.body.append(page);
  document.documentElement.classList.add('ledger-printing');
  const done = () => {
    page.remove();
    document.documentElement.classList.remove('ledger-printing');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  try {
    window.print();
  } catch (e) {
    showError(e, 'ledger.export.error');
  }
  // Some browsers never fire afterprint; the page must not stay.
  setTimeout(done, 60000);
}
