# Sources of the legislation values

Every value in `packages/core/legislation/sk.json` and `eu-vat-rates.json` carries `verified` and `verifiedAt`. The values below were checked on 19 October 2026 against these sources; a release is built only while all of them are verified (`node scripts/check-legislation.mjs --strict`). The tax reports and the bookkeeping that use them are still to be confirmed by an accountant before release R4.

| Key | Value | Source |
|---|---|---|
| `vatRates` | 23 %, 19 %, 5 % from 1 January 2025; 20 % and 10 % until 31 December 2024, 5 % from 1 January 2023 | § 27 of Act No. 222/2004 Z. z. as amended by Act No. 278/2024 Z. z. ([slov-lex](https://static.slov-lex.sk/static/SK/ZZ/2004/222/)); MF notice MF/018205/2024-731 to the poučenie of the kontrolný výkaz |
| `vatRegistrationThreshold` | 50 000 € in a calendar year, at once above 62 500 € | § 4 of the VAT Act as amended by Act No. 278/2024 Z. z. ([podnikajte.sk](https://www.podnikajte.sk/dan-z-pridanej-hodnoty/registracia-pre-dph-od-2025)) |
| `flatExpenses` | 60 % of income, at most 20 000 € a year, social and health insurance on top | § 6 ods. 10 of Act No. 595/2003 Z. z. ([podnikajte.sk, 2026](https://www.podnikajte.sk/dan-z-prijmov/pausalne-vydavky-v-roku-2026)) |
| `latePaymentInterest` | Business: ECB main rate on the first day of delay + 9 percentage points (fixed); consumers: ECB + 5 percentage points | Government regulations No. 21/2013 Z. z. and No. 87/1995 Z. z. ([e-Justice](https://e-justice.europa.eu/topics/taking-legal-action/where-and-how/interest-rates/sk_sk)) |
| `recoveryCostFlat` | 40 € | § 369c of the Commercial Code |
| `deadlines` | VAT return, kontrolný výkaz and súhrnný výkaz by the 25th day after the period; invoice within 15 days | § 78, § 78a, § 80 and § 73 of the VAT Act |
| `archiveYears` | 10 years | § 76 of the VAT Act |
| `cashRounding` | Cash payments rounded to 0.05 € from 1 July 2022 | Act No. 18/1996 Z. z. on prices ([podnikajte.sk](https://www.podnikajte.sk/zakonne-povinnosti-podnikatela/zaokruhlovanie-cien-od-1-7-2022-otazky-odpovede)) |
| `cashPaymentLimitB2b` | 5 000 € (15 000 € only between natural persons who are not in business) | § 4 of Act No. 394/2012 Z. z., wording from 1 January 2026 ([zakonypreludi.sk](https://www.zakonypreludi.sk/print/zz/2012-394/znenie-20260101.htm)) |
| `ekasa` | Act No. 384/2025 Z. z. on sales records in force from 1 January 2026; the virtual register only through its own client | [Collection of Laws](https://static.slov-lex.sk/pdf/SK/ZZ/2025/384/ZZ_2025_384_20260101.pdf) |
| `einvoice` | Mandatory e-invoices from 1 January 2027; digital reporting and the end of the kontrolný výkaz from 1 July 2030 | Act No. 385/2025 Z. z. ([slov-lex](https://static.slov-lex.sk/static/SK/ZZ/2025/385/20270101.print.html)); eFaktúra FAQ of Finančná správa |
| `depreciation` | Groups 0 to 6 with 2, 4, 6, 8, 12, 20 and 40 years; accelerated depreciation for groups 2 and 3 (6/7 and 8/9); 1 700 € and 2 400 € thresholds | § 22 and § 26 to § 28 of Act No. 595/2003 Z. z. |
| `travel` | 0.281 €/km from 1 March 2025, 0.296 €/km from 1 June 2025, 0.313 €/km from 1 January 2026; meal allowance 8.80 / 13.10 / 19.50 € from 1 April 2025 and 9.30 / 13.80 / 20.60 € from 1 December 2025 | Act No. 283/2002 Z. z.; notices of MPSVR SR No. 22/2025, 39/2025, 97/2025 and 280/2025 Z. z. ([Finančná správa](https://podpora.financnasprava.sk/017879-Cestovn%C3%A9-n%C3%A1hrady-SZ%C4%8CO-v-roku-2025)) |
| `texts` | Mandatory phrases on invoices (reverse charge, cash accounting scheme, self-billing, margin scheme, exemption) | § 74 ods. 1 of the VAT Act |
| `exemptionReasons` | VATEX codes by VAT category | [Peppol VATEX code list](https://docs.peppol.eu/poacc/billing/3.0/codelist/vatex/) |
| `eu-vat-rates.json` | Standard, reduced, super-reduced and parking rates of the 27 member states in force on 28 September 2026 | [Commission TEDB](https://ec.europa.eu/taxation_customs/tedb/), [Eurofiscalis](https://www.eurofiscalis.com/en/vat-rates-in-ue/) |
