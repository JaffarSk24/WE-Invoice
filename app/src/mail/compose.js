// Composing an e-mail about a document: recipients from the contact (the
// address for invoices or for reminders, a copy to the accountant when the
// contact has one), the language of the printed document, the template of
// the purpose with its placeholders filled, and the mailto: link for the
// web, where the user's own mail program sends it. Pure functions.
import { emailsFor } from '../views/contacts/model.js';
import { pickTemplate, fill, mailLanguage } from './templates.js';
import { documentVars } from './placeholders.js';

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// Mail options of the company (a record field the schema keeps as is):
// bccSelf sends a blind copy to the company address, replyTo overrides it.
export function mailSettings(company) {
  const s = (company && company.mailSettings) || {};
  return { bccSelf: s.bccSelf === true, ccAccountant: s.ccAccountant !== false, replyTo: s.replyTo || null };
}

// The language of the e-mail: as the printed document, else the client's,
// else the company default, else Slovak.
export function documentLanguage(document, contact, company) {
  return mailLanguage(document.language || contact?.language || company?.defaults?.language || 'sk');
}

export function splitAddresses(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,;\s]+/);
  return Array.from(new Set(list.map(s => String(s).trim()).filter(Boolean)));
}

export function invalidAddresses(list) {
  return splitAddresses(list).filter(a => !EMAIL.test(a));
}

/**
 * @param {{document: object, company: object, contact?: object|null, templates?: object[], purpose?: string,
 *          language?: string|null, today: string, penalties?: string}} input
 * @returns {{to: string[], cc: string[], bcc: string[], replyTo: string|null, subject: string, body: string, language: string, purpose: string}}
 */
export function composeMail(input) {
  const { document, company, contact = null, templates = [], purpose = 'SEND', today, penalties = '' } = input;
  const language = mailLanguage(input.language || documentLanguage(document, contact, company));
  const reminder = purpose.startsWith('REMINDER');
  let to = contact ? emailsFor(contact, reminder ? 'REMINDER' : 'INVOICE') : [];
  if (!to.length && document.buyer && document.buyer.email) to = [document.buyer.email];
  const settings = mailSettings(company);
  const cc = settings.ccAccountant && contact && purpose === 'SEND' ? emailsFor(contact, 'ACCOUNTANT').filter(a => !to.includes(a)) : [];
  const bcc = settings.bccSelf && company && company.email ? [company.email] : [];
  const template = pickTemplate(templates, { purpose, language, docKind: document.kind });
  const vars = documentVars({ document, company, contact, language, today, penalties });
  return {
    to: splitAddresses(to), cc, bcc, replyTo: settings.replyTo, purpose, language,
    subject: fill(template.subject, vars).replace(/\s+/g, ' ').trim(),
    body: fill(template.body, vars).replace(/\n{3,}/g, '\n\n')
  };
}

// A mailto: link (RFC 6068). Line breaks become CRLF; the body is cut so
// the link stays within what mail programs accept.
export function mailtoUrl({ to = [], cc = [], bcc = [], subject = '', body = '' }, maxLength = 1800) {
  const params = [];
  if (cc.length) params.push(`cc=${cc.map(encodeURIComponent).join(',')}`);
  if (bcc.length) params.push(`bcc=${bcc.map(encodeURIComponent).join(',')}`);
  params.push(`subject=${encodeURIComponent(subject)}`);
  const head = `mailto:${to.map(encodeURIComponent).join(',')}?${params.join('&')}`;
  let text = String(body).replace(/\r?\n/g, '\r\n');
  let encoded = encodeURIComponent(text);
  while (head.length + encoded.length + 6 > maxLength && text.length > 0) {
    const chars = Array.from(text);
    text = chars.slice(0, Math.floor(chars.length * 0.9)).join('');
    encoded = encodeURIComponent(text);
  }
  return `${head}&body=${encoded}`;
}
