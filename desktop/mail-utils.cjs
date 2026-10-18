// Checks and shapes what the page sends to weMail before nodemailer sees
// it: the SMTP account (host, port, security, user, sender) and a message
// (recipients, subject, text, attachments). Pure, tested without Electron.
// The password never passes through here: it is read from safeStorage in
// the main process.

const MAX_ATTACHMENT_TOTAL = 25 * 1024 * 1024;
const MAX_RECIPIENTS = 50;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SECURITY = Object.freeze(['tls', 'starttls', 'none']);

function cleanText(v, max = 500) {
  return (v == null ? '' : String(v)).trim().slice(0, max);
}

// The SMTP account. Returns { ok, config } or { ok: false, code }.
function normalizeSmtpConfig(input) {
  const c = input && typeof input === 'object' ? input : {};
  const host = cleanText(c.host, 253).toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) return { ok: false, code: 'MAIL_BAD_CONFIG' };
  const port = Number(c.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, code: 'MAIL_BAD_CONFIG' };
  const security = SECURITY.includes(c.security) ? c.security : (port === 465 ? 'tls' : 'starttls');
  const from = cleanText(c.from, 254);
  if (!EMAIL.test(from)) return { ok: false, code: 'MAIL_BAD_CONFIG' };
  return {
    ok: true,
    config: { host, port, security, user: cleanText(c.user, 254), from, fromName: cleanText(c.fromName, 120) }
  };
}

// nodemailer transport options for a config, with the password added.
function transportOptions(config, password) {
  return {
    host: config.host,
    port: config.port,
    secure: config.security === 'tls',
    requireTLS: config.security === 'starttls',
    ignoreTLS: config.security === 'none',
    auth: config.user ? { user: config.user, pass: password || '' } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000
  };
}

function addressList(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,;]/);
  return list.map(s => cleanText(s, 254)).filter(Boolean);
}

// The message. Returns { ok, message } or { ok: false, code }.
function normalizeMessage(input, config) {
  const m = input && typeof input === 'object' ? input : {};
  const to = addressList(m.to);
  const cc = addressList(m.cc);
  const bcc = addressList(m.bcc);
  const all = [...to, ...cc, ...bcc];
  if (!to.length || all.length > MAX_RECIPIENTS || all.some(a => !EMAIL.test(a))) return { ok: false, code: 'MAIL_BAD_RECIPIENT' };
  const subject = cleanText(m.subject, 500);
  const text = m.text == null ? '' : String(m.text);
  const html = m.html == null ? '' : String(m.html);
  if (!subject || (!text && !html)) return { ok: false, code: 'MAIL_EMPTY' };
  let total = 0;
  const attachments = [];
  for (const a of Array.isArray(m.attachments) ? m.attachments : []) {
    if (!a || typeof a !== 'object') return { ok: false, code: 'MAIL_BAD_ATTACHMENT' };
    const filename = cleanText(a.filename, 200).replace(/[\\/]/g, '_');
    const content = a.content instanceof Uint8Array ? Buffer.from(a.content) : (typeof a.content === 'string' ? Buffer.from(a.content, 'base64') : null);
    if (!filename || !content) return { ok: false, code: 'MAIL_BAD_ATTACHMENT' };
    total += content.length;
    if (total > MAX_ATTACHMENT_TOTAL) return { ok: false, code: 'MAIL_TOO_LARGE' };
    attachments.push({ filename, content, contentType: cleanText(a.contentType, 100) || undefined });
  }
  const sender = config.fromName ? { name: config.fromName, address: config.from } : config.from;
  const replyTo = cleanText(m.replyTo, 254);
  return {
    ok: true,
    message: {
      from: sender, to, cc: cc.length ? cc : undefined, bcc: bcc.length ? bcc : undefined,
      replyTo: replyTo && EMAIL.test(replyTo) ? replyTo : undefined,
      subject, text: text || undefined, html: html || undefined, attachments
    }
  };
}

// nodemailer errors map to the codes the page shows (errors.<CODE>).
function mailErrorCode(error) {
  const code = error && error.code;
  if (code === 'EAUTH') return 'MAIL_AUTH';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND'].includes(code)) return 'MAIL_CONNECT';
  if (code === 'EENVELOPE') return 'MAIL_BAD_RECIPIENT';
  return 'MAIL_FAILED';
}

module.exports = { MAX_ATTACHMENT_TOTAL, MAX_RECIPIENTS, SECURITY, normalizeSmtpConfig, transportOptions, normalizeMessage, mailErrorCode };
