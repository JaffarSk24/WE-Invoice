// One screen layout for the three reports (kontrolný výkaz, súhrnný výkaz,
// daňové priznanie): period, kind of filing, the checks before export,
// the preview of the rows, the XML download and the "filed" mark. A
// report module gives its route, title, how to build it and how to show
// its preview; everything else is shared. Errors block the download; in
// demo mode nothing is written and the actions say so.
import { h, icon, clear, selectEl, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { vatRecords, exportChecks, mergeProblems, canExport, recordsDigest, filingStatus, suggestedFilingType, filingDueDate, parseTaxPeriod } from '@we-invoice/core';
import { formatDate, todayLocal } from '../../components/dates.js';
import { emptyState } from '../../components/empty-state.js';
import { confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { taxSource } from './data.js';
import { saveXml, recordFiling, reportFileName } from './actions.js';
import { periodBar, filingTypeSelect, disclaimer, unverifiedNote, problemList, filingLine } from './parts.js';

/**
 * @param {HTMLElement} root
 * @param {object} ctx  boot context (transport)
 * @param {{report: 'kv'|'sv'|'vatReturn', title: string, types: string[], build: Function, preview: Function, allowed?: Function, prepare?: Function}} def
 * @param {{period: string, onPeriod: Function, state: object}} view
 */
export function renderReport(root, ctx, def, view) {
  const src = taxSource();
  root.append(h('header', { class: 'view-header' }, h('h1', {}, t(def.title))));
  if (!src.company) {
    root.append(emptyState({ title: t('tax.empty.title'), text: t('tax.empty.text'), iconName: 'file-spreadsheet' }));
    return;
  }
  const body = h('div', { class: 'tax-body' });
  append(root, [disclaimer(), h('div', { class: 'tax-toolbar' }, periodBar(view.period, view.onPeriod), def.periodKinds ? periodKindSelect(view) : null), body]);
  refreshIcons(root);
  draw(body, ctx, def, { ...view, src });
}

function draw(body, ctx, def, view) {
  drawReport(body, ctx, def, view).catch(e => {
    console.error(`Report ${def.report} could not be shown`, e);
    showError(e);
  });
}

async function drawReport(body, ctx, def, view) {
  const { src, period, state } = view;
  clear(body);
  const today = todayLocal();
  const records = vatRecords(src.documents, period, src.company);
  const extra = def.prepare ? await def.prepare(records, { ctx, src, state }) : {};
  const type = state.type && def.types.includes(state.type) ? state.type : suggest(def, src, period, today);
  let report;
  try {
    report = def.build(records, { company: src.company, type, today, ...extra });
  } catch (e) {
    console.error(`Report ${def.report} could not be built`, e);
    body.append(h('p', { class: 'callout callout-danger' }, icon('circle-x'), h('span', {}, t(`errors.${e.code || 'UNKNOWN'}`))));
    refreshIcons(body);
    return;
  }
  const problems = mergeProblems(exportChecks(records, src.documents, src.company), report.problems);
  const digest = recordsDigest(records, src.documents);
  const status = filingStatus(src.auditLog, def.report, period, digest);
  const redraw = () => draw(body, ctx, def, { ...view, src: taxSource() });

  const download = async () => {
    try {
      await saveXml(ctx.transport, reportFileName(def.report, src.company, period, type), report.xml);
      if (!src.readOnly) await recordFiling(src.store, { report: def.report, period, type, status: 'DOWNLOADED', digest });
      showToast(t('tax.export.saved'), { type: 'success' });
    } catch (e) {
      console.error('The XML could not be saved', e);
      showError(e);
    }
  };
  const markFiled = async () => {
    if (src.readOnly) {
      showToast(t(src.demo ? 'tax.demo.readOnly' : 'tax.readOnly'), { type: 'info' });
      return;
    }
    if (!(await confirmDialog(t('tax.filing.confirm', { period }), { okLabel: t('tax.filing.mark') }))) return;
    try {
      await recordFiling(src.store, { report: def.report, period, type, status: 'FILED', digest });
      showToast(t('tax.filing.saved'), { type: 'success' });
      redraw();
    } catch (e) {
      console.error('The filing could not be recorded', e);
      showError(e);
    }
  };
  const blocked = !canExport(problems);
  append(body, [
    h('div', { class: 'tax-toolbar' },
      filingTypeSelect(def.types, type, (next) => { state.type = next; redraw(); }),
      h('p', { class: 'muted tax-deadline' }, t('tax.deadline', { date: formatDate(filingDueDate(period, def.report)) })),
      h('div', { class: 'tax-buttons' },
        h('button', { type: 'button', class: 'btn btn-brand', disabled: blocked, onclick: download, title: blocked ? t('tax.export.blocked') : null }, icon('download'), t('tax.export.xml')),
        h('button', { type: 'button', class: 'btn', onclick: markFiled }, icon('file-check'), t('tax.filing.mark')))),
    filingLine(status),
    unverifiedNote(report.form),
    blocked ? h('p', { class: 'callout callout-danger' }, icon('circle-x'), h('span', {}, t('tax.export.blocked'))) : null,
    problemList(problems),
    h('section', { class: 'tax-preview', 'aria-labelledby': 'tax-preview-title' },
      h('h2', { id: 'tax-preview-title' }, t('tax.preview.title')),
      def.preview(report, { ctx, src, records, state, redraw })),
    xmlDetails(report.xml)]);
  refreshIcons(body);
}

// The súhrnný výkaz may be monthly although the VAT return is quarterly
// (§ 80 ods. 1): a month becomes its quarter, a quarter its first month.
function periodKindSelect(view) {
  const p = parseTaxPeriod(view.period);
  const select = selectEl(['MONTH', 'QUARTER'].map(k => ({ value: k, label: t(`tax.period.kind.${k}`) })), p.kind, { class: 'tax-period-kind' });
  select.addEventListener('change', () => {
    if (select.value === p.kind) return;
    view.onPeriod(select.value === 'QUARTER' ? `${p.year}-Q${Math.ceil(p.month / 3)}` : `${p.year}-${String((p.quarter - 1) * 3 + 1).padStart(2, '0')}`);
  });
  return h('label', { class: 'tax-field' }, h('span', { class: 'tax-field-label' }, t('tax.period.kind')), select);
}

function suggest(def, src, period, today) {
  const type = suggestedFilingType(src.auditLog, def.report, period, today);
  return def.types.includes(type) ? type : def.types[0];
}

// A report with an open error has no XML (the core refuses to write it).
function xmlDetails(xml) {
  if (!xml) return h('p', { class: 'muted tax-no-xml' }, t('tax.preview.noXml'));
  return h('details', { class: 'tax-xml' }, h('summary', {}, t('tax.preview.xml')), h('pre', { class: 'tax-xml-text' }, xml));
}
