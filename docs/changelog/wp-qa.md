## End-to-end testing and acceptance (WP-QA)

### Added

- End-to-end scenarios of the test plan on desktop, iPhone 14 and Pixel 7 with the network mocked: the first minute from the sample data to the PDF of the first invoice, totals with two rates and two discounts equal on the screen, in the PDF and in the UBL, a partial credit note, a proforma with its tax document for the payment and the final invoice, a recurring invoice over three periods, encryption with the recovery key and a password change, two devices syncing through a mocked Google Drive, two companies kept apart, a quick invoice from the FAB on a phone, six interface languages and four print languages, eFaktura with a mocked SAPI-SK provider, a CAMT.053 statement matched to invoices, an eKasa receipt read from its QR code, the KV of a month against its golden XML, a year of the cash book with the closing, and the migration from another invoicing app.
- End-to-end scenarios for the seams between the packages: an issued invoice moves the stock, lands in the VAT records and, once paid, in the cash book, with the price of the client's price level; bank payments change the statuses and the aging report; a closed VAT period keeps a document out of the editor; the card sends by e-mail and Peppol and starts a recurring invoice; an Inbox invoice reaches the VAT records and the Pohoda export.
- Accessibility audit with axe of every menu screen in both themes and of the main dialogs, and the main path with the keyboard only.
- Seeded generator of synthetic companies, contacts, items and documents with valid IČO, DIČ and IBAN (`tests/gen`), performance budgets over 10 000 documents in `npm run test:perf`, and the opening time of the invoice list measured in the browser.
- `npm run test:coverage` with the V8 provider of Vitest; more unit tests for the VAT records, the tax reports and the UBL reader.
- In-memory Google Drive and Peppol provider for the end-to-end tests (`tests/e2e/support`).
- Settings, Sync: the account and the state of the sync, with sign in and out, sync now, turning encryption on, unlocking this device and changing the password.
- The company switch on the More screen of phones.
- `docs/COVERAGE.md` (feature coverage for the release) and `docs/qa/0.1.0.md` (release checklist).

### Changed

- The document list builds its rows about three times faster: one collator for the sort, no arithmetic for documents without payments, and the eFaktura rules looked up once per date.

### Fixed

- Turning encryption on never finished: closing the recovery words on the way to the word check counted as a refusal, so nothing was uploaded and no confirmation was shown.
- A document of a closed VAT period could still be edited and saved, and a draft could be issued into a closed period.
- Two devices that issued their first document before syncing numbered it in two different series, so the merge kept the same number twice.
- The sync line of the menu read "Synchronizované" on a device that was not signed in or needed the password.
- Phones had no way to switch the company.
- Fields given their own id lost their label (editor dates, payment amount, the company wizard and settings), and the quick sale item box was a list without items when empty.
- A long receipt id in a title made the review screen wider than a phone and covered the Save button.
- The eFaktura duty of a document dated before the e-invoicing rules threw an error for every such row of a list.
