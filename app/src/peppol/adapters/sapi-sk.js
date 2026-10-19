// Adapter of SAPI-SK v1.0, the common API of Slovak Peppol providers
// (www.sapi-sk.sk). Works for every provider with sapiSk YES: client_id and
// client_secret give a JWT (POST auth/token), documents go out as UBL in
// {metadata, payload} (POST document/send) and come in through polling
// (GET document/receive) and acknowledge. The participant id 0245:<DIČ>
// rides in X-Peppol-Participant-Id. ACCEPTED means technical receipt only;
// SAPI-SK has no delivery status, so status() is not offered.
import { PeppolError } from '../errors.js';
import { cachedToken, dropToken } from '../token-cache.js';
import { unsupported, peppolDocumentTypeId, PEPPOL_PROCESS_ID, payloadText } from './interface.js';

const PAGE = 50;

/**
 * @param {{client: object, credentials: {clientId: string, clientSecret: string}, participantId: string,
 *   prefix?: string, now?: () => string}} options
 *   prefix: path before the SAPI-SK paths when the base URL does not include it (e.g. "sapi/v1")
 */
export function createSapiSkAdapter({ client, credentials, participantId, prefix = '', now = () => new Date().toISOString() }) {
  if (!credentials?.clientId || !credentials?.clientSecret) throw new PeppolError('PEPPOL_NO_CREDENTIALS', 'client id and secret are required');
  const p = (path) => (prefix ? `${prefix.replace(/\/+$/, '')}/${path}` : path);
  const tokenKey = `${client.provider.id}|${client.sandbox ? 'sandbox' : 'prod'}|${client.base || ''}|${credentials.clientId}`;

  const token = () => cachedToken(tokenKey, async () => {
    const { body } = await client.request({
      method: 'POST', path: p('auth/token'),
      json: { grant_type: 'client_credentials', client_id: credentials.clientId, client_secret: credentials.clientSecret }
    });
    if (!body?.access_token) throw new PeppolError('PEPPOL_BAD_RESPONSE', 'token answer without access_token');
    return { token: body.access_token, expiresInMs: Number(body.expires_in) * 1000 };
  });

  async function call(req) {
    const headers = { 'x-peppol-participant-id': participantId, ...(req.headers || {}) };
    try {
      return await client.request({ ...req, headers, auth: `Bearer ${await token()}` });
    } catch (error) {
      if (error.code !== 'PEPPOL_AUTH') throw error;
      // An expired or revoked token: sign in once more before giving up.
      dropToken(tokenKey);
      return client.request({ ...req, headers, auth: `Bearer ${await token()}` });
    }
  }

  function listOf(body) {
    const root = body?.payload && Array.isArray(body.payload.documents) ? body.payload : body;
    const docs = Array.isArray(root?.documents) ? root.documents : [];
    return { docs, next: root?.nextPageToken || root?.next_page_token || null };
  }

  return {
    id: 'sapi-sk',
    capabilities: () => ({ send: true, receive: true, ack: true, status: false, validate: false, maxAttachmentBytes: null }),
    async test() {
      await call({ method: 'GET', path: p('document/receive?limit=1&status=RECEIVED') });
      return { ok: true };
    },
    async send({ xml, rootName, documentId, idempotencyKey, receiverId }) {
      const { body } = await call({
        method: 'POST', path: p('document/send'),
        headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
        json: {
          metadata: {
            documentId, documentTypeId: peppolDocumentTypeId(rootName), processId: PEPPOL_PROCESS_ID,
            senderParticipantId: participantId, receiverParticipantId: receiverId, creationDateTime: now()
          },
          payload: xml, payloadFormat: 'XML', payloadEncoding: 'UTF-8'
        }
      });
      const status = String(body?.status || '').toUpperCase();
      if (status && status !== 'ACCEPTED' && status !== 'RECEIVED') throw new PeppolError('PEPPOL_VALIDATION', `send answered ${status}`, { detail: body?.message || null });
      return { providerMessageId: body?.documentId || documentId, status: 'ACCEPTED' };
    },
    status: unsupported('status'),
    async receive({ cursor = null } = {}) {
      const query = `limit=${PAGE}&status=RECEIVED${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ''}`;
      const { body } = await call({ method: 'GET', path: p(`document/receive?${query}`) });
      const { docs, next } = listOf(body);
      return {
        items: docs.map(d => ({ id: d.documentId || d.id, senderId: d.senderParticipantId || null, receivedAt: d.creationDateTime || null })).filter(d => d.id),
        next
      };
    },
    async fetch(id) {
      const { body } = await call({ method: 'GET', path: p(`document/receive/${encodeURIComponent(id)}`) });
      const root = body?.payload && typeof body.payload === 'object' ? body.payload : body;
      const xml = payloadText(root?.payload ?? (typeof body === 'string' ? body : null));
      if (!xml) throw new PeppolError('PEPPOL_BAD_RESPONSE', 'received document without XML payload');
      return { xml };
    },
    async ack(id) {
      await call({ method: 'POST', path: p(`document/receive/${encodeURIComponent(id)}/acknowledge`) });
    },
    validate: unsupported('validate')
  };
}
