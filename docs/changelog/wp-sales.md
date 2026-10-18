# WP-SALES: sales documents

## Added

- Lists of invoices, proforma invoices, credit and debit notes, quotes, orders and delivery notes: search, filters by period, status, client, label, currency and payment, sorting, totals per currency, bulk PDF download, sending and marking as paid, cards on a phone, an empty state with one main action, the status from the core and the "eFaktúra povinná" badge for Slovak sellers.
- One document editor for every sales kind: client search with a simple contact created on the spot, item, text and subtotal lines with price list suggestions, units in the print language, line and document discounts, VAT rates and exemption references from legislation, prices with or without VAT, live totals by EN 16931, the number the series will give, dates from the client or company due days, symbols, payment method and bank account, currency with the ECB rate, print language and second language, template, texts and an internal note, autosave of drafts and deletion with Undo.
- Issuing with the check of mandatory particulars shown at the fields, conversions (quote to proforma, invoice or order; proforma to the tax document for the received payment and to the final invoice that deducts the advance; invoice to credit note, debit note or delivery note), copies, statuses the user may set, unlocking a locked document with a reason in the audit log.
- Document card with the status ribbon, payments (partial payments, removal with Undo), related documents, the send log, PDF download and print.
- eKasa stage 1: for cash, card and on-site QR payments a screen with the invoice number and amount to copy into VRP2, the link to VRP2, the field for the receipt id, and a warning for cash between businesses above the legal limit.
- Settings: document defaults, numbering series with masks, resets, variable symbol masks and a protected next counter, and the company section with identifiers checked, bank accounts, logo, signature and stamp.
- Events for other packages: `document:send`, `peppol:send`, `stock:document-issued`; the editor opens on `document:new`, `fab:action` and `quick:invoice`, and takes price levels from `pricing:provider`.
- The dashboard reads documents, contacts, accounts and the inbox count from the store while a company is open.
- Unit labels in the print dictionaries.

## Fixed

- Leaving the editor right after issuing no longer writes the stale draft over the issued document.
