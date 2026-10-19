# WP-EXIM: old Excel files, Shoptet orders, SuperFaktura API

## Added

- Migration reads old Excel 97-2003 files (.xls, BIFF8) with its own small reader: the compound file container, the shared string table across CONTINUE records, dates by number format and cached formula results. Excel 95 files and files protected by a password are refused with their own messages.
- Shoptet orders: the XML and the CSV order export become draft invoices (numbered when issued, the order code kept as the order reference) or received orders, with the customers as contacts and the products as price list items. Lines link to the price list by product code, prices are taken with VAT so the totals equal the orders, cancelled orders are skipped, and an order imported before is not imported again.
- SuperFaktura API: with the account e-mail and the API key, clients, the price list and invoices with their lines and payments are downloaded page by page with a progress line and a stop button, then shown in the import preview like a file. The credentials can be kept on the device in the transport secrets. On the desktop the API is called directly; in the browser a request the API refuses is sent through the gateway route `/v1/proxy/superfaktura/{market}/{path}`.

## Changed

- The export, import and backup dictionaries are split into two files per language.
- Two kind lists of the export modules are written out instead of spread, so the export code no longer loads with the start of the app.
- The screen builds its DOM only through the helpers of `ui/dom.js`.
