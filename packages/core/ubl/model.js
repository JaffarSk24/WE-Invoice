// Everything a UBL document needs, gathered once from the document, the
// company and the options, so that the builder only writes and the local
// validation only checks. Amounts come from computeTotals() and are never
// recomputed here (04-peppol.md § 4.4). Two sign conventions are adapted:
// a credit note stored with negative amounts is written as a CreditNote
// with positive ones, and a line with a negative unit price is written with
// a positive price and a negative quantity (BR-27 forbids negative prices).
import { computeTotals } from '../vat/index.js';
import { getLegislation } from '../legislation/index.js';
import { isNegative, neg, abs } from '../money/index.js';
import { localDate } from '../documents/dates.js';
import { TYPE_CODES, CREDIT_NOTE_CODES } from './codes.js';
import { sellerOf, buyerOf, endpointOf } from './parties.js';
import { splitAttachments, attachmentIds } from './attachments.js';
import skRules from './sk-rules.json' with { type: 'json' };

const negate = (value) => (value === null || value === undefined || value === '' ? value : neg(value));

// A credit note keeps its meaning but is written with positive amounts.
function positiveCreditNote(document, totalsOptions) {
  const totals = computeTotals(document, totalsOptions);
  if (!isNegative(totals.gross) && !isNegative(totals.net)) return { document, totals };
  const flipped = {
    ...document,
    lines: (document.lines || []).map(l => (!l.kind || l.kind === 'ITEM' ? { ...l, qty: negate(l.qty) } : l)),
    docDiscount: document.docDiscount ? { ...document.docDiscount, amount: negate(document.docDiscount.amount) } : document.docDiscount,
    rounding: negate(document.rounding),
    links: (document.links || []).map(l => (l.amount ? { ...l, amount: negate(l.amount) } : l))
  };
  return { document: flipped, totals: computeTotals(flipped, totalsOptions) };
}

function legalText(key, date) {
  try {
    return getLegislation(`texts.${key}.sk`, date);
  } catch (error) {
    console.warn('ubl: legal text not available', key, error.code);
    return null;
  }
}

function defaultReason(category, date) {
  try {
    const list = getLegislation(`exemptionReasons.byCategory.${category}`, date);
    return list?.[0] ? { code: list[0].code, text: list[0].law } : null;
  } catch (error) {
    console.warn('ubl: no default exemption reason', category, error.code);
    return null;
  }
}

/**
 * @param {object} document
 * @param {object} company
 * @param {{contact?: object, preceding?: Array<{number: string, issueDate?: string}>, pdf?: {base64: string, name?: string},
 *   attachments?: Array<{name: string, mime?: string, base64: string, description?: string}>,
 *   attachPdf?: boolean, maxAttachmentBytes?: number, maxMessageBytes?: number, note?: string, prepaid?: string, cashRounding?: boolean}} options
 *   prepaid and cashRounding are passed to computeTotals (BT-113, BT-114); attachments are the
 *   user's files, embedded next to the PDF when their type is in the Peppol MIME code list
 */
export function ublModel(document, company = {}, options = {}) {
  const typeCode = TYPE_CODES[document.kind] || null;
  const creditNote = CREDIT_NOTE_CODES.includes(typeCode);
  const totalsOptions = { prepaid: options.prepaid, cashRounding: options.cashRounding };
  const { document: doc, totals } = creditNote ? positiveCreditNote(document, totalsOptions) : { document, totals: computeTotals(document, totalsOptions) };
  const date = doc.taxDate || doc.issueDate || localDate();
  const seller = sellerOf(doc, company);
  const buyer = buyerOf(doc, options.contact);
  const categories = new Set(totals.breakdown.map(b => b.category));
  const onlyNotSubject = categories.size > 0 && [...categories].every(c => c === 'O');

  const defaulted = [];
  const breakdown = totals.breakdown.map(b => {
    if (skRules.exemptionReasonForbidden.includes(b.category)) return { ...b, exemptionReasonCode: null, exemptionReasonText: null };
    if (!skRules.exemptionReasonRequired.includes(b.category) || b.exemptionReasonCode || b.exemptionReasonText) return b;
    const reason = defaultReason(b.category, date);
    defaulted.push(b.category);
    return { ...b, exemptionReasonCode: reason?.code || null, exemptionReasonText: reason?.text || null };
  });

  const notes = [];
  if (options.note) notes.push(options.note);
  // noLegalNotes: the note is given whole (writing again what was read), nothing is added.
  if (!options.noLegalNotes) {
    if ((creditNote || doc.kind === 'DEBIT_NOTE') && doc.correctionReason) notes.push(doc.correctionReason);
    if (categories.has('AE')) notes.push(legalText('reverseCharge', date));
    if (company.cashBasis) notes.push(legalText('cashBasis', date));
    if (doc.kind === 'SELF_BILLING') notes.push(legalText('selfBilling', date));
  }

  const pdfBytes = options.pdf?.base64 ? Math.floor(options.pdf.base64.length * 3 / 4) : 0;
  const attachWanted = options.attachPdf ?? company.defaults?.attachPdfToEInvoice ?? true;
  const pdfTooLarge = Boolean(options.maxAttachmentBytes && pdfBytes > options.maxAttachmentBytes);

  const pdf = attachWanted && options.pdf?.base64 && !pdfTooLarge ? options.pdf : null;
  const { embeddable, skipped } = splitAttachments((options.attachments || []).filter(a => a && a.base64));
  const ids = attachmentIds(doc.number, embeddable.length, pdf ? [doc.number] : []);
  const files = embeddable.map((a, i) => ({ id: ids[i], name: a.name, mime: a.mime, base64: a.base64, description: a.description || null }));

  const lines = totals.lines.map((amounts, i) => {
    const source = (doc.lines || []).filter(l => !l.kind || l.kind === 'ITEM')[i];
    const negativePrice = isNegative(amounts.unitNet);
    return {
      index: i + 1,
      source,
      amounts,
      qty: negativePrice ? neg(source.qty) : source.qty,
      price: abs(amounts.unitNet)
    };
  });

  return {
    document: doc,
    company,
    typeCode,
    root: creditNote ? 'CreditNote' : 'Invoice',
    creditNote,
    currency: doc.currency || 'EUR',
    totals: { ...totals, breakdown },
    lines,
    seller,
    buyer,
    sellerEndpoint: endpointOf(seller, { preferDic: true }),
    buyerEndpoint: endpointOf(buyer),
    categories,
    vatIds: !onlyNotSubject,
    defaultedReasons: defaulted,
    note: notes.filter(Boolean).join('\n'),
    preceding: (options.preceding || []).filter(p => p && p.number),
    pdf,
    pdfTooLarge: attachWanted && pdfTooLarge,
    attachments: files,
    skippedAttachments: skipped.map(a => a.name),
    bankAccount: bankAccountOf(doc, company)
  };
}

function bankAccountOf(document, company) {
  if (document.paymentAccount?.iban) return document.paymentAccount;
  const accounts = company.bankAccounts || [];
  return accounts.find(a => a.id === document.bankAccountId) || accounts.find(a => a.isDefault && a.currency === document.currency)
    || accounts.find(a => a.isDefault) || accounts[0] || null;
}
