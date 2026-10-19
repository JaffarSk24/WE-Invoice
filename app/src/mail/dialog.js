// The e-mail window of a document: recipients filled from the contact,
// subject and text from the template in the language of the printed
// document (another language can be chosen, which fills the template
// again unless the user has edited the text), and a clear note of what
// happens: SMTP sends with the PDF attached; without it the PDF is
// downloaded and the user's mail program opens to attach it by hand.
import '../style/contacts.css';
import { h, icon, selectEl, append } from '../ui/dom.js';
import { refreshIcons } from '../ui/icons.js';
import { t } from '../i18n/index.js';
import { openModal } from '../ui/modal.js';
import { showToast, showError } from '../ui/toast.js';
import { languageInfo } from '../i18n/languages.js';
import { todayLocal } from '../components/dates.js';
import { composeMail, splitAddresses, invalidAddresses } from './compose.js';
import { MAIL_LANGUAGES } from './templates.js';
import { smtpAccount } from './deliver.js';
import { sendDocumentMail } from './send.js';
import { documentAttachments } from './attachments.js';

function input(id, label, value, type = 'text') {
  const el = h('input', { id, type, value, autocomplete: 'off', spellcheck: 'false' });
  return { el, row: h('div', { class: 'field' }, h('label', { for: id }, label), el) };
}

/**
 * @param {{document: object, company: object, contact: object|null, templates: object[], store: object|null,
 *          transport: object, purpose?: string, penalties?: string, readOnly?: boolean, onSent?: Function}} ctx
 */
export function openSendDialog(ctx) {
  const { document, company, contact, templates, store, transport, purpose = 'SEND', penalties = '', readOnly = false } = ctx;
  const today = todayLocal();
  let message = composeMail({ document, company, contact, templates, purpose, today, penalties });
  let edited = false;
  const smtp = smtpAccount();

  const to = input('mail-to', t('mail.field.to'), message.to.join(', '), 'text');
  const cc = input('mail-cc', t('mail.field.cc'), message.cc.join(', '));
  const bcc = input('mail-bcc', t('mail.field.bcc'), message.bcc.join(', '));
  const subject = input('mail-subject', t('mail.field.subject'), message.subject);
  const body = h('textarea', { id: 'mail-body', rows: 12 }, message.body);
  const language = selectEl(MAIL_LANGUAGES.map(code => ({ value: code, label: languageInfo(code).name })), message.language, { id: 'mail-language' });
  [subject.el, body].forEach(el => el.addEventListener('input', () => { edited = true; }));
  language.addEventListener('change', () => {
    if (edited && !window.confirm(t('mail.dialog.replaceText'))) { language.value = message.language; return; }
    message = composeMail({ document, company, contact, templates, purpose, today, penalties, language: language.value });
    subject.el.value = message.subject;
    body.value = message.body;
    edited = false;
  });
  const status = h('div', { class: 'mail-status', 'aria-live': 'polite' });
  const note = smtp
    ? h('p', { class: 'callout' }, icon('info'), h('span', {}, t('mail.dialog.smtpNote', { from: smtp.from })))
    : h('p', { class: 'callout callout-warning' }, icon('info'), h('span', {}, t(transport.platform === 'web' ? 'mail.dialog.webNote' : 'mail.dialog.noSmtpNote')));

  // The document's own files go with the PDF; the ones this device does not have are named.
  const extraNote = h('div', { class: 'mail-extras muted small', id: 'mail-extras' });
  const names = (document.attachments || []).map(a => a.name);
  if (names.length) {
    append(extraNote, [h('p', {}, icon('file-text'), ' ', t('mail.dialog.extraAttachments', { names: names.join(', ') }))]);
    documentAttachments(document).then(({ missing }) => {
      if (missing.length) append(extraNote, [h('p', { class: 'callout callout-warning' }, t('mail.dialog.missingAttachments', { names: missing.join(', ') }))]);
    }).catch(e => console.warn('Attachments could not be checked', e));
  }

  let modal = null;
  let busy = false;
  const send = async () => {
    if (busy) return;
    if (readOnly || !store) { showToast(t('crm.demo.readOnly')); return; }
    const outgoing = {
      ...message, to: splitAddresses(to.el.value), cc: splitAddresses(cc.el.value), bcc: splitAddresses(bcc.el.value),
      subject: subject.el.value.trim(), body: body.value
    };
    const wrong = invalidAddresses([...outgoing.to, ...outgoing.cc, ...outgoing.bcc]);
    if (!outgoing.to.length || wrong.length) { status.textContent = t('mail.error.recipients', { list: wrong.join(', ') || '-' }); to.el.focus(); return; }
    if (!outgoing.subject) { status.textContent = t('errors.MAIL_EMPTY'); subject.el.focus(); return; }
    busy = true;
    status.textContent = t('mail.dialog.working');
    try {
      const { entry, url } = await sendDocumentMail({ store, document, company, message: outgoing, transport });
      if (entry.result === 'SENT') {
        showToast(t('mail.sent', { to: outgoing.to.join(', ') }), { type: 'success' });
        modal.close();
      } else {
        status.replaceChildren(h('p', {}, t('mail.dialog.opened')),
          h('a', { href: url, id: 'mail-open-link', class: 'btn btn-ghost' }, icon('mail'), t('mail.dialog.openAgain')));
        refreshIcons(status);
      }
      if (ctx.onSent) ctx.onSent(entry);
    } catch (e) {
      status.textContent = '';
      showError(e, 'errors.MAIL_FAILED');
    } finally {
      busy = false;
    }
  };

  modal = openModal({
    title: t('mail.dialog.title', { kind: t(`crm.kind.${document.kind}`), number: document.number || '' }),
    wide: true,
    body: h('div', { class: 'mail-dialog' },
      note,
      h('div', { class: 'form-grid' }, to.row, cc.row, bcc.row, h('div', { class: 'field' }, h('label', { for: 'mail-language' }, t('mail.field.language')), language)),
      subject.row,
      h('div', { class: 'field' }, h('label', { for: 'mail-body' }, t('mail.field.body')), body),
      h('p', { class: 'muted small' }, icon('file-text'), ' ', t('mail.dialog.attachment')),
      extraNote,
      status),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      { label: smtp ? t('mail.dialog.send') : t('mail.dialog.openClient'), kind: 'primary', onClick: send }
    ]
  });
  modal.content.querySelector('[data-primary]').id = 'mail-send';
  return modal;
}
