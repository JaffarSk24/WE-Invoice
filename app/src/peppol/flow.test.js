// Sending and receiving end to end against the in-memory provider, with the
// real store, the real UBL builder and parser, and an archive in memory.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Store } from '../store/store.js';
import { memoryAdapter } from '../store/local.js';
import { createSapiProvider, createMockTransport } from './mock-provider.js';
import { createPeppolService } from './service.js';
import { saveCredentials } from './credentials.js';
import { BETA_SECRET } from './beta.js';
import { findProvider } from './providers.js';
import { dropAllTokens } from './token-cache.js';

const fixture = (id) => readFileSync(new URL(`../../../tests/fixtures/ubl/expected/${id}.xml`, import.meta.url), 'utf8');

const COMPANY = {
  name: 'Gama Obchod a.s.', legalForm: 'AS', taxpayerType: 'PO', vatMode: 'PAYER', accountingMode: 'NONE',
  ico: '35000031', dic: '2020000026', icDph: 'SK2020000026', registerEntry: 'OR MS Bratislava III, Sa 1/B', address: { street: 'Dlhá 22', city: 'Košice', zip: '04001', country: 'SK' },
  bankAccounts: [{ id: 'acc', iban: 'SK3112000000198742637541', currency: 'EUR', isDefault: true }],
  peppol: { providerId: 'verteco', enabled: true, sandbox: false, participantId: '0245:2020000026' }
};
const BUYER = { name: 'Alfa Softvér s.r.o.', ico: '35000007', dic: '2020000004', icDph: 'SK2020000004', address: { country: 'SK' } };
const invoice = (fields = {}) => ({
  kind: 'INVOICE', status: 'ISSUED', number: 'FA2027100', issueDate: '2027-01-15', taxDate: '2027-01-15', dueDate: '2027-01-29', currency: 'EUR',
  buyer: BUYER, lines: [{ id: 'l1', name: 'Služba', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23' }], ...fields
});

async function setup({ inbox = [], beta = true, platform = 'web', files: deviceFiles = {} } = {}) {
  dropAllTokens();
  const store = new Store({ adapter: memoryAdapter() });
  await store.open();
  const company = await store.createCompany(COMPANY);
  const server = createSapiProvider({ inbox });
  const transport = createMockTransport({ platform, providers: { verteco: server }, bases: { verteco: 'https://peppol.verteco.digital/sapi' } });
  if (beta) transport.secretsMap.set(BETA_SECRET, JSON.stringify({ token: 't', expiresAt: '2099-01-01T00:00:00Z' }));
  await saveCredentials(transport, company.id, findProvider('verteco'), { clientId: 'client', clientSecret: 'secret' });
  const files = new Map();
  const archive = {
    saveXml: async (cid, date, docId, xml) => { files.set(`${cid}/${date.slice(0, 4)}/${docId}.xml`, xml); return `${date.slice(0, 4)}/${docId}`; },
    saveAttachment: async (cid, id, name, bytes) => { files.set(`${cid}/att/${id}`, bytes); }
  };
  const events = [];
  let clock = '2027-01-16T08:00:00.000Z';
  const loadAttachment = async (id) => deviceFiles[id] || null;
  const service = createPeppolService({ getStore: () => store, transport, emit: (name, payload) => events.push([name, payload]), archive, loadAttachment, now: () => clock });
  return { store, server, transport, service, files, events, company, setClock: (c) => { clock = c; } };
}

describe('sending', () => {
  let env;
  beforeEach(async () => { env = await setup(); });

  it('archives the XML, sends it once and locks the document', async () => {
    const doc = await env.store.insert('documents', invoice());
    const sent = await env.service.send(doc.id);
    expect(sent.peppol).toMatchObject({ direction: 'OUT', status: 'ACCEPTED', providerId: 'verteco', providerMessageId: 'prov-1', revision: 1, xmlFileId: `2027/${doc.id}` });
    expect(sent.lockedAt).toBe('2027-01-16T08:00:00.000Z');
    expect(sent.status).toBe('SENT');
    expect(sent.sendLog).toEqual([{ at: '2027-01-16T08:00:00.000Z', channel: 'PEPPOL', to: '0245:2020000004', result: 'ACCEPTED', detail: null }]);
    expect([...env.files.keys()]).toEqual([`${env.company.id}/2027/${doc.id}.xml`]);
    expect(env.server.state.sent[0].key).toBe(`${doc.id}:1`);
    expect(env.server.state.sent[0].body.payload).toContain('<cbc:ID>FA2027100</cbc:ID>');
    const statuses = env.events.filter(([n]) => n === 'peppol:status').map(([, p]) => p.status);
    expect(statuses).toEqual(['VALIDATING', 'READY', 'SENDING', 'ACCEPTED']);
    // A second send of an accepted document does nothing.
    await env.service.send(doc.id);
    expect(env.server.state.sent).toHaveLength(1);
  });

  it('stops at INVALID with the rule codes when the document breaks a rule', async () => {
    const doc = await env.store.insert('documents', invoice({ buyer: { name: 'Bez DIČ', address: { country: 'SK' } }, contactId: null }));
    const result = await env.service.send(doc.id);
    expect(result.peppol.status).toBe('INVALID');
    expect(result.peppol.errors.map(e => e.code)).toContain('BUYER_ENDPOINT_MISSING');
    expect(env.server.state.sent).toHaveLength(0);
    expect(env.files.size).toBe(0);
  });

  it('refuses classified and non-tax documents', async () => {
    const proforma = await env.store.insert('documents', invoice({ kind: 'PROFORMA' }));
    expect((await env.service.send(proforma.id)).peppol).toMatchObject({ status: 'INVALID', errors: [{ code: 'PEPPOL_NOT_ALLOWED' }] });
    const secret = await env.store.insert('documents', invoice({ classified: true }));
    expect((await env.service.send(secret.id)).peppol.status).toBe('INVALID');
  });

  it('keeps a network failure as FAILED and retries later with the same idempotency key', async () => {
    const doc = await env.store.insert('documents', invoice());
    env.server.state.fail = { status: 503, times: 1 };
    const failed = await env.service.send(doc.id);
    expect(failed.peppol).toMatchObject({ status: 'FAILED', attempts: 1, nextAttemptAt: '2027-01-16T08:01:00.000Z', errors: [{ code: 'PEPPOL_SERVER' }] });
    expect(failed.lockedAt ?? null).toBeNull();
    // Not due yet: nothing happens.
    expect((await env.service.tick()).retried).toBe(0);
    env.setClock('2027-01-16T08:02:00.000Z');
    expect((await env.service.tick()).retried).toBe(1);
    const sent = env.store.get('documents', doc.id);
    expect(sent.peppol).toMatchObject({ status: 'ACCEPTED', revision: 1, attempts: 2 });
    expect(env.server.state.sent[0].key).toBe(`${doc.id}:1`);
  });

  it('a provider refusal is INVALID with the provider text, not retried', async () => {
    const doc = await env.store.insert('documents', invoice());
    env.server.state.fail = { status: 422, times: 1, body: { error: { message: 'Receiver not registered' } } };
    const result = await env.service.send(doc.id);
    expect(result.peppol).toMatchObject({ status: 'INVALID', errors: [{ code: 'PEPPOL_VALIDATION', message: 'Receiver not registered' }], nextAttemptAt: null });
  });

  it('needs the beta to be switched on', async () => {
    const off = await setup({ beta: false });
    const doc = await off.store.insert('documents', invoice());
    const result = await off.service.send(doc.id);
    expect(result.peppol.status).toBe('FAILED');
    expect(result.peppol.errors[0].code).toBe('PEPPOL_BETA_REQUIRED');
    expect(await off.service.ready()).toBe(false);
  });
});

describe('sending with attachments', () => {
  const bytes = (text) => new TextEncoder().encode(text);
  const attachments = [
    { id: 'a1', name: 'protokol.pdf', mime: 'application/pdf', size: 9 },
    { id: 'a2', name: 'foto.jpg', mime: '', size: 4 },
    { id: 'a3', name: 'zmluva.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 4 }
  ];

  it('embeds the accepted files with their own ids and records the ones left out', async () => {
    const env = await setup({ files: { a1: { bytes: bytes('%PDF-1.4\n') }, a2: { bytes: bytes('JPEG') } } });
    const doc = await env.store.insert('documents', invoice({ attachments }));
    const sent = await env.service.send(doc.id);
    expect(sent.peppol.status).toBe('ACCEPTED');
    expect(sent.peppol.skippedAttachments).toEqual(['zmluva.docx']);
    const xml = env.server.state.sent[0].body.payload;
    expect(xml).toContain('<cbc:ID>FA2027100-1</cbc:ID>');
    expect(xml).toContain('mimeCode="application/pdf" filename="protokol.pdf"');
    expect(xml).toContain('mimeCode="image/jpeg" filename="foto.jpg"');
    expect(xml).not.toContain('zmluva.docx');
  });

  it('stops before sending when a file is not on this device, naming it', async () => {
    const env = await setup({ files: { a1: { bytes: bytes('%PDF-1.4\n') } } });
    const doc = await env.store.insert('documents', invoice({ attachments }));
    const result = await env.service.send(doc.id);
    expect(result.peppol).toMatchObject({ status: 'INVALID', errors: [{ code: 'ATTACHMENT_MISSING', message: 'foto.jpg', field: 'attachments' }] });
    expect(env.server.state.sent).toHaveLength(0);
    expect(env.files.size).toBe(0);
  });

  it('stops before sending when the message is over the 10 MB default, with both sizes', async () => {
    const big = new Uint8Array(8 * 1024 * 1024).fill(65);
    const env = await setup({ files: { a1: { bytes: big }, a2: { bytes: bytes('JPEG') } } });
    const doc = await env.store.insert('documents', invoice({ attachments }));
    const result = await env.service.send(doc.id);
    expect(result.peppol.status).toBe('INVALID');
    const error = result.peppol.errors.find(e => e.code === 'MESSAGE_TOO_LARGE');
    expect(error.params.limit).toBe(10 * 1024 * 1024);
    expect(error.params.bytes).toBeGreaterThan(10 * 1024 * 1024);
    expect(env.server.state.sent).toHaveLength(0);
  });
});

describe('receiving', () => {
  it('archives, stores as received with lines and attachments, creates the supplier and acknowledges', async () => {
    const env = await setup({ inbox: [{ id: 'in-1', xml: fixture('24-pdf-attachment') }, { id: 'in-2', xml: fixture('02-three-rates') }] });
    const summary = await env.service.receiveNow();
    expect(summary).toEqual({ stored: 2, duplicates: 0, failed: [] });
    expect(env.server.state.acked).toEqual(['in-1', 'in-2']);
    const received = env.store.list('documents');
    expect(received).toHaveLength(2);
    const first = received.find(d => d.number === 'FA2027024');
    expect(first).toMatchObject({ kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', receivedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), seller: { dic: '2020000004' } });
    expect(first.peppol).toMatchObject({ direction: 'IN', status: 'RECEIVED', providerId: 'verteco', providerMessageId: 'in-1', acknowledgedAt: expect.any(String) });
    expect(first.attachments).toEqual([expect.objectContaining({ name: 'FA2027024.pdf', mime: 'application/pdf', size: 36 })]);
    expect(env.store.list('documents').find(d => d.number === 'FA2027002').lines).toHaveLength(3);
    const contacts = env.store.list('contacts');
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ dic: '2020000004', name: 'Alfa Softvér s.r.o.', peppolId: '0245:2020000004' });
    expect([...env.files.keys()].filter(k => k.endsWith('.xml'))).toHaveLength(2);
  });

  it('acknowledges a duplicate without a second copy', async () => {
    const env = await setup({ inbox: [{ id: 'a', xml: fixture('01-basic-23') }, { id: 'b', xml: fixture('01-basic-23') }] });
    expect(await env.service.receiveNow()).toEqual({ stored: 1, duplicates: 1, failed: [] });
    expect(env.store.list('documents')).toHaveLength(1);
    expect(env.server.state.acked).toEqual(['a', 'b']);
  });

  it('does not acknowledge what could not be archived or read', async () => {
    const env = await setup({ inbox: [{ id: 'bad', xml: '<Invoice>' }, { id: 'ok', xml: fixture('01-basic-23') }] });
    const summary = await env.service.receiveNow();
    expect(summary.stored).toBe(1);
    expect(summary.failed).toEqual([{ id: 'bad', code: 'UBL_XML_INVALID' }]);
    expect(env.server.state.acked).toEqual(['ok']);
  });

  it('matches an existing supplier by DIČ', async () => {
    const env = await setup({ inbox: [{ id: 'x', xml: fixture('01-basic-23') }] });
    const known = await env.store.insert('contacts', { kind: 'COMPANY', name: 'Alfa', dic: '2020000004' });
    await env.service.receiveNow();
    expect(env.store.list('contacts')).toHaveLength(1);
    expect(env.store.list('documents')[0].contactId).toBe(known.id);
  });

  it('the background round receives when automatic receiving is on', async () => {
    const env = await setup({ inbox: [{ id: 'x', xml: fixture('01-basic-23') }] });
    const round = await env.service.tick();
    expect(round.received).toEqual({ stored: 1, duplicates: 0, failed: [] });
    await env.store.updateCompany({ peppol: { ...env.store.company().peppol, autoReceive: false } });
    env.server.state.inbox.push({ id: 'y', xml: fixture('02-three-rates') });
    expect((await env.service.tick()).received).toBeNull();
  });
});
