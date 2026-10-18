// The recurring invoice form: client, kind, lines, schedule (frequency,
// first run, end date or number of runs), due days, date of supply at the
// end of the period, draft or issued, automatic e-mail, the introduction
// text with {period}, a preview of the next runs, and for a saved
// template the documents it has made so far with a send button.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { emit } from '../../events.js';
import { schema } from '@we-invoice/core';
import { textField, textArea, selectField, checkboxField, numberField, dateField, radioGroup } from '../../components/fields.js';
import { formatDate, todayLocal } from '../../components/dates.js';
import { statusBadge } from '../../components/status-badge.js';
import { confirmDialog } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { printLanguageChoices } from '../contacts/form.js';
import { getOf, listOf, write, companyOf, onData, go } from '../contacts/source.js';
import { blankTemplate, normalizeTemplate, nextRunOnSave, KINDS } from './model.js';
import { upcomingRuns } from './schedule.js';
import { linesEditor, cleanLines } from './form-lines.js';

function fromDocument(id, today) {
  const doc = id ? getOf('documents', id) : null;
  if (!doc) return null;
  return blankTemplate(today, { docTemplate: { kind: KINDS.includes(doc.kind) ? doc.kind : 'INVOICE', contactId: doc.contactId, language: doc.language || null, textIntro: doc.textIntro || '', lines: (doc.lines || []).filter(l => !l.kind || l.kind === 'ITEM') } });
}

function history(template) {
  const docs = (template.history || []).map(hst => ({ hst, doc: getOf('documents', hst.docId) })).reverse();
  if (!docs.length) return h('p', { class: 'muted' }, t('recurring.history.none'));
  return h('ul', { class: 'contact-list tpl-history' }, docs.map(({ hst, doc }) => h('li', {},
    h('span', {}, formatDate(hst.periodStart)), ' ',
    doc ? [doc.number || t('status.DRAFT'), ' ', statusBadge(doc.status), doc.status !== 'DRAFT'
      ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => emit('document:send', { documentId: doc.id }) }, icon('send'), t('recurring.history.send'))
      : null] : h('span', { class: 'muted' }, t('recurring.history.deleted')))));
}

