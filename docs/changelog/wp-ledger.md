# WP-LEDGER

## Added

- Bookkeeping core for sole traders in `packages/core/ledger`: automatic cash book entries from document payments (split by line category, VAT kept apart for payers, foreign currency by the document rate, stable ids so two devices create the same record), the peňažný denník with every column of the MF SR form, month totals and cash and bank balances carried between years, books of receivables and payables at a day, tax depreciation (straight and accelerated, every group, months of use, disposal, rounding up to whole euros) and an accounting plan, travel compensation (km rate, fuel, meal allowance), the Výkaz o príjmoch a výdavkoch and the Výkaz o majetku a záväzkoch, the year closing checklist, the tax records with flat-rate expenses and the DPFO typ B table 1 summary, and a CSV writer.
- Ten golden years in `tests/fixtures/ledger` (non-payer, payer, transfers, assets, year-end books, advances and credit notes, warnings, trips and foreign currency, flat-rate below and over the cap).
- Screens for the `cash-journal`, `assets` and `closing` routes: the cash book with its books and trip log (or the income records and the type B summary with flat-rate expenses), the asset register with asset cards and plans, and the closing wizard with both statements. Tables become cards on a phone; print to PDF and CSV on every screen; demo mode shows the sample company and writes nothing; companies without bookkeeping get an explanation.
- Automatic entries kept in line with payments in the background while a bookkeeping company is open.

## Changed

- `legislation/sk.json`: accelerated depreciation coefficients, rounding and proration switches in `depreciation`; travel rates (km rate and meal allowance bands) with validity dates from April 2025 in `travel`; `prorateByMonths` and the separate cap of § 6 ods. 4 in `flatExpenses`. All values stay unverified until checked against the source.
