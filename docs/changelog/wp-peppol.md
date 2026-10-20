# WP-PEPPOL

## Added

- The attachments of a document travel in its e-invoice as BT-125 (`cac:AdditionalDocumentReference` with `cbc:EmbeddedDocumentBinaryObject`, `mimeCode` and `filename`) next to the document PDF, each with its own `cbc:ID` (the PDF keeps the document number, the files get number-1, number-2 and so on).
- Only the MIME types Peppol BIS 3 accepts are embedded (PDF, PNG, JPEG, CSV, XLSX, ODS; a file without a declared type is recognised by its extension). Before sending, a window names the attachments that stay out and lets the user cancel; the e-invoice detail lists them afterwards.
- The whole message is checked against the provider's size limit (from the adapter or `providers.json`, 10 MB when none is given) before anything is sent, with both sizes in the error. An attachment whose file is not on this device stops the sending with the names of the missing files.
- Slovak rules SK-20 (message size) and SK-21 (attachment types left out), core helpers `splitAttachments`, `attachmentMime`, `isEmbeddableMime`, `EMBEDDABLE_MIME_TYPES` and `DEFAULT_MAX_MESSAGE_BYTES`, a UBL fixture with a PDF and four user files checked by the UBL schema and the Schematron rules in CI, and an end-to-end test of the path.
- `skippedAttachments` and the `params` of an error in the Peppol state of a document are described in the data model.
