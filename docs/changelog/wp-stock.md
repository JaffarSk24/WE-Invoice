# WP-STOCK

## Added

- `quickSaleKind` in the core: the document a quick sale becomes, a sales receipt or a full invoice.

## Changed

- A quick sale with a reverse-charge line (AE, § 69 ods. 12 zákona o DPH) or a supply to another member state (K) is now issued as a full invoice instead of a sales receipt. A sales receipt is a simplified invoice (§ 74 ods. 3): the Financial Administration states that the domestic reverse charge does not apply when a simplified invoice (an eKasa receipt) is issued, and that a simplified invoice cannot be issued for a supply exempt under § 43. The invoice is paid on the spot, numbered in the invoice series of the sales screens and carries the buyer's name, address and IČ DPH and the text "prenesenie daňovej povinnosti" from legislation.
- The buyer fields of the quick sale ask for the address too, filled from the contact when one is picked; `checkSalesReceiptBuyer` refuses a buyer without a street or city (`SALES_RECEIPT_BUYER_ADDRESS`) and takes the country from the VAT number when none is given.
- The VRP2 summary of a sale issued as an invoice (`vrpSummary` entry `INVOICE_PAYMENT`) says to record the payment of that invoice in VRP2 instead of the items; the separate reverse-charge note is gone.
