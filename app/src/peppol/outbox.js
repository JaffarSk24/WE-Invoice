// Sending e-invoices (04-peppol.md § 4.6): DRAFT -> VALIDATING -> READY ->
// SENDING -> ACCEPTED (provider) -> DELIVERED (receiving access point), with
// INVALID for local or provider errors, FAILED for network and server
// errors (retried with back-off) and REJECTED for a negative delivery
// answer. The XML is archived before it leaves, the same Idempotency-Key
// (docId:revision) is used on every retry so a lost answer cannot create a
// duplicate, and an accepted document is locked: from then on it can only
// be corrected by a credit note.
import { PeppolError } from './errors.js';
import { prepareUbl, receiverIdOf } from './prepare.js';
import { MAX_SEND_ATTEMPTS, sendBackoffMs, statusBackoffMs, addMs, isDue, STATUS_CHECK_DAYS } from './retry.js';

const FINAL = new Set(['ACCEPTED', 'DELIVERED']);
const NEW_CONTENT = new Set(['INVALID', 'REJECTED']);

/**
 * @param {{store: object, archive: object, connect: () => Promise<object>, buildPdf?: Function, pdfName?: Function,
 *   loadAttachment?: (id: string) => Promise<object|null>, emit?: Function, now?: () => string}} deps
 *   loadAttachment reads the file of a document attachment kept on this device
 */
