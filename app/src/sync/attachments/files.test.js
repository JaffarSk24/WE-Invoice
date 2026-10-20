// Attachment files across two devices over one mock Drive: upload with
// the sync, taking a file on the other device when it is opened (and
// keeping it there), removal with the attachment or the document, the
// states people see, and the older eFaktura inbox files.
import { describe, it, expect } from 'vitest';
import { Store } from '../../store/store.js';
import { memoryAdapter } from '../../store/local.js';
import { SyncEngine } from '../engine.js';
import { setupEncryption, confirmSetup, unlock } from '../account.js';
import { mockDrive } from '../drive-mock.js';
import { memoryKeyring } from '../keyring.js';
import { Vault } from '../vault.js';
import { memoryFiles, attachmentsFolder, attachmentPath } from './files.js';
import { encodePayload } from './codec.js';
import { removeAttachment } from '../../views/editor/attachments.js';
import { purgeRecord } from '../../views/reports/trash-store.js';

const ISSUED = { status: 'ISSUED', number: 'FA20260001', issueDate: '2026-10-01' };

const PASSWORD = 'correct horse battery';
let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 20, 9, 0, 0, tick++)).toISOString();
const pdf = (text) => ({ name: 'Zmluva o dielo.pdf', type: 'application/pdf', bytes: new TextEncoder().encode(`%PDF-1.7 ${text}`), pages: [[{ str: text, x: 0, y: 0, w: 0.5, h: 0.1 }]] });

function machine(drive) {
  const events = [];
  const emit = (name, payload) => events.push({ name, payload });
  const store = new Store({ adapter: memoryAdapter(), emit, now });
  const auth = { signedIn: true, email: 'owner@example.com' };
  const transport = { platform: 'web', drive, auth: { status: async () => ({ signedIn: auth.signedIn, email: auth.email }), signIn: async () => ({ email: auth.email }), signOut: async () => { auth.signedIn = false; } } };
  const local = memoryFiles();
  const engine = new SyncEngine({ store, transport, vault: new Vault(memoryKeyring()), emit, now, idleMs: null, intervalMs: 0, localFiles: local });
  return { store, engine, local, events, auth, files: engine.files };
}

async function pair() {
  const drive = mockDrive();
  const a = machine(drive);
  await a.store.open();
  await a.store.createCompany({ name: 'Alfa s. r. o.' });
  await a.engine.init({ auto: false });
  await setupEncryption(a.engine, PASSWORD, { iterations: 2000 });
  await confirmSetup(a.engine);
  const b = machine(drive);
  await b.store.open();
  await b.engine.init({ auto: false });
  await unlock(b.engine, PASSWORD);
  return { drive, a, b, companyId: a.store.activeCompanyId() };
}

// What the editor does: the file into the device store, its record on the document.
async function attach(m, file, docFields = {}) {
  const id = `att-${tick++}`;
  await m.local.put(id, file);
  m.files.added(id);
  const doc = await m.store.insert('documents', { kind: 'INVOICE', status: 'DRAFT', currency: 'EUR', lines: [], attachments: [{ id, name: file.name, mime: file.type, size: file.bytes.length }], ...docFields });
  return { id, doc };
}

