// Numbering series in Settings (03-features.md § 3.5): the series of each
// kind with the next number they give, the mask ({YYYY}, {YY}, {MM}, {N},
// {N:4}), the reset (yearly, monthly, never), the variable symbol mask,
// the default per kind and the next counter, which refuses a number that
// is already used. A series in use by a document cannot be removed.
import { h, icon, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { textField, selectField, checkboxField } from '../../components/fields.js';
import { todayLocal } from '../../components/dates.js';
import { NUMBERED_KINDS, SERIES_RESETS, defaultSeries, seriesOfKind, withSeries, previewNumber, previewVs, maskError, setNextCounter, nextCounterOf, takenNumbers } from '../documents/series.js';
import { companyStore, saveCompanyPatch } from './company-section-store.js';

function documentsOf(store) {
  return store ? store.list('documents') : [];
}

/** The series list without one series; null when documents still use it. */
export function withoutSeries(company, seriesId, documents) {
  if ((documents || []).some(d => !d.deleted && d.seriesId === seriesId)) return null;
  return ((company && company.series) || []).filter(s => s.id !== seriesId);
}

function openSeriesDialog({ series, company, documents, onSaved }) {
  const today = todayLocal();
  const taken = takenNumbers(documents, series.id);
  const name = textField({ label: t('documents.series.name'), value: series.name || '' });
  const mask = textField({ label: t('documents.series.mask'), value: series.mask, hint: t('documents.series.maskHint'), attrs: { id: 'series-mask' } });
  const vsMask = textField({ label: t('documents.series.vsMask'), value: series.vsMask || '', hint: t('documents.series.vsMaskHint') });
  const reset = selectField({ label: t('documents.series.reset'), value: series.reset, options: SERIES_RESETS.map(r => ({ value: r, label: t(`documents.series.reset.${r}`) })) });
  const counter = textField({ label: t('documents.series.nextCounter'), value: String(nextCounterOf(series, today)), attrs: { inputmode: 'numeric', id: 'series-counter' } });
  const isDefault = checkboxField({ label: t('documents.series.default'), checked: series.isDefault !== false });
  const preview = h('p', { class: 'muted small', 'aria-live': 'polite', id: 'series-preview' });
  const build = () => ({ ...series, name: name.value(), mask: mask.value(), vsMask: vsMask.value() || null, reset: reset.value(), isDefault: isDefault.value() });
  const update = () => {
    const next = build();
    const error = maskError(next.mask, today) || (next.vsMask ? maskError(next.vsMask, today) : null);
    mask.setError(error ? t(`errors.${error}`) : null);
    const applied = error ? { error: null, series: next } : setNextCounter(next, today, counter.value(), taken);
    preview.textContent = error ? '' : t('documents.series.preview', { number: previewNumber(applied.series, today, taken) || '', vs: previewVs(applied.series, today, taken) || '' });
  };
  [name, mask, vsMask, counter].forEach(f => f.input.addEventListener('input', update));
  reset.input.addEventListener('change', update);
  update();
  openModal({
    title: t(`document.kind.${series.kind}`), wide: true,
    body: h('div', { class: 'form-grid series-form' }, name.el, mask.el, vsMask.el, reset.el, counter.el, isDefault.el, preview),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary', onClick: async (m) => {
          const next = build();
          const error = maskError(next.mask, today) || (next.vsMask ? maskError(next.vsMask, today) : null);
          if (error) { mask.setError(t(`errors.${error}`)); return; }
          const applied = setNextCounter(next, today, counter.value(), taken);
          if (applied.error) { counter.setError(t(`errors.${applied.error}`)); return; }
          try {
            const saved = await saveCompanyPatch({ series: withSeries(company, applied.series) });
            if (saved) { showToast(t('documents.series.saved'), { type: 'success' }); m.close(); onSaved(); }
          } catch (e) { showError(e); }
        }
      }
    ]
  });
}

export function numberingSection(root, { redraw, company, demo }) {
  const store = companyStore();
  const documents = documentsOf(store);
  const today = todayLocal();
  const box = h('div', { class: 'series-list' });
  NUMBERED_KINDS.forEach(kind => {
    const list = seriesOfKind(company, kind);
    const shown = list.length ? list : [defaultSeries(kind)];
    shown.forEach(series => {
      const isNew = !list.length;
      const next = previewNumber(series, today, takenNumbers(documents, series.id));
      append(box, [h('div', { class: 'setting-row series-row', dataset: { kind, seriesId: series.id } },
        h('div', { class: 'setting-text' },
          h('span', { class: 'setting-label' }, `${t(`document.kind.${kind}`)}${series.name ? ` · ${series.name}` : ''}`),
          h('span', { class: 'setting-hint' }, t('documents.series.summary', { mask: series.mask, next: next || '', reset: t(`documents.series.reset.${series.reset}`) }))),
        h('div', { class: 'setting-control' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: demo, onclick: () => openSeriesDialog({ series, company, documents, onSaved: redraw }) }, icon('pencil-line'), t('documents.series.edit')),
          isNew ? null : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: demo, onclick: async () => {
            const rest = withoutSeries(company, series.id, documents);
            if (!rest) { showToast(t('documents.series.inUse'), { type: 'error' }); return; }
            if (!(await confirmDialog(t('documents.series.removeConfirm'), { danger: true }))) return;
            try { if (await saveCompanyPatch({ series: rest })) redraw(); } catch (e) { showError(e); }
          } }, icon('trash-2'), t('common.delete'))))]);
    });
  });
  const add = selectField({ label: null, value: '', attrs: { 'aria-label': t('documents.series.add'), disabled: demo }, options: [{ value: '', label: t('documents.series.add') }, ...NUMBERED_KINDS.map(k => ({ value: k, label: t(`document.kind.${k}`) }))] });
  add.input.addEventListener('change', () => {
    if (!add.value()) return;
    openSeriesDialog({ series: { ...defaultSeries(add.value()), isDefault: false }, company, documents, onSaved: redraw });
    add.input.value = '';
  });
  root.append(h('h3', { class: 'settings-subtitle' }, t('documents.series.title')), h('p', { class: 'muted small' }, t('documents.series.text')), box, add.el);
  refreshIcons(root);
}
