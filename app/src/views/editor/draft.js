// A document draft as the editor builds it (03-features.md § 3.6.2): the
// defaults of a new document from the company and the client, the line
// operations, the VAT choices valid on the date and the live totals.
// Pure functions on plain objects; the store and the screen live
// elsewhere. Rates and legal references come from legislation only.
import { computeTotals, vatRatesOn, exemptionReasonsOn, isTaxDocument, isPayable, addDays, isDate, contactSnapshot, uuidv7 } from '@we-invoice/core';

export const UNIT_CODES = Object.freeze(['C62', 'HUR', 'DAY', 'MON', 'KGM', 'MTR', 'MTK', 'LTR', 'KMT', 'SET']);
export const EXEMPT_CATEGORIES = Object.freeze(['E', 'AE', 'K', 'G', 'O']);
const DEFAULT_DUE_DAYS = 14;
const QUOTE_VALID_DAYS = 30;

export function isPayer(company) {
  return Boolean(company && company.vatMode === 'PAYER');
}

/** VAT choices on a date: one per rate of the S category, then the other categories. */
export function vatChoices(date) {
  let rates = [];
  try {
    rates = vatRatesOn(date);
  } catch (e) {
    console.warn('VAT rates are not available for the date', e);
  }
  const unique = [...new Set(rates.map(r => r.rate))].sort((a, b) => Number(b) - Number(a));
  return [...unique.map(rate => ({ value: `S:${rate}`, category: 'S', rate })), ...['Z', ...EXEMPT_CATEGORIES].map(category => ({ value: category, category, rate: null }))];
}

export function vatChoiceOf(line) {
  return line.vatCategory === 'S' ? `S:${line.vatRate ?? ''}` : line.vatCategory;
}

/** The legal reference of an exempt category on a date (legislation exemptionReasons). */
export function exemptionFor(category, date) {
  try {
    const reasons = exemptionReasonsOn(category, date);
    return reasons[0] ? { code: reasons[0].code, text: reasons[0].law } : { code: null, text: null };
  } catch (e) {
    console.warn('Exemption reasons are not available for the date', e);
    return { code: null, text: null };
  }
}

/** A line with a VAT choice applied (category, rate and the exemption reference). */
export function withVatChoice(line, value, date) {
  const [category, rate] = String(value).split(':');
  if (category === 'S') return { ...line, vatCategory: 'S', vatRate: rate || null, exemptionReasonCode: null, exemptionReasonText: null };
  if (category === 'Z') return { ...line, vatCategory: 'Z', vatRate: '0', exemptionReasonCode: null, exemptionReasonText: null };
  const reason = exemptionFor(category, date);
  const keep = line.vatCategory === category && (line.exemptionReasonCode || line.exemptionReasonText);
  return {
    ...line, vatCategory: category, vatRate: category === 'O' ? null : '0',
    exemptionReasonCode: keep ? line.exemptionReasonCode : reason.code, exemptionReasonText: keep ? line.exemptionReasonText : reason.text
  };
}

/** The VAT of a new line: the standard rate for a VAT payer, out of scope otherwise. */
export function defaultVat(company, date) {
  if (isPayer(company)) {
    const choice = vatChoices(date).find(c => c.category === 'S');
    if (choice) return { vatCategory: 'S', vatRate: choice.rate, exemptionReasonCode: null, exemptionReasonText: null };
  }
  const reason = exemptionFor('O', date);
  return { vatCategory: 'O', vatRate: null, exemptionReasonCode: reason.code, exemptionReasonText: reason.text };
}

export function emptyLine({ company, date, kind = 'ITEM', unitLabel = '', id = uuidv7() }) {
  if (kind !== 'ITEM') return { id, kind, itemId: null, name: '', description: '', qty: '0', unitPrice: '0', vatCategory: 'O', vatRate: null };
  return {
    id, kind: 'ITEM', itemId: null, name: '', description: '', qty: '1', unit: { code: 'C62', label: unitLabel }, unitPrice: '0',
    baseQty: null, priceType: 'NET', discountPct: null, ...defaultVat(company, date)
  };
}

/** A line filled from a price list item; `price` overrides the item price (price level of the client). */
export function lineFromItem(item, { company, date, price = null, id = uuidv7() }) {
  const line = emptyLine({ company, date, id });
  const vat = isPayer(company)
    ? (item.vatCategory === 'S' ? { vatCategory: 'S', vatRate: item.vatRate } : withVatChoice(line, item.vatCategory, date))
    : defaultVat(company, date);
  return {
    ...line, ...vat, itemId: item.id || null, name: item.name || '', description: item.description || '',
    unit: item.unit ? { code: item.unit.code, label: item.unit.label || '' } : line.unit,
    unitPrice: price ?? item.price ?? '0', priceType: item.priceType === 'GROSS' ? 'GROSS' : 'NET'
  };
}

function dueDaysOf(contact, company) {
  if (contact && Number.isInteger(contact.dueDays)) return contact.dueDays;
  const days = company && company.defaults && company.defaults.dueDays;
  return Number.isInteger(days) ? days : DEFAULT_DUE_DAYS;
}

/** Due date = issue date + the client's days, else the company's (14 when neither says). */
export function dueDateFor(issueDate, contact, company) {
  return isDate(issueDate) ? addDays(issueDate, dueDaysOf(contact, company)) : null;
}

/** Print language: the client's, else the company's, else Slovak. */
export function languageFor(contact, company) {
  return (contact && contact.language) || (company && company.defaults && company.defaults.language) || 'sk';
}

function defaultAccount(company, currency) {
  const accounts = (company && company.bankAccounts) || [];
  const hit = accounts.find(a => a.isDefault && a.currency === currency) || accounts.find(a => a.currency === currency) || accounts.find(a => a.isDefault) || accounts[0];
  return hit ? hit.id : null;
}

