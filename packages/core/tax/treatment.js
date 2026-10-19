// How a document's VAT group is treated for Slovak VAT reporting. The
// category of the line (EN 16931 / UNCL5305), the direction and the
// partner's country decide it; the treatment then decides which line of
// the VAT return and which section of the kontrolný výkaz the amount
// goes to. Kept apart from the reports so every report reads the same
// decision.
//
// Outgoing:  DOMESTIC (S, VAT charged), DOMESTIC_RC (AE to a Slovak buyer,
// § 69 ods. 12), EU_GOODS (K, § 43), EU_SERVICES (AE to a buyer in another
// member state, § 15 ods. 1), EXPORT (G, § 47), EXEMPT (E), ZERO (Z),
// OUTSIDE (O, or AE to a buyer outside the EU), OSS (S to a consumer in
// another member state under the one-stop shop).
// Incoming:  DOMESTIC (S from a Slovak supplier), DOMESTIC_RC (AE from a
// Slovak supplier), EU_GOODS_ACQ (K from another member state, § 11),
// EU_SERVICES (AE from another member state, § 69 ods. 3), THIRD_SERVICES
// (AE from outside the EU, § 69 ods. 3), IMPORT (S from outside the EU:
// VAT paid to customs), FOREIGN (S charged by a supplier of another member
// state: foreign VAT, not deductible in Slovakia), EXEMPT, OUTSIDE.
import { isReceived } from '../documents/kinds.js';

// EU member states by their ISO 3166 code. Greece is GR in addresses and EL
// in VAT ids; XI (Northern Ireland) counts for goods only.
export const EU_COUNTRIES = Object.freeze([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'GR', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU',
  'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'
]);
const HOME = 'SK';

/** Country of a VAT id prefix as an address country (EL -> GR). */
export function vatIdCountry(vatId) {
  const prefix = String(vatId || '').replace(/\s+/g, '').slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(prefix)) return null;
  return prefix === 'EL' ? 'GR' : prefix;
}

/** The partner's country: the address, else the VAT id prefix, else Slovakia. */
export function partnerCountry(party) {
  const address = party && party.address && party.address.country;
  if (address) return String(address).toUpperCase();
  return vatIdCountry(party && party.icDph) || HOME;
}

export function isEu(country) {
  return EU_COUNTRIES.includes(country) || country === 'XI';
}

/** The partner of a document seen from the company: the buyer of an issued one, the seller of a received one. */
export function documentDirection(document, company) {
  if (isReceived(document.kind)) return 'IN';
  if (document.kind === 'SELF_BILLING') {
    // A self-billed invoice is drawn up by the buyer: when the company is
    // the buyer, it is a purchase.
    const buyer = document.buyer || {};
    const same = (a, b) => a && b && String(a).replace(/\s+/g, '') === String(b).replace(/\s+/g, '');
    if (company && (same(buyer.icDph, company.icDph) || same(buyer.ico, company.ico))) return 'IN';
  }
  return 'OUT';
}

export function partnerOf(document, direction) {
  return (direction === 'IN' ? document.seller : document.buyer) || {};
}

/**
 * Treatment of one VAT group.
 * @param {{category: string}} group
 * @param {'OUT'|'IN'} direction
 * @param {object} partner  party snapshot
 * @param {{oss?: boolean}} [company]
 * @returns {string}
 */
export function treatmentOf(group, direction, partner, company = {}) {
  const country = partnerCountry(partner);
  const home = country === HOME;
  const eu = isEu(country);
  const category = group.category;
  if (direction === 'OUT') {
    switch (category) {
      case 'S':
        if (!home && eu && company && company.oss && !(partner && partner.icDph)) return 'OSS';
        return 'DOMESTIC';
      case 'AE':
        if (home) return 'DOMESTIC_RC';
        return eu ? 'EU_SERVICES' : 'OUTSIDE';
      case 'K': return 'EU_GOODS';
      case 'G': return 'EXPORT';
      case 'E': return 'EXEMPT';
      case 'Z': return 'ZERO';
      default: return 'OUTSIDE';
    }
  }
  switch (category) {
    case 'S':
      if (home) return 'DOMESTIC';
      return eu ? 'FOREIGN' : 'IMPORT';
    case 'AE':
      if (home) return 'DOMESTIC_RC';
      return eu ? 'EU_SERVICES' : 'THIRD_SERVICES';
    case 'K': return eu && !home ? 'EU_GOODS_ACQ' : 'INVALID';
    case 'E': return 'EXEMPT';
    default: return 'OUTSIDE';
  }
}

// Treatments where the company (as buyer) computes and pays the VAT itself
// and may deduct it in the same period (samozdanenie).
export const SELF_ASSESSED = Object.freeze(['DOMESTIC_RC', 'EU_GOODS_ACQ', 'EU_SERVICES', 'THIRD_SERVICES']);

export function isSelfAssessed(treatment, direction) {
  return direction === 'IN' && SELF_ASSESSED.includes(treatment);
}
