// Seller and buyer of a UBL document (BG-4, BG-7): who they are, taken
// from the snapshots on the document (or the company and contact when a
// draft has none yet), and how they are written. The Peppol electronic
// address is the DIČ with scheme 0245; a foreign buyer may give their own
// Peppol id "scheme:value" instead.
import { leaf, node } from './xml.js';
import { SK_SCHEME } from './codes.js';

const DIC = /^[0-9]{10}$/;

const digits = (value) => String(value || '').replace(/\D/g, '');

/** Seller snapshot of a document, filled from the company where the document has nothing. */
export function sellerOf(document, company = {}) {
  const s = document.seller || {};
  return {
    name: s.name || company.name || '',
    ico: s.ico ?? company.ico ?? null,
    dic: s.dic ?? company.dic ?? null,
    icDph: s.icDph ?? company.icDph ?? null,
    address: s.address || company.address || {},
    registerEntry: s.registerEntry ?? company.registerEntry ?? null,
    email: s.email ?? company.email ?? null,
    phone: s.phone ?? company.phone ?? null,
    peppolId: s.peppolId || company.peppol?.participantId || null
  };
}

/** Buyer snapshot of a document, or the contact for a draft without one. */
export function buyerOf(document, contact = null) {
  const b = document.buyer || {};
  const c = contact || {};
  return {
    name: b.name || c.name || '',
    ico: b.ico ?? c.ico ?? null,
    dic: b.dic ?? c.dic ?? null,
    icDph: b.icDph ?? c.icDph ?? null,
    address: b.address || c.billingAddress || (c.country ? { country: c.country } : {}),
    registerEntry: b.registerEntry ?? null,
    email: b.email ?? c.emails?.[0]?.address ?? null,
    phone: b.phone ?? c.phone ?? null,
    peppolId: b.peppolId || c.peppolId || null
  };
}

/**
 * Electronic address of a party: an explicit Peppol id wins, else 0245:DIČ.
 * @returns {{scheme: string, id: string}|null}
 */
export function endpointOf(party, { preferDic = false } = {}) {
  const dic = digits(party.dic);
  if (preferDic && DIC.test(dic)) return { scheme: SK_SCHEME, id: dic };
  const explicit = /^([0-9]{4}):(.+)$/.exec(String(party.peppolId || '').trim());
  if (explicit) return { scheme: explicit[1], id: explicit[2] };
  return DIC.test(dic) ? { scheme: SK_SCHEME, id: dic } : null;
}

export const isDic = (value) => DIC.test(digits(value));

function addressNode(address = {}) {
  return node('cac:PostalAddress', [
    leaf('cbc:StreetName', address.street),
    leaf('cbc:CityName', address.city),
    leaf('cbc:PostalZone', address.zip),
    leaf('cbc:CountrySubentity', address.region),
    node('cac:Country', [leaf('cbc:IdentificationCode', (address.country || 'SK').toUpperCase())])
  ]);
}

function taxSchemeNode(companyId, scheme) {
  return node('cac:PartyTaxScheme', [leaf('cbc:CompanyID', companyId), node('cac:TaxScheme', [leaf('cbc:ID', scheme)])]);
}

/**
 * cac:Party of the seller or the buyer.
 * @param {object} party  snapshot from sellerOf / buyerOf
 * @param {{endpoint: {scheme: string, id: string}, vatId: boolean, seller: boolean}} opts
 *   vatId: whether the VAT identifier may be written (BR-O-02 forbids it for category O)
 */
export function partyNode(party, { endpoint, vatId, seller }) {
  const icDph = vatId && party.icDph ? party.icDph : null;
  // BT-32: a seller without IČ DPH states the DIČ as tax registration id (needed for exempt supplies, BR-E-02).
  const taxRegistration = seller && !party.icDph && isDic(party.dic) ? digits(party.dic) : null;
  return node('cac:Party', [
    endpoint ? leaf('cbc:EndpointID', endpoint.id, { schemeID: endpoint.scheme }) : null,
    addressNode(party.address),
    icDph ? taxSchemeNode(icDph, 'VAT') : null,
    taxRegistration ? taxSchemeNode(taxRegistration, 'TAX') : null,
    node('cac:PartyLegalEntity', [
      leaf('cbc:RegistrationName', party.name),
      leaf('cbc:CompanyID', party.ico),
      seller ? leaf('cbc:CompanyLegalForm', party.registerEntry) : null
    ]),
    node('cac:Contact', [leaf('cbc:Telephone', party.phone), leaf('cbc:ElectronicMail', party.email)])
  ]);
}
