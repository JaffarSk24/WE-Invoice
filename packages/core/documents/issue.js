// Issuing a document ("Vystaviť"): the particulars are checked, the number
// and variable symbol are assigned from the series, the seller and buyer
// details are frozen as snapshots, the totals are computed and stored,
// and the status moves from DRAFT to ISSUED. The series counter to store
// comes back with the document; nothing is mutated. The print language is
// the one chosen on the document, else the client's, else the company's
// default, else Slovak.
import { CoreError } from '../errors.js';
import { nextNumber } from '../numbering/index.js';
import { computeTotals } from '../vat/index.js';
import { addDays, localDate, isDate } from './dates.js';
import { companySnapshot, contactSnapshot } from './snapshots.js';
import { missingParticulars } from './particulars.js';
import { isTaxDocument, canTransition } from './kinds.js';

const DEFAULT_DUE_DAYS = 14;

/**
 * @param {import('../schema/types.js').Document} document  a draft
 * @param {{
 *   company: import('../schema/types.js').Company,
 *   contact?: import('../schema/types.js').Contact|null,
 *   series: import('../schema/types.js').Series,
 *   taken?: Iterable<string>,
 *   now?: string,
 *   today?: string,
 *   cashRounding?: boolean,
 *   force?: boolean
 * }} ctx  taken: numbers already used in the series; force: issue despite missing particulars (never for tax documents)
 * @returns {{document: import('../schema/types.js').Document, series: import('../schema/types.js').Series}}
 *   the issued document and the series with its counter advanced
 */
export function issueDocument(document, ctx) {
  const { company, contact, series } = ctx || {};
  if (!company || !series) throw new CoreError('ISSUE_CONTEXT_REQUIRED', 'issueDocument needs the company and the series');
  if (series.kind !== document.kind) throw new CoreError('SERIES_KIND_MISMATCH', `series ${series.id} is for ${series.kind}, not ${document.kind}`);
  if (!canTransition(document.kind, document.status || 'DRAFT', 'ISSUED')) {
    throw new CoreError('STATUS_TRANSITION_INVALID', `${document.kind} in ${document.status} cannot be issued`);
  }
  const now = ctx.now || new Date().toISOString();
  const today = ctx.today || localDate(now);

  const issued = structuredClone(document);
  issued.issueDate = isDate(issued.issueDate) ? issued.issueDate : today;
  if (isTaxDocument(issued.kind) && !isDate(issued.taxDate)) issued.taxDate = issued.issueDate;
  if (!isDate(issued.dueDate)) {
    const days = contact?.dueDays ?? company.defaults?.dueDays ?? DEFAULT_DUE_DAYS;
    issued.dueDate = addDays(issued.issueDate, days);
  }
  if (!issued.seller || !issued.seller.name) issued.seller = companySnapshot(company);
  if (contact && (!issued.buyer || !issued.buyer.name)) issued.buyer = contactSnapshot(contact);
  if (contact && !issued.contactId) issued.contactId = contact.id ?? null;
  if (!issued.currency) issued.currency = company.defaults?.currency || 'EUR';
  if (!issued.language) issued.language = contact?.language || company.defaults?.language || 'sk';

  const missing = missingParticulars(issued, company, issued.issueDate);
  if (missing.length && (isTaxDocument(issued.kind) || !ctx.force)) {
    throw new CoreError('DOCUMENT_INCOMPLETE', `missing particulars: ${missing.map(m => m.code).join(', ')}`, { missing });
  }

  const next = nextNumber(series, { date: issued.issueDate, taken: ctx.taken });
  issued.seriesId = series.id;
  issued.number = next.number;
  issued.vs = issued.vs || next.vs;
  issued.totals = computeTotals(issued, { cashRounding: ctx.cashRounding ?? (issued.paymentMethod === 'CASH' && Boolean(company.defaults?.roundingCash)) });
  issued.status = 'ISSUED';
  issued.updatedAt = now;

  const counters = { ...(series.counters || {}), [next.counterKey]: next.nextCounter };
  return { document: issued, series: { ...series, counters } };
}
