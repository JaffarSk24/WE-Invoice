// A recognition becomes a draft received document: kind, status "Na
// spracovanie", the supplier snapshot, lines, totals as printed by the
// supplier and the Inbox details (where each field came from). The draft
// is what the review form edits and what goes into the documents
// collection.
import { uuidv7 } from '../../ids/index.js';
import { computeTotals } from '../../vat/index.js';
import { companySnapshot } from '../../documents/snapshots.js';
import { round } from '../../money/index.js';
import { deductionPeriod } from './vat-deduction.js';

const digits = (value, max) => (value && new RegExp(`^\\d{1,${max}}$`).test(String(value)) ? String(value) : null);
const RECEIVED = ['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT'];

function emptyAddress(country = 'SK') {
  return { street: '', city: '', zip: '', country };
}

/** The supplier snapshot from recognised fields and, when known, the contact. */
export function supplierSnapshot(fields, contact = null) {
  const address = fields.supplierAddress || (contact && contact.billingAddress) || emptyAddress(fields.icDph ? fields.icDph.slice(0, 2) : 'SK');
  const icDph = fields.icDph || (contact && contact.icDph) || null;
  return {
    contactId: contact ? contact.id : null,
    name: fields.supplierName || (contact && contact.name) || '',
    ico: fields.ico || (contact && contact.ico) || null,
    dic: fields.dic || (contact && contact.dic) || null,
    icDph,
    address: { ...emptyAddress(), ...address },
    registerEntry: null,
    email: null,
    phone: null,
    peppolId: null,
    vatPayer: Boolean(icDph)
  };
}

function itemLine(base) {
  return {
    id: uuidv7(), kind: 'ITEM', itemId: null, description: '', baseQty: null, discountPct: null,
    exemptionReasonCode: null, exemptionReasonText: null, warehouseId: null, ...base
  };
}

/** Lines of the draft: the supplier's own lines, else one per VAT rate, else one for the total. */
export function draftLines(fields, { lineName = '', category = null, vatPayer = true } = {}) {
  const name = lineName || fields.supplierName || fields.number || '';
  if (fields.lines && fields.lines.length) {
    return fields.lines.map(l => itemLine({
      name: l.name || name, qty: l.qty || '1', unit: { code: l.unitCode || 'H87', label: '' }, unitPrice: l.unitPrice || '0',
      priceType: l.priceType === 'GROSS' ? 'GROSS' : 'NET', vatCategory: l.vatCategory || 'S',
      vatRate: (l.vatCategory || 'S') === 'S' ? (l.vatRate ?? null) : null, accountingCategory: category
    }));
  }
  if (fields.breakdown && fields.breakdown.length) {
    return fields.breakdown.map(b => itemLine({
      name, qty: '1', unit: { code: 'H87', label: '' }, unitPrice: b.base, priceType: 'NET',
      vatCategory: b.category || 'S', vatRate: (b.category || 'S') === 'S' ? b.rate : null, accountingCategory: category
    }));
  }
  if (fields.total) {
    const vatKnown = vatPayer && fields.net && fields.vat;
    return [itemLine({
      name, qty: '1', unit: { code: 'H87', label: '' }, unitPrice: vatKnown ? fields.net : fields.total, priceType: 'NET',
      vatCategory: vatKnown ? 'S' : 'O', vatRate: null, accountingCategory: category
    })];
  }
  return [];
}

/**
 * Totals of a received document: computed from the lines, with the net,
 * VAT and total the supplier printed taking precedence (the VAT to
 * deduct is the VAT on the document, rounding included).
 */
export function receivedTotals(doc, fields = {}) {
  let totals;
  try {
    const { lines, docAllowances, ...rest } = computeTotals(doc);
    void lines; void docAllowances;
    totals = rest;
  } catch (e) {
    // A line the user has not finished (a rate missing): the printed totals stand.
    if (!e || !e.code) throw e;
    totals = { lineNet: '0.00', allowances: '0.00', charges: '0.00', net: '0.00', vat: '0.00', vatEur: null, gross: '0.00', prepaid: '0.00', rounding: '0.00', payable: '0.00', breakdown: [] };
  }
  const out = { ...totals, breakdown: totals.breakdown.map(b => ({ category: b.category, rate: b.rate, base: b.base, vat: b.vat })) };
  if (fields.breakdown && fields.breakdown.length) out.breakdown = fields.breakdown.map(b => ({ ...b }));
  if (fields.net) out.net = round(fields.net, 2);
  if (fields.vat) out.vat = round(fields.vat, 2);
  if (fields.total) { out.gross = round(fields.total, 2); out.payable = round(fields.total, 2); }
  return out;
}

/**
 * @param {object} recognition  from recognizeXml, recognizeQr, extractInvoiceFields or mergeRecognitions
 * @param {{company?: object, today: string, contact?: object, template?: object, lineName?: string,
 *   file?: {id: string, name: string, mime: string, size: number}}} ctx
 * @returns {object} document fields for the documents collection
 */
export function draftFromRecognition(recognition, ctx) {
  const f = recognition.fields;
  const template = ctx.template || {};
  const kind = RECEIVED.includes(f.kind) ? f.kind : 'RECEIVED_INVOICE';
  const seller = supplierSnapshot(f, ctx.contact);
  const category = template.category || null;
  const doc = {
    kind,
    status: 'TO_PROCESS',
    seriesId: null,
    number: f.number || null,
    vs: digits(f.vs, 10),
    ks: digits(f.ks, 4),
    ss: digits(f.ss, 10),
    issueDate: f.issueDate || null,
    taxDate: f.taxDate || f.issueDate || null,
    dueDate: f.dueDate || null,
    deliveryDate: null,
    receivedDate: ctx.today,
    currency: f.currency || 'EUR',
    seller,
    buyer: ctx.company ? companySnapshot(ctx.company) : { name: '' },
    contactId: seller.contactId,
    lines: draftLines(f, { lineName: template.lineName || ctx.lineName, category, vatPayer: seller.vatPayer }),
    docDiscount: null,
    rounding: null,
    language: 'sk',
    template: 'CLASSIC',
    links: [],
    payments: [],
    attachments: ctx.file ? [{ id: ctx.file.id, name: ctx.file.name, mime: ctx.file.mime, size: ctx.file.size || 0 }] : [],
    sendLog: [],
    tags: [],
    noteInternal: null,
    payee: f.iban ? { iban: f.iban, bic: f.bic || null } : null,
    inbox: {
      format: recognition.format,
      confidence: recognition.confidence,
      fieldConfidence: { ...recognition.fieldConfidence },
      sources: { ...recognition.sources },
      needsConfirmation: recognition.needsConfirmation,
      receiptId: recognition.receipt ? recognition.receipt.receiptId || null : null,
      okp: recognition.receipt ? recognition.receipt.okp || null : null
    }
  };
  const method = template.paymentMethod || (kind !== 'EXPENSE_RECEIPT' && (f.iban || f.vs) ? 'TRANSFER' : null);
  if (method) doc.paymentMethod = method;
  doc.totals = receivedTotals(doc, f);
  doc.vatDeductionPeriod = deductionPeriod(doc, ctx.company);
  return doc;
}