export function renderTemplateForm(root, id) {
  const today = todayLocal();
  const existing = id ? getOf('recurringTemplates', id) : null;
  if (id && !existing) { go('recurring'); return; }
  const query = new URLSearchParams(String(window.location.hash).split('?')[1] || '');
  const tpl = existing || fromDocument(query.get('from'), today) || blankTemplate(today);
  const company = companyOf();
  const contacts = listOf('contacts').sort((a, b) => a.name.localeCompare(b.name, 'sk'));
  const f = {
    name: textField({ label: t('recurring.field.name'), value: tpl.name, hint: t('recurring.field.nameHint'), attrs: { id: 'tpl-name' } }),
    contact: selectField({ label: t('recurring.field.contact'), options: [{ value: '', label: t('recurring.field.contactPick') }, ...contacts.map(c => ({ value: c.id, label: c.name }))], value: tpl.docTemplate.contactId || '', required: true, attrs: { id: 'tpl-contact' } }),
    kind: selectField({ label: t('recurring.field.kind'), options: KINDS.map(k => ({ value: k, label: t(`crm.kind.${k}`) })), value: tpl.docTemplate.kind }),
    frequency: selectField({ label: t('recurring.field.frequency'), options: schema.RECURRING_FREQUENCIES.map(v => ({ value: v, label: t(`recurring.frequency.${v}`) })), value: tpl.frequency, attrs: { id: 'tpl-frequency' } }),
    interval: numberField({ label: t('recurring.field.interval'), value: String(tpl.interval || 1), attrs: { id: 'tpl-interval' } }),
    firstRun: dateField({ label: t('recurring.field.firstRun'), value: tpl.firstRun || today, required: true, attrs: { id: 'tpl-first-run' } }),
    endDate: dateField({ label: t('recurring.field.endDate'), value: tpl.endDate || '', hint: t('recurring.field.optional') }),
    maxCount: numberField({ label: t('recurring.field.maxCount'), value: tpl.maxCount ? String(tpl.maxCount) : null, hint: t('recurring.field.optional') }),
    dueShiftDays: numberField({ label: t('recurring.field.dueDays'), value: tpl.dueShiftDays === null || tpl.dueShiftDays === undefined ? null : String(tpl.dueShiftDays), hint: t('recurring.field.dueDaysHint') }),
    language: selectField({ label: t('contacts.field.language'), options: printLanguageChoices(), value: tpl.docTemplate.language || '' }),
    taxDateAtPeriodEnd: checkboxField({ label: t('recurring.field.taxDateAtPeriodEnd'), checked: tpl.taxDateAtPeriodEnd }),
    issueMode: radioGroup({ label: t('recurring.field.issueMode'), name: 'tpl-issue-mode', value: tpl.issueMode, options: ['DRAFT', 'ISSUE'].map(v => ({ value: v, label: t(`recurring.issueMode.${v}`), hint: t(`recurring.issueMode.${v}.hint`) })) }),
    autoSend: checkboxField({ label: t('recurring.field.autoSend'), checked: tpl.autoSend, hint: t('recurring.field.autoSendHint') }),
    copyToSelf: checkboxField({ label: t('recurring.field.copyToSelf'), checked: tpl.copyToSelf === true }),
    textIntro: textArea({ label: t('recurring.field.textIntro'), value: tpl.docTemplate.textIntro || '', hint: t('recurring.line.periodHint') })
  };
  const lines = linesEditor({ lines: tpl.docTemplate.lines || [], items: listOf('items'), vatPayer: !company || company.vatMode !== 'NONPAYER' });
  const preview = h('p', { class: 'muted small', id: 'tpl-preview', 'aria-live': 'polite' });

  const read = () => ({
    ...tpl, name: f.name.value(), frequency: f.frequency.value(), interval: f.interval.value(), firstRun: f.firstRun.value(),
    endDate: f.endDate.value(), maxCount: f.maxCount.value(), dueShiftDays: f.dueShiftDays.value(),
    taxDateAtPeriodEnd: f.taxDateAtPeriodEnd.value(), issueMode: f.issueMode.value(), autoSend: f.autoSend.value(), copyToSelf: f.copyToSelf.value(),
    docTemplate: { ...tpl.docTemplate, contactId: f.contact.value() || null, kind: f.kind.value(), language: f.language.value() || null, textIntro: f.textIntro.value(), lines: cleanLines(lines.value()).lines || [] }
  });
  const refresh = () => {
    f.interval.el.hidden = !['MONTHS', 'WEEK'].includes(f.frequency.value());
    f.autoSend.el.hidden = f.issueMode.value() !== 'ISSUE';
    f.copyToSelf.el.hidden = f.autoSend.el.hidden || !f.autoSend.value();
    const { template, errors } = normalizeTemplate(read());
    if (errors.firstRun || errors.interval) { preview.textContent = ''; return; }
    const runs = upcomingRuns(template, existing ? today : template.firstRun, 3);
    preview.textContent = runs.length ? t('recurring.preview', { dates: runs.map(r => formatDate(r.date)).join(', ') }) : t('recurring.preview.none');
  };
  root.addEventListener('change', refresh);

  const save = async () => {
    const checked = cleanLines(lines.value());
    const { template, errors } = normalizeTemplate(read());
    if (checked.error) errors.lines = checked.error;
    Object.entries(f).forEach(([k, field]) => field.setError(errors[k] ? t(`crm.error.${errors[k]}`) : null));
    if (errors.lines) showToast(t(`crm.error.${errors.lines}`), { type: 'error' });
    if (Object.keys(errors).length) return;
    const contact = getOf('contacts', template.docTemplate.contactId);
    const record = { ...template, name: template.name || contact?.name || '', nextRun: nextRunOnSave(existing, template, today) };
    const saved = await write(store => (existing ? store.update('recurringTemplates', existing.id, record) : store.insert('recurringTemplates', record)));
    if (!saved) return;
    showToast(t('recurring.saved'), { type: 'success' });
    go('recurring');
  };
  const remove = async () => {
    if (!(await confirmDialog(t('recurring.deleteConfirm'), { danger: true, okLabel: t('common.delete') }))) return;
    if (await write(store => store.remove('recurringTemplates', existing.id))) go('recurring');
  };

  const grid = (...children) => h('div', { class: 'form-grid' }, children);
  const historyBody = h('div', {}, existing ? history(existing) : null);
  const historyCard = existing ? h('section', { class: 'card tpl-history-card' }, h('h2', {}, t('recurring.history.title')), historyBody) : null;
  root.append(
    h('header', { class: 'view-header' }, h('div', {},
      h('a', { href: '#/recurring', class: 'back-link' }, icon('arrow-left'), t('recurring.back')),
      h('h1', {}, existing ? (existing.name || t('recurring.editTitle')) : t('recurring.new')))),
    h('form', { class: 'card tpl-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      h('fieldset', { class: 'form-section' }, h('legend', {}, t('recurring.section.document')), grid(f.contact.el, f.name.el, f.kind.el, f.language.el)),
      lines.el,
      h('fieldset', { class: 'form-section' }, h('legend', {}, t('recurring.section.schedule')),
        grid(f.frequency.el, f.interval.el, f.firstRun.el, f.endDate.el, f.maxCount.el, f.dueShiftDays.el), f.taxDateAtPeriodEnd.el, preview),
      h('fieldset', { class: 'form-section' }, h('legend', {}, t('recurring.section.issue')), f.issueMode.el, f.autoSend.el, f.copyToSelf.el),
      f.textIntro.el,
      h('div', { class: 'form-actions' },
        existing ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: remove }, icon('x'), t('common.delete')) : null,
        h('button', { type: 'button', class: 'btn', onclick: () => go('recurring') }, t('common.cancel')),
        h('button', { type: 'submit', class: 'btn btn-primary', id: 'tpl-save' }, icon('check'), t('common.save')))),
    historyCard || '');
  if (existing) {
    onData(historyCard, ['recurringTemplates', 'documents'], () => {
      const fresh = getOf('recurringTemplates', existing.id);
      if (fresh) historyBody.replaceChildren(history(fresh));
      refreshIcons(historyBody);
    });
  }
  refresh();
  refreshIcons(root);
}
