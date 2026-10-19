// The contract every provider adapter fulfils, so the send queue, the
// inbox and the wizard never need to know which provider is behind them.
//
//   capabilities()        {send, receive, ack, status, validate, maxAttachmentBytes}
//   test()                signs in and makes one harmless read; throws PeppolError
//   send({xml, rootName, documentId, idempotencyKey, senderId, receiverId})
//                         -> {providerMessageId, status}  status: ACCEPTED | DELIVERED
//   status(providerMessageId) -> {status: ACCEPTED | DELIVERED | REJECTED, detail}
//   receive({cursor})     -> {items: [{id, senderId, receivedAt}], next}
//   fetch(id)             -> {xml, pdfBase64?}
//   ack(id)               confirms the document is safely stored (§ 4.7)
//   validate(xml, {receiverId}) -> {ok, errors: string[]}
// A method a provider does not offer throws PEPPOL_UNSUPPORTED and its
// capability is false.
import { PeppolError } from '../errors.js';

export const ADAPTER_METHODS = Object.freeze(['capabilities', 'test', 'send', 'status', 'receive', 'fetch', 'ack', 'validate']);

export function unsupported(what) {
  return () => Promise.reject(new PeppolError('PEPPOL_UNSUPPORTED', `${what} is not offered by this provider`));
}

export function assertAdapter(adapter) {
  const missing = ADAPTER_METHODS.filter(m => typeof adapter?.[m] !== 'function');
  if (missing.length) throw new Error(`Adapter is missing: ${missing.join(', ')}`);
  return adapter;
}

// Peppol document type and process of BIS Billing 3.0 (Policy for use of identifiers 4.x).
const CUSTOMIZATION = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
export const PEPPOL_PROCESS_ID = 'cenbii-procid-ubl::urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';
export function peppolDocumentTypeId(rootName) {
  const root = rootName === 'CreditNote' ? 'CreditNote' : 'Invoice';
  return `busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:${root}-2::${root}##${CUSTOMIZATION}::2.1`;
}

/** Text of a payload that may come as XML or as base64 of XML. */
export function payloadText(payload) {
  if (typeof payload !== 'string' || !payload) return null;
  if (payload.trimStart().startsWith('<')) return payload;
  try {
    const bytes = Uint8Array.from(atobSafe(payload.replace(/\s/g, '')), c => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    return text.trimStart().startsWith('<') ? text : null;
  } catch {
    return null;
  }
}

function atobSafe(b64) {
  if (typeof globalThis.atob === 'function') return globalThis.atob(b64);
  throw new Error('no base64 decoder');
}
