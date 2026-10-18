// The "Peňažný denník" route (cash-journal). For jednoduché účtovníctvo:
// the journal of the year with depreciation and travel rows, the books of
// receivables and payables, and the trip log. For the tax records with
// flat-rate expenses: the income records, receivables and the DPFO typ B
// summary. Without bookkeeping the screen explains the mode instead.
import { cashJournal, openingBalances, journalSummary, depreciationRows, tripRows } from '@we-invoice/core';
import { clear } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { showError } from '../../ui/toast.js';
import { createTabs } from '../../components/tabs.js';
import { todayLocal } from '../../components/dates.js';
import { viewHeader, modeNotice, liveView, ledgerYear, callout } from './kit.js';
import { ledgerData, ledgerMode, ledgerYears, initialBalances, isReadOnly } from './state.js';
import { renderJournalTab, journalTables } from './journal-tab.js';
import { renderBooksTab, booksTables, bookDate } from './books-tab.js';
import { renderTripsTab, tripsTable, openTripForm } from './trips-tab.js';
import { renderIncomeTab, renderFlatSummaryTab, flatTables } from './flat-tab.js';
import { openEntryForm } from './entry-form.js';
import { saveCsv, printTables } from './export.js';
import { autoEntryWarnings } from './auto-entries.js';
import { isDemo } from '../shell/demo-mode.js';

let activeTab = null;

function safeTripRows(trips, year) {
  try { return tripRows(trips, year); } catch (e) { console.warn('Travel rows left out', e); return []; }
}

/** The journal of a year with the non-cash rows, as the screens and the closing see it. */
export function journalOf(data, year) {
  const opening = openingBalances(data.entries, year, initialBalances(data));
  return cashJournal(data.entries, year, { opening, extraRows: [...depreciationRows(data.assets, year), ...safeTripRows(data.trips, year)] });
}

function tabsFor(mode, ctx) {
  if (mode === 'TAX_RECORDS_FLAT') {
    return [
      { id: 'income', label: t('ledger.tab.income'), render: (p) => renderIncomeTab(p, ctx), tables: () => flatTables(ctx).slice(0, 1) },
      { id: 'books', label: t('ledger.tab.receivables'), render: (p) => renderBooksTab(p, { ...ctx, flat: true }), tables: () => booksTables(ctx.documents, ctx.date, true) },
      { id: 'summary', label: t('ledger.tab.flatSummary'), render: (p) => renderFlatSummaryTab(p, ctx), tables: () => flatTables(ctx).slice(1) }
    ];
  }
  return [
    { id: 'journal', label: t('ledger.tab.journal'), render: (p) => renderJournalTab(p, ctx), tables: (opts) => journalTables(ctx.journal, opts) },
    { id: 'books', label: t('ledger.tab.books'), render: (p) => renderBooksTab(p, ctx), tables: () => booksTables(ctx.documents, ctx.date) },
    { id: 'trips', label: t('ledger.tab.trips'), render: (p) => renderTripsTab(p, ctx), tables: () => [tripsTable(ctx.trips, ctx.year)] }
  ];
}

function draw(root) {
  clear(root);
  const notice = modeNotice();
  if (notice) {
    root.append(viewHeader({ title: t('nav.cashJournal') }), notice);
    return;
  }
  const data = ledgerData();
  const mode = ledgerMode(data.company);
  const year = ledgerYear();
  const readOnly = isReadOnly();
  const byId = new Map(data.entries.map(e => [e.id, e]));
  const ctx = {
    ...data, year, readOnly, payer: data.company?.vatMode === 'PAYER', date: bookDate(year, todayLocal()),
    warnings: readOnly ? [] : autoEntryWarnings(), entryById: (id) => byId.get(id) || null
  };
  let tabs;
  try {
    if (mode === 'SIMPLE') {
      ctx.journal = journalOf(data, year);
      ctx.summary = journalSummary(ctx.journal.totals);
    }
    tabs = tabsFor(mode, ctx);
  } catch (e) {
    showError(e);
    root.append(viewHeader({ title: t('nav.cashJournal') }), callout('danger', t('ledger.error.compute')));
    return;
  }
  if (!tabs.some(tb => tb.id === activeTab)) activeTab = tabs[0].id;
  const current = () => tabs.find(tb => tb.id === activeTab);
  const title = mode === 'TAX_RECORDS_FLAT' ? t('ledger.title.flat') : t('nav.cashJournal');
  const fileName = (ext) => `${t(`ledger.file.${activeTab}`)}-${year}.${ext}`;
  root.append(viewHeader({
    title, years: ledgerYears(data), year, onYear: () => draw(root),
    actions: [
      { id: 'add', icon: 'plus', label: activeTab === 'trips' ? t('ledger.trip.add') : t('ledger.entry.add'), primary: true, disabled: readOnly, onClick: () => (activeTab === 'trips' ? openTripForm(null, data.assets) : openEntryForm()) },
      { id: 'csv', icon: 'file-spreadsheet', label: t('ledger.export.csv'), onClick: () => saveCsv(fileName('csv'), current().tables()) },
      { id: 'print', icon: 'file-text', label: t('ledger.export.print'), onClick: () => printTables({ title: `${current().label} ${year}`, tables: current().tables({ print: true }) }) }
    ]
  }));
  if (isDemo()) root.append(callout('info', t('ledger.demo.notice')));
  else if (readOnly) root.append(callout('warning', t('ledger.readOnly')));
  const tabView = createTabs({ tabs, active: activeTab, onChange: (id) => { if (id !== activeTab) { activeTab = id; draw(root); } }, cls: 'ledger-tabs' });
  root.append(tabView.el);
}

export function renderCashJournal(root) {
  liveView(root, () => draw(root));
}
