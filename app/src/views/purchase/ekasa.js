// Details of an online eKasa receipt by its id, through the gateway
// (POST /v1/ekasa/receipt, EkasaReceipt in gateway/openapi.yaml). Errors
// carry codes the interface translates: OFFLINE, EKASA_RECEIPT_NOT_FOUND,
// UPSTREAM_UNAVAILABLE.
import { CoreError } from '@we-invoice/core';

export async function fetchEkasaReceipt(transport, receiptId) {
  let response;
  try {
    response = await transport.http({
      url: transport.gatewayUrl('/v1/ekasa/receipt'), method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiptId }), timeoutMs: 20000
    });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new CoreError(offline ? 'OFFLINE' : 'UPSTREAM_UNAVAILABLE', `eKasa lookup failed: ${e && e.message}`);
  }
  if (response.status === 404) throw new CoreError('EKASA_RECEIPT_NOT_FOUND', `Receipt ${receiptId} not found`);
  if (!response.ok) {
    let code = 'UPSTREAM_UNAVAILABLE';
    try { code = (await response.json()).error.code || code; } catch (e) { console.warn('eKasa error answer without a code', e); }
    throw new CoreError(code, `eKasa lookup answered ${response.status}`);
  }
  const data = await response.json();
  if (!data || !data.receiptId) throw new CoreError('UPSTREAM_UNAVAILABLE', 'eKasa answer has no receipt');
  return data;
}
