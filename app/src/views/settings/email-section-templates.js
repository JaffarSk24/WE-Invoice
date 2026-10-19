// The e-mail templates of Settings: for each purpose (sending a document,
// the reminder levels, the thank-you note) and print language, the user's
// own template or the built-in one. Editing a built-in template saves a
// copy in the collection emailTemplates; deleting the copy brings the
// built-in text back. A template may be limited to one document kind.
import { h, icon, selectEl, append, clear } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { openModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { languageInfo } from '../../i18n/languages.js';
import { schema } from '@we-invoice/core';
import { PURPOSES, MAIL_LANGUAGES, PLACEHOLDERS, defaultTemplate } from '../../mail/templates.js';
import { listOf, write } from '../contacts/source.js';

const SEND_KINDS = ['INVOICE', 'PROFORMA', 'CREDIT_NOTE', 'QUOTE', 'ORDER_IN', 'DELIVERY_NOTE'];

export function openTemplateEditor(template) {
  const base = template || defaultTemplate('SEND', 'sk');
  const purpose = selectEl(PURPOSES.map(p => ({ value: p, label: t(`mail.purpose.${p}`) })), base.purpose, { id: 'tpl-purpose' });
  const language = selectEl(MAIL_LANGUAGES.map(c => ({ value: c, label: languageInfo(c).name })), base.language, { id: 'tpl-language' });
  const docKind = selectEl([{ value: '', label: t('settings.email.anyKind') }, ...SEND_KINDS.filter(k => schema.DOCUMENT_KINDS.includes(k)).map(k => ({ value: k, label: t(`crm.kind.${k}`) }))], base.docKind || '', { id: 'tpl-kind' });
  const subject = h('input', { id: 'tpl-subject', type: 'text', value: base.subject });
  const body = h('textarea', { id: 'tpl-body', rows: 12 }, base.body);
  const field = (id, label, control) => h('div', { class: 'field' }, h('label', { for: id }, label), control);
  const reload = () => {
    if (template && template.id) return;
    const d = defaultTemplate(purpose.value, language.value);
    subject.value = d.subject;
    body.value = d.body;
  };
  purpose.addEventListener('change', reload);
  language.addEventListener('change', reload);
  const save = async (m) => {
    const record = { name: '', purpose: purpose.value, language: language.value, docKind: docKind.value || null, subject: subject.value.trim(), body: body.value };
    if (!record.subject || !record.body.trim()) { showToast(t('errors.MAIL_EMPTY'), { type: 'error' }); return; }
    const saved = await write(store => (template && template.id ? store.update('emailTemplates', template.id, record) : store.insert('emailTemplates', record)));
    if (saved) { showToast(t('settings.email.templateSaved'), { type: 'success' }); m.close(); }
  };
  return openModal({
    title: t('settings.email.editTemplate'),
    wide: true,
    body: h('div', { class: 'template-editor' },
      h('div', { class: 'form-grid' }, field('tpl-purpose', t('settings.email.purpose'), purpose), field('tpl-language', t('mail.field.language'), language), field('tpl-kind', t('settings.email.kind'), docKind)),
      field('tpl-subject', t('mail.field.subject'), subject),
      field('tpl-body', t('mail.field.body'), body),
      h('p', { class: 'muted small' }, t('settings.email.placeholders'), ' ', PLACEHOLDERS.map(p => `{${p}}`).join(' '))),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      { label: t('common.save'), kind: 'primary', onClick: save }
    ]
  });
}

export function templatesBlock() {
  const box = h('div', { class: 'templates-block' });
  const draw = () => {
    const mine = listOf('emailTemplates');
    const rows = [];
    PURPOSES.forEach(purpose => MAIL_LANGUAGES.forEach(language => {
      const own = mine.filter(x => x.purpose === purpose && x.language === language);
      if (own.length) own.forEach(x => rows.push({ purpose, language, template: x }));
      else rows.push({ purpose, language, template: null });
    }));
    append(clear(box), [
      h('table', { class: 'table templates-table' },
        h('thead', {}, h('tr', {}, [t('settings.email.purpose'), t('mail.field.language'), t('mail.field.subject'), ''].map(x => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, rows.map(r => {
          const shown = r.template || defaultTemplate(r.purpose, r.language);
          return h('tr', {},
            h('td', {}, t(`mail.purpose.${r.purpose}`), r.template && r.template.docKind ? h('span', { class: 'muted small' }, ` (${t(`crm.kind.${r.template.docKind}`)})`) : null),
            h('td', {}, languageInfo(r.language).name),
            h('td', {}, shown.subject, r.template ? null : h('span', { class: 'badge template-default' }, t('settings.email.default'))),
            h('td', { class: 'template-actions' },
              h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': t('settings.email.editTemplate'), onclick: () => openTemplateEditor(shown) }, icon('pencil-line')),
              r.template ? h('button', {
                type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': t('settings.email.restore'),
                onclick: async () => { if (await write(store => store.remove('emailTemplates', r.template.id))) showToast(t('settings.email.restored')); }
              }, icon('rotate-ccw')) : null));
        }))),
      h('button', { type: 'button', class: 'btn', id: 'templates-add', onclick: () => openTemplateEditor(null) }, icon('plus'), t('settings.email.addTemplate'))]);
    refreshIcons(box);
  };
  draw();
  return { el: box, draw };
}
