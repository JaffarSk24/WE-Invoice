// The E-mail section of Settings (03-features.md § 3.17): how e-mails go
// out on this device (own SMTP account on the desktop, the user's mail
// program in the browser), the copies (blind copy to the company address,
// copy to the client's accountant), the reply-to address and the
// templates. Gmail sending needs a verified Google app and is announced,
// not offered, until then.
import '../../style/contacts.css';
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { checkboxField, textField } from '../../components/fields.js';
import { mailSettings, invalidAddresses } from '../../mail/compose.js';
import { smtpAccount } from '../../mail/deliver.js';
import { companyOf, write, onData } from '../contacts/source.js';
import { templatesBlock } from './email-section-templates.js';

function sendingBlock(win) {
  const block = h('div', { class: 'mail-way' });
  if (win && win.weMail) {
    const account = smtpAccount(win);
    block.append(h('p', { class: account ? 'callout' : 'callout callout-warning' }, icon('mail'),
      h('span', {}, account ? t('settings.email.smtpReady', { from: account.from }) : t('settings.email.smtpMissing'))));
    const host = h('div', { class: 'smtp-host' });
    block.append(host);
    Promise.all([import('../desktop/smtp-form.js'), import('../desktop/desktop.css')])
      .then(([mod]) => host.append(mod.renderSmtpForm({ t, showToast, showError, weMail: win.weMail, weSecrets: win.weSecrets })))
      .catch(e => showError(e));
  } else {
    block.append(h('p', { class: 'callout' }, icon('info'), h('span', {}, t('settings.email.webWay'))),
      h('p', { class: 'muted small' }, t('settings.email.gmailLater')));
  }
  return block;
}

function optionsBlock() {
  const company = companyOf();
  const s = mailSettings(company);
  const bcc = checkboxField({ label: t('settings.email.bccSelf'), checked: s.bccSelf, hint: company && company.email ? t('settings.email.bccSelfHint', { email: company.email }) : t('settings.email.bccSelfNoEmail') });
  const acc = checkboxField({ label: t('settings.email.ccAccountant'), checked: s.ccAccountant, hint: t('settings.email.ccAccountantHint') });
  const replyTo = textField({ label: t('settings.email.replyTo'), value: s.replyTo || '', type: 'email', hint: t('settings.email.replyToHint') });
  const save = async () => {
    const reply = replyTo.value();
    if (reply && invalidAddresses([reply]).length) { replyTo.setError(t('crm.error.EMAIL_INVALID')); return; }
    replyTo.setError(null);
    const patch = { mailSettings: { bccSelf: bcc.value(), ccAccountant: acc.value(), replyTo: reply || null } };
    if (await write(store => store.updateCompany(patch))) showToast(t('settings.email.saved'), { type: 'success' });
  };
  return h('form', { class: 'mail-options', onsubmit: (e) => { e.preventDefault(); save(); } },
    bcc.el, acc.el, replyTo.el,
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn btn-primary', id: 'mail-options-save' }, t('common.save'))));
}

export function emailSection(root, { win = typeof window !== 'undefined' ? window : null } = {}) {
  const templates = templatesBlock();
  root.append(
    h('p', { class: 'muted' }, t('settings.email.intro')),
    h('h3', { class: 'settings-subtitle' }, t('settings.email.way')), sendingBlock(win),
    h('h3', { class: 'settings-subtitle' }, t('settings.email.options')), optionsBlock(),
    h('h3', { class: 'settings-subtitle' }, t('settings.email.templates')), templates.el);
  refreshIcons(root);
  onData(root, ['emailTemplates'], templates.draw);
}
