// The "Majetok" route (assets): the kniha majetku of the year with the tax
// depreciation of the year and the residual value at its end; a row opens
// the asset card. Low-value items are listed but carry no plan. The
// print gives one card per asset with its whole plan.
import { depreciationPlan, depreciationInYear, residualAt, sum, round } from '@we-invoice/core';
import { clear, h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { formatDate } from '../../components/dates.js';
import { viewHeader, modeNotice, liveView, ledgerYear, money, stats, callout } from './kit.js';
import { ledgerData, ledgerYears, isReadOnly, ledgerMode } from './state.js';
import { openAssetForm } from './asset-form.js';
import { tableSpec, saveCsv, printTables } from './export.js';

function safe(fn, fallback) {
  try { return fn(); } catch (e) { console.warn('Asset value not computed', e); return fallback; }
}

/** Rows of the asset book for a year. */
export function assetRows(assets, year) {
  return assets.map(a => ({
    ...a,
    yearAmount: safe(() => depreciationInYear(a, year), null),
    residual: safe(() => residualAt(a, year), null),
    lowValue: safe(() => depreciationPlan(a).lowValue, false)
  }));
}

function columns() {
  return [
    { id: 'name', label: t('ledger.asset.name'), render: r => r.name, sortValue: r => r.name, primary: true, always: true },
    { id: 'number', label: t('ledger.asset.inventoryNumber'), render: r => r.inventoryNumber || '' },
    { id: 'acquiredOn', label: t('ledger.asset.inUseFrom'), render: r => formatDate(r.inUseFrom || r.acquiredOn), sortValue: r => r.inUseFrom || r.acquiredOn },
    { id: 'group', label: t('ledger.asset.group'), render: r => (r.lowValue ? t('ledger.asset.lowValueShort') : `${r.depreciationGroup} / ${t(`ledger.asset.method.${r.method}`)}`) },
    { id: 'cost', label: t('ledger.asset.cost'), align: 'num', render: r => money(r.cost), total: rows => money(round(sum(rows.map(r => r.cost)), 2)) },
    { id: 'year', label: t('ledger.asset.yearAmount'), align: 'num', render: r => money(r.yearAmount), total: rows => money(round(sum(rows.map(r => r.yearAmount || '0')), 2)) },
    { id: 'residual', label: t('ledger.asset.residual'), align: 'num', render: r => money(r.residual), total: rows => money(round(sum(rows.map(r => r.residual || '0')), 2)) },
    { id: 'disposed', label: t('ledger.asset.disposedOn'), render: r => formatDate(r.disposedOn), hidden: true }
  ];
}

function tables(rows, year) {
  const list = tableSpec(t('ledger.asset.bookTitle', { year }), [
    { label: t('ledger.asset.inventoryNumber'), value: r => r.inventoryNumber },
    { label: t('ledger.asset.name'), value: r => r.name, foot: () => t('ledger.journal.total') },
    { label: t('ledger.asset.kind'), value: r => t(`ledger.asset.kind.${r.kind}`) },
    { label: t('ledger.asset.inUseFrom'), value: r => r.inUseFrom || r.acquiredOn },
    { label: t('ledger.asset.group'), value: r => r.depreciationGroup },
    { label: t('ledger.asset.method'), value: r => t(`ledger.asset.method.${r.method}`) },
    { label: t('ledger.asset.cost'), value: r => r.cost, num: true, foot: rs => round(sum(rs.map(r => r.cost)), 2) },
    { label: t('ledger.asset.yearAmount'), value: r => r.yearAmount, num: true, foot: rs => round(sum(rs.map(r => r.yearAmount || '0')), 2) },
    { label: t('ledger.asset.residual'), value: r => r.residual, num: true, foot: rs => round(sum(rs.map(r => r.residual || '0')), 2) },
    { label: t('ledger.asset.disposedOn'), value: r => r.disposedOn }
  ], rows, rows);
  const cards = rows.filter(r => !r.lowValue).map(r => {
    const plan = safe(() => depreciationPlan(r).plan, []);
    return tableSpec(`${r.inventoryNumber ? `${r.inventoryNumber} ` : ''}${r.name}`, [
      { label: t('ledger.year'), value: p => p.year },
      { label: t('ledger.asset.taxAmount'), value: p => p.amount, num: true },
      { label: t('ledger.asset.taxResidual'), value: p => p.residual, num: true }
    ], plan);
  });
  return { list, cards };
}

function draw(root) {
  clear(root);
  const notice = modeNotice();
  if (notice) { root.append(viewHeader({ title: t('nav.assets') }), notice); return; }
  const data = ledgerData();
  const year = ledgerYear();
  const readOnly = isReadOnly();
  const rows = assetRows(data.assets, year);
  const { list, cards } = tables(rows, year);
  root.append(viewHeader({
    title: t('nav.assets'), years: ledgerYears(data), year, onYear: () => draw(root),
    actions: [
      { id: 'add', icon: 'plus', label: t('ledger.asset.add'), primary: true, disabled: readOnly, onClick: () => openAssetForm() },
      { id: 'csv', icon: 'file-spreadsheet', label: t('ledger.export.csv'), onClick: () => saveCsv(`${t('ledger.file.assets')}-${year}.csv`, [list]) },
      { id: 'print', icon: 'file-text', label: t('ledger.export.print'), onClick: () => printTables({ title: t('ledger.asset.bookTitle', { year }), tables: [list, ...cards] }) }
    ]
  }));
  if (ledgerMode() === 'TAX_RECORDS_FLAT') root.append(callout('info', t('ledger.asset.flatNote')));
  if (rows.length) {
    root.append(stats([
      { label: t('ledger.asset.count'), value: String(rows.length) },
      { label: t('ledger.asset.yearAmount'), value: money(round(sum(rows.map(r => r.yearAmount || '0')), 2)) },
      { label: t('ledger.asset.residual'), value: money(round(sum(rows.map(r => r.residual || '0')), 2)) }
    ]));
  }
  const table = createTable({
    key: 'ledger-assets', columns: columns(), rows, onRowClick: (row) => openAssetForm(data.assets.find(a => a.id === row.id)),
    empty: emptyState({ title: t('ledger.asset.empty.title'), text: t('ledger.asset.empty.text'), iconName: 'building-2', actionLabel: readOnly ? null : t('ledger.asset.add'), onAction: () => openAssetForm() })
  });
  root.append(table.el, h('p', { class: 'muted small' }, t('ledger.asset.thresholdNote')));
}

export function renderAssets(root) {
  liveView(root, () => draw(root));
}
