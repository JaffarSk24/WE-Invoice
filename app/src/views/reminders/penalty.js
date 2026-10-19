// Late payment interest and the flat recovery cost of a reminder, through
// lateInterest() of the core (margins from legislation, never in code):
// B2B when the client is a company, B2C for a private person. The ECB
// base rate is set by the user in the reminder settings, because no
// endpoint of the gateway serves it; without it no interest is computed.
// The flat 40 EUR (§ 369c ObZ) is added to euro claims only.
// The result is also written out as the {penalties} lines of the e-mail
// in the mail language.
import { lateInterest, add, round } from '@we-invoice/core';
import { printText } from '../../mail/templates.js';
import { formatMailAmount, formatMailDate } from '../../mail/placeholders.js';

export function isB2b(contact, document) {
  if (contact) return contact.kind !== 'PERSON';
  return Boolean(document.buyer && (document.buyer.ico || document.buyer.icDph));
}

/**
 * @returns {{interest: string, recoveryCost: string|null, days: number, ratePct: string, total: string}|null}
 *   null when the policy computes no interest or the ECB rate is missing
 */
export function penaltyFor(document, { policy, contact = null, today, amount }) {
  if (!policy.lateInterest || policy.ecbRatePct === null || policy.ecbRatePct === undefined || policy.ecbRatePct === '') return null;
  if (!document.dueDate || document.dueDate >= today) return null;
  try {
    const b2b = isB2b(contact, document);
    const r = lateInterest({ amount, dueDate: document.dueDate, until: today, b2b, ecbRatePct: String(policy.ecbRatePct), recoveryCost: Boolean(policy.recoveryCostFlat) && (document.currency || 'EUR') === 'EUR' });
    return { ...r, total: round(add(r.interest, r.recoveryCost || '0')) };
  } catch (e) {
    console.warn(`Late interest of ${document.id} cannot be computed`, e);
    return null;
  }
}

// The {penalties} lines of a reminder e-mail ("" when there is nothing).
export function penaltyText(penalty, { language, currency, today }) {
  if (!penalty) return '';
  const lines = [printText(language, 'mail.penalty.interest', { date: formatMailDate(today, language), amount: formatMailAmount(penalty.interest, currency, language) })];
  if (penalty.recoveryCost) lines.push(printText(language, 'mail.penalty.recovery', { amount: formatMailAmount(penalty.recoveryCost, currency, language) }));
  return `\n${lines.join('\n')}\n`;
}
