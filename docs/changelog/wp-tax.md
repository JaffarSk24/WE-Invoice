# WP-TAX: VAT records and reports

## Added

- VAT records (evidencia DPH, § 70) for a month or a quarter, built from issued and received documents: tax point by the date of supply, deduction period chosen by the user or the period of receipt, the § 20 date rule for intra-EU goods, the cash scheme (§ 68d) by the payments of the period, advance tax documents taken out of the final invoice, credit and debit notes with a negative sign, documents in other currencies converted by the rate on the document.
- Treatment of every VAT group: domestic supply, domestic reverse charge (§ 69 ods. 12), intra-EU goods and services, export, exempt, outside the scope, OSS, acquisitions from the EU, services from abroad (§ 69 ods. 3), import and foreign VAT.
- Kontrolný výkaz DPH with sections A.1, A.2, B.1, B.2, B.3.1 or B.3.2 (threshold of 3000 EUR deducted from simplified invoices), C.1, C.2, D.1 and D.2, filing types R, O and D, and its XML.
- Súhrnný výkaz DPH per buyer VAT id and supply code, with the VIES check through the gateway, filing types R and O, and its XML.
- Daňové priznanie k DPH (DPHv25, periods from July 2025): amounts under stable names mapped to the rows of the form by a data file, own liability and excess deduction, filing types R, O and D, and its XML.
- Checks before export with links to the documents: missing date of supply or receipt, missing or invalid VAT ids, corrections without the original invoice, stored totals that differ from the lines, broken or unsettled advances, documents changed after export, drafts in the period, rates without a row on the form.
- Closing and opening of a period (company.closedPeriods, with an audit entry and a required reason to open) and canChangeInPeriod for the document editors.
- Filed reports recorded in the audit log with a digest of their documents, a warning when documents change after filing, and the suggested filing type by the deadline.
- VAT registration limit: turnover of the calendar year, the previous year and the last 12 months against vatRegistrationThreshold, with warnings from 80 % and over the immediate limit.
- OSS data per country and rate for a quarter, as CSV.
- Screens vat-records, kv, sv and vat-return: period switcher, summary, checks, preview of the rows, XML download, the "filed" mark, the disclaimer, and read-only sample data in demo mode. The screens load on first use.
- Twelve golden examples in tests/fixtures/tax with the expected rows and XML, and an XSD validation test that uses the official schemas once they are provided.

## Changed

- Form layouts (KVDPHv25, SVDPH, DPHv25) are data files in packages/core/tax/forms marked unverified until they are checked against the official XSD schemas of Finančná správa.
