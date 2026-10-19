// Reads a cac:Party of a received UBL document into a party snapshot of
// the data model. The DIČ comes from a 0245 electronic address or from a
// tax registration id; the full electronic address is kept as peppolId so
// that a reply (Invoice Response) can be addressed to it.
import { child, children, text } from './xml-parse.js';

function taxId(party, scheme) {
  const found = children(party, 'PartyTaxScheme').find(p => (text(p, 'TaxScheme', 'ID') || '').toUpperCase() === scheme);
  return found ? text(found, 'CompanyID') : null;
}

/**
 * @param {object|null} party  cac:Party element
 * @param {string} skScheme  scheme of the Slovak DIČ (0245)
 */
export function readParty(party, skScheme) {
  if (!party) return { name: '', address: {} };
  const endpoint = child(party, 'EndpointID');
  const scheme = endpoint?.attrs.schemeID || null;
  const endpointId = text(endpoint);
  const vatId = taxId(party, 'VAT');
  const registration = children(party, 'PartyTaxScheme').map(p => (text(p, 'TaxScheme', 'ID') || '').toUpperCase() !== 'VAT' ? text(p, 'CompanyID') : null).find(Boolean);
  const dic = scheme === skScheme ? endpointId : (registration && /^[0-9]{10}$/.test(registration) ? registration : null);
  const address = child(party, 'PostalAddress');
  return {
    name: text(party, 'PartyLegalEntity', 'RegistrationName') || text(party, 'PartyName', 'Name') || '',
    ico: text(party, 'PartyLegalEntity', 'CompanyID'),
    dic,
    icDph: vatId,
    address: {
      street: [text(address, 'StreetName'), text(address, 'AdditionalStreetName')].filter(Boolean).join(', ') || undefined,
      city: text(address, 'CityName') || undefined,
      zip: text(address, 'PostalZone') || undefined,
      region: text(address, 'CountrySubentity') || undefined,
      country: text(address, 'Country', 'IdentificationCode') || undefined
    },
    registerEntry: text(party, 'PartyLegalEntity', 'CompanyLegalForm'),
    email: text(party, 'Contact', 'ElectronicMail'),
    phone: text(party, 'Contact', 'Telephone'),
    peppolId: scheme && endpointId ? `${scheme}:${endpointId}` : null,
    vatPayer: Boolean(vatId)
  };
}
