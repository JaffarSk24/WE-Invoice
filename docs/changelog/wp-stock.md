# WP-STOCK

## Added

- Quick sale (predajka): every line has a VAT choice, as on an invoice line: each rate of the S category, the zero rate and the categories legislation gives an exemption reference for, reverse charge (AE, § 69 ods. 12 zákona o DPH) among them. A company that is not a VAT payer still sells outside VAT only.
- A reverse-charge line or a supply to another member state (K) cannot be documented by a sales receipt, which is a simplified invoice (§ 74 ods. 3): the Financial Administration states that the domestic reverse charge does not apply when a simplified invoice (an eKasa receipt) is issued, and that a simplified invoice cannot be issued for a supply exempt under § 43. Such a quick sale is therefore issued as a full invoice, paid on the spot, numbered in the invoice series of the sales screens, with the buyer's name, address and IČ DPH and the text "prenesenie daňovej povinnosti" from legislation. The buyer is typed in or taken from the contacts that have an IČ DPH; reverse charge needs a valid Slovak IČ DPH, a supply to another member state the VAT ID of another member state.
- Core functions in `packages/core/stock/receipt-vat.js`: `salesReceiptVatChoices`, `salesReceiptVatChoiceOf`, `salesReceiptVat`, `vatOfCategory`, `salesReceiptBuyerNeed`, `quickSaleKind`, `checkSalesReceiptBuyer` and `normalizeVatId`; `salesReceiptLine` and `issueSalesReceipt` take the VAT choice of each cart line, the buyer and the invoice series.

## Changed

- A price with VAT on a line without VAT (reverse charge, exemption) becomes the price without VAT at the item's own rate.
- The VRP2 summary (`vrpSummary`) names the VAT category of each line and of each VAT summary row, so reverse charge, exemptions and the zero rate are no longer all shown as 0 %. It gives the legal texts from legislation and the buyer's IČ DPH; for a sale issued as an invoice it says to record the payment of that invoice in VRP2 instead of the items.
