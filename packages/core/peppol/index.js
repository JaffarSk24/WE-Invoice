// Peppol decision engine (04-peppol.md § 4.5) and the provider list.
// peppolRequirement belongs to WP-CORE; the provider list is a contract.
//
// The duty of zákon č. 385/2025 Z. z. is Slovak: a seller seated outside
// Slovakia is never obliged (a Czech seller's electronic format is ISDOC,
// handled by the export package). Dates come from legislation.einvoice.
import providers from './providers.json' with { type: 'json' };
import { getLegislation } from '../legislation/index.js';
import { isTaxDocument } from '../documents/kinds.js';
import { addDays, diffDays, isDate, localDate } from '../documents/dates.js';

export const PEPPOL_PROVIDERS = Object.freeze(providers.providers);

const EXEMPT_CATEGORIES = new Set(['E', 'G']);
const reason = (key) => `peppol.reason.${key}`;

function buyerCountry(contact, document) {
  return (contact?.country || contact?.billingAddress?.country || document.buyer?.address?.country || 'SK').toUpperCase();
}

function isConsumer(contact, document) {
  const party = contact || document.buyer;
  if (!party) return true;
  const business = party.ico || party.icDph || party.dic || party.peppolId;
  if (business) return false;
  return contact ? contact.kind === 'PERSON' : true;
}

function allExempt(document) {
  const items = (document.lines || []).filter(l => !l.kind || l.kind === 'ITEM');
  return items.length > 0 && items.every(l => EXEMPT_CATEGORIES.has(l.vatCategory));
}

// The e-invoicing rules in force on a date, or null before the law. A
// list asks for every document, so the answer is kept per date.
const rulesOn = new Map();
function einvoiceRules(date) {
  if (rulesOn.has(date)) return rulesOn.get(date);
  let rules;
  try {
    rules = getLegislation('einvoice', date);
  } catch (e) {
    if (!e || e.code !== 'LEGISLATION_NOT_IN_FORCE') throw e;
    rules = null;
  }
  rulesOn.set(date, rules);
  return rules;
}

/**
 * Whether a document must, may or must not go through Peppol.
 * @param {import('../schema/types.js').Company} company
 * @param {import('../schema/types.js').Contact|null} contact
 * @param {import('../schema/types.js').Document} document
 * @param {string} [date]  today (local calendar date) for the deadline countdown
 * @returns {{requirement: 'MANDATORY'|'OPTIONAL'|'NOT_ALLOWED'|'NOT_APPLICABLE', reason: string, deadline?: string, daysLeft?: number}}
 *   reason is an i18n key, e.g. "peppol.reason.payerB2bDomestic"
 */
export function peppolRequirement(company, contact, document, date = localDate()) {
  const result = (requirement, key) => ({ requirement, reason: reason(key) });
  if (document.kind === 'SALES_RECEIPT') return result('NOT_APPLICABLE', 'simplifiedInvoice');
  if (!isTaxDocument(document.kind)) return result('NOT_APPLICABLE', 'nonTaxDocument');
  if (document.classified) return result('NOT_ALLOWED', 'classified');

  const sellerCountry = (company?.address?.country || 'SK').toUpperCase();
  const buyerPeppolId = contact?.peppolId || document.buyer?.peppolId;
  if (sellerCountry !== 'SK') return result(buyerPeppolId ? 'OPTIONAL' : 'NOT_APPLICABLE', 'sellerOutsideSk');
  if (isConsumer(contact, document)) return result('OPTIONAL', 'b2c');
  if (buyerCountry(contact, document) !== 'SK') return result('OPTIONAL', 'foreignBuyer');
  if (company?.vatMode !== 'PAYER') return result('OPTIONAL', 'sellerNotPayer');

  const supplyDate = [document.taxDate, document.deliveryDate, document.issueDate, date].find(isDate);
  // No e-invoicing rules in force on the date (a supply from before the
  // law): sending through Peppol is a choice, as before the mandatory date.
  const einvoice = einvoiceRules(supplyDate);
  if (!einvoice || supplyDate < einvoice.mandatoryFrom) return result('OPTIONAL', 'beforeMandatoryDate');
  if (allExempt(document)) return result('OPTIONAL', 'exemptSupply');

  const issueDays = getLegislation('deadlines.invoiceIssueDays', supplyDate);
  const deadline = addDays(supplyDate, issueDays);
  return { ...result('MANDATORY', 'payerB2bDomestic'), deadline, daysLeft: diffDays(date, deadline) };
}

/** Peppol participant id of a Slovak DIČ: "0245:<DIČ>". */
export function participantId(dic) {
  return `0245:${String(dic || '').replace(/\D/g, '')}`;
}
