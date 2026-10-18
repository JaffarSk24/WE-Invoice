# WP-PEPPOL

## Added

- E-invoices in Peppol BIS Billing 3.0 (UBL 2.1) with the Slovak rules: `buildUbl(document, company, options)` writes an Invoice or a CreditNote from `computeTotals` without recomputing any amount, with the legal notes (reverse charge, cash accounting scheme, self-billing), the reference to the corrected invoice (BT-25, BT-26), the VAT in EUR for other currencies (BT-6, BT-111), the delivery country of intra-community supplies and the optional PDF attachment (`company.defaults.attachPdfToEInvoice`, on by default).
- `parseUbl(xml, { received })` reads a received Invoice or CreditNote back into a document with parties, lines, VAT by rate, payment details, references and attachments; it keeps the stated totals and reports differences as warnings. The XML parser has no dependencies and refuses DOCTYPE declarations.
- `validateUblLocal` and `hasBlockingIssues`: the Slovak rules of `packages/core/ubl/sk-rules.json` (one test per rule) checked before sending.
- 28 UBL fixtures in `tests/fixtures/ubl` (rates 23, 19 and 5 %, line and document discounts and charges, reverse charge, exempt, intra-community and export supplies, not subject to VAT, foreign currencies, the tax document to a payment, a final invoice after an advance, credit and debit notes, gross prices, base quantity, cash rounding, PDF attachment) with expected XML, a build, parse and build round trip, and invalid cases.
- CI workflow `ubl-validate.yml`: the fixture XML is checked against the UBL 2.1 schema, the OpenPeppol BIS Billing 3.0.21 rules and the CEN EN 16931 rules (1.3.17), run by Saxon-HE on the runner's Java, with every artefact pinned by version and SHA-256.
- Provider adapters behind one interface: SAPI-SK (for every provider that speaks it), Verteco and the ePošťák API. In the browser the calls go through the gateway proxy, on the desktop straight to the provider; keys stay in `transport.secrets`, tokens only in memory.
- Sending queue: local checks, provider validation where offered, the XML archived in Drive before it leaves, an idempotency key per document revision, retries with back-off for network and server failures, locking of accepted documents and delivery checks where the provider reports them.
- Receiving: polling, the original XML archived before anything else, the document stored as a received invoice or credit note to process with its attachments, the supplier matched or created by DIČ, duplicates detected, and the provider acknowledged only after the document is safe.
- Settings > eFaktúra: a connection wizard with the beta code, the provider cards from `providers.json`, the VPDS instructions, keys with a connection test, the Peppol registration check through the gateway and the options (automatic receiving, PDF attachment, e-mail copy).
- Screens `efaktury-out` (what was sent or must be sent, with the 15-day deadline, single and bulk sending, retry, XML download) and `efaktury-in` (received e-invoices with a receive-now button).
- Events for other modules: `peppol:send`, `peppol:sendMany`, `peppol:receive`, and `peppol:status`, `peppol:received` in return. Background rounds at start, every 5 minutes on the web and on the desktop scheduler tick `scheduler:efaktury`.
- Slovak and English texts of the module.

## Changed

- `providers.json`: API addresses of ePošťák, Verteco and eFaktúra.sk from their own documentation, with the sources listed; Dativery uses the SAPI-SK adapter; iPoštár has no adapter until its API is documented publicly.
- The tax document to a received payment is written with type code 388.
