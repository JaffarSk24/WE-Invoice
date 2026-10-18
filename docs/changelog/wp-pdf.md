# WP-PDF

## Added

- PAY by square (SBA 1.2.0, through the bysquare library) and QR Platba (SPD 1.0) in `packages/core/paybysquare`: encoding from the app's decimal-string payment, decoding for the round-trip test and the Inbox, and the format choice by account country and currency (`paymentQr`).
- PDF of a document in `app/src/pdf`: `buildPdf(document, company, options)` returns a Blob, `buildDocDefinition` is the pure pdfmake definition for snapshot tests. pdfmake and the Inter font files (Latin, Latin Extended and Cyrillic subset, SIL OFL) load lazily on the first PDF, outside the initial bundle.
- Four templates: Klasický, Moderný, Minimalistický, Kompaktný, with the brand colour, logo, stamp and signature (PNG with transparency), the particulars of § 74 ods. 1 zákona o DPH, a line table whose header repeats on every page, totals and the VAT summary from `document.totals`, the payment block with IBAN, BIC, VS, KS, SS and the QR code, legal notes from the legislation file, free texts and a footer with the register entry, contacts, the optional "Vystavené vo WE Invoice" and the page number.
- Print languages SK, CS, EN, DE and a bilingual mode (every label in two languages). The print dictionaries carry the same keys in all four files.
- The mandatory particulars check (`missingRequisites`): a tax document without them is refused with `PDF_MISSING_FIELDS` and the list of fields; a draft preview may pass `allowIncomplete`.
- File names by the company's mask (`{kind}_{number}_{buyer}` by default), transliterated and without forbidden characters.
- PDF/A-3b with embedded files (`options.attachments`, for the UBL XML) when attachments are given.
- The PDF service on the event bus (`pdf:build`, `pdf:download`, `pdf:preview`, `pdf:check`) in `app/src/boot/pdf.js`.
- Interface keys `pdf.*` and `errors.PDF_*`, `errors.QR_*` in Slovak and English.

## Changed

- `bysquare` added as a dependency of the core, `pdfmake` as a build dependency of the app.
