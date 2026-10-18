// Kniha pohľadávok and kniha záväzkov: documents not yet settled on a day,
// with what was paid by then. The tax records of § 6 ods. 11 ZDP and the
// výkaz o majetku a záväzkoch both read the state at 31 December. Payments
// after the day do not count, so a past year can be reprinted unchanged.
import { sub, div, round, cmp, sum, isZero } from '../money/index.js';
import { computeTotals } from '../vat/index.js';
import { diffDays } from '../documents/dates.js';

const RECEIVABLE_KINDS = ['INVOICE', 'DEBIT_NOTE', 'CREDIT_NOTE', 'SELF_BILLING'];
const PAYABLE_KINDS = ['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT'];
const SKIPPED = ['DRAFT', 'CANCELLED'];

const live = (r) => r && !r.deleted;

function eur(amount, document) {
  if (!document.currency || document.currency === 'EUR' || !document.fxRate) return round(amount, 2);
  return round(div(amount, document.fxRate, 10), 2);
}

function bookRow(document, date, party) {
  const total = round(document.totals?.payable ?? computeTotals(document).payable, 2);
  const paid = round(sum((document.payments || []).filter(p => live(p) && p.date <= date).map(p => p.amount)), 2);
  const outstanding = round(sub(total, paid), 2);
  const overdueDays = document.dueDate && document.dueDate < date && cmp(outstanding, '0') > 0 ? diffDays(document.dueDate, date) : 0;
  return {
    docId: document.id,
    kind: document.kind,
    number: document.number || null,
    party: party?.name || null,
    issueDate: document.issueDate || document.receivedDate || null,
    dueDate: document.dueDate || null,
    currency: document.currency || 'EUR',
    total,
    paid,
    outstanding,
    outstandingEur: eur(outstanding, document),
    fxMissing: Boolean(document.currency && document.currency !== 'EUR' && !document.fxRate),
    overdueDays
  };
}

function book(documents, date, kinds, partyOf, dateOf) {
  const rows = (documents || [])
    .filter(d => live(d) && kinds.includes(d.kind) && !SKIPPED.includes(d.status))
    .filter(d => { const day = dateOf(d); return day && day <= date; })
    .map(d => bookRow(d, date, partyOf(d)))
    .filter(r => !isZero(r.outstanding))
    .sort((a, b) => String(a.issueDate).localeCompare(String(b.issueDate)) || String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }));
  return { date, rows, total: round(sum(rows.map(r => r.outstandingEur)), 2) };
}

/** Kniha pohľadávok: issued documents still unpaid on the day. */
export function receivablesBook(documents, date) {
  return book(documents, date, RECEIVABLE_KINDS, d => d.buyer, d => d.issueDate);
}

/** Kniha záväzkov: received documents still unpaid on the day. */
export function payablesBook(documents, date) {
  return book(documents, date, PAYABLE_KINDS, d => d.seller, d => d.receivedDate || d.issueDate);
}
