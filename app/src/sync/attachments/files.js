// The files of document attachments in Google Drive (02-architecture.md
// § 2.4.1): <companyId>/attachments/<id>.enc, sealed with the data key
// like the company data (codec.js has the content). The device keeps its
// copies in the store of purchase/file-store.js, which is also the cache
// of the files taken from Drive.
//
// One pass per sync of the active company (sync()), after its data:
//   - a file that a live document lists, that this device has and that
//     Drive lacks is uploaded (only in a sync that may write: closing, the
//     Sync button, 10 seconds after a change);
//   - a file this device knew as kept at its last pass and that the data
//     no longer keeps after the merge (retention.js: an attachment removed
//     from a draft, a deleted Inbox record, a draft removed for good from
//     the recycle bin) is removed from Drive and from this device, unless
//     the archive period recorded for it is not over yet. Attachments
//     removed from issued or received documents, and documents in the bin,
//     keep their files. A device that never saw the reference removes
//     nothing, so a file another device has just added is never taken for
//     an orphan.
// A file is taken from Drive only when someone opens or sends it (fetch()).
//
// The states people see, per attachment id (state()):
//   local        on this device, sync is off
//   synced       on this device and in Drive
//   pending      on this device, not yet uploaded
//   remote       in Drive, taken when opened
//   downloading  being taken from Drive now
//   notUploaded  neither here nor in Drive: the device that added it has
//                not uploaded it yet
//   offline      not here, and Drive cannot be reached now (no connection,
//                signed out, data locked)
// Every change of a state is announced as "attachments:status".
import { TRANSPORT_CODES } from '../remote.js';
import { attachmentFileName, parseAttachmentName, encodePayload, decodePayload, attachmentRecordOf } from './codec.js';
import { keptAttachments, mayRemove } from './retention.js';
import { todayLocal } from '../../components/dates.js';

export const ATTACHMENT_STATES = Object.freeze(['local', 'synced', 'pending', 'remote', 'downloading', 'notUploaded', 'offline']);
const UNREACHABLE = new Set([...TRANSPORT_CODES, 'LOCKED']);

export const attachmentsFolder = (companyId) => `${companyId}/attachments`;
export const attachmentPath = (companyId, id) => `${attachmentsFolder(companyId)}/${attachmentFileName(id)}`;

// A device store in memory, for tests and for an engine started without one.
export function memoryFiles() {
  const map = new Map();
  return {
    get: async (id) => map.get(id) || null,
    put: async (id, file) => { map.set(id, file); },
    delete: async (id) => { map.delete(id); },
    keys: async () => Array.from(map.keys())
  };
}

// The files known at the last pass: { id: last day to keep or null }; an
// older record was a plain list of ids, with no archive period.
function knownMap(value) {
  if (Array.isArray(value)) return new Map(value.map(id => [id, null]));
  return new Map(Object.entries(value && typeof value === 'object' ? value : {}));
}

function unreachable(error) {
  return Boolean(error && UNREACHABLE.has(error.code));
}

export class AttachmentFiles {
  /**
   * @param {{store: object, remote: object, local: {get, put, delete, keys}, emit?: Function,
   *   isConnected?: () => boolean, loadState?: Function, saveState?: Function}} deps
   *   isConnected: signed in with the data key on this device
   *   loadState(companyId) / saveState(companyId, state): the per-device record of the last pass
   *   today(): the local date ('YYYY-MM-DD') the archive periods are measured against
   *   yearsOn(date): the archive period valid on a date (retention.js; tests pass their own)
   */
  constructor({ store, remote, local, emit = () => {}, isConnected = () => true, loadState = async () => null, saveState = async () => {}, today = () => todayLocal(), yearsOn = undefined }) {
    this.store = store;
    this.remote = remote;
    this.local = local;
    this.emit = emit;
    this.isConnected = isConnected;
    this.loadState = loadState;
    this.saveState = saveState;
    this.today = today;
    this.retention = yearsOn ? { yearsOn } : {};
    this.localIds = new Set();
    this.remoteIds = new Map();   // id -> { path, ext } of the active company's folder
    this.listed = null;           // companyId whose folder remoteIds holds
    this.downloading = new Map(); // id -> Promise
    this.failed = new Map();      // id -> 'offline' | 'notUploaded'
  }

  companyId() {
    return this.store.activeCompanyId ? this.store.activeCompanyId() : null;
  }

  announce(id) {
    this.emit('attachments:status', { id, state: this.state(id) });
  }

  // ---------- what this device has ----------

  async refreshLocal() {
    try {
      this.localIds = new Set((await this.local.keys()).map(String));
    } catch (e) {
      console.warn('The files on this device could not be listed', e);
    }
    return this.localIds;
  }

  // The file store tells about a file it kept or dropped.
  added(id) {
    this.localIds.add(id);
    this.failed.delete(id);
    this.announce(id);
  }

  removed(id) {
    this.localIds.delete(id);
    this.announce(id);
  }

  // ---------- states ----------

  state(id) {
    if (this.downloading.has(id)) return 'downloading';
    const inDrive = this.remoteIds.has(id);
    if (this.localIds.has(id)) {
      if (!this.isConnected() && !this.listed) return 'local';
      return inDrive ? 'synced' : 'pending';
    }
    if (this.failed.has(id)) return this.failed.get(id);
    if (!this.isConnected()) return 'offline';
    if (this.listed === this.companyId() && !inDrive) return 'notUploaded';
    return 'remote';
  }

