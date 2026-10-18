// Mandatory particulars of an invoice (03-features.md § 3.6.1: § 74 ods. 1
// zákona o DPH and § 3a ObZ). The PDF and UBL generators block issue while
// anything is missing. Legal texts come from legislation only.
import { CoreError } from '../errors.js';
import { getLegislation } from '../legislation/index.js';
import { isDate } from './dates.js';
import { isTaxDocument } from './kinds.js';
import { companySnapshot } from './snapshots.js';

const EXEMPT = new Set(['E', 'AE', 'K', 'G', 'O']);
const DECIMAL = /^-?\d+(\.\d+)?$/;

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const hasAddress = (a) => Boolean(a && (filled(a.street) || filled(a.city)) && filled(a.country));

/**
 * Particulars missing from a document. Every entry names the field (a
 * path in the document) and a code the interface translates
 * (document.missing.<code>).
 * @param {import('../schema/types.js').Document} document
 * @param {import('../schema/types.js').Company} [company]  used when the seller snapshot is not taken yet
 * @param {string} [date]  unused for now; kept for rules that change over time
 * @returns {Array<{field: string, code: string}>} empty when the document may be issued
 */
export function missingParticulars(document, company, date) {
  const missing = [];
  const miss = (field, code) => missing.push({ field, code });
  const tax = isTaxDocument(document.kind);
  const seller = document.seller || (company ? companySnapshot(company) : null);
  const vatMode = company?.vatMode || (seller?.vatPayer ? 'PAYER' : 'NONPAYER');

  if (!seller || !filled(seller.name)) miss('seller.name', 'SELLER_NAME');
  if (tax) {
    if (!hasAddress(seller?.address)) miss('seller.address', 'SELLER_ADDRESS');
    if (vatMode === 'NONPAYER') {
      if (!filled(seller?.dic)) miss('seller.dic', 'SELLER_DIC');
    } else if (!filled(seller?.icDph)) miss('seller.icDph', 'SELLER_VAT_ID');
    if (!filled(seller?.ico)) miss('seller.ico', 'SELLER_ICO');
    if (!filled(seller?.registerEntry)) miss('seller.registerEntry', 'SELLER_REGISTER_ENTRY');

    const buyer = document.buyer;
    if (!buyer || !filled(buyer.name)) miss('buyer.name', 'BUYER_NAME');
    else if (!hasAddress(buyer.address)) miss('buyer.address', 'BUYER_ADDRESS');
  }

  if (document.status && document.status !== 'DRAFT' && !filled(document.number)) miss('number', 'NUMBER');
  if (!isDate(document.issueDate)) miss('issueDate', 'ISSUE_DATE');
  if (tax && filled(document.taxDate) && !isDate(document.taxDate)) miss('taxDate', 'TAX_DATE');

  const items = (document.lines || []).filter(l => !l.kind || l.kind === 'ITEM');
  if (!items.length) miss('lines', 'LINES');
  (document.lines || []).forEach((line, i) => {
    if (line.kind && line.kind !== 'ITEM') return;
    const at = `lines[${i}]`;
    if (!filled(line.name)) miss(`${at}.name`, 'LINE_NAME');
    if (!DECIMAL.test(String(line.qty ?? ''))) miss(`${at}.qty`, 'LINE_QTY');
    if (!DECIMAL.test(String(line.unitPrice ?? ''))) miss(`${at}.unitPrice`, 'LINE_UNIT_PRICE');
    if (!tax) return;
    if (line.vatCategory === 'S') {
      if (vatMode === 'PAYER' && (!DECIMAL.test(String(line.vatRate ?? '')) || Number(line.vatRate) <= 0)) miss(`${at}.vatRate`, 'LINE_VAT_RATE');
    } else if (EXEMPT.has(line.vatCategory)) {
      if (!filled(line.exemptionReasonCode) && !filled(line.exemptionReasonText)) miss(`${at}.exemptionReasonCode`, 'LINE_EXEMPTION_REASON');
    } else if (line.vatCategory !== 'Z') {
      miss(`${at}.vatCategory`, 'LINE_VAT_CATEGORY');
    }
  });

  if (tax && document.currency && document.currency !== 'EUR' && vatMode === 'PAYER' && !filled(document.fxRate)) miss('fxRate', 'FX_RATE');
  if (document.kind === 'CREDIT_NOTE' || document.kind === 'DEBIT_NOTE') {
    if (!(document.links || []).some(l => l.kind === 'CORRECTS' && filled(l.docId))) miss('links', 'CORRECTION_REFERENCE');
    if (!filled(document.correctionReason)) miss('correctionReason', 'CORRECTION_REASON');
  }
  return missing;
}

/**
 * Legal texts a document must print (§ 74 ods. 1 items 10 and 11), from
 * legislation in the document language (Slovak when a translation is
 * missing): reverse charge, exemption, self-billing, cash basis, non-payer.
 * @returns {Array<{key: string, text: string}>}
 */
export function requiredTexts(document, company, date) {
  if (!isDate(date)) throw new CoreError('DATE_INVALID', `expected YYYY-MM-DD, got ${date}`);
  const keys = [];
  const categories = new Set((document.lines || []).filter(l => !l.kind || l.kind === 'ITEM').map(l => l.vatCategory));
  if (company?.vatMode === 'NONPAYER' || (!company && document.seller && document.seller.vatPayer === false)) keys.push('nonPayer');
  if (categories.has('AE')) keys.push('reverseCharge');
  if (categories.has('E') || categories.has('K') || categories.has('G')) keys.push('exempt');
  if (document.kind === 'SELF_BILLING') keys.push('selfBilling');
  if (company?.cashBasis && company.vatMode === 'PAYER') keys.push('cashBasis');
  const texts = getLegislation('texts', date, 'SK');
  const lang = document.language || 'sk';
  return keys.map(key => ({ key, text: texts[key]?.[lang] || texts[key]?.sk || '' }));
}
