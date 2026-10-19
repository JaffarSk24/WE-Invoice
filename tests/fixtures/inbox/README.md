# Inbox fixtures

Inputs of the Inbox recognition with the fields that must come out, listed in `cases.json` (the own company of every case is in the same file). All identifiers are synthetic with valid checksums; no real company appears.

| Folder | Content |
|---|---|
| `xml/` | UBL invoice, credit note and multi-rate invoice, ISDOC invoice, CII (Factur-X) invoice |
| `qr/` | PAY by square, QR Platba and eKasa QR payloads (`payloads.json`) and an eKasa receipt as the gateway returns it |
| `text/` | Texts of invoices and receipts in Slovak, Czech, English and German, as a PDF text layer or OCR delivers them |
| `pdf/` | PDFs built from the texts: with a PAY by square code, plain, and with an embedded Factur-X XML (`node tests/fixtures/inbox/make-pdfs.js`) |
| `scans/` | Synthetic scans of six texts, rotated and blurred (`node tests/fixtures/inbox/make-scans.js`) |

Tests: `packages/core/imports/inbox/fixtures.test.js` (XML, QR, texts), `app/src/ocr/pdf-fixtures.test.js` (PDF text layer), `app/src/ocr/ocr-quality.perf.test.js` (OCR, `npm run test:perf`) and `tests/e2e/purchase.spec.js`.
