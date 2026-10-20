// Sync between devices through the user's Google Drive, ported from the
// WE Budget engine (02-architecture.md § 2.6). The engine runs in the page;
// the transport only moves bytes (web.js: fetch to the Drive API; desktop:
// the weCloud bridge), so every device follows the same rules:
//   - at start, after sign-in and in the background data is only taken
//     from the cloud; uploads happen when the window closes, from the Sync
//     button and 10 seconds after the last local change;
//   - every root (the workspace, the active company's data) goes through
//     cycle.js: content hashes decide what changed, a merge keeps both
//     originals in backups/, a write never replaces an unseen version;
//   - after the company data, the files of its attachments (attachments/
//     files.js): uploaded when the sync may write, removed from Drive with
//     the attachment, taken from Drive when someone opens one;
//   - encryption is mandatory: a cloud workspace this device cannot open
//     stops everything until the password (or the recovery key) is typed.
// The state for the interface travels as the "sync:status" event.
import { syncRoot } from './cycle.js';
import { Remote } from './remote.js';
import { Vault } from './vault.js';
import { workspaceSpec, companySpec } from './roots.js';
import { KEYS } from '../store/local.js';
import { isEncrypted } from './keys.js';
import { AttachmentFiles, memoryFiles } from './attachments/files.js';

export const SYNC_STATUSES = ['unavailable', 'off', 'checking', 'setup', 'locked', 'idle', 'syncing', 'offline', 'renew', 'error'];
export const IDLE_UPLOAD_MS = 10000;
const RETRY_STATUSES = { RENEW_NEEDED: 'renew', NOT_SIGNED_IN: 'off', OFFLINE: 'offline', LOCKED: 'locked' };

export class SyncEngine {
  // `numbering` lets tests pass their own conflict finder (conflicts.js);
  // `localFiles` is the device store of attachment files (purchase/file-store.js).
  constructor({ store, transport, vault = null, emit = () => {}, now = () => new Date().toISOString(), idleMs = IDLE_UPLOAD_MS, intervalMs = 5 * 60 * 1000, readme = null, numbering = {}, localFiles = null }) {
    this.store = store;
    this.transport = transport;
    this.vault = vault || new Vault();
    this.emit = emit;
    this.now = now;
    this.idleMs = idleMs;
    this.intervalMs = intervalMs;
    this.readme = readme;
    this.numbering = numbering;
    this.remote = new Remote({ drive: transport.drive, vault: this.vault, now });
    this.signedIn = false;
    this.files = new AttachmentFiles({
      store, remote: this.remote, local: localFiles || memoryFiles(), emit,
      isConnected: () => this.signedIn && !this.vault.locked,
      loadState: async (companyId) => ((await this.savedState()).attachments || {})[companyId] || null,
      saveState: async (companyId, state) => {
        const saved = await this.savedState();
        await this.remember({ attachments: { ...(saved.attachments || {}), [companyId]: state } });
      }
    });
    this.running = null;
    this.idleTimer = null;
    this.conflicts = [];
    this.state = {
      status: 'checking', email: '', lastSyncAt: null, pending: false, locked: false, encrypted: false, keyStored: true, error: null, readOnly: false
    };
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('sync:status', this.state);
    return this.state;
  }

  // ---------- device state ----------

  async savedState() {
    try {
      const text = await this.store.adapter.get(KEYS.syncState);
      return text ? JSON.parse(text) : { files: {} };
    } catch (e) {
      console.warn('The sync state could not be read; the next sync merges', e);
      return { files: {} };
    }
  }

  async remember(patch, filePatch = null) {
    const saved = await this.savedState();
    const next = { ...saved, ...patch, files: { ...(saved.files || {}), ...(filePatch || {}) } };
    await this.store.adapter.put(KEYS.syncState, JSON.stringify(next));
    return next;
  }

  // ---------- lifecycle ----------

  // Start: takes what the cloud has, uploads nothing.
  async init({ auto = true } = {}) {
    await this.vault.load();
    let status;
    try {
      status = await this.transport.auth.status();
    } catch (e) {
      console.error('Sign-in status unavailable', e);
      status = { signedIn: false };
    }
    this.signedIn = Boolean(status && status.signedIn);
    const saved = await this.savedState();
    this.setState({
      status: this.signedIn ? 'idle' : 'off', email: (status && status.email) || '', lastSyncAt: saved.lastSyncAt || null,
      encrypted: isEncrypted(this.store.workspace), locked: this.vault.locked && isEncrypted(this.store.workspace),
      keyStored: this.vault.keyStored, readOnly: this.store.readOnly
    });
    if (auto) this.startAuto();
    if (this.signedIn) await this.sync('startup');
    return this.state;
  }

  // While the app is open it keeps taking what other devices uploaded and
  // sends its own changes 10 seconds after the last one.
  startAuto() {
    this.store.emit = ((original) => (event, payload) => {
      original(event, payload);
      if (event === 'data:changed' && payload && payload.source === 'local') this.touched();
    })(this.store.emit);
    if (this.intervalMs) setInterval(() => this.sync('interval'), this.intervalMs);
    if (typeof window !== 'undefined' && window.addEventListener) {
      let lastFocus = 0;
      window.addEventListener('focus', () => {
        if (Date.now() - lastFocus < 60 * 1000) return;
        lastFocus = Date.now();
        this.sync('focus');
      });
      window.addEventListener('online', () => this.sync('online'));
      window.addEventListener('pagehide', () => { this.flush(); });
    }
  }

