# WP-STOCK

## Added

- Stock core in `packages/core/stock`: validation of stock moves (receipt, issue, transfer, stocktaking difference), levels per item and warehouse on any date, warnings for balances below zero (checked at the end of each day, so backdated sales warn too) and for items under their minimum.
- Stock valuation by weighted average cost or FIFO per item across warehouses, with the cost of every move and the balance after it; a shortfall is costed at the last known cost and covered by the next receipt.
- Moves caused by documents (`movesForDocument`): issued invoices, delivery notes and sales receipts take goods out, received invoices bring them in at the net cost in EUR (with VAT for companies that cannot deduct it), credit notes marked with `stockReturn` bring goods back. An invoice whose goods left on a delivery note moves nothing. `reconcileDocumentMoves` and `documentMoveIds` keep the stored moves idempotent and identical on every device.
- Reservations by open received orders and the quantity free to sell.
- Prices for a client (`priceFor`): price levels with their own item prices or a discount, optional validity, the client's own prices and quantity discounts given as a line discount.
- Stocktaking differences as inventory adjustments, and a CSV writer (semicolon separated, decimal comma, BOM, formula cells neutralised).
- Quick sale (predajka): `issueSalesReceipt` issues a paid sales receipt without a client from a cart, cash rounded to the legal step, card not, partial payment possible; `vrpSummary` gives the data to type into the virtual cash register (VRP2).
- Stock screen (`#/stock`) with tabs for levels (reserved, available, unit cost, value, below minimum), the movement report for a period, stocktaking, warehouses with the valuation method, and price levels with item prices; CSV export of levels and moves.
- Receipt, issue and transfer dialogs with a quick way to add a stock item and a confirmation before a balance goes below zero.
- Quick sale screen (`#/quick-sale`) with search, barcode scanner input, cart, cash or card, partial payment and the VRP2 summary after the sale.
- Stock moves follow documents on the `stock:document-issued` event and on every local change of a document, so cancelling or deleting a document takes its moves back. The quick sale emits `stock:sales-receipt-issued`.
- Unit, DOM and end-to-end tests (receipt, quick sale, level drops) and a performance test of levels and valuation over 10 000 moves.
