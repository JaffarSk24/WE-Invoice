// The values for the placeholders of an e-mail about a document, formatted
// in the mail language: amounts and dates as a reader in that language
// expects them, the document title from the print dictionary, the IBAN of
// the account on the document, the billing period ("október 2026") and
// the days after the due date. Pure: "today" is passed in.
import { formatAmount, amountDue, payableOf, diffDays, isDate } from '@we-invoice/core';
import { mailLanguage, printText } from './templates.js';

const LOCALES = Object.freeze({ sk: 'sk-SK', cs: 'cs-CZ', en: 'en-GB', de: 'de-DE' });

export function localeFor(language) {
  return LOCALES[mailLanguage(language)];
}

export function formatMailDate(ymd, language) {
  if (!isDate(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat(localeFor(language), { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatMailAmount(amount, currency, language) {
  try {
    return formatAmount(amount, currency || 'EUR', localeFor(language));
  } catch (e) {
    console.warn('Amount cannot be formatted', e);
    return `${amount} ${currency || 'EUR'}`;
  }
}

// "október 2026" for one month, otherwise "1. 10. 2026 - 31. 12. 2026".
export function periodLabel(from, to, language) {
  if (!isDate(from)) return '';
  const [y, m] = from.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (!to || (to.slice(0, 7) === from.slice(0, 7) && from.endsWith('-01') && Number(to.slice(8)) === lastDay)) {
    return new Intl.DateTimeFormat(localeFor(language), { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
  }
  return `${formatMailDate(from, language)} - ${formatMailDate(to, language)}`;
}

function ibanOf(document, company) {
  const accounts = (company && company.bankAccounts) || [];
  const account = accounts.find(a => a.id === document.bankAccountId) || accounts.find(a => a.isDefault) || accounts[0];
  return account ? account.iban.replace(/(.{4})/g, '$1 ').trim() : '';
}

function safe(fn, fallback) {
  try { return fn(); } catch (e) { console.warn('A mail value cannot be computed', e); return fallback; }
}

/**
 * @param {{document: object, company: object, contact?: object|null, language: string, today: string, penalties?: string}} input
 * @returns {Object<string, string>} the values for fill()
 */
export function documentVars({ document, company, contact = null, language, today, penalties = '' }) {
  const lang = mailLanguage(language);
  const currency = document.currency || 'EUR';
  const gross = document.totals || document.lines ? safe(() => payableOf(document), '0.00') : (document.totalGross || '0.00');
  const due = document.totals || document.lines ? safe(() => amountDue(document), gross) : gross;
  const overdue = isDate(document.dueDate) && isDate(today) ? Math.max(0, diffDays(document.dueDate, today)) : 0;
  return {
    kind: printText(lang, `title.${document.kind}`),
    number: document.number || '',
    company: (company && company.name) || document.seller?.name || '',
    contact: document.buyer?.name || contact?.name || '',
    amount: formatMailAmount(gross, currency, lang),
    amountDue: formatMailAmount(due, currency, lang),
    issueDate: formatMailDate(document.issueDate, lang),
    dueDate: formatMailDate(document.dueDate, lang),
    vs: document.vs || '',
    iban: ibanOf(document, company),
    period: periodLabel(document.periodFrom || document.recurringPeriodStart, document.periodTo, lang),
    daysOverdue: String(overdue),
    penalties
  };
}