  // A local change: the upload waits for a pause in the work.
  touched() {
    if (!this.state.pending) this.setState({ pending: true });
    if (!this.signedIn || this.idleMs === null) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.sync('idle', { upload: true }), this.idleMs);
  }

  async signIn() {
    const result = await this.transport.auth.signIn();
    this.signedIn = true;
    this.setState({ status: 'idle', email: (result && result.email) || this.state.email, error: null });
    return this.sync('signin');
  }

  // The key goes too: another account signed in later has its own files.
  async signOut() {
    clearTimeout(this.idleTimer);
    try { await this.transport.auth.signOut(); } catch (e) { console.warn('Sign-out at Google failed; the local sign-out stands', e); }
    await this.store.adapter.delete(KEYS.syncState);
    await this.vault.lock();
    this.signedIn = false;
    this.files.reset();
    this.setState({ status: 'off', email: '', lastSyncAt: null, pending: false, locked: false, error: null });
  }

  // Closing the window: the only automatic upload besides the idle timer.
  async flush() {
    if (!this.signedIn) return { ok: true, outcome: 'off' };
    clearTimeout(this.idleTimer);
    if (this.running) await this.running;
    return this.sync('close', { upload: true });
  }

  // `upload` only for closing, the idle timer, the setup and the Sync
  // button ('manual').
  sync(reason = 'manual', { upload = reason === 'manual' } = {}) {
    if (!this.signedIn) return Promise.resolve({ ok: false, error: 'NOT_SIGNED_IN', reason });
    if (this.running) {
      if (upload) return this.running.then(() => this.sync(reason, { upload }));
      return this.running;
    }
    this.running = this.cycle(reason, { upload }).finally(() => { this.running = null; });
    return this.running;
  }

  async settle() {
    if (this.running) await this.running.catch(() => null);
  }

  // ---------- one sync ----------

  async cycle(reason, { upload }) {
    this.setState({ status: 'syncing' });
    try {
      const outcome = await this.step({ upload });
      if (outcome === 'setup') {
        this.setState({ status: 'setup', error: null });
        return { ok: false, error: 'SETUP_NEEDED', reason };
      }
      const lastSyncAt = this.now();
      await this.remember({ lastSyncAt });
      const saved = await this.savedState();
      const pending = Object.values(saved.files || {}).some(f => f && f.localHash === null);
      this.setState({ status: 'idle', lastSyncAt, error: null, pending: pending || outcome.some(o => o === 'local-ahead'), locked: false, encrypted: isEncrypted(this.store.workspace), keyStored: this.vault.keyStored, readOnly: this.store.readOnly });
      return { ok: true, outcome, reason };
    } catch (e) {
      const code = (e && e.code) || 'SYNC_FAILED';
      const status = RETRY_STATUSES[code] || 'error';
      if (code === 'NOT_SIGNED_IN') this.signedIn = false;
      if (status === 'error') console.error('Sync failed', e);
      this.setState({ status, error: code, locked: code === 'LOCKED', encrypted: code === 'LOCKED' || this.state.encrypted });
      return { ok: false, error: code, reason };
    }
  }

  // The workspace first (it may tell that the password is needed), then
  // the active company. Every root is retried when a write loses a race.
  async step({ upload }) {
    const outcomes = [];
    if (!isEncrypted(this.store.workspace)) {
      const cloud = await this.remote.readWorkspace();
      if (!cloud) return 'setup';
      if (cloud.locked) throw Object.assign(new Error('The cloud workspace is encrypted'), { code: 'LOCKED' });
    }
    if (this.vault.locked) throw Object.assign(new Error('No data key on this device'), { code: 'LOCKED' });
    if (this.readme) await this.remote.ensureReadme(this.readme);
    outcomes.push(await this.runRoot(workspaceSpec({ store: this.store, remote: this.remote }), upload));
    const companyId = this.store.workspace.activeCompanyId || (this.store.companies()[0] || {}).id || null;
    if (companyId && this.store.workspace.activeCompanyId !== companyId) await this.store.switchCompany(companyId);
    if (companyId) {
      const spec = companySpec({ store: this.store, remote: this.remote, companyId, now: this.now, numbering: this.numbering, onConflicts: (r) => this.reportConflicts(r) });
      outcomes.push(await this.runRoot(spec, upload));
      const files = await this.files.sync(companyId, { upload });
      outcomes.push(files.pending ? 'local-ahead' : 'files');
    }
    return outcomes;
  }

  async runRoot(spec, upload) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const saved = await this.savedState();
      const result = await syncRoot(this.remote, spec, (saved.files || {})[spec.path] || {}, { upload });
      if (result) {
        await this.remember({}, { [spec.path]: result.state });
        return result.outcome;
      }
    }
    throw Object.assign(new Error('The cloud kept changing while uploading'), { code: 'SYNC_FAILED' });
  }

  reportConflicts(result) {
    this.conflicts = result.conflicts;
    this.emit('sync:conflicts', { conflicts: result.conflicts, renumbered: result.renumbered });
  }
}
