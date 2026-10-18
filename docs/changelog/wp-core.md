# WP-CORE

## Added

- Money arithmetic on decimal strings (big.js): add, sub, mul, div, cmp, half-up rounding, Slovak cash rounding to 0.05 EUR, locale display through Intl, tolerant parsing of user input with "," or ".", conversion by a rate.
- Identifier checks: ICO checksum (SK and CZ), Slovak DIC, EU VAT id formats, IBAN mod-97, BIC and bank name from Slovak and Czech bank codes (packages/core/ids/bank-codes.json).
- Legislation lookup by date (getLegislation, unverifiedLegislation, exemptionReasonsOn) and the cash rounding step in legislation/sk.json.
- Document totals by EN 16931 (computeTotals): line net amounts, line and document discounts split over VAT groups, BG-23 breakdown with exemption reasons, gross prices converted to net at four places with the difference reported, advances, cash rounding, VAT in EUR for foreign currency documents; 80 fixture cases in tests/fixtures/totals.
- Numbering: mask tokens, counters per reset period from the document date, taken numbers skipped, variable symbol from a number, conflicts after a merge with proposed free numbers.
- Documents: UNCL1001 type codes, allowed statuses and transitions, status shown today, edit rules for locked and Peppol-sent documents, conversions between kinds with links and advance deduction, mandatory particulars of § 74 ods. 1 with legal texts from legislation, issuing with number, snapshots and totals.
- Payments: payment state, amount due, overdue by the local date, late payment interest from the ECB rate and the margins in legislation with the flat recovery cost.
- Peppol requirement engine with reason keys and the 15 day deadline; the duty is Slovak only, a seller outside Slovakia is never obliged.
- Local calendar date helpers for Europe/Bratislava.
- Slovak and English dictionary keys for core errors, document kinds and statuses, missing particulars, payment states, Peppol reasons and VAT categories.
