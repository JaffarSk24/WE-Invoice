// The full backup of one company (03-features.md § 3.13): every record,
// tombstones included, with the schema version it was written in and a
// checksum of the content, so a file damaged on the way is recognised
// before it can replace anything. Encryption with a password is done by
// the app with the sync package's crypto; this is the plain content.
import { exportFingerprint } from './state.js';

export const BACKUP_FORMAT = 'we-invoice-backup';
export const BACKUP_VERSION = 1;

/** Checksum of the backed-up data (canonical JSON, FNV based). */
export function backupChecksum(data) {
  return exportFingerprint({ data });
}

/**
 * @param {object} data  the company data root (schemaVersion, companyId, company, collections)
 * @param {{now: string, app?: string}} ctx
 */
export function buildBackup(data, ctx) {
  const counts = {};
  Object.entries(data || {}).forEach(([k, v]) => { if (Array.isArray(v)) counts[k] = v.length; });
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: ctx.now,
    app: ctx.app || 'WE Invoice',
    schemaVersion: data.schemaVersion,
    companyId: data.companyId,
    companyName: (data.company && data.company.name) || '',
    counts,
    checksum: backupChecksum(data),
    data
  };
}

/** The backup as the text of a .json file. */
export function serializeBackup(backup) {
  return `${JSON.stringify(backup, null, 1)}\n`;
}
