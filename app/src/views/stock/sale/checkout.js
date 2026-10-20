// Finishing a quick sale: the core issues the document from the cart, a
// sales receipt (number from the receipt series, created on the first
// sale) or, when a line is reverse charge or a supply to another member
// state, a full invoice with the buyer (number from the invoice series of
// the sales screens). The document and the series counter are stored, the
// stock moves follow from it and stock:sales-receipt-issued tells other
// modules (the cash book of WP-BANK) that a paid document exists.
import { issueSalesReceipt, salesReceiptSeries, movesForDocument, negativeStockWarnings } from '@we-invoice/core';
import { getStore } from '../../../store/index.js';
import { emit } from '../../../events.js';
import { t } from '../../../i18n/index.js';
import { StockError, writeBlocker, ensureWarehouse } from '../data.js';
import { queueDocumentSync, quietDocument } from '../document-moves.js';
import { resolveSeries, withSeries, takenNumbers } from '../../documents/series.js';

/**
 * @param {Array<{item: object, qty: string, vat?: string|null}>} cart
 * @param {{method: 'CASH'|'CARD', paid?: string|null, warehouseId?: string|null, buyer?: object|null}} options
 *   buyer: name, address and IČ DPH, required by a reverse-charge line (the core checks it)
 * @returns {Promise<{document: object, warnings: Array<object>}>}
 */
export async function checkout(cart, { method = 'CASH', paid = null, warehouseId = null, buyer = null } = {}) {
  const blocker = writeBlocker();
  if (blocker) throw new StockError(blocker);
  const store = getStore();
  const company = store.company();
  const { series } = salesReceiptSeries(company, { name: t('stock.sale.seriesName') });
  const warehouse = warehouseId || await ensureWarehouse();
  const documents = store.list('documents', { includeDeleted: true });
  const taken = documents.filter(d => d.seriesId === series.id && d.number).map(d => d.number);
  const invoiceSeries = resolveSeries(company, 'INVOICE').series;
  const { document, series: advanced } = issueSalesReceipt(cart, {
    company, series, invoiceSeries, method, paid, warehouseId: warehouse, taken, invoiceTaken: takenNumbers(documents, invoiceSeries.id),
    priceLevels: store.list('priceLevels'), buyer
  });
  const warnings = negativeStockWarnings(store.list('stockMoves'), movesForDocument(document, { items: store.list('items'), warehouseId: warehouse }));
  await store.updateCompany({ series: withSeries(company, advanced) });
  quietDocument(document.id);
  const saved = await store.insert('documents', document);
  // Queued behind the run the stored document itself triggered.
  await queueDocumentSync(saved.id, { onError: (e) => { throw e; } });
  emit('stock:sales-receipt-issued', { documentId: saved.id, kind: saved.kind });
  return { document: saved, warnings };
}
