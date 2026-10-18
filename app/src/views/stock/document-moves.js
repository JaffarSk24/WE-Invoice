// Keeps the stock moves of documents in step with the documents. Run when
// WP-SALES announces an issued document (stock:document-issued) and on
// every local change of a document, so cancelling or deleting one takes
// its moves back. The work is idempotent: the core says which moves a
// document needs, existing matching moves stay, the rest is replaced, and
// record ids come from the document so two devices never double a move.
// Runs are queued one after another so two events for the same document
// cannot insert the same move twice.
import { movesForDocument, reconcileDocumentMoves, documentMoveIds, documentsAffectedBy, negativeStockWarnings } from '@we-invoice/core';
import { getStore } from '../../store/index.js';
import { writeBlocker, ensureWarehouse } from './data.js';

const PLACEHOLDER = '~default-warehouse~';

async function syncOne(store, documentId) {
  const document = store.get('documents', documentId, { includeDeleted: true });
  const allMoves = store.list('stockMoves', { includeDeleted: true });
  const existing = allMoves.filter(m => !m.deleted && m.docId === documentId);
  let wanted = [];
  if (document && !document.deleted) {
    const warehouses = store.list('warehouses');
    const fallback = (warehouses.find(w => w.isDefault) || warehouses[0])?.id || PLACEHOLDER;
    wanted = movesForDocument(document, {
      items: store.list('items'), documents: store.list('documents'), warehouseId: fallback, company: store.company()
    });
    if (wanted.some(m => m.warehouseId === PLACEHOLDER)) {
      const id = await ensureWarehouse();
      wanted = wanted.map(m => (m.warehouseId === PLACEHOLDER ? { ...m, warehouseId: id } : m));
    }
  }
  const { insert, remove } = reconcileDocumentMoves(existing, wanted);
  if (!insert.length && !remove.length) return { document, inserted: [], warnings: [] };
  const remaining = allMoves.filter(m => !remove.includes(m));
  const warnings = negativeStockWarnings(remaining, insert);
  for (const move of remove) await store.remove('stockMoves', move.id);
  const taken = new Set(allMoves.map(m => m.id));
  const ids = documentMoveIds(documentId, insert, taken);
  const inserted = [];
  for (let i = 0; i < insert.length; i += 1) {
    if (store.get('stockMoves', ids[i], { includeDeleted: true })) continue;
    inserted.push(await store.insert('stockMoves', { ...insert[i], id: ids[i] }));
  }
  return { document, inserted, warnings };
}

/**
 * Brings the moves of a document (and of the invoices it covers, for a
 * delivery note) in line with it.
 * @returns {Promise<{inserted: Array<object>, warnings: Array<object>}>}
 */
export async function syncDocumentMoves(documentId, { store = getStore() } = {}) {
  if (!documentId || writeBlocker()) return { inserted: [], warnings: [] };
  const first = await syncOne(store, documentId);
  const result = { inserted: [...first.inserted], warnings: [...first.warnings] };
  if (first.document && !first.document.deleted) {
    for (const id of documentsAffectedBy(first.document, store.list('documents'))) {
      const other = await syncOne(store, id);
      result.inserted.push(...other.inserted);
      result.warnings.push(...other.warnings);
    }
  }
  return result;
}

let queue = Promise.resolve();
// Documents whose screen reports the stock warnings itself (the quick sale).
const quiet = new Set();

export function quietDocument(documentId) {
  quiet.add(documentId);
}

/**
 * Queues a sync; errors go to onError (or the console) and never stop
 * later runs. An onError that throws rejects the returned promise.
 * @returns {Promise<object|null>}
 */
export function queueDocumentSync(documentId, { onResult = null, onError = null } = {}) {
  const run = queue.then(() => syncDocumentMoves(documentId)).then(
    (result) => { if (onResult && !quiet.has(documentId)) onResult(result); return result; },
    (error) => { if (onError) onError(error); else console.error('Stock moves of a document failed', error); return null; }
  );
  // A failed run never blocks the ones queued after it.
  queue = run.catch(() => null);
  return run;
}
