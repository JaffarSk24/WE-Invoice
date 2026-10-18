// Outgoing e-mail for the waitlist: SMTP (nodemailer) when SMTP_HOST is
// set, otherwise the Mailgun HTTP API when its key and domain are set.
// Without either, the mailer only logs that a message would have been
// sent, so a development gateway never needs credentials. Addresses are
// never logged in full.
import nodemailer from 'nodemailer';
import { renderMail } from './render.js';

const MAILGUN_HOSTS = new Set(['api.mailgun.net', 'api.eu.mailgun.net']);

// The Mailgun messages API as a nodemailer-like transport.
export function mailgunTransport(mg, { fetchImpl = fetch } = {}) {
  if (!MAILGUN_HOSTS.has(mg.endpoint)) throw new Error(`Unknown Mailgun endpoint ${mg.endpoint}`);
  const auth = `Basic ${Buffer.from(`api:${mg.apiKey}`).toString('base64')}`;
  return {
    async sendMail({ from, to, subject, text, html, headers = {}, replyTo }) {
      const body = new URLSearchParams({ from, to, subject, text });
      if (html) body.set('html', html);
      if (replyTo) body.set('h:Reply-To', replyTo);
      for (const [name, value] of Object.entries(headers)) body.set(`h:${name}`, value);
      const res = await fetchImpl(`https://${mg.endpoint}/v3/${encodeURIComponent(mg.domain)}/messages`, {
        method: 'POST', headers: { Authorization: auth }, body, signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) throw Object.assign(new Error(`Mailgun answered ${res.status}`), { code: `MAILGUN_${res.status}` });
      return { messageId: 'mailgun' };
    }
  };
}

export function createMailer(config, { transport, log, fetchImpl } = {}) {
  const smtp = config.smtp;
  const mg = config.mailgun || {};
  let transporter = transport || null;
  if (!transporter && smtp.host) {
    transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure || smtp.port === 465,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
    });
  } else if (!transporter && mg.apiKey && mg.domain) {
    transporter = mailgunTransport(mg, { fetchImpl });
  }
  const from = smtp.from || 'WE Invoice <no-reply@whiteeagles.sk>';

  return {
    configured: Boolean(transporter),
    // options.replyTo: where an answer to the message goes.
    async send(kind, lang, to, params, options = {}) {
      const mail = renderMail(kind, lang, params);
      if (!transporter) {
        log && log.warn({ kind, lang }, 'No mail transport configured, e-mail not sent');
        return { sent: false };
      }
      await transporter.sendMail({ from, to, subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers, replyTo: options.replyTo });
      return { sent: true };
    }
  };
}
