import { describe, it, expect, beforeEach } from 'vitest';
import { createSapiProvider, createMockTransport, mockResponse } from './mock-provider.js';
import { createProviderClient } from './http.js';
import { createAdapter } from './adapters/index.js';
import { createEpostakAdapter, epostakStatus } from './adapters/epostak.js';
import { peppolDocumentTypeId, payloadText, assertAdapter } from './adapters/interface.js';
import { dropAllTokens } from './token-cache.js';
import { findProvider } from './providers.js';
import { errorFromResponse, providerMessage } from './errors.js';

const creds = { clientId: 'client', clientSecret: 'secret' };
const PID = '0245:2020000004';
const XML = '<?xml version="1.0"?><Invoice/>';

beforeEach(() => dropAllTokens());

function sapi(platform = 'web', providerId = 'verteco') {
  const server = createSapiProvider({ inbox: [{ id: 'in-1', xml: XML }] });
  const provider = findProvider(providerId);
  const transport = createMockTransport({ platform, providers: { [providerId]: server }, bases: { [providerId]: provider.baseUrl.prod } });
  const client = createProviderClient({ transport, provider });
  return { server, transport, adapter: createAdapter(provider, { client, credentials: creds, participantId: PID }) };
}

describe('SAPI-SK adapter', () => {
  it('goes through the gateway proxy on the web with the key in X-Upstream-Authorization', async () => {
    const { transport, adapter } = sapi('web');
    await adapter.test();
    const call = transport.calls.find(c => c.url.includes('document/receive'));
    expect(call.url).toBe('https://gw.test/v1/proxy/peppol/verteco/document/receive?limit=1&status=RECEIVED');
    expect(call.headers['x-upstream-authorization']).toBe('Bearer jwt-1');
    expect(call.headers.authorization).toBeUndefined();
    expect(call.headers['x-peppol-participant-id']).toBe(PID);
  });

  it('calls the provider directly on the desktop', async () => {
    const { transport, adapter } = sapi('mac');
    await adapter.test();
    expect(transport.calls.map(c => c.url)).toContain('https://peppol.verteco.digital/sapi/auth/token');
    expect(transport.calls.at(-1).headers.authorization).toBe('Bearer jwt-1');
  });

  it('sends UBL with metadata and the idempotency key; a repeat does not duplicate', async () => {
    const { server, adapter } = sapi();
    const args = { xml: XML, rootName: 'Invoice', documentId: 'd1', idempotencyKey: 'd1:1', receiverId: '0245:2020000026' };
    const first = await adapter.send(args);
    const again = await adapter.send(args);
    expect(first).toEqual({ providerMessageId: 'prov-1', status: 'ACCEPTED' });
    expect(again.providerMessageId).toBe('prov-1');
    expect(server.state.sent).toHaveLength(1);
    expect(server.state.sent[0].body).toMatchObject({
      payload: XML, payloadFormat: 'XML',
      metadata: { documentId: 'd1', senderParticipantId: PID, receiverParticipantId: '0245:2020000026', documentTypeId: peppolDocumentTypeId('Invoice') }
    });
  });

  it('reuses the token and signs in again after a 401', async () => {
    const { server, adapter } = sapi();
    await adapter.test();
    await adapter.test();
    expect(server.state.tokens).toBe(1);
    server.state.fail = { status: 401, times: 1 };
    await adapter.test();
    expect(server.state.tokens).toBe(2);
  });

  it('lists, fetches and acknowledges received documents', async () => {
    const { server, adapter } = sapi();
    const { items } = await adapter.receive();
    expect(items).toEqual([{ id: 'in-1', senderId: '0245:2020000004', receivedAt: null }]);
    expect((await adapter.fetch('in-1')).xml).toBe(XML);
    await adapter.ack('in-1');
    expect(server.state.acked).toEqual(['in-1']);
    expect((await adapter.receive()).items).toEqual([]);
  });

  it('reports wrong credentials as PEPPOL_AUTH and has no delivery status', async () => {
    const provider = findProvider('verteco');
    const transport = createMockTransport({ providers: { verteco: createSapiProvider() } });
    const adapter = createAdapter(provider, { client: createProviderClient({ transport, provider }), credentials: { clientId: 'x', clientSecret: 'y' }, participantId: PID });
    await expect(adapter.test()).rejects.toMatchObject({ code: 'PEPPOL_AUTH' });
    await expect(adapter.status('a')).rejects.toMatchObject({ code: 'PEPPOL_UNSUPPORTED' });
  });

  it('turns network, server and rate limit failures into retryable errors', async () => {
    const { server, adapter, transport } = sapi();
    server.state.fail = { status: 503 };
    await expect(adapter.test()).rejects.toMatchObject({ code: 'PEPPOL_SERVER', retryable: true });
    server.state.fail = { status: 429 };
    await expect(adapter.test()).rejects.toMatchObject({ code: 'PEPPOL_RATE_LIMIT', retryable: true });
    server.state.fail = { status: 422, body: { error: { code: 'UBL_VALIDATION_ERROR', message: 'BR-CO-15 failed', field: 'TaxTotal' } } };
    await expect(adapter.test()).rejects.toMatchObject({ code: 'PEPPOL_VALIDATION', retryable: false, detail: 'BR-CO-15 failed (TaxTotal)' });
    transport.http = async () => { throw new TypeError('Failed to fetch'); };
    await expect(adapter.test()).rejects.toMatchObject({ code: 'PEPPOL_NETWORK', retryable: true });
  });

  it('a custom SAPI-SK provider sends its base URL to the gateway', async () => {
    const provider = findProvider('sapi-sk');
    const server = createSapiProvider();
    const transport = createMockTransport({ providers: { 'sapi-sk': server } });
    const client = createProviderClient({ transport, provider, customBase: 'https://api.example.sk/sapi/v1/' });
    await createAdapter(provider, { client, credentials: creds, participantId: PID }).test();
    expect(transport.calls[0].headers['x-upstream-base']).toBe('https://api.example.sk/sapi/v1');
  });

  it('refuses to start without credentials and keeps the secret out of error messages', async () => {
    const provider = findProvider('verteco');
    const client = createProviderClient({ transport: createMockTransport(), provider });
    expect(() => createAdapter(provider, { client, credentials: null, participantId: PID })).toThrow(expect.objectContaining({ code: 'PEPPOL_NO_CREDENTIALS' }));
    const transport = createMockTransport({ providers: { verteco: createSapiProvider({ clientSecret: 'other' }) } });
    const adapter = createAdapter(provider, { client: createProviderClient({ transport, provider }), credentials: { clientId: 'client', clientSecret: 'vpt_supersecret' }, participantId: PID });
    const error = await adapter.test().catch(e => e);
    expect(`${error.message} ${error.detail}`).not.toContain('supersecret');
  });
});

