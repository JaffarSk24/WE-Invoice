// The eFaktúra service of the running app: one place that knows whether
// Peppol is switched on for the open company (provider, credentials)
// and runs the send queue, the delivery checks and the inbox. The editor of
// WP-SALES sends through the event peppol:send { documentId } and hears
// back peppol:status { documentId, status } at every step.
import { PeppolError } from './errors.js';
import { openConnection, peppolSettings } from './connection.js';
import { createArchive } from './archive.js';
import { createOutbox } from './outbox.js';
import { createInbox } from './inbox.js';

/**
 * @param {{getStore: () => object|null, transport: object, emit: Function, buildPdf?: Function, pdfName?: Function,
 *   loadAttachment?: Function, archive?: object, now?: () => string}} deps
 */
export function createPeppolService({ getStore, transport, emit, buildPdf = null, pdfName = null, loadAttachment = null, archive = createArchive(), now = () => new Date().toISOString() }) {
  const sending = new Map();
  let receiving = null;
  let ticking = null;

  function store() {
    const s = getStore();
    if (!s || !s.company()) throw new PeppolError('PEPPOL_NOT_ALLOWED', 'no company is open');
    return s;
  }

  async function connect() {
    const company = store().company();
    if (!peppolSettings(company).enabled) throw new PeppolError('PEPPOL_NO_PROVIDER', 'no provider connected');
    return openConnection({ transport, company });
  }

  const outbox = () => createOutbox({ store: store(), archive, connect, buildPdf, pdfName, loadAttachment, emit, now });
  const inbox = () => createInbox({ store: store(), archive, connect, emit, now });

  /** Sends one document; a second call for the same document waits for the first. */
  function send(documentId) {
    if (!sending.has(documentId)) {
      const run = outbox().send(documentId).finally(() => sending.delete(documentId));
      sending.set(documentId, run);
    }
    return sending.get(documentId);
  }

  /** Sends the selected documents one after another (§ 4.6 step 6). */
  async function sendMany(ids) {
    const results = [];
    for (const id of ids) {
      try {
        results.push({ id, document: await send(id) });
      } catch (error) {
        results.push({ id, error });
      }
    }
    return results;
  }

  // Fetches the waiting documents now (the "receive now" button); runs once at a time.
  function receiveNow() {
    if (!receiving) receiving = inbox().receiveAll().finally(() => { receiving = null; });
    return receiving;
  }

  /** Is the company ready for background work? Quietly false when not. */
  async function ready() {
    const s = getStore();
    if (!s || !s.company() || s.readOnly) return false;
    return peppolSettings(s.company()).enabled;
  }

  /**
   * Background round: retries that are due, delivery checks and, when
   * automatic receiving is on, the inbox. Errors are logged, not thrown.
   * @returns {Promise<{retried: number, changed: object[], received: object|null}>}
   */
  function tick() {
    if (ticking) return ticking;
    ticking = (async () => {
      const result = { retried: 0, changed: [], received: null };
      if (!(await ready())) return result;
      try {
        for (const document of outbox().dueRetries(now())) {
          await send(document.id);
          result.retried++;
        }
        result.changed = await outbox().checkStatuses(now());
        if (peppolSettings(store().company()).autoReceive) result.received = await receiveNow();
      } catch (error) {
        console.warn('peppol: background round stopped', error.code || error.name);
      }
      return result;
    })().finally(() => { ticking = null; });
    return ticking;
  }

  /**
   * The provider's PDF of a received document: from the archive, else
   * fetched from the provider once and archived. Null when there is none.
   * @returns {Promise<Uint8Array|null>}
   */
  async function receivedPdf(documentId) {
    const s = store();
    const company = s.company();
    const doc = s.get('documents', documentId);
    if (!doc || doc.peppol?.direction !== 'IN') return null;
    if (doc.peppol.pdfFileId) {
      const kept = await archive.readPdf(company.id, doc.peppol.pdfFileId);
      if (kept) return kept;
    }
    if (!doc.peppol.providerMessageId) return null;
    const connection = await connect();
    if (!connection.adapter.visual) return null;
    const visual = await connection.adapter.visual(doc.peppol.providerMessageId);
    if (!visual) return null;
    try {
      const key = await archive.savePdf(company.id, doc.receivedDate || doc.issueDate, doc.id, visual.bytes);
      if (!s.readOnly) await s.update('documents', doc.id, { peppol: { ...doc.peppol, pdfFileId: key } });
    } catch (error) {
      console.warn('peppol: the picture was shown but not archived', error.code || error.name);
    }
    return visual.bytes;
  }

  return { connect, send, sendMany, receiveNow, tick, ready, receivedPdf };
}
