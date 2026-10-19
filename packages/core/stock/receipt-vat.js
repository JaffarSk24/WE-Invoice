// VAT of the lines of a predajka (03-features.md § 3.6): the same choices
// as a line of an invoice (each rate of the S category, the zero rate and
// the categories legislation gives an exemption reference for), and the
// buyer such a line needs. Reverse charge (AE, § 69 ods. 12 zákona o DPH)
// shifts the tax to the buyer, so it is allowed only for a buyer who is a
// Slovak VAT payer and the receipt then carries the buyer's IČ DPH; an
// intra-Community supply (K, § 43) needs the IČ DPH of another member
// state. A company that is not a VAT payer sells outside VAT only.
import { CoreError } from '../errors.js';
import { getLegislation, exemptionReasonsOn } from '../legislation/index.js';
import { isValidVatId } from '../ids/validate.js';

// Categories whose buyer must give a VAT number, and where it must be from.
export const BUYER_VAT_ID_CATEGORIES = Object.freeze({ AE: 'SK', K: 'OTHER_EU' });

const RATE = /^\d+(\.\d+)?$/;

function sellsWithVat(company) {
  return !company || company.vatMode === 'PAYER';
}

// Legislation errors (no rule in force on the date) reach the caller.
function exemptCategories(date) {
  return Object.keys(getLegislation('exemptionReasons.byCategory', date));
}

function standardRates(date) {
  const rates = getLegislation('vatRates', date).map(r => r.rate);
  return [...new Set(rates)].sort((a, b) => Number(b) - Number(a));
}

/**
 * VAT choices of a predajka line on a date. Values are "S:<rate>" for a
 * rate of the S category and the category code for the others.
 * @param {string} date  YYYY-MM-DD
 * @param {object|null} company
 * @returns {Array<{value: string, category: string, rate: string|null}>}
 */
export function salesReceiptVatChoices(date, company = null) {
  if (!sellsWithVat(company)) return [{ value: 'O', category: 'O', rate: null }];
  const categories = ['Z', ...exemptCategories(date).filter(c => c !== 'Z')];
  return [
    ...standardRates(date).map(rate => ({ value: `S:${rate}`, category: 'S', rate })),
    ...categories.map(category => ({ value: category, category, rate: null }))
  ];
}

/** The choice an item starts with: its own category and rate. */
export function salesReceiptVatChoiceOf(item, company = null) {
  if (!sellsWithVat(company)) return 'O';
  const category = item?.vatCategory || 'S';
  return category === 'S' ? `S:${item?.vatRate ?? ''}` : category;
}

/**
 * Category, rate and exemption reference of a category on a date, without
 * checking whether the seller may use it (the item's own VAT).
 * @returns {{vatCategory: string, vatRate: string|null, exemptionReasonCode: string|null, exemptionReasonText: string|null}}
 */
export function vatOfCategory(category, rate, date) {
  if (!category || category === 'S') return { vatCategory: 'S', vatRate: rate ?? null, exemptionReasonCode: null, exemptionReasonText: null };
  if (category === 'Z') return { vatCategory: 'Z', vatRate: '0', exemptionReasonCode: null, exemptionReasonText: null };
  const reason = exemptionReasonsOn(category, date)[0] || null;
  return {
    vatCategory: category, vatRate: category === 'O' ? null : '0',
    exemptionReasonCode: reason ? reason.code : null, exemptionReasonText: reason ? reason.law : null
  };
}

/**
 * Category, rate and exemption reference of a choice the seller made on a
 * date. Throws SALES_RECEIPT_VAT_CHOICE_INVALID for a choice not offered.
 * @returns {{vatCategory: string, vatRate: string|null, exemptionReasonCode: string|null, exemptionReasonText: string|null}}
 */
export function salesReceiptVat(choice, date, company = null) {
  const [category, rate] = String(choice || '').split(':');
  const allowed = salesReceiptVatChoices(date, company);
  if (category === 'S' && (!RATE.test(rate || '') || !allowed.some(c => c.category === 'S'))) {
    throw new CoreError('SALES_RECEIPT_VAT_CHOICE_INVALID', `no VAT rate in ${choice}`);
  }
  if (category !== 'S' && !allowed.some(c => c.category === category)) throw new CoreError('SALES_RECEIPT_VAT_CHOICE_INVALID', `VAT choice ${choice} is not offered`);
  return vatOfCategory(category, rate, date);
}

/**
 * The first category of the lines that needs the buyer's VAT number
 * (AE before K), or null when the receipt may stay without a buyer.
 * @returns {'AE'|'K'|null}
 */
export function salesReceiptBuyerNeed(lines) {
  const categories = new Set((lines || []).map(l => l.vatCategory));
  return Object.keys(BUYER_VAT_ID_CATEGORIES).find(c => categories.has(c)) || null;
}

/** IČ DPH as stored: without spaces and dots, upper case. */
export function normalizeVatId(value) {
  return String(value ?? '').replace(/[\s.-]/g, '').toUpperCase();
}

/**
 * Checks the buyer of a receipt whose lines need one and returns the
 * buyer snapshot to store; null when no buyer is needed and none given.
 * Throws CoreError with details.field ('name' or 'icDph'):
 *   SALES_RECEIPT_BUYER_REQUIRED  the name or the IČ DPH is missing
 *   SALES_RECEIPT_BUYER_VAT_ID_INVALID  the IČ DPH fails its check
 *   SALES_RECEIPT_BUYER_NOT_SK  reverse charge needs a Slovak IČ DPH
 *   SALES_RECEIPT_BUYER_NOT_EU  a supply to another member state needs its IČ DPH
 * @param {Array<object>} lines
 * @param {{name?: string, icDph?: string, ico?: string|null, contactId?: string|null, address?: object}|null} buyer
 * @returns {object|null}
 */
export function checkSalesReceiptBuyer(lines, buyer) {
  const need = salesReceiptBuyerNeed(lines);
  if (!need) return null;
  const name = String(buyer?.name ?? '').trim();
  const icDph = normalizeVatId(buyer?.icDph);
  if (!name) throw new CoreError('SALES_RECEIPT_BUYER_REQUIRED', 'the buyer name is missing', { field: 'name', category: need });
  if (!icDph) throw new CoreError('SALES_RECEIPT_BUYER_REQUIRED', 'the buyer VAT number is missing', { field: 'icDph', category: need });
  if (!isValidVatId(icDph)) throw new CoreError('SALES_RECEIPT_BUYER_VAT_ID_INVALID', `not a VAT number: ${icDph}`, { field: 'icDph', category: need });
  const domestic = icDph.startsWith('SK');
  if (BUYER_VAT_ID_CATEGORIES[need] === 'SK' && !domestic) throw new CoreError('SALES_RECEIPT_BUYER_NOT_SK', 'reverse charge needs a Slovak VAT payer', { field: 'icDph', category: need });
  if (BUYER_VAT_ID_CATEGORIES[need] === 'OTHER_EU' && domestic) throw new CoreError('SALES_RECEIPT_BUYER_NOT_EU', 'an intra-Community supply needs a VAT number of another member state', { field: 'icDph', category: need });
  return {
    contactId: buyer?.contactId || null, name, ico: buyer?.ico || null, dic: domestic ? icDph.slice(2) : null, icDph,
    address: buyer?.address || {}, vatPayer: true
  };
}
