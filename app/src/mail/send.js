// One sending of a document by e-mail, from the composed message to the
// entry in the document's send log, shared by the send dialog and the
// automatic sending of recurring invoices and reminders. A failed SMTP
// delivery is logged as FAILED and the error is passed on, so the caller
// shows it; nothing is ever reported as sent when it was not.
import { CoreError } from '@we-invoice/core';
import { invalidAddresses } from './compose.js';
import { smtpAccount, documentPdf, sendViaSmtp, openMailClient, defaultOpenUrl, sendLogEntry, sendPatch } from './deliver.js';

/**
 * @param {{store: object, document: object, company: object, message: object, transport: object,
 *          win?: object, openUrl?: Function, attach?: boolean, pdf?: Function, now?: () => string,
 *          allowClient?: boolean}} input
 *   allowClient: false for automatic sending, which needs SMTP (no mail program to open)
 * @returns {Promise<{entry: object, url?: string}>}
 */
export async function sendDocumentMail(input) {
  const { store, document, company, message, transport, win = typeof window !== 'undefined' ? window : null } = input;
  const { openUrl = defaultOpenUrl, attach = true, pdf = documentPdf, now = () => new Date().toISOString(), allowClient = true } = input;
  if (!message.to.length) throw new CoreError('MAIL_BAD_RECIPIENT', 'No recipient');
  if (invalidAddresses([...message.to, ...message.cc, ...message.bcc]).length) throw new CoreError('MAIL_BAD_RECIPIENT', 'Invalid recipient');
  const account = smtpAccount(win);
  if (!account && !allowClient) throw new CoreError('MAIL_NO_SMTP', 'Automatic sending needs an SMTP account');
  const attachment = attach ? await pdf(document, company) : null;
  let outcome;
  try {
    outcome = account
      ? await sendViaSmtp(win, account, message, attachment)
      : await openMailClient({ transport, message, attachment, openUrl });
  } catch (e) {
    const failed = sendLogEntry({ to: message.to, result: 'FAILED', purpose: message.purpose, at: now() });
    try {
      await store.update('documents', document.id, sendPatch(store.get('documents', document.id) || document, failed));
    } catch (logError) {
      console.error('The failed sending could not be logged', logError);
    }
    throw e;
  }
  const entry = sendLogEntry({ to: message.to, result: outcome.result, purpose: message.purpose, at: now() });
  await store.update('documents', document.id, sendPatch(store.get('documents', document.id) || document, entry));
  return { entry, url: outcome.url };
}