  // Files of the active company still waiting for their upload.
  pendingCount() {
    const data = this.store.data;
    if (!data) return 0;
    let n = 0;
    keptAttachments(data, this.retention).forEach((until, id) => { if (this.localIds.has(id) && !this.remoteIds.has(id)) n += 1; });
    return n;
  }

  // ---------- Drive ----------

  async list(companyId) {
    const entries = await this.remote.drive.list(attachmentsFolder(companyId));
    const ids = new Map();
    entries.filter(e => !e.isFolder).forEach(e => {
      const parsed = parseAttachmentName(e.name);
      // The current name wins over the older "<id>.<ext>.enc" of the same id.
      if (parsed && (!ids.has(parsed.id) || !parsed.ext)) ids.set(parsed.id, { path: e.path, ext: parsed.ext });
    });
    this.remoteIds = ids;
    this.listed = companyId;
    return ids;
  }

  async upload(companyId, id) {
    const file = await this.local.get(id);
    if (!file || !file.bytes) {
      this.localIds.delete(id);
      return false;
    }
    const path = attachmentPath(companyId, id);
    await this.remote.putSealed(path, encodePayload(file));
    this.remoteIds.set(id, { path, ext: null });
    return true;
  }

  // One pass for a company (see the header). Transport failures (offline,
  // token) end the pass like any sync; a failure of one file is logged and
  // the file stays pending.
  async sync(companyId, { upload = false } = {}) {
    const data = await this.store.companyData(companyId);
    if (!data) return { pending: 0, uploaded: 0, deleted: 0 };
    await this.refreshLocal();
    const referenced = keptAttachments(data, this.retention);
    const saved = (await this.loadState(companyId)) || {};
    const known = knownMap(saved.known);
    const remoteIds = await this.list(companyId);
    const keep = new Map(referenced);
    const today = this.today();
    let uploaded = 0;
    let deleted = 0;

    for (const [id, until] of known) {
      if (referenced.has(id)) continue;
      // Gone from the data while its archive period runs: the file stays.
      if (!mayRemove(until, today)) { keep.set(id, until); continue; }
      if (this.localIds.has(id)) {
        try {
          await this.local.delete(id);
          this.localIds.delete(id);
        } catch (e) {
          console.warn(`The file of removed attachment ${id} could not be dropped from this device`, e);
        }
      }
      const entry = remoteIds.get(id);
      if (!entry) continue;
      if (!upload) { keep.set(id, until); continue; }
      try {
        await this.remote.removeAt(entry.path);
        remoteIds.delete(id);
        deleted += 1;
      } catch (e) {
        if (unreachable(e)) throw e;
        console.error(`The file of removed attachment ${id} could not be removed from Drive`, e);
        keep.set(id, until);
      }
    }

    for (const id of referenced.keys()) {
      if (!this.localIds.has(id) || remoteIds.has(id) || !upload) continue;
      try {
        if (await this.upload(companyId, id)) uploaded += 1;
      } catch (e) {
        if (unreachable(e)) throw e;
        console.error(`The file of attachment ${id} could not be uploaded`, e);
      }
    }

    await this.saveState(companyId, { known: Object.fromEntries(keep) });
    referenced.forEach((until, id) => { if (this.failed.get(id) === 'notUploaded' && remoteIds.has(id)) this.failed.delete(id); });
    this.emit('attachments:status', { id: null, state: null });
    return { pending: this.pendingCount(), uploaded, deleted };
  }

  // ---------- taking a file from Drive ----------

  /** The file of an attachment of the active company from Drive, kept on this device; null when it cannot be had. */
  fetch(id) {
    if (this.downloading.has(id)) return this.downloading.get(id);
    const job = this.download(id).finally(() => {
      this.downloading.delete(id);
      this.announce(id);
    });
    this.downloading.set(id, job);
    this.announce(id);
    return job;
  }

  async download(id) {
    const companyId = this.companyId();
    if (!companyId) return null;
    if (!this.isConnected()) {
      this.failed.set(id, 'offline');
      return null;
    }
    try {
      let entry = this.listed === companyId ? this.remoteIds.get(id) : null;
      if (!entry) entry = (await this.list(companyId)).get(id) || null;
      if (!entry) {
        this.failed.set(id, 'notUploaded');
        return null;
      }
      const bytes = await this.remote.getSealed(entry.path);
      if (!bytes) {
        this.remoteIds.delete(id);
        this.failed.set(id, 'notUploaded');
        return null;
      }
      const record = attachmentRecordOf(this.store.data, id) || {};
      const file = decodePayload(bytes, { name: record.name, type: record.mime, ext: entry.ext });
      await this.local.put(id, file);
      this.localIds.add(id);
      this.failed.delete(id);
      return file;
    } catch (e) {
      if (unreachable(e)) {
        this.failed.set(id, 'offline');
        console.warn(`Attachment ${id} cannot be taken from Drive now`, e);
        return null;
      }
      throw e;
    }
  }

  // Signing out: nothing is known about Drive any more.
  reset() {
    this.remoteIds = new Map();
    this.listed = null;
    this.failed.clear();
    this.emit('attachments:status', { id: null, state: null });
  }
}

