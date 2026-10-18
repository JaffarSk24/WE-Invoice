import { describe, it, expect } from 'vitest';
import { Store } from '../store/store.js';
import { memoryAdapter, KEYS } from '../store/local.js';
import { SyncEngine } from './engine.js';
import { setupEncryption, confirmSetup, unlock, recover, changePassword, verifyPassword, forgetKey } from './account.js';
import { mockDrive } from './drive-mock.js';
import { memoryKeyring } from './keyring.js';
import { Vault } from './vault.js';
import { PATHS } from './remote.js';
import { syncAction } from './cycle.js';

const PASSWORD = 'correct horse battery';
const FAST = { iterations: 2000 };

// One clock for every machine, so the order of operations in a test is the
// order of their timestamps.
let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 18, 9, 0, 0, tick++)).toISOString();

// A machine: its own store, keyring and sync state over the shared Drive.
function machine(drive, { signedIn = true } = {}) {
  const events = [];
  const adapter = memoryAdapter();
  const emit = (name, payload) => events.push({ name, payload });
  const store = new Store({ adapter, emit, now });
  const auth = { signedIn, email: 'owner@example.com' };
  const transport = {
    platform: 'web', drive,
    auth: { status: async () => ({ signedIn: auth.signedIn, email: auth.email }), signIn: async () => { auth.signedIn = true; return { email: auth.email }; }, signOut: async () => { auth.signedIn = false; } }
  };
  const keyring = memoryKeyring();
  const make = (options = {}) => new SyncEngine({ store, transport, vault: new Vault(keyring), emit, now, idleMs: null, intervalMs: 0, readme: 'WE Invoice folder', ...options });
  const m = { store, adapter, events, transport, keyring, auth, engine: make(), make, now };
  m.restart = async (options) => { m.engine = make(options); await m.engine.init({ auto: false }); return m.engine.state; };
  m.statuses = () => events.filter(e => e.name === 'sync:status').map(e => e.payload.status);
  return m;
}

async function opened(drive, options) {
  const m = machine(drive, options);
  await m.store.open();
  return m;
}

// A first machine with a company, encryption on and everything uploaded.
async function seeded(drive) {
  const a = await opened(drive);
  await a.store.createCompany({ name: 'Alfa s. r. o.', legalForm: 'SRO', series: [{ id: 's1', kind: 'INVOICE', mask: 'FA{YYYY}{N:4}', reset: 'YEARLY' }] });
  await a.store.insert('contacts', { kind: 'COMPANY', name: 'Beta' });
  await a.engine.init({ auto: false });
  expect(a.engine.state.status).toBe('setup');
  const { words } = await setupEncryption(a.engine, PASSWORD, FAST);
  const result = await confirmSetup(a.engine);
  expect(result.ok).toBe(true);
  return { a, words };
}

const names = (m) => m.store.list('contacts').map(c => c.name).sort();

describe('sync action', () => {
  it('decides from what both sides know', () => {
    expect(syncAction({ remoteExists: false, localWork: true })).toBe('push');
    expect(syncAction({ remoteExists: false, localWork: false })).toBe('up_to_date');
    expect(syncAction({ remoteExists: true, known: false, localWork: true })).toBe('merge');
    expect(syncAction({ remoteExists: true, known: false, localWork: false })).toBe('pull');
    expect(syncAction({ remoteExists: true, known: true, remoteChanged: true, localChanged: true })).toBe('merge');
    expect(syncAction({ remoteExists: true, known: true, remoteChanged: true, localChanged: false })).toBe('pull');
    expect(syncAction({ remoteExists: true, known: true, remoteChanged: false, localChanged: true })).toBe('push');
    expect(syncAction({ remoteExists: true, known: true, remoteChanged: false, localChanged: false })).toBe('up_to_date');
  });
});

