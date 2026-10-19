# WP-PURCHASE

## Added

- Inbox for received documents: drop, paste, pick or photograph PDFs, pictures and ISDOC or UBL XML files; every file is read on the device and waits in the queue "Na spracovanie" until the user checks it.
- Recognition in the core (`packages/core/imports/inbox`): UBL 2.1, ISDOC 6 and CII (ZUGFeRD, Factur-X) e-invoices, also embedded in a PDF; PAY by square and QR Platba payment codes; eKasa receipt codes (online receipts completed through `POST /v1/ekasa/receipt`, offline codes read directly); invoice fields from the PDF text layer or OCR text in Slovak, Czech, English and German, with IČO, DIČ, IČ DPH and IBAN accepted only when their checksums hold and amounts cross-checked against the VAT breakdown.
- `registerInboxParser` lets the Peppol and import packages plug in their full UBL and ISDOC parsers; the core `parseUbl` and `parseIsdoc` are used as soon as they exist.
- PDF reading with pdf.js (text layer, attachments, page rendering), QR codes with the browser's BarcodeDetector or jsQR, and OCR with tesseract.js and the Slovak, Czech and English models shipped with the app; all of it loads on first use and runs without any CDN.
- Review screen with the document preview: fields the recognition was unsure of are marked, "Vybrať" fills a field from the text clicked on the preview, and every value shows where it came from.
- Remembered suppliers: confirming a document creates or updates the supplier contact with a purchase template (category, payment method, line text and the place of each picked field), applied to the next document from the same IČO.
- Received invoices and expenses lists with filters, totals, payments, an expense summary by category with the input VAT to deduct, and manual entry.
- Expense categories as data (`expense-categories.json`) with their peňažný denník column and income tax and VAT deductibility; the input VAT period of a received document follows the company VAT period and the later of supply and receipt; `receivedKvSections` tells the tax package where a document belongs in the kontrolný výkaz.
- Inbox fixtures: five XML e-invoices, seven QR payloads, eleven invoice and receipt texts, three PDFs and six synthetic scans with expected fields; an OCR quality test in the performance suite and Playwright tests of the purchase flow.
