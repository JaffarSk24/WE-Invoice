// Unpaid invoices after their due date, by client, on the reminders
// screen: the amount due and the interest so far, a reminder for any one
// invoice, and the printed reminder ("Upomienka") of the client with all
// of them, downloaded as PDF.
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { emit } from '../../events.js';
import { formatDate } from '../../components/dates.js';
import { formatAmount, sum } from '../../components/decimal.js';
import { showError } from '../../ui/toast.js';
import { diffDays } from '@we-invoice/core';
import { documentAmounts } from '../contacts/model.js';
import { overdueByContact, sentPurposes } from './plan.js';
import { penaltyFor, penaltyText } from './penalty.js';
import { reminderDocument } from './document.js';
import { documentLanguage } from '../../mail/compose.js';

// The next level for a manual reminder: one above the highest sent.
export function nextPurpose(document) {
  const sent = sentPurposes(document);
  for (let i = 1; i <= 3; i++) if (!sent.has(`REMINDER_${i}`)) return `REMINDER_${i}`;
  return 'REMINDER_3';
}

export async function downloadReminderPdf({ group, company, policy, today, transport }) {
  try {
    const doc = reminderDocument({ contact: group.contact, documents: group.documents, company, policy, today });
    const pdf = await import('../../pdf/index.js');
    const blob = await pdf.buildPdf(doc, company, { allowIncomplete: true, qr: false });
    await transport.files.saveAs(pdf.pdfFileNameFor(doc, company), blob);
  } catch (e) {
    showError(e, 'errors.PDF_RENDER_FAILED');
  }
}

function row(d, { contact, policy, company, today, readOnly }) {
  const { due } = documentAmounts(d);
  const days = diffDays(d.dueDate, today);
  const p = penaltyFor(d, { policy, contact, today, amount: due });
  const purpose = nextPurpose(d);
  const penalties = penaltyText(p, { language: documentLanguage(d, contact, company), currency: d.currency || 'EUR', today });
  return h('div', { class: 'reminder-row' },
    h('div', { class: 'reminder-main' },
      h('span', {}, t(`crm.kind.${d.kind}`), ' ', h('strong', {}, d.number || '')),
      h('span', { class: 'reminder-meta' }, t('reminders.dueOn', { date: formatDate(d.dueDate), days }), p ? ` · ${t('reminders.interest', { amount: formatAmount(p.total, d.currency || 'EUR') })}` : '')),
    h('strong', { class: 'num' }, formatAmount(due, d.currency || 'EUR')),
    h('div', { class: 'reminder-actions' },
      h('button', { type: 'button', class: 'btn btn-sm', disabled: readOnly, onclick: () => emit('document:send', { documentId: d.id, purpose, penalties }) }, icon('send'), t(`mail.purpose.${purpose}`))));
}

export function overdueBlock({ documents, contacts, policy, company, today, transport, readOnly }) {
  const groups = overdueByContact({ documents, contacts, policy, today });
  if (!groups.length) return h('p', { class: 'muted' }, t('reminders.overdue.none'));
  return h('div', { class: 'reminder-groups' }, groups.map(group => {
    const currency = group.documents[0].currency || 'EUR';
    const total = sum(group.documents.filter(d => (d.currency || 'EUR') === currency).map(d => documentAmounts(d).due));
    return h('section', { class: 'card reminder-group' },
      h('h2', {}, h('span', {}, group.name, ' ', h('span', { class: 'muted small' }, formatAmount(total, currency))),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => downloadReminderPdf({ group, company, policy, today, transport }) }, icon('download'), t('reminders.pdf'))),
      group.documents.map(d => row(d, { contact: group.contact, policy, company, today, readOnly })));
  }));
}
