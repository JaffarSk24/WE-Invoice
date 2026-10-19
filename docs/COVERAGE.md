# Feature coverage for release 0.1.0

How WE Invoice answers the weak points of other invoicing apps used in Slovakia and the Czech Republic, and where it keeps parity with their strong points. Every row has a status and the evidence: a test, an end-to-end scenario or a screen. Status values: **Done** (built and covered by a test), **Partial** (built in part; the missing part is named), **Missing** (planned but not built yet), **Not planned** (a deliberate choice, explained in the FAQ of the site).

Checked against the `develop` branch after wave B, on 19 October 2026. End-to-end scenarios live in `tests/e2e`, unit tests next to the code.

## A. Weak points of other invoicing apps that WE Invoice closes

| # | Weak point elsewhere | WE Invoice | Priority | Status | Evidence |
|---|---|---|---|---|---|
| A1 | Free plan cut down (few contacts, no VAT, no bank) | Everything free, no limits on contacts, documents, companies or users | P0 | Done | No limit in the store or the screens; `tests/e2e/large-list.spec.js` (10 000 documents), `tests/e2e/multi-company.spec.js` |
| A2 | Recurring invoices, extra users and companies are paid | Free, unlimited companies | P0 | Done | `tests/e2e/recurring-periods.spec.js`, `tests/e2e/sales-crm-recurring.spec.js`, `tests/e2e/multi-company.spec.js` |
| A3 | Bank only through parsed e-mail notices of a few banks | Statement import CSV, CAMT.053, MT940, ABO/GPC of any bank; profiles of Slovak banks | P1 | Done | `packages/core/payments/bank`, fixtures `tests/fixtures/bank` (12 CSV profiles, CAMT.053, MT940, GPC), `tests/e2e/bank.spec.js`, `tests/e2e/seams-bank.spec.js` |
| A4 | Matching by variable symbol only, bank consent renewed every 180 days, 3 months of history | Matching by VS, IBAN, amount, number in the message and name with a confidence; no consent, no history limit | P1 | Done | `packages/core/payments/bank` (matchStatement), match dialog `app/src/views/money/bank/match-dialog.js`, `tests/e2e/seams-bank.spec.js` |
| A5 | No payment orders for received invoices | SEPA pain.001 batch, PAY by square from a received invoice | P1 | Done | `packages/core/payments/bank/pain001.js` (validated against `tests/fixtures/bank/xsd/pain.001.001.03.xsd`), `app/src/views/money/bank/pain-dialog.js` |
| A6 | Automatic reminders only while the user is logged in | Desktop tray scheduler, run at start of the app; optional server helper | P0 | Partial | Tray scheduler `desktop/` (scheduler:reminders), run at start `app/src/views/reminders/service.js`, `tests/e2e/sales-crm-reminders.spec.js`. The optional server helper of the gateway is not built. |
| A7 | One reminder template, no escalation | Three levels with their own templates and a friendly note before the due date | P0 | Done | `app/src/views/reminders/plan.js`, `app/src/views/settings/reminders-section.js`, `tests/e2e/sales-crm-reminders.spec.js` |
| A8 | No late payment interest and no flat 40 EUR recovery cost | Interest from the ECB rate and the margin in legislation, plus the flat cost of § 369c ObZ | P0 | Done | `packages/core/payments` (late interest), `legislation/sk.json` (recoveryCostFlat), `tests/e2e/sales-crm-reminders.spec.js` |
| A9 | Sent reminders are not archived | Every reminder kept as a document (PDF) in the client's history | P0 | Done | `app/src/views/reminders/document.js` (REMINDER document), client history `app/src/views/contacts/detail.js`, `tests/e2e/sales-crm-reminders.spec.js` |
| A10 | No KV DPH, SV or VAT return in the Slovak version | XML for eDane with checks before filing | P1 | Done | `packages/core/tax` with golden examples `tests/fixtures/tax`, `tests/e2e/tax.spec.js`, `tests/e2e/tax-kv.spec.js`. Validation against the official XSD runs once the schemas are added (see `tests/fixtures/tax/xsd/README.md`). |
| A11 | Bookkeeping, assets and cash book only in a separate paid program | Simple bookkeeping and tax records in the same app | P1 | Done | `packages/core/ledger`, screens cash journal, assets, closing; `tests/e2e/ledger.spec.js`, `tests/e2e/ledger-year.spec.js`, `tests/e2e/seams-issue.spec.js` |
| A12 | Paid recognition of incoming documents, receipts typed by hand | Free local OCR, XML and QR recognition, eKasa QR data from the eKasa API | P1 | Done | `app/src/ocr`, `packages/core/imports/inbox`, `tests/e2e/purchase.spec.js` (PDF, Factur-X, photo OCR), `tests/e2e/inbox-ekasa.spec.js` |
| A13 | Import of a received e-invoice takes the header only | All lines, VAT, attachments, link to the KV | P0 | Done | `packages/core/ubl/parse.js`, `app/src/peppol/inbox.js`, `tests/e2e/peppol-flow.spec.js` (received e-invoice), `tests/e2e/seams-inbox.spec.js` (received invoice in the VAT records and Pohoda) |
| A14 | Document and line discount not together | Both at once, right in UBL (AllowanceCharge) | P0 | Done | `packages/core/vat`, UBL fixture `tests/fixtures/ubl/expected/05-doc-discount-pct-and-line.xml`, `tests/e2e/sales-totals.spec.js` (screen, PDF and UBL agree) |
| A15 | Reverse charge missing on cash documents and simplified invoices | Category AE in every document kind where the law allows it | P0 | Partial | AE in the editor of invoices, credit and debit notes and in UBL (`tests/fixtures/ubl/expected/07-reverse-charge-ae.xml`). The quick sale (predajka) and cash vouchers take the VAT of the item and offer no AE choice. |
| A16 | Attachments up to 2 MB, at most 5 | No count limit, up to 10 MB per file | P0 | Partial | The document schema has attachments and the Inbox keeps the source file (`app/src/views/purchase/intake.js`, 20 MB). The sales editor has no screen to attach files to an issued document yet. |
| A17 | No orders and no stand-alone delivery note | Orders received and issued, delivery note, one invoice from several delivery notes | P1 | Partial | Kinds ORDER_IN, ORDER_OUT, DELIVERY_NOTE and the conversions quote to order to invoice or delivery note (`packages/core/documents/convert.js`, `#/orders`, `#/delivery-notes`). One invoice from several delivery notes is not built. |
| A18 | Basic stock: one warehouse, no valuation | Several warehouses, minimum stock, stocktaking, average price | P1 | Done | `packages/core/stock`, `app/src/views/stock`, `tests/e2e/stock.spec.js`, `tests/e2e/seams-issue.spec.js` |
| A19 | Two roles without settings | Four roles and an action log | P2 | Partial | The action log is built (`#/audit`, `app/src/views/reports/audit-recorder.js`, `tests/e2e/reports.spec.js`). Roles are not built: every device of the account has full rights. |
| A20 | No accountant workspace with several clients | Accountant mode with client workspaces and an overview | P2 | Missing | Several companies per workspace exist (A30); the accountant overview is not built. |
| A21 | No online acceptance of a quote, no client portal | Zero-knowledge link: view, accept or decline | P2 | Missing | Not built. |
| A22 | No online payment by link | The user's payment link with amount and VS in the PDF and the e-mail | P2 | Partial | The document schema has `paymentLink`; the editor, the PDF and the e-mail do not use it yet. |
| A23 | Only four print languages | SK, CS, EN, DE plus bilingual documents | P0 | Done | `app/src/i18n/print/*.json`, `app/src/pdf/labels.js`, `tests/e2e/languages.spec.js` (print in four languages) |
| A24 | No P&L, cash flow forecast, reports by project and tag | Profit by client and project, inflow forecast, reports by tag | P1 | Done | `packages/core/reports` (profitability, cashflowForecast), `tests/e2e/reports.spec.js` |
| A25 | Recurring invoice without end date and indexation | End date and number of runs; indexation later (P2) | P0 / P2 | Partial | End date and count in `app/src/views/recurring/model.js` and `schedule.js`, `tests/e2e/recurring-periods.spec.js`. Price indexation (P2) is not built. |
| A26 | Overloaded interface | First invoice within 60 s, progressive disclosure, speed tested end to end | P0 | Done | `tests/e2e/first-run.spec.js`, `tests/e2e/onboarding.spec.js`, `tests/e2e/large-list.spec.js` |
| A27 | Mobile app hangs and crashes | PWA with end-to-end tests on phone viewports | P0 | Done | Every scenario runs on iPhone 14 and Pixel 7 (`playwright.config.js`); `tests/e2e/phone-quick-invoice.spec.js` |
| A28 | No link to accounting programs | Export to Pohoda XML, Money S3 XML, Omega, ISDOC, UBL, XLSX | P0 | Done | `packages/core/exports`, `tests/e2e/exim.spec.js`, `tests/e2e/seams-inbox.spec.js` |
| A29 | No shop connectors, or paid ones | Import of orders and invoices from shop exports (XML, CSV) | P2 | Partial | WooCommerce order exports are read by the CSV importer (`packages/core/imports/mapping.js`); a Shoptet export profile is not built. |
| A30 | Every company is a licence, confusing product line | One app, every feature, unlimited companies | P0 | Done | `tests/e2e/multi-company.spec.js`; the company switch on phones on the More screen |
| A31 | Peppol tied to the vendor's provider | Free choice of provider (SAPI-SK and native adapters), change without losing data | P0 (beta) | Done | `app/src/peppol/adapters` (SAPI-SK, Verteco, ePošťák), `packages/core/peppol/providers.json`, `tests/e2e/peppol.spec.js`, `tests/e2e/peppol-flow.spec.js` |
| A32 | Sending e-invoices paid above a monthly count | WE takes nothing; the user picks a provider, with the tariffs in the wizard | P0 | Done | Pricing links of providers in the eFaktura wizard (`app/src/views/settings/peppol-section-provider.js`), `tests/e2e/peppol.spec.js` |
| A33 | Partial import from other programs (payments and rates lost) | Migration with a report, including payments and rates | P1 | Done | `packages/core/imports` (the exports of three other invoicing apps and of Pohoda), `tests/e2e/migration.spec.js` (payments, report, numbering goes on) |
| A34 | Proformas issued and reminded by hand only | Reminders for proformas too (a setting) | P1 | Done | `includeProformas` in `app/src/views/reminders/plan.js` and the reminder settings |

