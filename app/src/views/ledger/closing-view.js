// The "Uzávierka" route (closing): the year-end wizard of jednoduché
// účtovníctvo. Cash and bank against the counted and stated balances,
// receivables and payables, the values entered by hand, the checks that
// still block, both statements (print and CSV) and the closing itself,
// which marks the depreciation of the year as booked and shows the
// balances carried into the next year. With flat-rate expenses the screen
// gives the DPFO summary and the receivables at 31 December.
import { yearClosing, depreciationPlan } from '@we-invoice/core';
import { clear, h, icon, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/modal.js';
import { amountField } from '../../components/fields.js';
import { formatDate } from '../../components/dates.js';
import { getStore } from '../../store/index.js';
import { viewHeader, modeNotice, liveView, ledgerYear, money, stats, callout, canWrite } from './kit.js';
import { ledgerData, ledgerMode, ledgerYears, initialBalances, isReadOnly } from './state.js';
import { CLOSING_INPUTS, closingState, saveClosingState } from './closing-inputs.js';
import { tableSpec, saveCsv, printTables } from './export.js';
import { renderFlatSummaryTab, flatTables } from './flat-tab.js';
import { renderBooksTab, booksTables } from './books-tab.js';

function statementTables(r) {
  const cols = (prefix) => [
    { label: t('ledger.statement.row'), value: x => x.code },
    { label: t('ledger.statement.item'), value: x => t(`ledger.statement.${prefix}.${x.code}`) },
    { label: t('ledger.statement.amount'), value: x => x.amount, num: true }
  ];
  return [
    tableSpec(t('ledger.statement.ie.title', { year: r.year }), cols('ie'), r.incomeExpense.rows),
    tableSpec(t('ledger.statement.al.title', { year: r.year }), cols('al'), r.assetsLiabilities.rows)
  ];
}

function statementCard(spec, rows) {
  return h('section', { class: 'card ledger-card ledger-statement' }, h('h2', {}, spec.caption),
    h('table', { class: 'table ledger-simple-table' }, h('tbody', {}, rows.map((row, i) => h('tr', { class: row.total ? 'is-total' : null },
      h('td', { class: 'muted' }, spec.rows[i][0]), h('td', {}, spec.rows[i][1]), h('td', { class: 'num' }, money(row.amount)))))));
}

function checkItem(item) {
  const ok = item.ok;
  const detail = item.difference && !item.pending ? t('ledger.closing.difference', { amount: money(item.difference) }) : item.count ? t('ledger.closing.count', { n: item.count }) : '';
  return h('li', { class: `ledger-check ${ok ? 'is-ok' : item.pending ? 'is-pending' : 'is-bad'}` },
    icon(ok ? 'circle-check' : item.pending ? 'circle' : 'triangle-alert'),
    h('span', {}, t(`ledger.closing.check.${item.id}`)), detail ? h('span', { class: 'muted' }, ` ${detail}`) : null);
}

async function closeYear(root, data, result, companyId) {
  if (!canWrite()) return;
  if (!(await confirmDialog(t('ledger.closing.confirm', { year: result.year }), { okLabel: t('ledger.closing.close') }))) return;
  try {
    const store = getStore();
    for (const asset of data.assets) {
      const plan = depreciationPlan(asset).plan;
      if (!plan.some(p => p.year === result.year && !p.booked)) continue;
      await store.update('assets', asset.id, { plan: plan.map(p => (p.year === result.year ? { ...p, booked: true } : p)) });
    }
    saveClosingState(companyId, result.year, { closedAt: new Date().toISOString() });
    showToast(t('ledger.closing.closed', { year: result.year }), { type: 'success' });
    draw(root);
  } catch (e) {
    showError(e, 'ledger.closing.error');
  }
}

function inputsCard(root, companyId, year, state, readOnly) {
  const fields = CLOSING_INPUTS.map(key => {
    const f = amountField({ label: t(`ledger.closing.input.${key}`), value: state.inputs[key] ?? null, hint: t(`ledger.closing.hint.${key}`) });
    f.input.disabled = readOnly;
    f.input.addEventListener('change', () => {
      const value = f.value();
      saveClosingState(companyId, year, { inputs: { ...closingState(companyId, year).inputs, [key]: value } });
      draw(root);
    });
    return f.el;
  });
  return h('section', { class: 'card ledger-card' }, h('h2', {}, t('ledger.closing.inputs')), h('div', { class: 'form-grid ledger-form' }, fields));
}

function drawSimple(root, data, year, readOnly) {
  const companyId = data.company?.id || 'demo';
  const state = closingState(companyId, year);
  const result = yearClosing({ ...data, year, initial: initialBalances(data), inputs: state.inputs });
  const specs = statementTables(result);
  root.append(viewHeader({
    title: t('nav.closing'), years: ledgerYears(data), year, onYear: () => draw(root),
    actions: [
      { id: 'csv', icon: 'file-spreadsheet', label: t('ledger.export.csv'), onClick: () => saveCsv(`${t('ledger.file.statements')}-${year}.csv`, specs) },
      { id: 'print', icon: 'file-text', label: t('ledger.export.print'), onClick: () => printTables({ title: t('ledger.closing.printTitle', { year }), tables: specs }) }
    ]
  }));
  root.append(callout('info', t('ledger.closing.disclaimer')));
  if (state.closedAt) root.append(callout('info', t('ledger.closing.closedAt', { date: formatDate(state.closedAt.slice(0, 10)) })));
  append(root, [stats([
    { label: t('ledger.stat.cash'), value: money(result.journal.closing.cash) },
    { label: t('ledger.stat.bank'), value: money(result.journal.closing.bank) },
    { label: t('ledger.books.receivables'), value: money(result.receivables.total) },
    { label: t('ledger.books.payables'), value: money(result.payables.total) },
    { label: t('ledger.stat.result'), value: money(result.incomeExpense.result), tone: result.negativeResult ? 'danger' : null }
  ])]);
  root.append(inputsCard(root, companyId, year, state, readOnly));
  const list = h('ul', { class: 'ledger-checklist' }, result.checklist.map(checkItem));
  result.disposals.forEach(d => list.append(h('li', { class: 'ledger-check is-bad' }, icon('info'), h('span', {}, t('ledger.closing.disposal', { name: d.name, amount: money(d.residual) })))));
  root.append(h('section', { class: 'card ledger-card' }, h('h2', {}, t('ledger.closing.checks')), list));
  root.append(h('div', { class: 'ledger-statements' }, statementCard(specs[0], result.incomeExpense.rows), statementCard(specs[1], result.assetsLiabilities.rows)));
  append(root, [h('section', { class: 'card ledger-card ledger-carry' },
    h('h2', {}, t('ledger.closing.carryTitle', { year: result.carryForward.year })),
    h('p', {}, t('ledger.closing.carryText', { cash: money(result.carryForward.cash), bank: money(result.carryForward.bank) })),
    result.ready ? null : h('p', { class: 'muted' }, t('ledger.closing.notReady')),
    h('button', { type: 'button', class: 'btn btn-primary', disabled: readOnly, dataset: { action: 'close-year' }, onclick: () => closeYear(root, data, result, companyId) }, icon('lock'), t('ledger.closing.close')))]);
  refreshIcons(root);
}

function drawFlat(root, data, year) {
  const ctx = { ...data, year, date: `${year}-12-31` };
  const tables = [...flatTables(ctx), ...booksTables(data.documents, ctx.date, true)];
  root.append(viewHeader({
    title: t('nav.closing'), years: ledgerYears(data), year, onYear: () => draw(root),
    actions: [
      { id: 'csv', icon: 'file-spreadsheet', label: t('ledger.export.csv'), onClick: () => saveCsv(`${t('ledger.file.summary')}-${year}.csv`, tables) },
      { id: 'print', icon: 'file-text', label: t('ledger.export.print'), onClick: () => printTables({ title: t('ledger.closing.flatTitle', { year }), tables }) }
    ]
  }));
  const summary = h('div', {});
  renderFlatSummaryTab(summary, ctx);
  const books = h('div', {});
  renderBooksTab(books, { documents: data.documents, date: ctx.date, flat: true });
  root.append(summary, books);
}

function draw(root) {
  clear(root);
  const notice = modeNotice();
  if (notice) { root.append(viewHeader({ title: t('nav.closing') }), notice); return; }
  const data = ledgerData();
  const year = ledgerYear();
  try {
    if (ledgerMode(data.company) === 'TAX_RECORDS_FLAT') drawFlat(root, data, year);
    else drawSimple(root, data, year, isReadOnly());
  } catch (e) {
    showError(e);
    root.append(callout('danger', t('ledger.error.compute')));
  }
}

export function renderClosing(root) {
  liveView(root, () => draw(root));
}
