// A received proforma (zálohová faktúra) paid in advance and the invoice
// that later settles it. The money moved once, on the proforma; the
// invoice carries an ADVANCE_PAID link to the proforma whose amount counts
// as paid on the invoice, so both show as paid while the bank statement,
// the cash principle ledger and the reports still see one payment. The
// proforma itself is no tax document and no expense of its own.
//
// Which proforma an invoice settles is found by the supplier (IČO, DIČ,
// IČ DPH, else the name), the currency, and either the proforma number
// written on the invoice or the amount: the advance the invoice deducts
// (BT-113), or the whole invoice equal to the paid advance. When more than
// one proforma fits only by amount, none is chosen: a wrong pair is worse
// than a missing one, and the user can link it by hand.
import { add, sub, round, cmp, sum, isZero } from '../money/index.js';

export const ADVANCE_LINK = 'ADVANCE_PAID';
export const RECEIVED_PROFORMA = 'RECEIVED_PROFORMA';
const SETTLING_KINDS = ['RECEIVED_INVOICE'];
const CLOSED = ['DRAFT', 'CANCELLED', 'TO_PROCESS'];

const live = (d) => d && !d.deleted && !CLOSED.includes(d.status);
const digits = (s) => String(s || '').replace(/\D/g, '');
const compact = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const plainName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(s\s*\.?\s*r\s*\.?\s*o|a\s*\.?\s*s|spol|k\s*\.?\s*s|v\s*\.?\s*o\s*\.?\s*s)\b\.?/g, '').replace(/[^a-z0-9]/g, '');

/** The advance links of a document. */
export function advanceLinks(document) {
  return (document?.links || []).filter(l => l && l.kind === ADVANCE_LINK);
}

/** What paid advances cover on a document (the sum of its ADVANCE_PAID amounts). */
export function advanceSettled(document) {
  const links = advanceLinks(document);
  if (!links.length) return '0.00';
  return round(sum(links.map(l => l.amount || '0')), 2);
}

/** Money actually paid on a document: its own payments, without settled advances. */
export function ownPaid(document) {
  const payments = (document?.payments || []).filter(p => !p.deleted && (!p.currency || !document.currency || p.currency === document.currency));
  return payments.length ? round(sum(payments.map(p => p.amount)), 2) : '0.00';
}

/** The live invoices that settle a proforma. */
export function settlementsOf(proforma, documents) {
  return (documents || []).filter(d => live(d) && SETTLING_KINDS.includes(d.kind) && advanceLinks(d).some(l => l.docId === proforma.id));
}

/** True when a received proforma is settled by an invoice (vyúčtovaná). */
export function isSettledAdvance(proforma, documents) {
  return Boolean(proforma && proforma.kind === RECEIVED_PROFORMA && settlementsOf(proforma, documents).length);
}

/** True when two parties are the same supplier: a shared identifier, else the same name. */
export function sameSupplier(a, b) {
  if (!a || !b) return false;
  const ids = [['ico', digits], ['dic', digits], ['icDph', compact]];
  let compared = false;
  for (const [field, norm] of ids) {
    const x = norm(a[field]);
    const y = norm(b[field]);
    if (x && y) {
      if (x === y) return true;
      compared = true;
    }
  }
  if (compared) return false;
  const n = plainName(a.name);
  return Boolean(n) && n === plainName(b.name);
}

// Texts of an invoice where a supplier writes the number of the proforma.
function referenceTexts(invoice) {
  return [
    invoice.orderReference, invoice.contractReference, invoice.buyerReference, invoice.paymentReference,
    invoice.textIntro, invoice.textOutro, invoice.noteInternal,
    ...(invoice.lines || []).map(l => l && l.name)
  ].filter(Boolean).map(String);
}

function mentions(invoice, number) {
  const n = compact(number);
  if (n.length < 3) return false;
  return referenceTexts(invoice).some(t => {
    const text = compact(t);
    const at = text.indexOf(n);
    // A digit just before or after means a longer, different number.
    return at >= 0 && !/[0-9]/.test(text[at - 1] || '') && !/[0-9]/.test(text[at + n.length] || '');
  });
}

function grossOf(document) {
  const t = document.totals || {};
  return round(t.gross ?? t.payable ?? '0', 2);
}

/** What an invoice still owes before advances: payable less its own payments. */
function dueBeforeAdvances(invoice) {
  const payable = round(invoice.totals?.payable ?? '0', 2);
  return round(sub(payable, ownPaid(invoice)), 2);
}

function canSettle(invoice) {
  return live(invoice) && SETTLING_KINDS.includes(invoice.kind) && !advanceLinks(invoice).length;
}

