// Getting an e-mail out. On the desktop with an SMTP account the message
// goes through window.weMail (nodemailer in the main process, password in
// the system keychain) with the PDF and the document's own attachments.
// In the browser those files are downloaded and the user's mail program
// opens with a mailto: link; the user attaches them there (a link cannot
// carry an attachment). Gmail
// sending needs a verified Google app and is not wired yet. Every outcome
// becomes a sendLog entry on the document.
import { CoreError, canTransition } from '@we-invoice/core';
import { getDesktopPrefs, smtpConfigured } from '../desktop/prefs.js';
import { mailtoUrl } from './compose.js';

// The SMTP account when sending through it is possible here.
export function smtpAccount(win = typeof window !== 'undefined' ? window : null) {
  if (!win || !win.weMail || typeof win.weMail.send !== 'function') return null;
  const smtp = getDesktopPrefs().smtp;
  return smtpConfigured(smtp) ? smtp : null;
}

// The PDF of a document as { fileName, blob }; the engine loads lazily.
export async function documentPdf(document, company) {
  const pdf = await import('../pdf/index.js');
  const blob = await pdf.buildPdf(document, company);
  return { fileName: pdf.pdfFileNameFor(document, company), blob };
}

async function bytesOf(blob) {
  if (blob instanceof Uint8Array) return blob;
  return new Uint8Array(await blob.arrayBuffer());
}

// extras: the document's attachments [{ fileName, blob, contentType }].
export async function sendViaSmtp(win, account, message, attachment = null, extras = []) {
  const files = [];
  if (attachment) files.push({ filename: attachment.fileName, content: await bytesOf(attachment.blob), contentType: 'application/pdf' });
  for (const extra of extras) files.push({ filename: extra.fileName, content: await bytesOf(extra.blob), contentType: extra.contentType || 'application/octet-stream' });
  const result = await win.weMail.send(account, {
    to: message.to, cc: message.cc, bcc: message.bcc, replyTo: message.replyTo || undefined,
    subject: message.subject, text: message.body,
    attachments: files
  });
  if (!result || !result.ok) {
    const code = (result && result.error && result.error.code) || 'MAIL_FAILED';
    throw new CoreError(code, `SMTP sending failed: ${result && result.error && result.error.message}`);
  }
  return { result: 'SENT', messageId: result.messageId || null };
}

// Downloads the PDF and the attachments and opens the mail program.
// Returns the mailto link so the dialog can offer it again when nothing
// opened.
export async function openMailClient({ transport, message, attachment = null, extras = [], openUrl }) {
  if (attachment) await transport.files.saveAs(attachment.fileName, attachment.blob);
  for (const extra of extras) await transport.files.saveAs(extra.fileName, extra.blob instanceof Blob ? extra.blob : new Blob([extra.blob], { type: extra.contentType }));
  const url = mailtoUrl(message);
  openUrl(url);
  return { result: 'CLIENT_OPENED', url };
}

export function defaultOpenUrl(url) {
  window.location.href = url;
}

// A sendLog entry (schema SEND_LOG_ENTRY); detail keeps the purpose.
export function sendLogEntry({ to = [], result, purpose = 'SEND', at = new Date().toISOString(), channel = 'EMAIL' }) {
  return { at, channel, to: to.join(', ').slice(0, 500) || null, result, detail: purpose };
}

// The patch that records a send on a document: the log entry and, for the
// first sending of an issued document, the status SENT.
export function sendPatch(document, entry) {
  const patch = { sendLog: [...(document.sendLog || []), entry] };
  const ok = entry.result === 'SENT' || entry.result === 'CLIENT_OPENED';
  if (ok && entry.detail === 'SEND' && document.status === 'ISSUED' && canTransition(document.kind, 'ISSUED', 'SENT')) patch.status = 'SENT';
  return patch;
}
