// Is a Slovak company registered in Peppol? The gateway answers from the
// SML and the SMP (GET /v1/peppol/lookup/0245/{dič}, cached 24 hours), on
// the web and on the desktop alike (§ 4.10). A provider's own lookup would
// be preferred, but none of the adapters offers one yet.
import { PeppolError } from './errors.js';

const DIC = /^[0-9]{10}$/;

/** @returns {Promise<{registered: boolean, documentTypes: string[], checkedAt: string}>} */
export async function lookupParticipant(transport, dic) {
  const id = String(dic || '').replace(/\D/g, '');
  if (!DIC.test(id)) throw new PeppolError('PEPPOL_NOT_ALLOWED', 'a DIČ has 10 digits');
  let response;
  try {
    response = await transport.http({ url: transport.gatewayUrl(`/v1/peppol/lookup/0245/${id}`), method: 'GET', headers: { accept: 'application/json' }, timeoutMs: 20000 });
  } catch (error) {
    throw new PeppolError('PEPPOL_NETWORK', `lookup: ${error.name || error.code}`, { retryable: true });
  }
  if (!response.ok) throw new PeppolError(response.status >= 500 ? 'PEPPOL_SERVER' : 'PEPPOL_BAD_RESPONSE', `lookup answered ${response.status}`, { status: response.status, retryable: response.status >= 500 });
  const body = await response.json();
  return { registered: Boolean(body?.registered), documentTypes: Array.isArray(body?.documentTypes) ? body.documentTypes : [], checkedAt: body?.checkedAt || new Date().toISOString() };
}

/** True when the receiver accepts BIS Billing 3 invoices, as far as the lookup knows. */
export function acceptsInvoices(result) {
  if (!result?.registered) return false;
  if (!result.documentTypes.length) return true;
  return result.documentTypes.some(t => /Invoice-2::Invoice##urn:cen\.eu:en16931:2017#compliant#urn:fdc:peppol\.eu:2017:poacc:billing:3\.0/.test(t));
}
