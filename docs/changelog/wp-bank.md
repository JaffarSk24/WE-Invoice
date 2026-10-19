# WP-BANK: bank, cash desk and payments

## Added

- VAT choice on a cash voucher (príjmový and výdavkový pokladničný doklad): the rates valid on the voucher date, reverse charge (AE, § 69 ods. 12 zákona o DPH), an exemption (E) and no VAT, with the legal references from legislation. Offered to a VAT payer only.
- Reverse charge on a cash voucher requires the partner's valid Slovak IČ DPH; the voucher stores the partner's IČ DPH and IČO, and a contact can be picked to fill them.

## Fixed

- Cash vouchers with VAT now reach the Evidencia DPH and the reports built from it: a receipt as a sale (A.1, A.2 or D.2 of the kontrolný výkaz), an expense as a purchase received on its own date (B.3, or B.1 self-assessed for reverse charge). Vouchers that only record the cash payment of an invoice and vouchers without VAT stay out, so nothing is counted twice.
