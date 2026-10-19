// The printed reminder ("Upomienka") of one client: a document of the kind
// REMINDER with a line for every unpaid invoice after its due date and the
// late interest (and the flat recovery cost) below, outside the scope of
// VAT. It is built on the fly for the PDF and not stored as a document,
// so it never appears among the issued documents or in VAT records.
import { contactSnapshot, companySnapshot, add, round, diffDays } from '@we-invoice/core';
import { printText } from '../../mail/templates.js';
import { formatMailDate } from '../../mail/placeholders.js';
import { penaltyFor } from './penalty.js';
import { documentAmounts } from '../contacts/model.js';

const line = (id, name, description, amount) => ({
  id, kind: 'ITEM', itemId: null, name, description, qty: '1', unit: { code: 'C62', label: '' }, unitPrice: amount, priceType: 'NET',
  discountPct: null, vatRate: null, vatCategory: 'O'
});

/**
 * @param {{contact: object|null, documents: object[], company: object, policy: object, today: string, language?: string}} input
 * @returns {object} a REMINDER document ready for buildPdf
 */
export function reminderDocument({ contact, documents, company, policy, today, language = null }) {
  const lang = language || contact?.language || company?.defaults?.language || 'sk';
  const currency = documents[0]?.currency || 'EUR';
  const lines = [];
  let interestTotal = '0';
  let recovery = '0';
  documents.filter(d => (d.currency || 'EUR') === currency).forEach((d, i) => {
    const { due } = documentAmounts(d);
    const days = Math.max(0, diffDays(d.dueDate, today));
    lines.push(line(`r${i + 1}`, `${printText(lang, `title.${d.kind}`)} ${d.number || ''}`.trim(),
      `${printText(lang, 'field.dueDate')}: ${formatMailDate(d.dueDate, lang)} (${days})`, due));
    const p = penaltyFor(d, { policy, contact, today, amount: due });
    if (p) {
      interestTotal = add(interestTotal, p.interest);
      if (p.recoveryCost) recovery = add(recovery, p.recoveryCost);
    }
  });
  if (round(interestTotal) !== '0.00') {
    lines.push(line('interest', printText(lang, 'mail.penalty.interest', { date: formatMailDate(today, lang), amount: '' }).replace(/:\s*$/, ''), '', round(interestTotal)));
  }
  if (round(recovery) !== '0.00') {
    lines.push(line('recovery', printText(lang, 'mail.penalty.recovery', { amount: '' }).replace(/:\s*$/, ''), '', round(recovery)));
  }
  return {
    id: `reminder-${contact?.id || 'buyer'}-${today}`,
    kind: 'REMINDER', status: 'ISSUED', number: `UP${today.replace(/-/g, '')}`, currency, language: lang,
    issueDate: today, dueDate: today, seller: companySnapshot(company),
    buyer: contact ? contactSnapshot(contact) : documents[0]?.buyer || { name: '' },
    contactId: contact?.id || null, lines, payments: [], sendLog: [], links: [], paymentMethod: 'TRANSFER',
    bankAccountId: documents[0]?.bankAccountId || null, vs: documents.length === 1 ? documents[0].vs || null : null,
    textIntro: printText(lang, 'mail.reminder.listTitle')
  };
}
