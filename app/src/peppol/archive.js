// The ten-year archive of e-invoices in their original XML (zákon o DPH,
// 04-peppol.md § 4.1): <companyId>/archive/<YYYY>/<docId>.xml.enc in the
// user's Drive, sealed with the data key like every other file. The
// provider keeps nothing, so a document is sent only after its XML is
// archived, and a received one is acknowledged only after it is archived.
import { PeppolError } from './errors.js';
import { hasEngine, getEngine } from '../sync/index.js';
import { PATHS } from '../sync/remote.js';

const utf8 = new TextEncoder();
const utf8d = new TextDecoder();

/** Archive key stored in document.peppol.xmlFileId: "<YYYY>/<docId>". */
export const archiveKey = (year, docId) => `${year}/${docId}`;

function yearOf(date) {
  const year = String(date || '').slice(0, 4);
  return /^\d{4}$/.test(year) ? year : String(new Date().getUTCFullYear());
}

/**
 * @param {{putSealed: Function, getSealed: Function}|null} [remote]  defaults to the sync engine's Drive
 */
export function createArchive(remote = null) {
  const drive = () => {
    const r = remote || (hasEngine() ? getEngine().remote : null);
    if (!r) throw new PeppolError('PEPPOL_ARCHIVE_UNAVAILABLE', 'Drive is not connected');
    return r;
  };
  async function put(companyId, date, docId, ext, bytes) {
    const year = yearOf(date);
    try {
      await drive().putSealed(PATHS.archive(companyId, year, docId, ext), bytes);
    } catch (error) {
      if (error instanceof PeppolError) throw error;
      throw new PeppolError('PEPPOL_ARCHIVE_UNAVAILABLE', `archive write failed: ${error.code || error.name}`, { retryable: true });
    }
    return archiveKey(year, docId);
  }
  return {
    saveXml: (companyId, date, docId, xml) => put(companyId, date, docId, 'xml', utf8.encode(xml)),
    savePdf: (companyId, date, docId, bytes) => put(companyId, date, docId, 'pdf', bytes),
    // Attachments of received documents: <companyId>/attachments/<id>.<ext>.enc.
    async saveAttachment(companyId, id, name, bytes) {
      const ext = (/\.([a-z0-9]{1,8})$/i.exec(name || '') || [])[1] || 'bin';
      try {
        await drive().putSealed(PATHS.attachment(companyId, `${id}.${ext.toLowerCase()}`), bytes);
      } catch (error) {
        if (error instanceof PeppolError) throw error;
        throw new PeppolError('PEPPOL_ARCHIVE_UNAVAILABLE', `attachment write failed: ${error.code || error.name}`, { retryable: true });
      }
    },
    async readXml(companyId, key) {
      const [year, docId] = String(key).split('/');
      const bytes = await drive().getSealed(PATHS.archive(companyId, year, docId, 'xml'));
      return bytes ? utf8d.decode(bytes) : null;
    }
  };
}
