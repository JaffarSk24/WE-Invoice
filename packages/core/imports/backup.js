// Reading a full backup and planning the restore (03-features.md § 3.13).
// A file is accepted only when it is whole: the right format, a known
// version, a schema version, the company root and a checksum that
// matches. A file of a newer schema than this app is refused (the app
// must be updated first); an older one is migrated with the core
// migrations. A damaged file never replaces anything.
//
// Restoring has to win against the copies on other devices: the sync
// merges record by record by updatedAt, so every restored record is
// stamped now, and every record that exists now but not in the backup is
// turned into a tombstone (stamped now as well). Without that, the next
// sync would bring the newer records straight back.
import { CoreError } from '../errors.js';
import { COLLECTIONS } from '../schema/entities/workspace.js';
import { migrate } from '../schema/migrations/index.js';
import { BACKUP_FORMAT, BACKUP_VERSION, backupChecksum } from '../exports/backup.js';

function damaged(message) {
  return new CoreError('BACKUP_DAMAGED', message);
}

/**
 * @param {string|object} input  the text of the file or the parsed object
 * @returns {object} the backup envelope
 */
export function parseBackup(input) {
  let backup = input;
  if (typeof input === 'string') {
    try {
      backup = JSON.parse(input);
    } catch {
      throw damaged('the file is not JSON');
    }
  }
  if (!backup || typeof backup !== 'object' || backup.format !== BACKUP_FORMAT) throw new CoreError('BACKUP_FORMAT_UNKNOWN', 'not a WE Invoice backup');
  if (!Number.isInteger(backup.version) || backup.version > BACKUP_VERSION) throw new CoreError('BACKUP_VERSION_NEWER', `backup version ${backup.version}`);
  const data = backup.data;
  if (!data || typeof data !== 'object' || !Number.isInteger(data.schemaVersion) || !data.companyId || !data.company || typeof data.company !== 'object') {
    throw damaged('the company data is missing');
  }
  if (COLLECTIONS.some(name => data[name] !== undefined && !Array.isArray(data[name]))) throw damaged('a collection is not a list');
  if (COLLECTIONS.some(name => (data[name] || []).some(r => !r || typeof r !== 'object' || !r.id))) throw damaged('a record has no id');
  if (backup.checksum !== backupChecksum(data)) throw damaged('the checksum does not match');
  return backup;
}

/**
 * The data root after restoring a backup over the current one.
 * @param {object|null} current  the open company data (null when none is open)
 * @param {object} backup  from parseBackup
 * @param {{now: string, schemaVersion: number}} ctx
 * @returns {{data: object, restored: number, removed: number, migrated: boolean, sameCompany: boolean}}
 */
export function planRestore(current, backup, ctx) {
  const result = migrate(backup.data, ctx.schemaVersion);
  if (result.readOnly) throw new CoreError('BACKUP_SCHEMA_NEWER', `backup schema ${backup.data.schemaVersion} is newer than ${ctx.schemaVersion}`);
  const source = result.data;
  const now = ctx.now;
  const companyId = current ? current.companyId : source.companyId;
  const out = {
    ...source,
    schemaVersion: ctx.schemaVersion,
    companyId,
    updatedAt: now,
    company: { ...source.company, id: companyId, updatedAt: now }
  };
  let restored = 0;
  let removed = 0;
  COLLECTIONS.forEach(name => {
    const records = (source[name] || []).map(r => ({ ...r, updatedAt: now }));
    const ids = new Set(records.map(r => r.id));
    restored += records.filter(r => !r.deleted).length;
    const gone = ((current && current[name]) || []).filter(r => !ids.has(r.id)).map(r => {
      if (r.deleted) return r;
      removed++;
      return { ...r, deleted: true, updatedAt: now };
    });
    out[name] = [...records, ...gone];
  });
  return { data: out, restored, removed, migrated: result.migrated, sameCompany: !current || current.companyId === source.companyId };
}
