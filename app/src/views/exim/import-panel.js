// "Import a migrácia": the program the files come from, the direction of
// the documents, the files, then the preview of the plan and one button
// that adds what is new. Duplicates (same IČO, same document number) are
// never added twice; the report says what was skipped and why.
import { h, clear, selectEl } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/modal.js';
import { buildImportPlan } from './core-bridge.js';
import { eximSource } from './source.js';
import { pickFiles } from './files.js';
import { PROGRAMS, ACCEPT, readSourceFile, parseSources } from './import-read.js';
import { mappingEditors, planSummary } from './import-preview.js';
import { applyImport } from './import-apply.js';
import { errorText } from './labels.js';

export function renderImportPanel(panel, deps = {}) {
  const state = { program: 'idoklad', direction: 'OUT', files: [], mappings: new Map(), plan: null };
  const preview = h('div', { class: 'exim-preview', id: 'exim-import-preview', 'aria-live': 'polite' });
  const program = selectEl(PROGRAMS.map(p => ({ value: p, label: t(`exim.program.${p}`) })), state.program, { id: 'exim-import-program' });
  const direction = selectEl([{ value: 'OUT', label: t('exim.import.out') }, { value: 'IN', label: t('exim.import.in') }], state.direction, { id: 'exim-import-direction' });
  const hint = h('p', { class: 'muted small', id: 'exim-import-hint' }, t(`exim.program.${state.program}.hint`));
  const importButton = h('button', { type: 'button', class: 'btn btn-primary', id: 'exim-import-apply', disabled: true }, t('exim.import.apply'));

  function rebuild() {
    clear(preview);
    state.plan = null;
    importButton.disabled = true;
    if (!state.files.length) return;
    const source = eximSource();
    try {
      const parsed = parseSources(state.program, state.files, { company: source.company || {}, direction: state.direction, mappings: state.mappings });
      state.plan = buildImportPlan(parsed, source);
      preview.append(...mappingEditors(parsed.tables, (name, value) => { state.mappings.set(name, value); rebuild(); }), planSummary(state.plan));
      const r = state.plan.report.added;
      importButton.disabled = !source.writable || !(r.contacts + r.items + r.documents);
      if (source.demo) preview.append(h('p', { class: 'callout' }, t('exim.demoReadOnly')));
    } catch (e) {
      console.error('Import preview failed', e);
      preview.append(h('p', { class: 'callout callout-danger', role: 'alert' }, errorText(e, 'errors.IMPORT_FAILED')));
    }
  }

  program.addEventListener('change', () => {
    state.program = program.value;
    hint.textContent = t(`exim.program.${state.program}.hint`);
    rebuild();
  });
  direction.addEventListener('change', () => { state.direction = direction.value; rebuild(); });

  const choose = h('button', { type: 'button', class: 'btn', id: 'exim-import-choose' }, t('exim.import.choose'));
  const chosen = h('p', { class: 'muted small', id: 'exim-import-files' });
  choose.addEventListener('click', async () => {
    try {
      const files = await pickFiles({ accept: ACCEPT, multiple: true }, deps.transport);
      if (!files.length) return;
      state.files = [];
      for (const file of files) state.files.push(await readSourceFile(file));
      state.mappings.clear();
      chosen.textContent = state.files.map(f => f.name).join(', ');
      rebuild();
    } catch (e) {
      showError(e, 'errors.IMPORT_FAILED');
    }
  });

  importButton.addEventListener('click', async () => {
    const source = eximSource();
    if (!state.plan || !source.writable) return;
    const r = state.plan.report.added;
    const ok = await confirmDialog(t('exim.import.confirm', { documents: r.documents, contacts: r.contacts, items: r.items }), { okLabel: t('exim.import.apply') });
    if (!ok) return;
    importButton.disabled = true;
    try {
      const result = await applyImport(source.store, state.plan);
      showToast(t('exim.import.done', { documents: result.added.documents.length, contacts: result.added.contacts.length, items: result.added.items.length }), { type: 'success' });
      state.files = [];
      chosen.textContent = '';
      const report = state.plan;
      clear(preview);
      preview.append(h('h3', {}, t('exim.import.report')), planSummary(report));
      state.plan = null;
    } catch (e) {
      showError(e, 'errors.IMPORT_FAILED');
      importButton.disabled = false;
    }
  });

  panel.append(h('section', { class: 'card exim-card' },
    h('h2', {}, t('exim.import.title')),
    h('p', { class: 'muted' }, t('exim.import.text')),
    h('div', { class: 'exim-grid' },
      h('div', { class: 'field' }, h('label', { for: 'exim-import-program' }, t('exim.import.program')), program),
      h('div', { class: 'field' }, h('label', { for: 'exim-import-direction' }, t('exim.import.direction')), direction)),
    hint,
    h('div', { class: 'exim-actions' }, choose), chosen, preview,
    h('div', { class: 'exim-actions' }, importButton)));
}
