# WP-BANK: bank, cash desk and payments

## Added

- "Predaj evidovaný v eKasa" on a cash receipt voucher (príjmový pokladničný doklad) of a sale with VAT, ticked by default when the company uses eKasa. Not offered for reverse charge, for an expense voucher or when the company does not use eKasa.
- Evidencia DPH lists such vouchers apart, with their mark, and leaves them out of the totals, the kontrolný výkaz and the VAT return: their VAT reaches D.1 through the eKasa turnover entered separately.
- Warnings in the Evidencia DPH checks: a sales voucher counted on its own on a day with eKasa turnover (a possible double count), and a voucher marked as recorded in eKasa on a day without eKasa turnover (its VAT is not reported yet).
- Golden tax examples 13 and 14: cash vouchers of a company with and without eKasa, with the expected kontrolný výkaz, súhrnný výkaz and VAT return.

## Changed

- A sales voucher with VAT goes to D.2 of the kontrolný výkaz only when the company does not use eKasa or the mark is cleared.