/**
 * A new draft of a kind for the company, optionally for a client.
 * @param {{kind: string, company: object, contact?: object|null, today: string, id?: string, now?: string, unitLabel?: string}} input
 */
export function newDraft({ kind, company, contact = null, today, id = uuidv7(), now = new Date().toISOString(), unitLabel = '' }) {
  const defaults = (company && company.defaults) || {};
  const currency = (contact && contact.currency) || defaults.currency || 'EUR';
  const draft = {
    id, createdAt: now, updatedAt: now, kind, status: 'DRAFT', seriesId: null, number: null, vs: null, ks: null, ss: null,
    issueDate: today, taxDate: isTaxDocument(kind) ? today : null, deliveryDate: null,
    dueDate: isPayable(kind) ? dueDateFor(today, contact, company) : null,
    validUntil: kind === 'QUOTE' ? addDays(today, QUOTE_VALID_DAYS) : null,
    currency, fxRate: null, fxRateDate: null, fxSource: null,
    seller: null, buyer: contact ? contactSnapshot(contact) : null, contactId: contact ? contact.id : null,
    lines: [emptyLine({ company, date: today, unitLabel })], docDiscount: null, rounding: null, totals: null,
    paymentMethod: defaults.paymentMethod || 'TRANSFER', bankAccountId: defaultAccount(company, currency), paymentLink: null,
    buyerReference: null, orderReference: null, contractReference: null, correctionReason: null, classified: false,
    textIntro: (defaults.texts && defaults.texts.intro) || null, textOutro: (defaults.texts && defaults.texts.outro) || null, noteInternal: null,
    language: languageFor(contact, company), secondLanguage: defaults.secondLanguage || null, template: defaults.template || 'CLASSIC',
    links: [], payments: [], peppol: null, pdfFileId: null, attachments: [], sendLog: [], exportedAt: null, lockedAt: null,
    tags: [], projectRef: null
  };
  if (contact && contact.discountPct) draft.lines[0].discountPct = contact.discountPct;
  return draft;
}

/** The draft for another client: buyer, language, currency of the client and the due date from its days. */
export function applyContact(draft, contact, company) {
  const next = { ...draft, contactId: contact ? contact.id : null, buyer: contact ? contactSnapshot(contact) : null };
  next.language = languageFor(contact, company);
  if (isPayable(draft.kind)) next.dueDate = dueDateFor(draft.issueDate, contact, company);
  return next;
}

/** The draft after the issue date changed: the tax date follows when it was equal, the due date keeps its days. */
export function withIssueDate(draft, issueDate, contact, company) {
  const next = { ...draft, issueDate };
  if (isTaxDocument(draft.kind) && (!draft.taxDate || draft.taxDate === draft.issueDate)) next.taxDate = issueDate;
  if (isPayable(draft.kind)) next.dueDate = dueDateFor(issueDate, contact, company);
  if (draft.kind === 'QUOTE' && isDate(issueDate)) next.validUntil = addDays(issueDate, QUOTE_VALID_DAYS);
  return next;
}

// ---------- lines ----------

export function insertLine(lines, line, index = lines.length) {
  const next = lines.slice();
  next.splice(Math.max(0, Math.min(index, next.length)), 0, line);
  return next;
}

export function removeLine(lines, id) {
  return lines.filter(l => l.id !== id);
}

export function moveLine(lines, from, to) {
  if (from === to || from < 0 || from >= lines.length) return lines;
  const next = lines.slice();
  const [line] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, line);
  return next;
}

export function duplicateLine(lines, id, newId = uuidv7()) {
  const index = lines.findIndex(l => l.id === id);
  if (index < 0) return lines;
  return insertLine(lines, { ...structuredClone(lines[index]), id: newId }, index + 1);
}

export function updateLine(lines, id, patch) {
  return lines.map(l => (l.id === id ? { ...l, ...patch } : l));
}

/**
 * Totals of the draft as they are now. A draft being typed may not be
 * computable (a line without a rate): the error code comes back instead
 * of an exception, so the screen keeps working.
 * @returns {{totals: object|null, error: string|null}}
 */
export function liveTotals(draft, company) {
  try {
    const cashRounding = draft.paymentMethod === 'CASH' && Boolean(company && company.defaults && company.defaults.roundingCash);
    return { totals: computeTotals(draft, { cashRounding }), error: null };
  } catch (e) {
    return { totals: null, error: e && e.code ? e.code : 'UNKNOWN' };
  }
}

/** The editable fields of a document copied into a fresh draft (Kopírovať). */
export function duplicateDocument(doc, { today, id = uuidv7(), now = new Date().toISOString(), company = null, contact = null }) {
  const copy = structuredClone(doc);
  return {
    ...copy, id, createdAt: now, updatedAt: now, status: 'DRAFT', number: null, vs: null,
    seriesId: copy.seriesId || null, issueDate: today, taxDate: isTaxDocument(copy.kind) ? today : null,
    dueDate: isPayable(copy.kind) ? dueDateFor(today, contact, company) : null,
    validUntil: copy.kind === 'QUOTE' ? addDays(today, QUOTE_VALID_DAYS) : null,
    seller: null, totals: null, payments: [], links: copy.kind === 'CREDIT_NOTE' || copy.kind === 'DEBIT_NOTE' ? copy.links || [] : [],
    peppol: null, pdfFileId: null, sendLog: [], exportedAt: null, lockedAt: null, deleted: false,
    // The files belong to the original: a copy sharing their ids would delete them with its own.
    attachments: [], removedAttachments: [],
    lines: (copy.lines || []).map(l => ({ ...l, id: uuidv7() })), recurringTemplateId: null, recurringPeriodStart: null
  };
}
