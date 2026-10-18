// Who gets a payment reminder today (03-features.md § 3.10), as pure
// functions. The company policy says when: N days before the due date
// (pripomienka), then up to three levels N, M and K days after it, from a
// minimum amount, never at the weekend if so set. A contact can be left
// out ("posielať upomienky" off). What was already sent is read from the
// document's send log, so a level goes out once, also across devices, and
// a level that was skipped while the app was closed is overtaken by the
// higher one. "Today" is the local date and comes from the caller.
import { cmp, diffDays, isDate, paymentState, addDays } from '@we-invoice/core';
import { documentAmounts } from '../contacts/model.js';

export function defaultPolicy() {
  return {
    enabled: true, beforeDueDays: 3, levels: [{ afterDays: 7, templateId: null }, { afterDays: 21, templateId: null }, { afterDays: 35, templateId: null }],
    minAmount: '5', skipWeekends: true, includeProformas: false, lateInterest: true, recoveryCostFlat: false, thankYou: false,
    autoSend: false, ecbRatePct: null
  };
}

// The policy record of the company merged over the defaults.
export function effectivePolicy(records) {
  const record = (records || []).find(r => !r.deleted) || null;
  return { ...defaultPolicy(), ...(record || {}), levels: (record && Array.isArray(record.levels) ? record.levels : defaultPolicy().levels).slice(0, 3) };
}

export function isWeekend(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

const SENT = new Set(['SENT', 'CLIENT_OPENED']);

// Purposes already sent for a document (REMINDER_0..3, THANK_YOU).
export function sentPurposes(document) {
  return new Set((document.sendLog || []).filter(e => SENT.has(e.result) && e.detail).map(e => e.detail));
}

const dueOf = (document) => documentAmounts(document).due;

// True for an issued document a reminder may be about.
export function remindable(document, policy) {
  const kinds = policy.includeProformas ? ['INVOICE', 'PROFORMA'] : ['INVOICE'];
  return kinds.includes(document.kind) && !document.deleted && !['DRAFT', 'CANCELLED', 'PAID', 'OVERPAID'].includes(document.status) && isDate(document.dueDate);
}

/**
 * The reminder a document needs today, or null.
 * @returns {{purpose: string, level: number, days: number, amountDue: string}|null}
 */
export function dueReminder(document, { policy, contact = null, today }) {
  if (!policy.enabled || !remindable(document, policy)) return null;
  if (contact && contact.sendReminders === false) return null;
  const due = dueOf(document);
  if (cmp(due, '0') <= 0) return null;
  if (policy.minAmount && cmp(due, policy.minAmount) < 0) return null;
  const days = diffDays(document.dueDate, today);
  const sent = sentPurposes(document);
  if (days < 0) {
    if (policy.beforeDueDays === null || policy.beforeDueDays === undefined || -days > policy.beforeDueDays || sent.has('REMINDER_0')) return null;
    return { purpose: 'REMINDER_0', level: 0, days, amountDue: due };
  }
  let reached = 0;
  (policy.levels || []).forEach((level, i) => { if (days >= Number(level.afterDays) && days > 0) reached = i + 1; });
  if (!reached) return null;
  for (let i = reached; i <= 3; i++) if (sent.has(`REMINDER_${i}`)) return null;
  return { purpose: `REMINDER_${reached}`, level: reached, days, amountDue: due };
}

/**
 * Every reminder to send today, oldest due date first. Nothing at the
 * weekend when the policy says so.
 * @returns {Array<{document: object, contact: object|null, purpose: string, level: number, days: number, amountDue: string}>}
 */
export function remindersDue({ documents, contacts, policy, today }) {
  if (!policy.enabled || (policy.skipWeekends && isWeekend(today))) return [];
  const byId = new Map((contacts || []).map(c => [c.id, c]));
  return (documents || [])
    .map(document => {
      const contact = byId.get(document.contactId) || null;
      const hit = dueReminder(document, { policy, contact, today });
      return hit ? { document, contact, ...hit } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.document.dueDate.localeCompare(b.document.dueDate));
}

// Unpaid documents after their due date, for the overview, by client.
export function overdueByContact({ documents, contacts, policy, today }) {
  const byId = new Map((contacts || []).map(c => [c.id, c]));
  const groups = new Map();
  (documents || []).filter(d => remindable(d, { ...policy, includeProformas: true }) && d.dueDate < today && cmp(dueOf(d), '0') > 0).forEach(d => {
    const key = d.contactId || `buyer:${d.buyer?.name || ''}`;
    if (!groups.has(key)) groups.set(key, { contact: byId.get(d.contactId) || null, name: byId.get(d.contactId)?.name || d.buyer?.name || '', documents: [] });
    groups.get(key).documents.push(d);
  });
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'sk'));
}

// Paid documents that should get a thank-you note: paid within the last
// two weeks, never thanked, the client not excluded.
export function thankYouDue({ documents, contacts, policy, today }) {
  if (!policy.thankYou) return [];
  const byId = new Map((contacts || []).map(c => [c.id, c]));
  const since = addDays(today, -14);
  return (documents || []).filter(d => {
    if (d.deleted || !['INVOICE', 'PROFORMA'].includes(d.kind) || d.status === 'CANCELLED') return false;
    const contact = byId.get(d.contactId);
    if (contact && contact.sendReminders === false) return false;
    if (sentPurposes(d).has('THANK_YOU')) return false;
    let state;
    try { state = paymentState(d); } catch (e) { return false; }
    if (state !== 'PAID' && state !== 'OVERPAID') return false;
    const last = (d.payments || []).filter(p => !p.deleted).map(p => p.date).sort().pop();
    return Boolean(last) && last >= since && last <= today;
  }).map(d => ({ document: d, contact: byId.get(d.contactId) || null, purpose: 'THANK_YOU' }));
}
