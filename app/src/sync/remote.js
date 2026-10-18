// The folder "My Drive/WE Invoice/" (02-architecture.md § 2.4.1) over the
// transport's drive bridge, with the data key of the vault applied:
//
//   workspace.json.enc                       workspace (files.js)
//   <companyId>/data.json.gz.enc             company data
//   <companyId>/backups/data-<ISO>-<tag>.json.gz.enc   the last 30 copies
//   <companyId>/archive/<YYYY>/<docId>.xml.enc, .pdf.enc
//   <companyId>/attachments/<id>.<ext>.enc
//   README.txt                               what this folder is, in the clear
//
// The drive bridge (transport.drive, web.js and desktop.js) works on paths
// relative to that folder and never throws for a missing file:
//   list(folder) -> [{ name, path, id, isFolder, size, version, modifiedTime }]
//   get(path)    -> null | { bytes: Uint8Array, id, version, modifiedTime }
//   put(path, bytes | text) -> { id, version, modifiedTime }  (creates folders)
//   delete(path) -> boolean
// A failure is an Error with .code: NOT_SIGNED_IN, RENEW_NEEDED, OFFLINE,
// DRIVE_SCOPE_MISSING or DRIVE_ERROR.
import { encodeJsonFile, decodeJsonFile, encodeWorkspaceFile, decodeWorkspaceFile, readWorkspaceHeader, sealBytes, openBytes } from './files.js';
import { cryptoError } from './crypto.js';

export const BACKUPS_KEPT = 30;
export const TRANSPORT_CODES = Object.freeze(['NOT_SIGNED_IN', 'RENEW_NEEDED', 'OFFLINE', 'DRIVE_SCOPE_MISSING']);
export const PATHS = Object.freeze({
  workspace: 'workspace.json.enc',
  readme: 'README.txt',
  company: (id) => `${id}/data.json.gz.enc`,
  backups: (id) => `${id}/backups`,
  backup: (id, iso, tag) => `${id}/backups/data-${iso.replace(/:/g, '-')}-${tag}.json.gz.enc`,
  archive: (id, year, docId, ext) => `${id}/archive/${year}/${docId}.${ext}.enc`,
  attachment: (id, name) => `${id}/attachments/${name}.enc`
});

export function folderOf(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function nameOf(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

const utf8 = new TextEncoder();
const utf8d = new TextDecoder();

export class Remote {
  constructor({ drive, vault, now = () => new Date().toISOString() }) {
    this.drive = drive;
    this.vault = vault;
    this.now = now;
  }

  key() {
    if (!this.vault.key) throw cryptoError('LOCKED');
    return this.vault.key;
  }

  // The newest file of that name in its folder, and any duplicates (two
  // devices creating it at the same moment).
  async stat(path) {
    const name = nameOf(path);
    const entries = (await this.drive.list(folderOf(path))).filter(e => e.name === name && !e.isFolder)
      .sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
    return { entry: entries[0] || null, duplicates: entries.slice(1) };
  }

  // ---------- workspace ----------

  // null when there is no workspace in Drive; otherwise the header and,
  // when this device holds the key, the workspace itself.
  async readWorkspace() {
    const file = await this.drive.get(PATHS.workspace);
    if (!file) return null;
    const text = utf8d.decode(file.bytes);
    const head = readWorkspaceHeader(text);
    if (this.vault.locked) return { header: head.keys, workspaceId: head.workspaceId, version: file.version, locked: true, workspace: null };
    const workspace = await decodeWorkspaceFile(this.vault.key, text);
    return { header: head.keys, workspaceId: head.workspaceId, version: file.version, locked: false, workspace };
  }

  async writeWorkspace(workspace) {
    return this.drive.put(PATHS.workspace, await encodeWorkspaceFile(this.key(), workspace));
  }

  // ---------- company data ----------

  async readCompanyAt(path) {
    const file = await this.drive.get(path);
    if (!file) return null;
    return { data: await decodeJsonFile(this.key(), file.bytes), version: file.version, id: file.id };
  }

  readCompany(companyId) {
    return this.readCompanyAt(PATHS.company(companyId));
  }

  async writeCompany(data) {
    return this.drive.put(PATHS.company(data.companyId), await encodeJsonFile(this.key(), data));
  }

  // One more copy in backups/, the oldest ones beyond the limit removed.
  // A failure here never stops a sync: it is logged and the sync goes on.
  async keepBackup(companyId, data, tag) {
    try {
      await this.drive.put(PATHS.backup(companyId, this.now(), tag), await encodeJsonFile(this.key(), data));
      const list = (await this.drive.list(PATHS.backups(companyId))).filter(e => !e.isFolder && e.name.startsWith('data-'))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const old of list.slice(0, Math.max(0, list.length - BACKUPS_KEPT))) await this.drive.delete(old.path);
    } catch (e) {
      if (TRANSPORT_CODES.includes(e && e.code)) throw e;
      console.error('A backup copy could not be kept', e);
    }
  }

  // ---------- other sealed files ----------

  async putSealed(path, bytes) {
    return this.drive.put(path, await sealBytes(this.key(), bytes));
  }

  async getSealed(path) {
    const file = await this.drive.get(path);
    return file ? openBytes(this.key(), file.bytes) : null;
  }

  async removeAt(path) {
    return this.drive.delete(path);
  }

  // The human-readable note in the folder, written once. A transport
  // failure (offline, token) is the caller's; anything else is only logged.
  async ensureReadme(text) {
    try {
      const { entry } = await this.stat(PATHS.readme);
      if (!entry) await this.drive.put(PATHS.readme, utf8.encode(text));
    } catch (e) {
      if (TRANSPORT_CODES.includes(e && e.code)) throw e;
      console.warn('README.txt could not be written', e);
    }
  }
}
