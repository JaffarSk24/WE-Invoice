// Finishing a quick sale: the core issues the sales receipt from the cart
// (number from the receipt series, created on the first sale), the
// receipt and the series counter are stored, the stock moves follow from
// the receipt and stock:sales-receipt-issued tells other modules (the cash
// book of WP-BANK) that a paid receipt exists.
import { issueSalesReceipt, salesReceiptSeries, movesForDocument, negativeStockWarnings } from '@we-invoice/core';
import { getStore } from '../../../store/index.js';
import { emit } from '../../../events.js';
import { t } from '../../../i18n/index.js';
import { StockError, writeBlocker, ensureWarehouse } from '../data.js';
import { queueDocumentSync, quietDocument } from '../document-moves.js';

/**
 * @param {Array<{item: object, qty: string}>} cart
 * @param {{method: 'CASH'|'CARD', paid?: string|null, warehouseId?: string|null}} options
 * @returns {Promise<{document: object, warnings: Array<object>}>}
 */
export async function checkout(cart, { method = 'CASH', paid = null, warehouseId = null } = {}) {
  const blocker = writeBlocker();
  if (blocker) throw new StockError(blocker);
  const store = getStore();
  const company = store.company();
  const { series, created } = salesReceiptSeries(company, { name: t('stock.sale.seriesName') });
  const warehouse = warehouseId || await ensureWarehouse();
  const taken = store.list('documents', { includeDeleted: true }).filter(d => d.seriesId === series.id && d.number).map(d => d.number);
  const { document, series: advanced } = issueSalesReceipt(cart, {
    company, series, method, paid, warehouseId: warehouse, taken, priceLevels: store.list('priceLevels')
  });
  const warnings = negativeStockWarnings(store.list('stockMoves'), movesForDocument(document, { items: store.list('items'), warehouseId: warehouse }));
  const list = company.series || [];
  await store.updateCompany({ series: created ? [...list, advanced] : list.map(s => (s.id === advanced.id ? advanced : s)) });
  quietDocument(document.id);
  const saved = await store.insert('documents', document);
  // Queued behind the run the stored document itself triggered.
  await queueDocumentSync(saved.id, { onError: (e) => { throw e; } });
  emit('stock:sales-receipt-issued', { documentId: saved.id });
  return { document: saved, warnings };
}