function canBeSettled(proforma, documents) {
  return live(proforma) && proforma.kind === RECEIVED_PROFORMA && cmp(ownPaid(proforma), '0') > 0 && !settlementsOf(proforma, documents).length;
}

function fits(invoice, proforma) {
  if ((invoice.currency || 'EUR') !== (proforma.currency || 'EUR')) return false;
  if (!sameSupplier(invoice.seller, proforma.seller)) return false;
  if (invoice.issueDate && proforma.issueDate && invoice.issueDate < proforma.issueDate) return false;
  return true;
}

function byAmount(invoice, proforma) {
  const paid = ownPaid(proforma);
  const prepaid = round(invoice.totals?.prepaid ?? '0', 2);
  return (!isZero(prepaid) && cmp(prepaid, paid) === 0) || cmp(grossOf(invoice), paid) === 0;
}

/** The ADVANCE_PAID amount for a pair: what the advance covers of what the invoice still owes. */
export function settlementAmount(invoice, proforma) {
  const due = dueBeforeAdvances(invoice);
  if (cmp(due, '0') <= 0) return '0.00';
  const paid = ownPaid(proforma);
  return cmp(paid, due) < 0 ? paid : due;
}

/**
 * The paid proforma an invoice settles, or null.
 * @returns {{proforma: object, amount: string, by: 'NUMBER'|'AMOUNT'}|null}
 */
export function findAdvanceFor(invoice, documents) {
  if (!canSettle(invoice)) return null;
  const open = (documents || []).filter(d => d.id !== invoice.id && canBeSettled(d, documents) && fits(invoice, d));
  const named = open.filter(p => p.number && mentions(invoice, p.number));
  if (named.length === 1) return { proforma: named[0], amount: settlementAmount(invoice, named[0]), by: 'NUMBER' };
  if (named.length > 1) return null;
  const sized = open.filter(p => byAmount(invoice, p));
  return sized.length === 1 ? { proforma: sized[0], amount: settlementAmount(invoice, sized[0]), by: 'AMOUNT' } : null;
}

/**
 * The invoice that settles a paid proforma, for a proforma recorded or paid
 * after its invoice came, or null. Same rules, seen from the proforma.
 * @returns {{invoice: object, amount: string, by: 'NUMBER'|'AMOUNT'}|null}
 */
export function findInvoiceFor(proforma, documents) {
  if (!canBeSettled(proforma, documents)) return null;
  const open = (documents || []).filter(d => d.id !== proforma.id && canSettle(d) && fits(d, proforma));
  const named = open.filter(i => proforma.number && mentions(i, proforma.number));
  if (named.length === 1) return { invoice: named[0], amount: settlementAmount(named[0], proforma), by: 'NUMBER' };
  if (named.length > 1) return null;
  const sized = open.filter(i => byAmount(i, proforma) && !findOtherFit(i, proforma, documents));
  return sized.length === 1 ? { invoice: sized[0], amount: settlementAmount(sized[0], proforma), by: 'AMOUNT' } : null;
}

// Another proforma that fits the invoice just as well makes the pair unsure.
function findOtherFit(invoice, proforma, documents) {
  return (documents || []).some(d => d.id !== proforma.id && d.id !== invoice.id && canBeSettled(d, documents) && fits(invoice, d) && byAmount(invoice, d));
}

/** Proformas a user may link to an invoice by hand: paid, unsettled, same supplier and currency. */
export function advanceChoicesFor(invoice, documents) {
  if (!canSettle(invoice)) return [];
  return (documents || []).filter(d => d.id !== invoice.id && canBeSettled(d, documents)
    && (invoice.currency || 'EUR') === (d.currency || 'EUR') && sameSupplier(invoice.seller, d.seller));
}

/** The invoice with the proforma linked as settled by the given amount. */
export function withAdvance(invoice, proforma, amount = settlementAmount(invoice, proforma)) {
  const links = (invoice.links || []).filter(l => !(l.kind === ADVANCE_LINK && l.docId === proforma.id));
  return { ...invoice, links: [...links, { kind: ADVANCE_LINK, docId: proforma.id, amount: round(amount, 2) }] };
}

/** The invoice without its link to the proforma. */
export function withoutAdvance(invoice, proformaId) {
  return { ...invoice, links: (invoice.links || []).filter(l => !(l.kind === ADVANCE_LINK && l.docId === proformaId)) };
}

/** Sum of the own payments and settled advances (what paidAmount reports). */
export function paidWithAdvances(document) {
  return round(add(ownPaid(document), advanceSettled(document)), 2);
}
