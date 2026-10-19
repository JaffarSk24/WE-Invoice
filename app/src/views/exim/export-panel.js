// "Export pre účtovníka": a period, the formats the accountant's program
// reads, one ZIP. After the file is saved the documents are marked
// exported (and locked), so a later change shows as "zmenené po exporte".
// The WE Budget CSV of the same period sits below.
import { h, clear } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { selectExportDocuments, exportState, exportWeBudgetCsv, ACCOUNTANT_FORMATS } from './core-bridge.js';
import { eximSource } from './source.js';
import { periodPicker } from './period-picker.js';
import { buildAccountantZip, markExported } from './export-run.js';
import { saveFile } from './files.js';
import { reasonText } from './labels.js';
import { getPrefs, setPref } from '../../prefs.js';

const DEFAULT_FORMATS = ['pdf', 'csv', 'xlsx', 'pohoda', 'isdoc'];

function savedFormats() {
  const saved = getPrefs().eximFormats;
  return new Set(Array.isArray(saved) && saved.length ? saved.filter(f => ACCOUNTANT_FORMATS.includes(f)) : DEFAULT_FORMATS);
}

export function periodStats(documents, range) {
  const docs = selectExportDocuments(documents, range);
  const states = docs.map(exportState);
  return {
    count: docs.length,
    exported: states.filter(s => s === 'EXPORTED').length,
    changed: states.filter(s => s === 'CHANGED_AFTER_EXPORT').length
  };
}

export function renderExportPanel(panel, deps = {}) {
  const state = { preset: 'lastMonth', from: null, to: null, formats: savedFormats(), mark: true, busy: false };
  const info = h('p', { class: 'exim-info', id: 'exim-export-info', 'aria-live': 'polite' });
  const result = h('div', { class: 'exim-result', 'aria-live': 'polite' });
  const picker = periodPicker(state, () => update(), 'exim-export');

  function update() {
    const source = eximSource();
    const range = picker.value();
    const stats = periodStats(source.documents, range);
    info.textContent = range.from && range.to ? t('exim.export.inPeriod', { n: stats.count }) : t('exim.export.pickPeriod');
    if (stats.changed) info.textContent += ` ${t('exim.export.changed', { n: stats.changed })}`;
    else if (stats.exported) info.textContent += ` ${t('exim.export.already', { n: stats.exported })}`;
    zipButton.disabled = state.busy || !stats.count || !state.formats.size;
    budgetButton.disabled = state.busy || !range.from || !range.to;
  }

  const formatList = h('fieldset', { class: 'exim-formats' }, h('legend', { class: 'exim-label' }, t('exim.export.formats')),
    ACCOUNTANT_FORMATS.map(f => {
      const id = `exim-format-${f}`;
      const box = h('input', { type: 'checkbox', id, checked: state.formats.has(f) });
      box.addEventListener('change', () => {
        if (box.checked) state.formats.add(f); else state.formats.delete(f);
        setPref('eximFormats', [...state.formats]);
        update();
      });
      return h('label', { for: id, class: 'exim-format' }, box, h('span', { class: 'exim-format-text' },
        h('span', { class: 'exim-format-name' }, t(`exim.format.${f}`)), h('span', { class: 'exim-format-hint' }, t(`exim.format.${f}.hint`))));
    }));

  const source0 = eximSource();
  const markBox = h('input', { type: 'checkbox', id: 'exim-export-mark', checked: source0.writable, disabled: !source0.writable });
  markBox.addEventListener('change', () => { state.mark = markBox.checked; });
  state.mark = source0.writable;

  const zipButton = h('button', { type: 'button', class: 'btn btn-primary', id: 'exim-export-zip' }, t('exim.export.zip'));
  zipButton.addEventListener('click', async () => {
    const source = eximSource();
    const range = picker.value();
    if (!source.company) return showToast(t('exim.noCompany'), { type: 'error' });
    state.busy = true;
    zipButton.textContent = t('exim.export.working');
    update();
    try {
      const out = await buildAccountantZip(source, { ...range, formats: [...state.formats] }, deps);
      const saved = await saveFile(out.fileName, out.bytes, 'application/zip', deps.transport);
      clear(result);
      if (saved === false) return;
      if (state.mark && source.writable && out.documents.length) await markExported(source.store, out.documents);
      showToast(source.demo ? t('exim.export.doneDemo') : t('exim.export.done', { n: out.documents.length }), { type: 'success' });
      if (out.skipped.length || out.warnings.length) {
        result.append(h('div', { class: 'callout callout-warning' }, h('p', {}, t('exim.export.notes')),
          h('ul', {}, [...out.skipped.map(s => `${s.number || s.id} (${t(`exim.format.${s.format}`)}): ${reasonText(s.reason)}`), ...new Set(out.warnings.map(reasonText))].map(x => h('li', {}, x)))));
      }
    } catch (e) {
      showError(e, 'errors.EXPORT_FAILED');
    } finally {
      state.busy = false;
      zipButton.textContent = t('exim.export.zip');
      update();
    }
  });

  const budgetButton = h('button', { type: 'button', class: 'btn', id: 'exim-export-webudget' }, t('exim.budget.button'));
  budgetButton.addEventListener('click', async () => {
    const source = eximSource();
    const range = picker.value();
    try {
      const out = exportWeBudgetCsv(source, { ...range, describe: d => `${t(`document.kind.${d.kind}`)} ${d.number || ''}`.trim() });
      if (!out.count) return showToast(t('exim.budget.empty'), { type: 'info' });
      await saveFile(`we-budget_${range.from}_${range.to}.csv`, out.content, 'text/csv', deps.transport);
      showToast(t('exim.budget.done', { n: out.count }), { type: 'success' });
    } catch (e) {
      showError(e, 'errors.EXPORT_FAILED');
    }
  });

  panel.append(
    h('section', { class: 'card exim-card' },
      h('h2', {}, t('exim.export.title')),
      h('p', { class: 'muted' }, t('exim.export.text')),
      picker.el, info, formatList,
      h('label', { for: 'exim-export-mark', class: 'checkbox-label exim-mark' }, markBox, h('span', {}, t('exim.export.mark'))),
      h('div', { class: 'exim-actions' }, zipButton), result),
    h('section', { class: 'card exim-card' },
      h('h2', {}, t('exim.budget.title')),
      h('p', { class: 'muted' }, t('exim.budget.text')),
      h('div', { class: 'exim-actions' }, budgetButton)));
  update();
  refreshIcons(panel);
}