export function createOutbox({ store, archive, connect, buildPdf = null, pdfName = null, loadAttachment = null, emit = () => {}, now = () => new Date().toISOString() }) {
  async function setState(document, peppol, extra = {}) {
    const next = { direction: 'OUT', errors: [], ...(document.peppol || {}), ...peppol };
    const saved = await store.update('documents', document.id, { peppol: next, ...extra });
    emit('peppol:status', { documentId: document.id, status: next.status });
    return saved;
  }

  async function fail(document, error, attempts) {
    const errors = [{ code: error.code || 'PEPPOL_SERVER', message: error.detail || '', field: null }];
    if (error.retryable && attempts < MAX_SEND_ATTEMPTS) {
      const nextAttemptAt = addMs(now(), sendBackoffMs(attempts, error.retryAfterMs));
      return setState(document, { status: 'FAILED', errors, attempts, nextAttemptAt });
    }
    const status = error.code === 'PEPPOL_VALIDATION' ? 'INVALID' : 'FAILED';
    return setState(document, { status, errors, attempts, nextAttemptAt: null });
  }

  /**
   * Sends one document now. Resolves with the saved document; problems with
   * the document itself end as INVALID, transient ones as FAILED.
   * Throws only when nothing could be recorded (no store, no company).
   */
  async function send(documentId) {
    if (store.readOnly) throw new PeppolError('PEPPOL_READ_ONLY', 'the data file is read-only');
    const company = store.company();
    let document = store.get('documents', documentId);
    if (!company || !document) throw new PeppolError('PEPPOL_NOT_ALLOWED', `document ${documentId} not found`);
    if (FINAL.has(document.peppol?.status)) return document;
    const revision = (document.peppol?.revision || 0) + (NEW_CONTENT.has(document.peppol?.status) || !document.peppol ? 1 : 0);
    const attempts = (document.peppol?.status === 'FAILED' ? document.peppol.attempts || 0 : 0) + 1;
    document = await setState(document, { status: 'VALIDATING', revision, attempts });

    let connection;
    let prepared;
    try {
      connection = await connect();
      const caps = connection.adapter.capabilities();
      // The message limit: the adapter's, else the provider's from providers.json, else 10 MB (core default).
      const maxMessageBytes = caps.maxMessageBytes || connection.provider.maxMessageBytes || null;
      prepared = await prepareUbl({ store, document, company, buildPdf, pdfName, maxAttachmentBytes: caps.maxAttachmentBytes, maxMessageBytes, loadAttachment });
    } catch (error) {
      if (error.code === 'PEPPOL_ATTACHMENT_MISSING') {
        return setState(document, { status: 'INVALID', errors: [{ code: 'ATTACHMENT_MISSING', message: error.detail || '', field: 'attachments' }] });
      }
      if (error.code === 'PEPPOL_NOT_ALLOWED' || error.code === 'PEPPOL_NO_PROVIDER' || error.code === 'PEPPOL_NO_CREDENTIALS') {
        return setState(document, { status: 'INVALID', errors: [{ code: error.code, message: error.detail || '', field: null }] });
      }
      if (error.code === 'UBL_INVALID' || error.code?.startsWith?.('VAT_')) {
        return setState(document, { status: 'INVALID', errors: [{ code: error.code, message: error.message, field: null }] });
      }
      return fail(document, error, attempts);
    }
    const skippedAttachments = prepared.skippedAttachments;
    if (!prepared.xml) {
      const errors = prepared.issues.filter(i => i.severity === 'error')
        .map(i => ({ code: i.code, message: i.bt, field: i.field, ...(i.detail ? { params: i.detail } : {}) }));
      return setState(document, { status: 'INVALID', errors, skippedAttachments });
    }

    const contact = prepared.options.contact;
    const receiverId = receiverIdOf(document, contact);
    try {
      if (connection.adapter.capabilities().validate) {
        const check = await connection.adapter.validate(prepared.xml, { receiverId });
        if (!check.ok) return setState(document, { status: 'INVALID', errors: check.errors.map(m => ({ code: 'PEPPOL_VALIDATION', message: String(m), field: null })) });
      }
      document = await setState(document, { status: 'READY', providerId: connection.provider.id, skippedAttachments });
      const xmlFileId = await archive.saveXml(company.id, document.issueDate, document.id, prepared.xml);
      document = await setState(document, { status: 'SENDING', xmlFileId });
      const result = await connection.adapter.send({
        xml: prepared.xml, rootName: prepared.rootName, documentId: document.id,
        idempotencyKey: `${document.id}:${revision}`, senderId: connection.participantId, receiverId
      });
      const at = now();
      const sendLog = [...(document.sendLog || []), { at, channel: 'PEPPOL', to: receiverId, result: result.status, detail: null }];
      return setState(document, {
        status: result.status, providerMessageId: result.providerMessageId, sentAt: at, errors: [], attempts, nextAttemptAt: null,
        deliveredAt: result.status === 'DELIVERED' ? at : null, statusChecks: 0, nextCheckAt: addMs(at, statusBackoffMs(0))
      }, { lockedAt: document.lockedAt || at, status: document.status === 'ISSUED' ? 'SENT' : document.status, sendLog });
    } catch (error) {
      if (!(error instanceof PeppolError)) console.error('peppol: sending failed', error);
      return fail(document, error instanceof PeppolError ? error : new PeppolError('PEPPOL_SERVER', error.message, { retryable: true }), attempts);
    }
  }

  /** Documents whose retry time has come. */
  function dueRetries(at = now()) {
    return store.list('documents').filter(d => d.peppol?.direction === 'OUT' && d.peppol.status === 'FAILED' && d.peppol.nextAttemptAt && isDue(d.peppol.nextAttemptAt, at));
  }

  /** Asks the provider about delivery of accepted documents (when it can tell). */
  async function checkStatuses(at = now()) {
    const waiting = store.list('documents').filter(d => d.peppol?.direction === 'OUT' && d.peppol.status === 'ACCEPTED' && isDue(d.peppol.nextCheckAt, at)
      && (!d.peppol.sentAt || addMs(d.peppol.sentAt, STATUS_CHECK_DAYS * 86400000) > at));
    if (!waiting.length) return [];
    const connection = await connect();
    if (!connection.adapter.capabilities().status) return [];
    const changed = [];
    for (const document of waiting) {
      try {
        const result = await connection.adapter.status(document.peppol.providerMessageId);
        const checks = (document.peppol.statusChecks || 0) + 1;
        if (result.status === 'ACCEPTED') {
          await setState(document, { statusChecks: checks, nextCheckAt: addMs(now(), statusBackoffMs(checks)) });
          continue;
        }
        const errors = result.status === 'REJECTED' ? [{ code: 'PEPPOL_REJECTED', message: result.detail || '', field: null }] : [];
        changed.push(await setState(document, { status: result.status, deliveredAt: result.status === 'DELIVERED' ? (result.deliveredAt || now()) : null, errors, statusChecks: checks, nextCheckAt: null }));
      } catch (error) {
        console.warn('peppol: delivery status not available', error.code || error.name);
      }
    }
    return changed;
  }

  return { send, dueRetries, checkStatuses };
}
