// "Import a migrácia": the program the files come from, the direction of
// the documents, the files, then the preview of the plan and one button
// that adds what is new. Duplicates (same IČO, same document number) are
// never added twice; the report says what was skipped and why.
import { h, clear, selectEl, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/modal.js';
import { buildImportPlan } from './core-bridge.js';
import { eximSource } from './source.js';
import { pickFiles } from './files.js';
import { PROGRAMS, API_PROGRAMS, ACCEPT, readSourceFile, parseSources } from './import-read.js';
import { renderSfPanel } from './sf-panel.js';
import { mappingEditors, planSummary } from './import-preview.js';
import { applyImport } from './import-apply.js';
import { errorText } from './labels.js';

export function renderImportPanel(panel, deps = {}) {
  const state = { program: 'idoklad', direction: 'OUT', target: 'INVOICE_DRAFT', addItems: true, files: [], apiParsed: null, mappings: new Map(), plan: null };
  const preview = h('div', { class: 'exim-preview', id: 'exim-import-preview', 'aria-live': 'polite' });
  const program = selectEl(PROGRAMS.map(p => ({ value: p, label: t(`exim.program.${p}`) })), state.program, { id: 'exim-import-program' });
  const direction = selectEl([{ value: 'OUT', label: t('exim.import.out') }, { value: 'IN', label: t('exim.import.in') }], state.direction, { id: 'exim-import-direction' });
  const hint = h('p', { class: 'muted small', id: 'exim-import-hint' }, t(`exim.program.${state.program}.hint`));
  const importButton = h('button', { type: 'button', class: 'btn btn-primary', id: 'exim-import-apply', disabled: true }, t('exim.import.apply'));

  const isApi = () => API_PROGRAMS.includes(state.program);

  function rebuild() {
    clear(preview);
    state.plan = null;
    importButton.disabled = true;
    if (isApi() ? !state.apiParsed : !state.files.length) return;
    const source = eximSource();
    try {
      const parsed = isApi() ? state.apiParsed : parseSources(state.program, state.files, {
        company: source.company || {}, direction: state.direction, mappings: state.mappings, target: state.target, addItems: state.addItems
      });
      state.plan = buildImportPlan(parsed, source);
      append(preview, [...mappingEditors(parsed.tables || [], (name, value) => { state.mappings.set(name, value); rebuild(); }), planSummary(state.plan)]);
      const r = state.plan.report.added;
      importButton.disabled = !source.writable || !(r.contacts + r.items + r.documents);
      if (source.demo) append(preview, [h('p', { class: 'callout' }, t('exim.demoReadOnly'))]);
      else if (!source.company) append(preview, [h('p', { class: 'callout' }, t('exim.noCompany'))]);
    } catch (e) {
      console.error('Import preview failed', e);
      append(preview, [h('p', { class: 'callout callout-danger', role: 'alert' }, errorText(e, 'errors.IMPORT_FAILED'))]);
    }
  }

  // Shoptet: what the orders become and whether products join the price list.
  const target = selectEl([{ value: 'INVOICE_DRAFT', label: t('exim.shoptet.target.draft') }, { value: 'ORDER_IN', label: t('exim.shoptet.target.order') }], state.target, { id: 'exim-import-target' });
  target.addEventListener('change', () => { state.target = target.value; rebuild(); });
  const addItems = h('input', { type: 'checkbox', id: 'exim-import-add-items', checked: true });
  addItems.addEventListener('change', () => { state.addItems = addItems.checked; rebuild(); });
  const shoptetOptions = h('div', { class: 'exim-grid', id: 'exim-import-shoptet', hidden: true },
    h('div', { class: 'field' }, h('label', { for: 'exim-import-target' }, t('exim.shoptet.target')), target),
    h('label', { for: 'exim-import-add-items', class: 'checkbox-label' }, addItems, h('span', {}, t('exim.shoptet.addItems'))));
  const directionField = h('div', { class: 'field' }, h('label', { for: 'exim-import-direction' }, t('exim.import.direction')), direction);
  const apiArea = h('div', { class: 'exim-sf', id: 'exim-import-api', hidden: true });

  function showOptions() {
    shoptetOptions.hidden = state.program !== 'shoptet';
    directionField.hidden = state.program === 'shoptet' || isApi();
    fileArea.hidden = isApi();
    apiArea.hidden = !isApi();
    if (isApi() && !apiArea.firstChild) {
      renderSfPanel(apiArea, { transport: deps.transport, company: eximSource().company, createClient: deps.createSfClient, onParsed: (parsed) => { state.apiParsed = parsed; rebuild(); } });
    }
  }

  program.addEventListener('change', () => {
    state.program = program.value;
    hint.textContent = t(`exim.program.${state.program}.hint`);
    showOptions();
    rebuild();
  });
  direction.addEventListener('change', () => { state.direction = direction.value; rebuild(); });

  const choose = h('button', { type: 'button', class: 'btn', id: 'exim-import-choose' }, t('exim.import.choose'));
  const chosen = h('p', { class: 'muted small', id: 'exim-import-files' });
  const fileArea = h('div', { class: 'exim-files' }, h('div', { class: 'exim-actions' }, choose), chosen);
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
      state.apiParsed = null;
      chosen.textContent = '';
      const report = state.plan;
      clear(preview);
      append(preview, [h('h3', {}, t('exim.import.report')), planSummary(report)]);
      state.plan = null;
    } catch (e) {
      showError(e, 'errors.IMPORT_FAILED');
      importButton.disabled = false;
    }
  });

  append(panel, [h('section', { class: 'card exim-card' },
    h('h2', {}, t('exim.import.title')),
    h('p', { class: 'muted' }, t('exim.import.text')),
    h('div', { class: 'exim-grid' },
      h('div', { class: 'field' }, h('label', { for: 'exim-import-program' }, t('exim.import.program')), program),
      directionField),
    hint, shoptetOptions, fileArea, apiArea, preview,
    h('div', { class: 'exim-actions' }, importButton))]);
  showOptions();
}
