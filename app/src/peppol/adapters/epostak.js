// ePošťák (EFSK 012), its own enterprise API (OpenAPI, SDK @epostak/sdk 4.x):
// OAuth2 client_credentials at auth/token with the key UUID and the sk_live
// secret, raw UBL sending with a preflight that validates the XML and checks
// the receiver in SMP, a delivery status per document, inbox polling and
// acknowledge. Base URL https://epostak.sk/api/v1 (test: dev.epostak.sk).
import { PeppolError } from '../errors.js';
import { cachedToken, dropToken } from '../token-cache.js';
import { payloadText } from './interface.js';

const DELIVERED = new Set(['DELIVERED', 'ACKNOWLEDGED', 'ACCEPTED_BY_RECEIVER', 'READ']);
const REJECTED = new Set(['FAILED', 'REJECTED', 'UNDELIVERABLE', 'ERROR']);

export function epostakStatus(body) {
  const status = String(body?.status || '').toUpperCase();
  if (body?.invoiceResponseStatus === 'RE' || REJECTED.has(status)) {
    const errors = body?.validationResult?.errors;
    return { status: 'REJECTED', detail: Array.isArray(errors) && errors.length ? errors.map(e => e.message || e).join('; ') : status };
  }
  if (DELIVERED.has(status) || body?.deliveredAt) return { status: 'DELIVERED', detail: null, deliveredAt: body?.deliveredAt || null };
  return { status: 'ACCEPTED', detail: null };
}

export function createEpostakAdapter({ client, credentials, participantId }) {
  if (!credentials?.clientId || !credentials?.clientSecret) throw new PeppolError('PEPPOL_NO_CREDENTIALS', 'client id and secret are required');
  const tokenKey = `epostak|${client.sandbox ? 'sandbox' : 'prod'}|${credentials.clientId}`;
  const token = () => cachedToken(tokenKey, async () => {
    const { body } = await client.request({
      method: 'POST', path: 'auth/token',
      json: { grant_type: 'client_credentials', client_id: credentials.clientId, client_secret: credentials.clientSecret }
    });
    if (!body?.access_token) throw new PeppolError('PEPPOL_BAD_RESPONSE', 'token answer without access_token');
    return { token: body.access_token, expiresInMs: Number(body.expires_in) * 1000 };
  });

  async function call(req) {
    try {
      return await client.request({ ...req, auth: `Bearer ${await token()}` });
    } catch (error) {
      if (error.code !== 'PEPPOL_AUTH') throw error;
      dropToken(tokenKey);
      return client.request({ ...req, auth: `Bearer ${await token()}` });
    }
  }

  return {
    id: 'epostak',
    capabilities: () => ({ send: true, receive: true, ack: true, status: true, validate: true, maxAttachmentBytes: null }),
    async test() {
      await call({ method: 'GET', path: 'documents/inbox?limit=1' });
      return { ok: true };
    },
    async validate(xml, { receiverId }) {
      const { body } = await call({ method: 'POST', path: 'documents/preflight', json: { receiverPeppolId: receiverId, xml } });
      const errors = [...(body?.validationErrors || [])];
      if (body?.recipientFound === false) errors.push(`receiver ${receiverId} not found in Peppol`);
      return { ok: body?.canSend !== false && errors.length === 0, errors, recipientFound: body?.recipientFound ?? null };
    },
    async send({ xml, idempotencyKey, receiverId }) {
      const { body } = await call({
        method: 'POST', path: 'documents/send',
        headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
        json: { receiverPeppolId: receiverId, xml }
      });
      if (!body?.documentId) throw new PeppolError('PEPPOL_BAD_RESPONSE', 'send answer without documentId');
      return { providerMessageId: body.documentId, status: epostakStatus(body).status === 'DELIVERED' ? 'DELIVERED' : 'ACCEPTED' };
    },
    async status(providerMessageId) {
      const { body } = await call({ method: 'GET', path: `documents/${encodeURIComponent(providerMessageId)}/status` });
      return epostakStatus(body);
    },
    async receive({ cursor = 0 } = {}) {
      const offset = Number(cursor) || 0;
      const { body } = await call({ method: 'GET', path: `documents/inbox?limit=50&offset=${offset}&status=received` });
      const docs = Array.isArray(body?.documents) ? body.documents : [];
      const next = offset + docs.length < Number(body?.total || 0) ? offset + docs.length : null;
      return { items: docs.map(d => ({ id: d.id, senderId: d.supplier?.peppolId || null, receivedAt: d.createdAt || null })), next };
    },
    async fetch(id) {
      const { body } = await call({ method: 'GET', path: `documents/inbox/${encodeURIComponent(id)}` });
      const xml = payloadText(body?.payload);
      if (!xml) throw new PeppolError('PEPPOL_BAD_RESPONSE', 'inbox document without XML payload');
      return { xml };
    },
    async ack(id) {
      await call({ method: 'POST', path: `documents/inbox/${encodeURIComponent(id)}/acknowledge` });
    }
  };
}
