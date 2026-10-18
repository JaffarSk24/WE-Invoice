// Start-up of the stock module (WP-STOCK): registers its routes over the
// placeholders and starts its services. Called once, in the order of
// boot/index.js, after the language and the transport are ready.
//
//   #/stock       warehouses, levels, moves, stocktaking, price levels
//   #/quick-sale  the quick sale (predajka)
//
// Documents keep their stock moves in step: WP-SALES (and WP-PURCHASE for
// received invoices) emit stock:document-issued { documentId }; every
// local change of a document is followed as well, so a cancelled or
// deleted document takes its moves back.
import '../style/stock.css';
import { queueDocumentSync } from '../views/stock/document-moves.js';
import { setStockContext, qtyText, nameIndex } from '../views/stock/format.js';
import { stockData } from '../views/stock/data.js';

function reportWarnings(ctx, result) {
  if (!result || !result.warnings.length) return;
  const name = nameIndex(stockData().items);
  const w = result.warnings[0];
  ctx.showToast(ctx.t('stock.warning.negative', { item: name(w.itemId), qty: qtyText(w.qty) }), { type: 'info', duration: 8000 });
}

// The screens load on first visit, so they do not weigh on the start.
function lazyRoute(ctx, load) {
  return async (root, route) => {
    try {
      const render = await load();
      render(root, route);
    } catch (e) {
      ctx.showError(e, 'stock.error.load');
    }
  };
}

export async function boot(ctx) {
  setStockContext(ctx);
  ctx.registerRoute('stock', lazyRoute(ctx, async () => (await import('../views/stock/index.js')).renderStock));
  ctx.registerRoute('quick-sale', lazyRoute(ctx, async () => (await import('../views/stock/sale/index.js')).renderQuickSale));

  const follow = (documentId) => queueDocumentSync(documentId, {
    onResult: (result) => reportWarnings(ctx, result),
    onError: (error) => ctx.showError(error, 'stock.error.documentMoves')
  });
  ctx.on('stock:document-issued', (payload) => { if (payload && payload.documentId) follow(payload.documentId); });
  ctx.on('data:changed', (e) => { if (e && e.collection === 'documents' && e.id && e.source === 'local') follow(e.id); });
}
