// Fixed identifiers and code lists of Peppol BIS Billing 3.0 (UBL 2.1) used
// by the builder and the parser: specification and profile ids, the UBL
// namespaces, document type codes (UNCL1001) and payment means (UNCL4461).
// Slovak choices (which code a kind uses) come from sk-rules.json.
import skRules from './sk-rules.json' with { type: 'json' };

export const CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
export const PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

export const NS = Object.freeze({
  Invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  CreditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
});

/** Electronic address scheme of a Slovak DIČ (EAS code list). */
export const SK_SCHEME = '0245';

export const TYPE_CODES = Object.freeze({ ...skRules.typeCodes.byKind });

// CreditNote is its own root (381); every other tax document is an Invoice.
export const CREDIT_NOTE_CODES = Object.freeze(['381']);

/** Document kind of a received type code; unknown invoice codes fall back to INVOICE. */
export function kindOfTypeCode(code) {
  const found = Object.entries(TYPE_CODES).find(([, value]) => value === code);
  if (found) return found[0];
  return CREDIT_NOTE_CODES.includes(code) ? 'CREDIT_NOTE' : 'INVOICE';
}

// UNCL4461: 58 SEPA credit transfer, 30 other credit transfer, 10 cash,
// 48 bank card, 97 clearing between partners, 68 online payment service,
// 1 not defined (used when nothing else fits, e.g. refunds by credit note).
const PAYMENT_MEANS = Object.freeze({ CASH: '10', CARD: '48', COD: '10', OFFSET: '97', ONLINE: '68', QR_ON_SITE: '30' });

/** UNCL4461 code of a payment method; a transfer in EUR is a SEPA transfer. */
export function paymentMeansCode(method, currency) {
  if (!method || method === 'TRANSFER') return currency === 'EUR' ? '58' : '30';
  return PAYMENT_MEANS[method] || '1';
}

const METHOD_OF_CODE = Object.freeze({ 10: 'CASH', 48: 'CARD', 97: 'OFFSET', 68: 'ONLINE', 30: 'TRANSFER', 58: 'TRANSFER', 31: 'TRANSFER', 42: 'TRANSFER', 49: 'TRANSFER', 59: 'TRANSFER' });

/** Payment method of a received UNCL4461 code. */
export function methodOfPaymentCode(code) {
  return METHOD_OF_CODE[code] || 'TRANSFER';
}

/** UN/ECE Recommendation 20 unit code of a line, C62 ("one") by default. */
export function unitCode(line) {
  const code = line.unit?.code;
  return code && /^[A-Z0-9]{2,3}$/.test(code) ? code : 'C62';
}
