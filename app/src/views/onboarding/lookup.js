// Company details by IČO from the gateway (GET /v1/company/sk/{ico},
// CompanyLookup in gateway/openapi.yaml). Only the transport talks to the
// network; this module maps the answer onto the wizard draft.
import { CoreError } from '@we-invoice/core';

const LEGAL_FORMS = new Set(['FO_ZIVNOST', 'SRO', 'AS', 'NGO', 'OTHER']);

// The legal form of the answer, or a guess from its text, or OTHER.
export function mapLegalForm(lookup) {
  if (lookup.legalForm && LEGAL_FORMS.has(lookup.legalForm)) return lookup.legalForm;
  // Folded to plain letters, so the patterns need no diacritics.
  const text = String(lookup.legalFormText || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/s\.\s*r\.\s*o|spol.*s r/.test(text)) return 'SRO';
  if (/a\.\s*s\.|akciov/.test(text)) return 'AS';
  if (/podnikate|zivnos|fyzick/.test(text)) return 'FO_ZIVNOST';
  if (/obciansk|nezisk|nadac/.test(text)) return 'NGO';
  return 'OTHER';
}

export function lookupToDraft(lookup) {
  const address = lookup.address || {};
  return {
    name: lookup.name || '',
    ico: lookup.ico || '',
    dic: lookup.dic || '',
    icDph: lookup.icDph || '',
    registerEntry: lookup.registerEntry || '',
    legalForm: mapLegalForm(lookup),
    vatMode: lookup.icDph ? 'PAYER' : 'NONPAYER',
    address: { street: address.street || '', city: address.city || '', zip: address.zip || '', country: address.country || lookup.country || 'SK' }
  };
}

// Throws CoreError with a code the interface can translate:
// COMPANY_NOT_FOUND, UPSTREAM_UNAVAILABLE, OFFLINE.
export async function lookupCompany(transport, ico) {
  if (!/^\d{6,8}$/.test(ico)) throw new CoreError('ICO_FORMAT', `Bad company id ${ico}`);
  let response;
  try {
    response = await transport.http({ url: transport.gatewayUrl(`/v1/company/sk/${ico}`), method: 'GET', timeoutMs: 15000 });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new CoreError(offline ? 'OFFLINE' : 'UPSTREAM_UNAVAILABLE', `Company lookup failed: ${e && e.message}`);
  }
  if (response.status === 404) throw new CoreError('COMPANY_NOT_FOUND', `Company id ${ico} not found`);
  if (!response.ok) throw new CoreError('UPSTREAM_UNAVAILABLE', `Company lookup answered ${response.status}`);
  const data = await response.json();
  if (!data || typeof data !== 'object' || !data.name) throw new CoreError('UPSTREAM_UNAVAILABLE', 'Company lookup answer has no name');
  return lookupToDraft(data);
}