describe('sync engine', () => {
  it('sets up encryption, uploads the workspace and the company, writes the README', async () => {
    const drive = mockDrive();
    const { a } = await seeded(drive);
    const companyId = a.store.activeCompanyId();
    expect(drive.paths()).toEqual([PATHS.readme, PATHS.workspace, PATHS.company(companyId)].sort());
    expect(drive.text(PATHS.workspace)).not.toContain('Alfa');
    expect(drive.text(PATHS.readme)).toBe('WE Invoice folder');
    expect(a.engine.state).toMatchObject({ status: 'idle', encrypted: true, locked: false, pending: false, email: 'owner@example.com' });
    expect(a.engine.state.lastSyncAt).toBeTruthy();
    // Nothing changed: a second sync writes nothing.
    const writes = drive.writes;
    const again = await a.engine.sync('manual');
    expect(again.outcome).toEqual(['unchanged', 'unchanged']);
    expect(drive.writes).toBe(writes);
  });

  it('a second machine is locked until the password is typed, then pulls everything', async () => {
    const drive = mockDrive();
    const { a } = await seeded(drive);
    const b = await opened(drive);
    await b.engine.init({ auto: false });
    expect(b.engine.state.status).toBe('locked');
    expect(b.store.companies()).toEqual([]);
    await expect(unlock(b.engine, 'wrong horse battery')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    const result = await unlock(b.engine, PASSWORD);
    expect(result.ok).toBe(true);
    expect(b.engine.state.status).toBe('idle');
    expect(b.store.companies().map(c => c.name)).toEqual(['Alfa s. r. o.']);
    expect(b.store.activeCompanyId()).toBe(a.store.activeCompanyId());
    expect(names(b)).toEqual(['Beta']);
    expect(b.store.workspace.keys).toEqual(a.store.workspace.keys);
    // The key is kept: after a restart no password is asked.
    expect((await b.restart()).status).toBe('idle');
  });

  it('merges work done on both machines and keeps both originals', async () => {
    const drive = mockDrive();
    const { a } = await seeded(drive);
    const b = await opened(drive);
    await b.engine.init({ auto: false });
    await unlock(b.engine, PASSWORD);
    await a.store.insert('contacts', { kind: 'PERSON', name: 'From A' });
    await b.store.insert('contacts', { kind: 'PERSON', name: 'From B' });
    expect(a.engine.state.pending).toBe(false);
    await a.engine.flush();
    expect((await b.engine.flush()).outcome[1]).toBe('merged');
    expect(names(b)).toEqual(['Beta', 'From A', 'From B']);
    const pulled = await a.engine.sync('startup', { upload: false });
    expect(pulled.outcome[1]).toBe('pulled');
    expect(names(a)).toEqual(['Beta', 'From A', 'From B']);
    const companyId = a.store.activeCompanyId();
    const backups = drive.paths().filter(p => p.startsWith(PATHS.backups(companyId)));
    expect(backups).toHaveLength(2);
    expect(backups.some(p => p.endsWith('-local.json.gz.enc'))).toBe(true);
    expect(backups.some(p => p.endsWith('-cloud.json.gz.enc'))).toBe(true);
  });

  it('a deletion travels as a tombstone and the merge is the same from both sides', async () => {
    const drive = mockDrive();
    const { a } = await seeded(drive);
    const b = await opened(drive);
    await b.engine.init({ auto: false });
    await unlock(b.engine, PASSWORD);
    const beta = b.store.list('contacts')[0];
    await a.store.update('contacts', beta.id, { name: 'Beta (older edit)' });
    await b.store.remove('contacts', beta.id);
    await b.engine.flush();
    await a.engine.flush();
    expect(names(a)).toEqual([]);
    await b.engine.sync('startup', { upload: false });
    expect(names(b)).toEqual([]);
    expect(b.store.get('contacts', beta.id, { includeDeleted: true }).deleted).toBe(true);
  });

  it('uploads on its own after the idle pause', async () => {
    const drive = mockDrive();
    const { a } = await seeded(drive);
    await a.restart({ idleMs: 30 });
    a.engine.startAuto();
    const writes = drive.writes;
    await a.store.insert('contacts', { kind: 'PERSON', name: 'Idle' });
    expect(a.engine.state.pending).toBe(true);
    // The upload comes after the idle pause; under a loaded test run it may
    // take longer than the pause itself, so wait for it with a ceiling.
    const deadline = Date.now() + 2000;
    while (drive.writes <= writes && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
    expect(drive.writes).toBeGreaterThan(writes);
    expect(a.engine.state.pending).toBe(false);
  });

  it('renumbers a document that got the same number on another machine', async () => {
    const drive = mockDrive();
    const finder = (docs) => {
      const seen = new Map();
      const out = [];
      docs.filter(d => !d.deleted && d.number).sort((x, y) => x.id.localeCompare(y.id)).forEach(d => {
        const key = `${d.seriesId}|${d.number}`;
        if (seen.has(key)) out.push({ docId: d.id, number: d.number, proposed: d.lockedAt ? null : 'FA20260002', locked: Boolean(d.lockedAt) });
        else seen.set(key, d.id);
      });
      return out;
    };
    const numbering = { finder, vs: (n) => n.replace(/\D/g, '') };
    const { a } = await seeded(drive);
    const b = await opened(drive);
    b.engine = b.make({ numbering });
    await b.engine.init({ auto: false });
    await unlock(b.engine, PASSWORD);
    a.engine = a.make({ numbering });
    await a.engine.init({ auto: false });
    await a.store.insert('documents', { kind: 'INVOICE', status: 'ISSUED', seriesId: 's1', number: 'FA20260001', currency: 'EUR', lines: [] });
    await b.store.insert('documents', { kind: 'INVOICE', status: 'ISSUED', seriesId: 's1', number: 'FA20260001', currency: 'EUR', lines: [] });
    await a.engine.flush();
    await b.engine.flush();
    const numbers = b.store.list('documents').map(d => d.number).sort();
    expect(numbers).toEqual(['FA20260001', 'FA20260002']);
    expect(b.store.list('documents').find(d => d.number === 'FA20260002').vs).toBe('20260002');
    const report = b.events.find(e => e.name === 'sync:conflicts');
    expect(report.payload.renumbered).toBe(1);
    await a.engine.sync('startup');
    expect(a.store.list('documents').map(d => d.number).sort()).toEqual(numbers);
  });

  it('recovers with the words, sets a new password and a third machine opens with it', async () => {
    const drive = mockDrive();
    const { a, words } = await seeded(drive);
    const b = await opened(drive);
    await b.engine.init({ auto: false });
    await expect(recover(b.engine, 'wrong words', 'brand new password')).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' });
    const result = await recover(b.engine, words.join(' '), 'brand new password');
    expect(result.ok).toBe(true);
    expect(names(b)).toEqual(['Beta']);
    const c = await opened(drive);
    await c.engine.init({ auto: false });
    await expect(unlock(c.engine, PASSWORD)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await unlock(c.engine, 'brand new password');
    expect(names(c)).toEqual(['Beta']);
    // The first machine keeps its key and sees the new header after a sync.
    await a.engine.sync('startup');
    expect(a.store.workspace.keys.wrappedByPassword).toBe(b.store.workspace.keys.wrappedByPassword);
    expect(await verifyPassword(a.engine, 'brand new password')).toBe(true);
    expect(await verifyPassword(a.engine, PASSWORD)).toBe(false);
  });

  it('changes the password without rewriting the company file', async () => {
    const drive = mockDrive();
    const { a } = await seeded(drive);
    const companyId = a.store.activeCompanyId();
    const before = drive.files.get(PATHS.company(companyId)).version;
    await expect(changePassword(a.engine, 'wrong', 'another long password')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    const result = await changePassword(a.engine, PASSWORD, 'another long password');
    expect(result.ok).toBe(true);
    expect(drive.files.get(PATHS.company(companyId)).version).toBe(before);
    await forgetKey(a.engine);
    expect(a.engine.state.locked).toBe(true);
    expect((await a.restart()).status).toBe('locked');
    await unlock(a.engine, 'another long password');
    expect(a.engine.state.status).toBe('idle');
  });

  it('never applies or overwrites a damaged cloud file', async () => {
    const drive = mockDrive();
    const { a } = await seeded(drive);
    const companyId = a.store.activeCompanyId();
    await drive.put(PATHS.company(companyId), new TextEncoder().encode('garbage'));
    const result = await a.engine.sync('manual');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('DAMAGED');
    expect(a.engine.state.status).toBe('error');
    expect(drive.text(PATHS.company(companyId))).toBe('garbage');
    expect(names(a)).toEqual(['Beta']);
  });

  it('goes offline and comes back, and signs out with the key', async () => {
    const drive = mockDrive();
    const { a } = await seeded(drive);
    drive.failNext = 'OFFLINE';
    expect((await a.engine.sync('manual')).error).toBe('OFFLINE');
    expect(a.engine.state.status).toBe('offline');
    expect((await a.engine.sync('manual')).ok).toBe(true);
    drive.failNext = 'RENEW_NEEDED';
    await a.engine.sync('manual');
    expect(a.engine.state.status).toBe('renew');
    await a.engine.signOut();
    expect(a.engine.state).toMatchObject({ status: 'off', email: '', locked: false });
    expect(a.engine.vault.locked).toBe(true);
    expect(a.adapter.peek(KEYS.syncState)).toBeNull();
    expect((await a.engine.sync('manual')).error).toBe('NOT_SIGNED_IN');
    await a.engine.signIn();
    expect(a.engine.state.status).toBe('locked');
  });

  it('a second company created elsewhere arrives through the workspace', async () => {
    const drive = mockDrive();
    const { a } = await seeded(drive);
    const b = await opened(drive);
    await b.engine.init({ auto: false });
    await unlock(b.engine, PASSWORD);
    const second = await b.store.createCompany({ name: 'Gama s. r. o.' });
    await b.store.insert('items', { name: 'Hour', price: '40.00' });
    await b.engine.flush();
    await a.engine.sync('startup');
    expect(a.store.companies().map(c => c.name).sort()).toEqual(['Alfa s. r. o.', 'Gama s. r. o.']);
    await a.store.switchCompany(second.id);
    expect(a.store.data).toBeNull();
    await a.engine.sync('startup');
    expect(a.store.list('items').map(i => i.name)).toEqual(['Hour']);
  });
});
