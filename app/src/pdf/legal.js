// The legal notes a Slovak invoice must carry (§ 74 ods. 1 zákona o DPH):
// reverse charge, exemption with the reference, self-billing, margin
// scheme, cash accounting, the non-payer note. The wording comes only from
// packages/core/legislation/sk.json, the entry valid on the issue date;
// nothing legal is written in this code.
import { LEGISLATION } from '@we-invoice/core';

// The entry of a dated list valid on a calendar date (the newest when the
// date is missing). getLegislation() in the core is still a stub.
export function validOn(list, date) {
  const entries = (list || []).filter(e => !date || (e.validFrom <= date && (!e.validTo || e.validTo >= date)));
  return entries.sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0] || null;
}

export function legalTexts(date, country = 'SK') {
  const law = LEGISLATION[country] || LEGISLATION.SK;
  return validOn(law.texts, date) || {};
}

export function exemptionReasons(date, country = 'SK') {
  const law = LEGISLATION[country] || LEGISLATION.SK;
  const entry = validOn(law.exemptionReasons, date);
  return (entry && entry.byCategory) || {};
}

const TAX_DOCUMENT_KINDS = new Set(['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ADVANCE_TAX_DOC', 'SELF_BILLING']);

export function isTaxDocument(kind) {
  return TAX_DOCUMENT_KINDS.has(kind);
}

export function isVatPayer(document, company) {
  if (document.seller && typeof document.seller.vatPayer === 'boolean') return document.seller.vatPayer;
  return Boolean(company && company.vatMode === 'PAYER');
}

function categoriesOf(document) {
  const set = new Set();
  (document.lines || []).forEach(line => { if (line.kind !== 'TEXT' && line.kind !== 'SUBTOTAL') set.add(line.vatCategory || 'S'); });
  (document.totals && document.totals.breakdown || []).forEach(b => set.add(b.category));
  return set;
}

/**
 * The notes to print, each as { key, text } where text is in one or two
 * languages (labels.pair). Order: the notes about the VAT regime of the
 * document first, then the exemption references.
 * @param {object} document
 * @param {object} company
 * @param {{pair: Function}} labels
 * @returns {Array<{key: string, text: string}>}
 */
export function legalNotes(document, company, labels) {
  const date = document.issueDate || document.taxDate || null;
  const texts = legalTexts(date);
  const reasons = exemptionReasons(date);
  const notes = [];
  const push = (key, byLanguage, suffix = '') => {
    if (!byLanguage) return;
    const text = labels.pair(byLanguage);
    if (text) notes.push({ key, text: suffix ? `${text} (${suffix})` : text });
  };
  const vatPayer = isVatPayer(document, company);
  if (!vatPayer) {
    if (document.kind !== 'QUOTE' && document.kind !== 'DELIVERY_NOTE') push('nonPayer', texts.nonPayer);
    return notes;
  }
  const categories = categoriesOf(document);
  if (document.kind === 'SELF_BILLING') push('selfBilling', texts.selfBilling);
  if (company && company.cashBasis) push('cashBasis', texts.cashBasis);
  if (document.marginScheme) push('margin', texts.margin);
  if (categories.has('AE')) push('reverseCharge', texts.reverseCharge, lawOf(reasons, 'AE'));
  ['E', 'K', 'G'].forEach(cat => { if (categories.has(cat)) push(`exempt.${cat}`, texts.exempt, lawOf(reasons, cat, document)); });
  if (categories.has('O')) push('outOfScope', { sk: lawOf(reasons, 'O'), en: lawOf(reasons, 'O') });
  return notes;
}

function lawOf(reasons, category, document = null) {
  const custom = document && (document.lines || []).find(l => l.vatCategory === category && l.exemptionReasonText);
  if (custom) return custom.exemptionReasonText;
  const list = reasons[category] || [];
  return list.length ? list[0].law : '';
}
