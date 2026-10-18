// The SMTP account form of the desktop settings: server, port, security,
// user, sender and the password, which goes to the system keychain through
// weMail and never into the preferences. "Test the connection" asks the
// main process to log in without sending anything.
import { h, selectEl } from '../../ui/dom.js';
import { getDesktopPrefs, setDesktopPref } from '../../desktop/prefs.js';

const SECURITY = ['tls', 'starttls', 'none'];

function field(label, control, hint = null) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h('div', { class: 'form-group' }, h('label', { for: id }, label), control, hint ? h('p', { class: 'form-hint' }, hint) : null);
}

function errorOf(result) {
  const code = result && result.error && result.error.code;
  return Object.assign(new Error(code || 'MAIL_FAILED'), { code: code || 'MAIL_FAILED' });
}

// ctx = { t, showToast, showError, weMail, weSecrets }
export function renderSmtpForm(ctx) {
  const { t, showToast, showError, weMail, weSecrets } = ctx;
  const smtp = getDesktopPrefs().smtp;
  const host = h('input', { type: 'text', value: smtp.host, autocomplete: 'off', spellcheck: 'false' });
  const port = h('input', { type: 'number', min: '1', max: '65535', value: String(smtp.port) });
  const security = selectEl(SECURITY.map(v => ({ value: v, label: t(`desktop.smtp.security.${v}`) })), smtp.security);
  const user = h('input', { type: 'text', value: smtp.user, autocomplete: 'username' });
  const password = h('input', { type: 'password', autocomplete: 'current-password', placeholder: '' });
  const from = h('input', { type: 'email', value: smtp.from, autocomplete: 'email' });
  const fromName = h('input', { type: 'text', value: smtp.fromName });
  const passwordHint = h('p', { class: 'form-hint' });

  async function refreshPasswordHint() {
    try {
      const available = weSecrets ? await weSecrets.available() : false;
      const stored = weMail ? await weMail.hasPassword() : false;
      passwordHint.textContent = !available ? t('desktop.smtp.passwordNotStored') : stored ? `${t('desktop.smtp.passwordStored')} ${t('desktop.smtp.passwordKeep')}` : '';
    } catch (e) {
      console.warn('SMTP password state unknown', e);
    }
  }

  function readConfig() {
    return {
      host: host.value.trim(), port: Number(port.value), security: security.value,
      user: user.value.trim(), from: from.value.trim(), fromName: fromName.value.trim()
    };
  }

  async function save() {
    const config = readConfig();
    setDesktopPref('smtp', config);
    if (weMail && password.value) {
      const result = await weMail.setPassword(password.value);
      password.value = '';
      if (!result.ok) showError(Object.assign(new Error(result.error), { code: `SECRETS_${result.error}` }));
    }
    await refreshPasswordHint();
    showToast(t('desktop.smtp.saved'), { type: 'success' });
    return config;
  }

  async function test() {
    if (!weMail) return;
    const config = await save();
    const result = await weMail.test(config);
    if (result.ok) showToast(t('desktop.smtp.testOk'), { type: 'success' });
    else showError(errorOf(result));
  }

  const form = h('form', { class: 'card desktop-section', onsubmit: (e) => { e.preventDefault(); save().catch(showError); } },
    h('h2', {}, t('desktop.smtp.title')),
    h('p', { class: 'form-hint' }, t('desktop.smtp.hint')),
    h('div', { class: 'form-grid' },
      field(t('desktop.smtp.host'), host),
      field(t('desktop.smtp.port'), port),
      field(t('desktop.smtp.security'), security),
      field(t('desktop.smtp.user'), user),
      h('div', { class: 'form-group' }, h('label', { for: 'smtp-password' }, t('desktop.smtp.password')), Object.assign(password, { id: 'smtp-password' }), passwordHint),
      field(t('desktop.smtp.from'), from),
      field(t('desktop.smtp.fromName'), fromName)),
    h('div', { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => test().catch(showError) }, t('desktop.smtp.test')),
      h('button', { type: 'submit', class: 'btn btn-primary' }, t('common.save'))));
  refreshPasswordHint();
  return form;
}
