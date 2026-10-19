# WP-BANK: bank, cash desk and payments

## Added

- Bank statement import in packages/core/payments/bank: CSV with bank profiles kept as data (Tatra banka, Slovenská sporiteľňa, VÚB, ČSOB SK, 365.bank, Prima banka, UniCredit, Fio, mBank, Revolut Business, Wise) and a generic layout, profile detection from the header, windows-1250 decoding, CAMT.053, MT940 and ABO/GPC. Transactions are normalised to bankTransactions records with decimal string amounts, calendar dates, VS/KS/SS, counterparty and IBAN (built from SK and CZ domestic numbers when needed).
- Idempotent import: keys of account, date, amount and reference, with a counter for identical lines of one file.
- Matching of transactions with documents: VS and amount (100), IBAN and amount (90), VS with another amount (85), document number in the message (80 or 70), amount and name (60), IBAN with another amount (50); partial payments and overpayments, one payment for several documents, several payments for one document, explanations as codes, confirmation before anything is written, undo.
- SEPA pain.001.001.03 batches for open received invoices with IBAN, BIC, amount and currency checks, validated against the ISO 20022 schema in tests.
- Cash desk: cash books with their own numbering series, príjmový and výdavkový pokladničný doklad, running balance, negative balance warning, pokladničná kniha as CSV and in the print window, vouchers created with cash payments.
- B2B cash payment limit from legislation (cashPaymentLimitB2b), counting earlier cash on the same document.
- Offset (zápočet) of receivables and payables with one party: protocol document, OFFSET payments, printed agreement, cancellation.
- eKasa stage 1: data for manual entry in VRP2 (invoice number and amount, VAT lines only for a sale that is not an invoice), a link to the financial administration's site, receipt ID and OKP fields on the payment; no integration with VRP2.
- Screens Bank, Cash desk and Payments with filters and phone cards, loaded on first use; events payment:record and payment:ekasa for other modules.
- Synthetic fixtures for every format and profile, unit tests and an end to end test of import, matching and the paid invoice.
