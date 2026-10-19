# WP-STOCK

## Added

- Quick sale (predajka): every line has a VAT choice, as on an invoice line: each rate of the S category, the zero rate and the categories legislation gives an exemption reference for, reverse charge (AE, § 69 ods. 12 zákona o DPH) among them. A company that is not a VAT payer still sells outside VAT only.
- A reverse-charge line asks for the buyer: name and IČ DPH, typed in or taken from the contacts that have one. The receipt is refused until the IČ DPH is valid and Slovak, since reverse charge is possible only for a buyer who is a VAT payer; a supply to another member state (K) needs the VAT ID of another member state. The buyer is stored on the receipt.
- Core functions in `packages/core/stock/receipt-vat.js`: `salesReceiptVatChoices`, `salesReceiptVatChoiceOf`, `salesReceiptVat`, `vatOfCategory`, `salesReceiptBuyerNeed`, `checkSalesReceiptBuyer` and `normalizeVatId`; `salesReceiptLine` and `issueSalesReceipt` take the VAT choice of each cart line and the buyer.

## Changed

- A price with VAT on a line without VAT (reverse charge, exemption) becomes the price without VAT at the item's own rate.
- The VRP2 summary (`vrpSummary`) names the VAT category of each line and of each VAT summary row, so reverse charge, exemptions and the zero rate are no longer all shown as 0 %. It also gives the legal texts from legislation, the buyer's IČ DPH and a note on how to enter reverse-charge items in VRP2.
