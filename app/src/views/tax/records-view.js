// The "Evidencia DPH" screen (route vat-records): the period, the totals
// (output VAT, deductible VAT, the balance), the issued and the received
// documents of the period by VAT group, the checks before filing, the
// closing of the period, the registration limit for a person that is not a
// full payer, and the OSS data of a quarter as CSV.
import { h, icon, clear } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { vatRecords, exportChecks, isPeriodClosed, registrationTurnover, ossData, ossCsv, parseTaxPeriod } from '@we-invoice/core';
import { formatDate, todayLocal } from '../../components/dates.js';
import { emptyState } from '../../components/empty-state.js';
import { createTabs } from '../../components/tabs.js';
import { confirmDialog, openModal } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { taxSource } from './data.js';
import { closeTaxPeriod, openTaxPeriod } from './actions.js';
import { periodBar, disclaimer, summaryTiles, problemList, simpleTable, money, documentLink } from './parts.js';

const columns = (direction) => [
  { label: t('tax.records.number'), value: e => documentLink(e.kind, e.docId, e.number) },
  { label: t('tax.records.date'), value: e => formatDate(e.date) },
  { label: t(direction === 'OUT' ? 'tax.records.buyer' : 'tax.records.supplier'), value: e => e.partner.name || e.partner.icDph || '' },
  { label: t('tax.records.vatId'), value: e => e.partner.icDph || '' },
  { label: t('tax.records.treatment'), value: e => t(`tax.treatment.${e.treatment}`) },
  { label: t('tax.records.rate'), value: e => (e.rate === null || e.rate === undefined ? '' : `${e.rate} %`), num: true },
  { label: t('tax.records.base'), value: e => money(e.base), num: true },
  { label: t('tax.records.vat'), value: e => money(e.vat), num: true },
  ...(direction === 'IN' ? [{ label: t('tax.records.deductible'), value: e => money(e.deductible), num: true }] : [])
];

function entriesTable(entries, direction) {
  const rows = entries.filter(e => e.direction === direction);
  if (!rows.length) return h('p', { class: 'muted' }, t('tax.records.none'));
  return simpleTable(columns(direction), rows);
}

function thresholdBlock(documents, today) {
  const r = registrationTurnover(documents, today);
  return h('section', { class: 'tax-threshold card', 'aria-labelledby': 'tax-threshold-title' },
    h('h2', { id: 'tax-threshold-title' }, t('tax.threshold.title')),
    summaryTiles([
      { label: t('tax.threshold.yearToDate'), amount: r.yearToDate },
      { label: t('tax.threshold.previousYear'), amount: r.previousYear },
      { label: t('tax.threshold.rolling12'), amount: r.rolling12 },
      { label: t('tax.threshold.limit'), amount: r.amount }
    ]),
    r.level !== 'OK' ? h('p', { class: `callout ${r.level === 'NEAR' ? 'callout-warning' : 'callout-danger'}` }, icon('triangle-alert'),
      h('span', {}, t(`tax.threshold.${r.level}`, { share: r.share, immediate: money(r.immediate) }))) : null);
}

function closingControls(src, period, redraw) {
  const closed = isPeriodClosed(src.company, period);
  if (src.readOnly) return h('p', { class: 'muted' }, t(closed ? 'tax.closing.closed' : 'tax.closing.open'));
  const close = async () => {
    if (!(await confirmDialog(t('tax.closing.confirm'), { okLabel: t('tax.closing.close') }))) return;
    try {
      await closeTaxPeriod(src.store, src.company, period);
      showToast(t('tax.closing.closedToast'), { type: 'success' });
      redraw();
    } catch (e) {
      console.error('The period could not be closed', e);
      showError(e);
    }
  };
  const reopen = () => {
    const reason = h('textarea', { rows: '3', class: 'tax-reason', 'aria-label': t('tax.closing.reason') });
    openModal({
      title: t('tax.closing.openTitle'),
      body: h('div', {}, h('p', {}, t('tax.closing.openText')), h('label', { class: 'tax-field' }, h('span', { class: 'tax-field-label' }, t('tax.closing.reason')), reason)),
      actions: [
        { label: t('common.cancel'), onClick: (m) => m.close() },
        {
          label: t('tax.closing.reopen'), kind: 'primary', onClick: async (m) => {
            try {
              await openTaxPeriod(src.store, src.company, period, reason.value);
              m.close();
              showToast(t('tax.closing.openedToast'), { type: 'success' });
              redraw();
            } catch (e) {
              console.error('The period could not be opened', e);
              showError(e);
            }
          }
        }
      ]
    });
  };
  return h('div', { class: 'tax-closing' },
    h('span', { class: `badge ${closed ? 'badge-locked' : ''}`.trim() }, icon(closed ? 'lock' : 'circle-dot'), t(closed ? 'tax.closing.closed' : 'tax.closing.open')),
    closed
      ? h('button', { type: 'button', class: 'btn', onclick: reopen }, t('tax.closing.reopen'))
      : h('button', { type: 'button', class: 'btn', onclick: close }, icon('lock'), t('tax.closing.close')));
}

function ossButton(src, records, ctx) {
  if (!src.company.oss || parseTaxPeriod(records.period).kind !== 'QUARTER') return null;
  return h('button', {
    type: 'button', class: 'btn', onclick: async () => {
      try {
        const csv = ossCsv(ossData(records));
        await ctx.transport.files.saveAs(`OSS_${records.period}.csv`, new Blob([csv], { type: 'text/csv' }));
      } catch (e) {
        console.error('OSS data could not be saved', e);
        showError(e);
      }
    }
  }, icon('download'), t('tax.oss.download'));
}

export function renderRecordsBody(body, { src, period, ctx, redraw }) {
  clear(body);
  const records = vatRecords(src.documents, period, src.company);
  const problems = exportChecks(records, src.documents, src.company);
  const totals = records.totals;
  body.append(
    summaryTiles([
      { label: t('tax.records.outputVat'), amount: totals.outputVat },
      { label: t('tax.records.deductibleVat'), amount: totals.deductibleVat },
      { label: t(Number(totals.balance) >= 0 ? 'tax.records.toPay' : 'tax.records.excess'), amount: totals.balance.replace('-', ''), tone: Number(totals.balance) > 0 ? 'due' : 'refund' },
      { label: t('tax.records.documents'), text: String(totals.count) }
    ]),
    h('div', { class: 'tax-actions' }, closingControls(src, period, redraw), ossButton(src, records, ctx)),
    problemList(problems),
    createTabs({
      tabs: [
        { id: 'out', label: t('tax.records.issued'), render: (panel) => panel.append(entriesTable(records.entries, 'OUT')) },
        { id: 'in', label: t('tax.records.received'), render: (panel) => panel.append(entriesTable(records.entries, 'IN')) }
      ]
    }).el);
  if (src.company.vatMode !== 'PAYER') body.append(thresholdBlock(src.documents, todayLocal()));
  refreshIcons(body);
}

export function renderVatRecords(root, ctx, { period, onPeriod }) {
  const src = taxSource();
  root.append(h('header', { class: 'view-header' }, h('h1', {}, t('nav.vatRecords'))));
  if (!src.company) {
    root.append(emptyState({ title: t('tax.empty.title'), text: t('tax.empty.text'), iconName: 'calculator' }));
    return;
  }
  const body = h('div', { class: 'tax-body' });
  root.append(disclaimer(), periodBar(period, onPeriod), body);
  renderRecordsBody(body, { src, period, ctx, redraw: () => onPeriod(period) });
}