describe('attachment files in Drive', () => {
  it('uploads a new attachment sealed and named by its id only', async () => {
    const { drive, a, companyId } = await pair();
    const { id } = await attach(a, pdf('secret contract'));
    expect(a.files.state(id)).toBe('pending');
    const pull = await a.engine.sync('interval');
    expect(pull.ok).toBe(true);
    expect(a.engine.state.pending).toBe(true);
    expect(drive.paths()).not.toContain(attachmentPath(companyId, id));
    await a.engine.flush();
    const path = attachmentPath(companyId, id);
    expect(path).toBe(`${companyId}/attachments/${id}.enc`);
    expect(drive.paths()).toContain(path);
    expect(drive.paths().some(p => p.includes('Zmluva'))).toBe(false);
    expect(drive.text(path)).not.toContain('secret contract');
    expect(a.files.state(id)).toBe('synced');
    expect(a.engine.state.pending).toBe(false);
  });

  it('takes the file on the other device when it is opened and keeps it there', async () => {
    const { drive, a, b } = await pair();
    const { id } = await attach(a, pdf('page one'));
    await a.engine.flush();
    await b.engine.sync('startup');
    expect(b.store.list('documents')[0].attachments[0].id).toBe(id);
    expect(b.files.state(id)).toBe('remote');
    const states = [];
    b.events.length = 0;
    const file = await b.files.fetch(id);
    b.events.filter(e => e.name === 'attachments:status' && e.payload.id === id).forEach(e => states.push(e.payload.state));
    expect(states).toEqual(['downloading', 'synced']);
    expect(new TextDecoder().decode(file.bytes)).toBe('%PDF-1.7 page one');
    expect(file.name).toBe('Zmluva o dielo.pdf');
    expect(file.pages[0][0].str).toBe('page one');
    expect((await b.local.get(id)).name).toBe('Zmluva o dielo.pdf');
    expect(drive.files.size).toBeGreaterThan(0);
  });

  it('says the file is not uploaded yet while the other device has not sent it', async () => {
    const { a, b } = await pair();
    const { id } = await attach(a, pdf('later'));
    // A uploads the data on closing but its idle upload of files fails once.
    const put = a.files.upload.bind(a.files);
    a.files.upload = async () => { throw Object.assign(new Error('quota'), { code: 'DRIVE_ERROR' }); };
    await a.engine.flush();
    a.files.upload = put;
    expect(a.files.state(id)).toBe('pending');
    await b.engine.sync('startup');
    expect(b.files.state(id)).toBe('notUploaded');
    expect(await b.files.fetch(id)).toBeNull();
    expect(b.files.state(id)).toBe('notUploaded');
    await a.engine.flush();
    await b.engine.sync('startup');
    expect(b.files.state(id)).toBe('remote');
    expect(await b.files.fetch(id)).not.toBeNull();
  });

  it('reports no connection and takes the file once Drive answers again', async () => {
    const { drive, a, b } = await pair();
    const { id } = await attach(a, pdf('offline'));
    await a.engine.flush();
    await b.engine.sync('startup');
    drive.failNext = 'OFFLINE';
    b.files.listed = null;
    expect(await b.files.fetch(id)).toBeNull();
    expect(b.files.state(id)).toBe('offline');
    b.auth.signedIn = false;
    await b.engine.signOut();
    expect(b.files.state(id)).toBe('offline');
    expect(await b.files.fetch(id)).toBeNull();
  });

  it('removes the file from Drive and from the other device with the attachment', async () => {
    const { drive, a, b, companyId } = await pair();
    const { id, doc } = await attach(a, pdf('to remove'));
    await a.engine.flush();
    await b.engine.sync('startup');
    await b.files.fetch(id);
    expect(await b.local.get(id)).not.toBeNull();
    await a.store.update('documents', doc.id, { attachments: [] });
    await a.local.delete(id);
    a.files.removed(id);
    await a.engine.flush();
    expect(drive.paths()).not.toContain(attachmentPath(companyId, id));
    await b.engine.sync('startup');
    expect(await b.local.get(id)).toBeNull();
    expect(b.files.state(id)).toBe('notUploaded');
  });

  it('a draft in the bin keeps its files; removed for good, they leave Drive and the other device', async () => {
    const { drive, a, b, companyId } = await pair();
    const { id, doc } = await attach(b, pdf('draft'));
    await b.engine.flush();
    await a.engine.sync('startup');
    await a.store.remove('documents', doc.id);
    await a.engine.flush();
    expect(drive.paths()).toContain(attachmentPath(companyId, id));
    await b.engine.sync('startup');
    expect(await b.local.get(id)).not.toBeNull();
    await purgeRecord(a.store, 'documents', doc.id);
    // A pull-only pass keeps the file, the next writing one removes it.
    await a.engine.sync('interval');
    expect(drive.paths()).toContain(attachmentPath(companyId, id));
    await a.engine.flush();
    expect(drive.paths()).not.toContain(attachmentPath(companyId, id));
    await b.engine.sync('startup');
    expect(await b.local.get(id)).toBeNull();
  });

  it('an issued document keeps the file of a removed attachment as an archived reference', async () => {
    const { drive, a, b, companyId } = await pair();
    const { id, doc } = await attach(a, pdf('contract'), ISSUED);
    await a.engine.flush();
    await b.engine.sync('startup');
    await b.files.fetch(id);
    await removeAttachment(a.store, doc.id, id, { remove: (x) => a.local.delete(x), now: () => '2026-10-20T10:00:00.000Z' });
    const stored = a.store.get('documents', doc.id);
    expect(stored.attachments).toEqual([]);
    expect(stored.removedAttachments).toEqual([{ id, name: 'Zmluva o dielo.pdf', mime: 'application/pdf', size: pdf('contract').bytes.length, removedAt: '2026-10-20T10:00:00.000Z', reason: 'REMOVED_BY_USER' }]);
    expect(a.store.list('auditLog').find(e => e.reason === 'attachment removed').changes).toEqual([{ field: 'attachments', from: 'Zmluva o dielo.pdf', to: null }]);
    await a.engine.flush();
    expect(drive.paths()).toContain(attachmentPath(companyId, id));
    expect(await a.local.get(id)).not.toBeNull();
    await b.engine.sync('startup');
    expect(b.store.get('documents', doc.id).attachments).toEqual([]);
    expect(b.store.get('documents', doc.id).removedAttachments).toHaveLength(1);
    expect(await b.local.get(id)).not.toBeNull();
    expect(b.files.state(id)).toBe('synced');
    // Still a live reference: a device that has it locally but not yet in Drive uploads it.
    expect(a.files.pendingCount()).toBe(0);
  });

  it('an issued document in the bin keeps its files, even without its record, until the archive period ends', async () => {
    const { drive, a, companyId } = await pair();
    const { id, doc } = await attach(a, pdf('archive'), ISSUED);
    await a.engine.flush();
    await a.store.remove('documents', doc.id);
    await a.engine.flush();
    expect(drive.paths()).toContain(attachmentPath(companyId, id));
    // The app never removes an issued document for good; should its record
    // vanish anyway, the day recorded at the last pass still protects it.
    const records = a.store.list('documents', { includeDeleted: true });
    const bare = { id: doc.id, createdAt: doc.createdAt, updatedAt: now(), deleted: true, purgedAt: now(), kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', lines: [] };
    await a.store.commit('documents', { data: { ...a.store.data, documents: records.map(r => (r.id === doc.id ? bare : r)) }, record: bare });
    await a.engine.flush();
    expect(drive.paths()).toContain(attachmentPath(companyId, id));
    a.files.today = () => '2036-10-01';
    await a.engine.flush();
    expect(drive.paths()).toContain(attachmentPath(companyId, id));
    a.files.today = () => '2036-10-02';
    await a.engine.flush();
    expect(drive.paths()).not.toContain(attachmentPath(companyId, id));
  });

  it('a deleted Inbox record drops its file, a received eFaktura in the Inbox keeps it', async () => {
    const { drive, a, companyId } = await pair();
    const scan = await attach(a, pdf('scan'), { kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS' });
    const einvoice = await attach(a, pdf('ubl'), { kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', receivedDate: '2026-10-19', peppol: { direction: 'IN', status: 'RECEIVED' } });
    await a.engine.flush();
    await a.store.remove('documents', scan.doc.id);
    await a.store.remove('documents', einvoice.doc.id);
    await a.engine.flush();
    expect(drive.paths()).not.toContain(attachmentPath(companyId, scan.id));
    expect(drive.paths()).toContain(attachmentPath(companyId, einvoice.id));
  });

  it('never removes a file it did not know, and keeps a file another document still lists', async () => {
    const { drive, a, companyId } = await pair();
    // A file in Drive that no data lists yet (another device is mid-way).
    await a.engine.remote.putSealed(attachmentPath(companyId, 'stranger'), encodePayload(pdf('x')));
    const { id, doc } = await attach(a, pdf('shared'));
    await a.store.insert('documents', { kind: 'INVOICE', status: 'DRAFT', currency: 'EUR', lines: [], attachments: [{ id, name: 'copy.pdf', mime: 'application/pdf', size: 3 }] });
    await a.engine.flush();
    await a.store.update('documents', doc.id, { attachments: [] });
    await a.engine.flush();
    expect(drive.paths()).toContain(attachmentPath(companyId, 'stranger'));
    expect(drive.paths()).toContain(attachmentPath(companyId, id));
    expect(await a.local.get(id)).not.toBeNull();
  });

  it('opens attachments of received eFaktury stored under the older name', async () => {
    const { a, b, companyId } = await pair();
    const raw = new TextEncoder().encode('<Invoice/>');
    await a.engine.remote.putSealed(`${attachmentsFolder(companyId)}/peppol-1.xml.enc`, raw);
    await a.store.insert('documents', { kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', currency: 'EUR', lines: [], attachments: [{ id: 'peppol-1', name: 'spec.xml', mime: 'application/xml', size: raw.length }] });
    await a.engine.flush();
    await b.engine.sync('startup');
    expect(b.files.state('peppol-1')).toBe('remote');
    const file = await b.files.fetch('peppol-1');
    expect(file).toMatchObject({ name: 'spec.xml', type: 'application/xml', pages: [] });
    expect(new TextDecoder().decode(file.bytes)).toBe('<Invoice/>');
    // Already in Drive: nothing is uploaded again under the new name.
    await b.engine.flush();
    expect(b.files.state('peppol-1')).toBe('synced');
  });

  it('shows a file kept here as local while sync is off', async () => {
    const drive = mockDrive();
    const m = machine(drive);
    m.auth.signedIn = false;
    await m.store.open();
    await m.store.createCompany({ name: 'Solo' });
    await m.engine.init({ auto: false });
    const { id } = await attach(m, pdf('solo'));
    expect(m.files.state(id)).toBe('local');
    expect(m.files.state('unknown')).toBe('offline');
  });
});
