# WP-EXIM: import checks

## Added

- An imported document with a standard-rated line at a rate that is not a Slovak rate in force on its date (from the legislation data) is imported as it is, and a VAT payer gets a warning in the import report: possibly OSS or a mistake, to check by hand.
- The Shoptet import lists every column or XML field it does not read, every row without an order code and every order item without a name in the import report, so nothing in the file is dropped without a word.
