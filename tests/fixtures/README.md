# Test fixtures

| Folder | Content | Owner |
|---|---|---|
| `totals/` | 50+ totals cases: input document and expected BT values (EN 16931) | WP-CORE |
| `ubl/` | Outgoing and incoming UBL (380, 381, 383, 386/388, AE, E, K, G, O, currency, advance, discounts) plus invalid ones | WP-PEPPOL |
| `isdoc/` | Czech ISDOC examples | WP-EXIM |
| `bank/` | Statements of every bank profile, CAMT.053, MT940, ABO/GPC | WP-BANK |
| `inbox/` | 20+ PDFs and photos of invoices and receipts with expected fields | WP-PURCHASE |
| `tax/` | Golden examples: documents of a period and expected KV, SV, VAT return rows and XML | WP-TAX |
| `migration/` | Exports of iDoklad, SuperFaktura (Pohoda XML), KROS | WP-EXIM |
| `timetracker/` | WE Time Tracker JSON export | WP-EXIM |

All data is anonymised: real IČO, DIČ and IBAN are replaced by synthetic ones with valid checksums.
