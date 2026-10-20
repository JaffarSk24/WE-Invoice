// Conversions between document kinds (03-features.md § 3.6): a quote to a
// proforma, invoice or order; a proforma to the tax document for the
// received payment or to the final invoice with the advance deducted; an
// invoice to a credit note, debit note or delivery note. The result is a
// new draft linked to its source; the source is never changed here.
import { CoreError } from '../errors.js';
import { uuidv7 } from '../ids/uuid.js';
import { add, sub, mul, div, round, cmp, isZero, sum } from '../money/index.js';
import { computeTotals } from '../vat/index.js';
import { paidAmount } from '../payments/index.js';
import { localDate } from './dates.js';

// target kind -> link kind written on the new document
const CONVERSIONS = Object.freeze({
  QUOTE: { PROFORMA: 'FROM_QUOTE', INVOICE: 'FROM_QUOTE', ORDER_IN: 'FROM_QUOTE' },
  PROFORMA: { ADVANCE_TAX_DOC: 'FROM_PROFORMA', INVOICE: 'FROM_PROFORMA' },
  ADVANCE_TAX_DOC: { INVOICE: 'ADVANCE_DEDUCTION' },
  ORDER_IN: { INVOICE: 'FROM_ORDER', DELIVERY_NOTE: 'FROM_ORDER' },
  INVOICE: { CREDIT_NOTE: 'CORRECTS', DEBIT_NOTE: 'CORRECTS', DELIVERY_NOTE: 'DELIVERY_FOR' }
});

const COPIED = [
  'currency', 'fxRate', 'fxRateDate', 'fxSource', 'seller', 'buyer', 'contactId', 'docDiscount', 'paymentMethod',
  'bankAccountId', 'paymentLink', 'buyerReference', 'orderReference', 'contractReference', 'textIntro', 'textOutro',
  'language', 'secondLanguage', 'template', 'tags', 'projectRef', 'deliveryDate', 'periodFrom', 'periodTo'
];

/** Targets a kind may be converted to. @returns {string[]} */
export function conversionTargets(kind) {
  return Object.keys(CONVERSIONS[kind] || {});
}

/**
 * New draft of another kind from a document, with links set.
 * @param {import('../schema/types.js').Document} document  the source
 * @param {string} targetKind
 * @param {{id?: string, now?: string, today?: string, reason?: string, amount?: string, lines?: Array, lineName?: string, paymentDate?: string}} [ctx]
 *   reason: correction reason (required for credit and debit notes);
 *   amount: advance received or to deduct (defaults to what was paid);
 *   lines: replacement lines (partial credit note); lineName: name of the
 *   generated line of a partial advance tax document.
 * @returns {import('../schema/types.js').Document}
 */
export function convertDocument(document, targetKind, ctx = {}) {
  const linkKind = CONVERSIONS[document.kind]?.[targetKind];
  if (!linkKind) throw new CoreError('CONVERSION_NOT_ALLOWED', `${document.kind} cannot become ${targetKind}`);
  const now = ctx.now || new Date().toISOString();
  const today = ctx.today || localDate(now);
  const draft = {
    id: ctx.id || uuidv7(),
    createdAt: now,
    updatedAt: now,
    kind: targetKind,
    status: 'DRAFT',
    seriesId: null,
    number: null,
    vs: null,
    ks: document.ks ?? null,
    ss: document.ss ?? null,
    issueDate: today,
    taxDate: null,
    dueDate: null,
    validUntil: null,
    rounding: null,
    totals: null,
    lines: copyLines(ctx.lines || document.lines || []),
    links: [{ kind: linkKind, docId: document.id }],
    payments: [],
    peppol: null,
    pdfFileId: null,
    attachments: [],
    sendLog: [],
    exportedAt: null,
    lockedAt: null,
    correctionReason: null,
    classified: Boolean(document.classified),
    noteInternal: null
  };
  for (const field of COPIED) if (document[field] !== undefined) draft[field] = structuredClone(document[field]);

  if (targetKind === 'CREDIT_NOTE' || targetKind === 'DEBIT_NOTE') {
    if (!ctx.reason || !String(ctx.reason).trim()) throw new CoreError('CORRECTION_REASON_REQUIRED', 'a correction needs its reason');
    draft.correctionReason = String(ctx.reason).trim();
  }
  if (targetKind === 'ADVANCE_TAX_DOC') advanceTaxDocument(draft, document, ctx);
  if (targetKind === 'INVOICE' && (document.kind === 'PROFORMA' || document.kind === 'ADVANCE_TAX_DOC')) {
    const amount = ctx.amount ?? (document.kind === 'PROFORMA' ? paidAmount(document) : totalsOf(document).gross);
    if (document.kind === 'ADVANCE_TAX_DOC') draft.links[0].amount = round(amount, 2);
    else if (!isZero(amount)) draft.links.push({ kind: 'ADVANCE_DEDUCTION', docId: document.id, amount: round(amount, 2) });
  }
  if (targetKind === 'DELIVERY_NOTE') {
    draft.lines = draft.lines.filter(l => !l.kind || l.kind !== 'SUBTOTAL');
    draft.docDiscount = null;
  }
  return draft;
}

function totalsOf(document) {
  return document.totals || computeTotals(document);
}

function copyLines(lines) {
  return lines.map(line => ({ ...structuredClone(line), id: uuidv7() }));
}

// The tax document for a received payment covers what was actually paid.
// For a full payment the proforma lines are copied; for a partial one a
// line per VAT group carries the paid share with VAT included.
function advanceTaxDocument(draft, proforma, ctx) {
  const totals = totalsOf(proforma);
  const amount = round(ctx.amount ?? paidAmount(proforma), 2);
  draft.taxDate = ctx.paymentDate || draft.issueDate;
  draft.dueDate = draft.issueDate;
  draft.links[0].amount = amount;
  if (isZero(amount)) throw new CoreError('ADVANCE_NOT_PAID', 'nothing has been paid on the proforma');
  if (cmp(amount, totals.gross) === 0) return;
  const groups = totals.breakdown.map(b => ({ ...b, gross: add(b.base, b.vat) }));
  const totalGross = sum(groups.map(g => g.gross));
  if (isZero(totalGross)) throw new CoreError('ADVANCE_NOT_PAID', 'the proforma has no amount to split');
  let allocated = '0';
  let largest = groups[0];
  for (const g of groups) {
    g.share = round(div(mul(amount, g.gross), totalGross, 10), 2);
    allocated = add(allocated, g.share);
    if (cmp(g.gross, largest.gross) > 0) largest = g;
  }
  largest.share = round(add(largest.share, sub(amount, allocated)), 2);
  const sourceLines = (proforma.lines || []).filter(l => !l.kind || l.kind === 'ITEM');
  draft.lines = groups.filter(g => !isZero(g.share)).map(g => {
    const first = sourceLines.find(l => l.vatCategory === g.category) || sourceLines[0] || {};
    return {
      id: uuidv7(),
      kind: 'ITEM',
      itemId: null,
      name: ctx.lineName || first.name || '',
      description: '',
      qty: '1',
      unit: first.unit ? structuredClone(first.unit) : { code: 'C62', label: '' },
      unitPrice: g.share,
      baseQty: null,
      priceType: 'GROSS',
      discountPct: null,
      vatRate: g.rate,
      vatCategory: g.category,
      exemptionReasonCode: g.exemptionReasonCode ?? null,
      exemptionReasonText: g.exemptionReasonText ?? null
    };
  });
  draft.docDiscount = null;
}
