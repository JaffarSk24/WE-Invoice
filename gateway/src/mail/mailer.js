// Outgoing e-mail over SMTP (nodemailer) for the waitlist. Without SMTP
// settings the mailer only logs that a message would have been sent, so
// a development gateway never needs credentials. Addresses are never
// logged in full.
import nodemailer from 'nodemailer';
import { renderMail } from './render.js';

export function createMailer(config, { transport, log } = {}) {
  const smtp = config.smtp;
  let transporter = transport || null;
  if (!transporter && smtp.host) {
    transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure || smtp.port === 465,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
    });
  }
  const from = smtp.from || 'WE Invoice <no-reply@whiteeagles.sk>';

  return {
    configured: Boolean(transporter),
    async send(kind, lang, to, params) {
      const mail = renderMail(kind, lang, params);
      if (!transporter) {
        log && log.warn({ kind, lang }, 'SMTP not configured, e-mail not sent');
        return { sent: false };
      }
      await transporter.sendMail({ from, to, subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers });
      return { sent: true };
    }
  };
}
