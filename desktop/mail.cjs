// weMail: sending through the user's own SMTP account from the main
// process (03-features.md § 3.8, P1). nodemailer runs here, never in the
// page; the password lives in safeStorage under "smtp.password" and the
// page only ever sends the account settings and the message.
const { normalizeSmtpConfig, transportOptions, normalizeMessage, mailErrorCode } = require('./mail-utils.cjs');

const PASSWORD_SECRET = 'smtp.password';

function createMail({ secrets, createTransport = null }) {
  // nodemailer is loaded on first use: it is not needed to start the app.
  const transportFactory = () => createTransport || require('nodemailer').createTransport;

  function password() {
    const result = secrets.get(PASSWORD_SECRET);
    return result.ok ? result.value || '' : '';
  }

  // { ok } or { error: { code } }: connects and authenticates, sends nothing.
  async function test(input) {
    const cfg = normalizeSmtpConfig(input);
    if (!cfg.ok) return { error: { code: cfg.code } };
    try {
      const transporter = transportFactory()(transportOptions(cfg.config, password()));
      await transporter.verify();
      if (typeof transporter.close === 'function') transporter.close();
      return { ok: true };
    } catch (e) {
      console.error('[mail] test failed', e.code || '', e.message);
      return { error: { code: mailErrorCode(e), message: e.message } };
    }
  }

  // { ok, messageId } or { error: { code } }.
  async function send(input, messageInput) {
    const cfg = normalizeSmtpConfig(input);
    if (!cfg.ok) return { error: { code: cfg.code } };
    const msg = normalizeMessage(messageInput, cfg.config);
    if (!msg.ok) return { error: { code: msg.code } };
    try {
      const transporter = transportFactory()(transportOptions(cfg.config, password()));
      const info = await transporter.sendMail(msg.message);
      if (typeof transporter.close === 'function') transporter.close();
      return { ok: true, messageId: info && info.messageId ? String(info.messageId) : null, accepted: (info && info.accepted) || [] };
    } catch (e) {
      console.error('[mail] send failed', e.code || '', e.message);
      return { error: { code: mailErrorCode(e), message: e.message } };
    }
  }

  function setPassword(value) {
    if (value === null || value === '') return secrets.delete(PASSWORD_SECRET);
    return secrets.set(PASSWORD_SECRET, String(value));
  }

  function hasPassword() {
    const result = secrets.get(PASSWORD_SECRET);
    return Boolean(result.ok && result.value);
  }

  return { test, send, setPassword, hasPassword };
}

function initMailIpc(ipcMain, mail) {
  ipcMain.handle('mail:test', (_e, config) => mail.test(config));
  ipcMain.handle('mail:send', (_e, config, message) => mail.send(config, message));
  ipcMain.handle('mail:set-password', (_e, value) => mail.setPassword(value));
  ipcMain.handle('mail:has-password', () => mail.hasPassword());
}

module.exports = { createMail, initMailIpc, PASSWORD_SECRET };