describe('ePošťák adapter', () => {
  function epostak(routes) {
    const provider = findProvider('epostak');
    const handle = ({ method, path, body }) => {
      if (path === 'auth/token') return mockResponse(200, { access_token: 'jwt-e', expires_in: 900 });
      return routes(method, path, body ? JSON.parse(body) : null);
    };
    const transport = createMockTransport({ providers: { epostak: { handle } } });
    return createEpostakAdapter({ client: createProviderClient({ transport, provider }), credentials: creds, participantId: PID });
  }

  it('validates by preflight and sends raw UBL', async () => {
    const adapter = assertAdapter(epostak((method, path, body) => {
      if (path === 'documents/preflight') return mockResponse(200, { canSend: false, recipientFound: false, validationErrors: ['[BR-16] no lines'] });
      if (path === 'documents/send') return mockResponse(201, { documentId: 'e1', messageId: 'm1', status: 'sent', echo: body });
      return mockResponse(404, {});
    }));
    const check = await adapter.validate(XML, { receiverId: '0245:2020000026' });
    expect(check.ok).toBe(false);
    expect(check.errors).toEqual(['[BR-16] no lines', 'receiver 0245:2020000026 not found in Peppol']);
    expect(await adapter.send({ xml: XML, receiverId: '0245:2020000026', idempotencyKey: 'k' })).toEqual({ providerMessageId: 'e1', status: 'ACCEPTED' });
  });

  it('maps delivery statuses', async () => {
    expect(epostakStatus({ status: 'delivered' }).status).toBe('DELIVERED');
    expect(epostakStatus({ status: 'sent', deliveredAt: '2027-01-01T10:00:00Z' }).status).toBe('DELIVERED');
    expect(epostakStatus({ status: 'failed', validationResult: { errors: [{ message: 'bad' }] } })).toEqual({ status: 'REJECTED', detail: 'bad' });
    expect(epostakStatus({ status: 'sent', invoiceResponseStatus: 'RE' }).status).toBe('REJECTED');
    expect(epostakStatus({ status: 'sent' }).status).toBe('ACCEPTED');
  });

  it('pages through the inbox by offset', async () => {
    const adapter = epostak((method, path) => {
      if (path.startsWith('documents/inbox?')) return mockResponse(200, { documents: [{ id: 'a', createdAt: 'x' }], total: 2, limit: 50, offset: 0 });
      if (path === 'documents/inbox/a') return mockResponse(200, { document: {}, payload: XML });
      return mockResponse(404, {});
    });
    expect(await adapter.receive()).toEqual({ items: [{ id: 'a', senderId: null, receivedAt: 'x' }], next: 1 });
    expect((await adapter.fetch('a')).xml).toBe(XML);
  });
});

describe('helpers', () => {
  it('reads XML given as text or base64', () => {
    expect(payloadText(XML)).toBe(XML);
    expect(payloadText(globalThis.btoa(XML))).toBe(XML);
    expect(payloadText('bm90IHhtbA==')).toBeNull();
  });

  it('builds the Peppol document type of BIS 3', () => {
    expect(peppolDocumentTypeId('CreditNote')).toBe('busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1');
  });

  it('reads provider error texts and gateway refusals', () => {
    expect(providerMessage({ errors: ['a', { message: 'b' }] })).toBe('a b');
    expect(errorFromResponse({ status: 400, headers: {} }, { error: { code: 'PROVIDER_NOT_CONFIGURED' } }, 'x').code).toBe('PEPPOL_NOT_CONFIGURED');
    expect(errorFromResponse({ status: 503, headers: { 'retry-after': '30' } }, null, 'x').retryAfterMs).toBe(30000);
  });
});
