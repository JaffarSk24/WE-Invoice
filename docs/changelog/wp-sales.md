# WP-SALES: sales documents

## Added

- "Nepoužívam eKasa" in the company settings (company.ekasaExempt, off by default) and the core helper ekasaExempt: when it is on, the VRP2 hints for cash, card and on-site QR payments are left out on the document card, on the payments screen and on the quick sale; a quick sale then ends with a confirmation instead of the VRP2 data.
- End to end test of the PDF preview inside the editor and on the document card.

## Changed

- The page policy lets frames load blob: URLs (frame-src blob: only, nothing else loosened), so the PDF preview of the editor and of the document card shows inside the app on the web and on the desktop.
- ekasaNeeded no longer treats usesEkasa: false as an opt-out: the wizard writes it for every company, so the eKasa helper of the payments screen never opened.

## Fixed

- A test pins that a company that is not a VAT payer gets new lines outside the scope of VAT (category O, no rate) and issues them without VAT.
