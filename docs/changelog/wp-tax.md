# WP-TAX: official XSD layout of the tax reports

## Changed

- The kontrolný výkaz follows the official schema kv_dph_2025.xsd: root element KVDPH_2025, simplified invoices as B31 (in total) or B32 (per supplier), D1 and D2 with the standard rate in Z and D and the reduced rates in ZZn and DZn (D1 also with SumaObratov), sections in the order of the schema, and optional attributes left out instead of written empty. Both reduced rates (19 % and 5 %) are summed into ZZn and DZn until an accountant confirms it.
- The VAT return follows the schema of form DPHv25: the header with dic, danovyUrad, typDP with the discovery date, osoba, zdanObd, meno lines and dates as dd.mm.yyyy, and a body with every row from r01 to r37 and splneniePodmienok in the order of the form. The map of amounts to rows was rebuilt after the poučenie: supplies where the recipient pays the tax go to rows 09 and 10, exempt supplies to 13, intra-EU goods to 14, reverse charge supplies to 15, own liability to 31, excess deduction to 32 and the amount to pay to 35. Rows 11 and 12 belong to triangular trade and imports and stay empty.
- The súhrnný výkaz follows the schema of form SVDPHv20 (valid from 2020-01-01): the new header, records paged by twelve, and the three kinds of filing riadny, opravný and dodatočný.
- No XML is produced while a report has an open error, so a file that the schema would reject is never offered. The screen says so instead of showing the XML.
- The XSD test checks the SHA-256 of every schema against tests/fixtures/tax/xsd/sources.json, which now names the official download addresses.

## Added

- A warning when a supplier in section B.1 has no VAT ID, in all six interface languages.