## B. Strong points of other invoicing apps: parity

| # | Feature elsewhere | WE Invoice | Status | Evidence |
|---|---|---|---|---|
| B1 | Lookup by company id or name with autofill | RPO (SK), ARES (CZ), VIES | Done | Gateway `gateway/src/routes/registers.js`, `tests/e2e/onboarding.spec.js`, `tests/e2e/sales-crm-contacts.spec.js` |
| B2 | Reliability of a VAT payer | Shown on the contact and in bank transactions | Partial | Shown on the contact card and in the editor (`app/src/views/contacts/checks.js`, `app/src/views/editor/party-field.js`); the bank screens do not show it yet. |
| B3 | VAT registration limit widget | Built | Done | `packages/core/tax/threshold.js`, VAT records screen |
| B4 | PAY by square, QR Platba (CZ) | Built | Done | `packages/core/paybysquare` (PAY by square and SPD), PDF payment block |
| B5 | OSS, cash basis (§ 68d), registered person § 7/7a | Built | Done | Golden examples `tests/fixtures/tax/07-cash-basis`, `12-registered-7`, OSS export `packages/core/tax/oss.js` |
| B6 | Tracking that a client opened the invoice | Through the zero-knowledge link (P2) | Missing | Depends on A21. |
| B7 | One-click saving of an invoice from a user of the same program | Peppol plus import of ISDOC, UBL and PDF with QR | Done | `tests/e2e/peppol-flow.spec.js`, `tests/e2e/purchase.spec.js` |
| B8 | Mailbox address for incoming invoices | Zero-knowledge mailbox on the gateway (P2) | Missing | Not built. |
| B9 | Simplified sale document with cash receipt | Predajka with the cash voucher | Done | `#/quick-sale`, `tests/e2e/stock.spec.js` |
| B10 | Price levels and client prices | Built | Done | `packages/core/stock/prices.js` (priceFor), `tests/e2e/seams-issue.spec.js` |
| B11 | Barcode scanner | USB scanner and camera | Done | Quick sale scanner input `app/src/views/stock/sale/index.js`, camera QR `app/src/ocr/qr.js` |
| B12 | Cash rounding to 0.05 EUR | Built | Done | `packages/core/money` (cash rounding), `tests/fixtures/ubl/expected/22-cash-rounding.xml` |
| B13 | One-click conversion quote to order to invoice or delivery note | Built | Done | `packages/core/documents/convert.js`, `tests/e2e/sales-documents.spec.js`, `tests/e2e/sales-totals.spec.js` |
| B14 | Automatic thank-you for a payment | Built | Done | `thankYou` in `app/src/views/reminders/runner.js` and the reminder settings |
| B15 | Recycle bin and linked documents | Built | Done | `#/trash`, links on the document card, `tests/e2e/reports.spec.js`, `tests/e2e/sales-totals.spec.js` |
| B16 | Two-factor sign-in | Google sign-in plus the data encryption password | Done | `tests/e2e/encryption.spec.js`, `tests/e2e/sync-devices.spec.js` |
| B17 | Directory of accountants and partner discounts | Site page for accountants and referrals (P2) | Missing | Not built on the site yet. |

## C. Deliberately not built

| Feature | Status | Why, and the alternative | Evidence |
|---|---|---|---|
| Own eKasa cash register (ORP or SORP) | Not planned | Needs certification by the Financial Administration; the app gives the VRP2 data of an invoice and keeps the receipt id | FAQ of the site (`site/content/*/landing.json`), quick sale VRP2 data in `tests/e2e/stock.spec.js` |
| VRP2 integration by API | Not planned | Forbidden by law 384/2025, § 5 ods. 6; no public API | FAQ of the site |
| Real-time bank (PSD2) | Not planned | Needs an AISP licence or a paid aggregator and sends data through a server; statement import of any bank instead | FAQ of the site, A3 |
| SMS reminders | Not planned | Paid channel; e-mail, Peppol and calendar instead | FAQ of the site |
| Own Peppol access point | Not planned | Cost and operations of an access point; the user's own provider instead | A31. The site FAQ does not explain it yet. |
| Public REST API of the app | Not planned | There is no server holding the data; open export and import formats and open source instead | A28, A33 |
| Double-entry bookkeeping | Not planned | Another class of product; export for the accountant in all common formats | A28; the site names single-entry bookkeeping and the FAQ "Will it replace my accountant?". |
