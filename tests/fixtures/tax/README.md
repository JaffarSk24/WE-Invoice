# Golden examples of the tax reports

Each folder is one scenario of a tax period: `input.json` holds the company, the documents and the period; `expected.json` the totals of the VAT records, the sizes of the kontrolný výkaz sections, the rows of the súhrnný výkaz and of the VAT return and every problem the checks report; `kv.xml`, `sv.xml` and `dph.xml` the expected XML files. A report with an open error (scenario 11 on purpose, and the kontrolný výkaz of a person registered under § 7 in scenario 12) has no XML: the generator refuses to write it, so the file is missing and the XSD test checks only files that would really be filed. `packages/core/tax/golden.test.js` runs them all.

All parties are synthetic: the Slovak VAT ids have valid checksums but belong to nobody.

| Scenario | What it covers |
|---|---|
| 01-monthly-domestic | A.1, B.2, B.3.1 and D.2 at 23 %, 19 % and 5 %; a draft and a document of the next month are left out |
| 02-quarterly | quarterly payer, a deduction period chosen by the user (later and earlier than receipt) |
| 03-corrections | credit and debit notes to a payer (C.1), from a supplier (C.2) and to a consumer (D.2) |
| 04-domestic-reverse-charge | § 69 ods. 12: issued A.2, received B.1 with self-assessed VAT |
| 05-eu-goods | intra-EU supply (SV code 0) and acquisition (B.1) with the § 20 date rule |
| 06-eu-services | services to a German business (SV code 2), from Austria and the USA (§ 69 ods. 3) |
| 07-cash-basis | § 68d: output VAT and deduction by the payments of the period |
| 08-advances | advance tax document and the final invoice that taxes only the rest |
| 09-foreign-currency | invoices in CZK and USD converted by the rate on the document |
| 10-ekasa-simplified | eKasa sales (D.1) and simplified invoices over the per-supplier threshold (B.3.2) |
| 11-problems | missing dates and VAT ids, a broken advance link, stored totals that do not match, a change after export |
| 12-registered-7 | person registered under § 7a: VAT on a service from abroad without deduction, SV for services supplied |

The expected values were computed by hand for the totals and rows and are waiting for the review of a qualified accountant before the tax modules are released (05-accounting-tax.md § 5.5). After a deliberate change of the reports, regenerate with `UPDATE_TAX_GOLDEN=1 npx vitest run packages/core/tax/golden.test.js` and review the diff.

The `xsd/` folder explains how the XML files are validated against the official schemas.
