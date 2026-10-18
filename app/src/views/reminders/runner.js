// Sending the reminders and thank-you notes that are due: by hand from the
// reminders screen, or automatically (policy "send automatically") when
// the desktop scheduler wakes the page or the app starts, which needs an
// SMTP account. Without one nothing is sent behind the user's back: the
// user is told how many reminders wait. Each sending is logged on the
// document, so a level never goes out twice.
import { emailsFor } from '../contacts/model.js';
import { remindersDue, thankYouDue, effectivePolicy } from './plan.js';
import { penaltyFor, penaltyText } from './penalty.js';
import { documentLanguage } from '../../mail/compose.js';

// The reminders and thank-you notes of today for a store.
export function todaysWork(store, today) {
  const policy = effectivePolicy(store.list('reminderPolicies'));
  const input = { documents: store.list('documents'), contacts: store.list('contacts'), policy, today };
  return { policy, reminders: remindersDue(input), thanks: thankYouDue(input) };
}

// The {penalties} text of one reminder.
export function penaltiesOf(entry, { policy, company, today }) {
  if (entry.purpose === 'REMINDER_0' || entry.purpose === 'THANK_YOU') return '';
  const p = penaltyFor(entry.document, { policy, contact: entry.contact, today, amount: entry.amountDue });
  return penaltyText(p, { language: documentLanguage(entry.document, entry.contact, company), currency: entry.document.currency || 'EUR', today });
}

const reachable = (entry) => Boolean((entry.contact && emailsFor(entry.contact, 'REMINDER').length) || entry.document.buyer?.email);

/**
 * @param {{store: object, today: string, send: (input: object) => Promise<object|null>, force?: boolean}} input
 *   send({ store, document, purpose, penalties }) resolves to the log entry or null
 *   force: send even when the policy does not send automatically (the "send all" button)
 * @returns {Promise<{sent: number, waiting: number, failed: number, unreachable: number}>}
 */
export async function sendDueReminders({ store, today, send, force = false }) {
  const out = { sent: 0, waiting: 0, failed: 0, unreachable: 0 };
  if (!store || !store.company() || store.readOnly) return out;
  const { policy, reminders, thanks } = todaysWork(store, today);
  const work = [...reminders, ...thanks];
  if (!force && !policy.autoSend) { out.waiting = work.length; return out; }
  const company = store.company();
  for (const entry of work) {
    if (!reachable(entry)) { out.unreachable += 1; continue; }
    try {
      const logged = await send({ store, document: entry.document, purpose: entry.purpose, penalties: penaltiesOf(entry, { policy, company, today }) });
      if (logged && logged.result === 'SENT') out.sent += 1; else out.waiting += 1;
    } catch (e) {
      console.error('A reminder could not be sent', e);
      out.failed += 1;
    }
  }
  return out;
}
