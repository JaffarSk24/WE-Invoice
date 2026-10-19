# WP-SALES: sales documents

## Added

- Attachments of sales documents in the editor and on the document card: any number of files, at most 10 MB each, kept on the device in the same store as the original files of the Inbox, with the id, name, type and size on the document. A file can be opened and removed; removing one from an issued document asks for a confirmation and writes an entry with the file name to the change log. Adding a file to an issued document is allowed.
- The e-mail of a document carries its attachments with the PDF (SMTP), or downloads them with the PDF for the mail program; the send window lists them and names the files this device does not have.
- Unit, screen and end to end tests of the attachment path, and a test that the e-invoice (UBL) is the same whatever the attachments and embeds the PDF only by attachPdfToEInvoice.

## Changed

- The change log entries written by the sales screens name the record kind "Document", as the change log recorder does.
- A copy of a document starts without attachments, so removing a file from the copy never deletes the original's file.

## Fixed

- Opening a PDF or an attachment in a new tab no longer downloads it as well: window.open answers null when "noopener" is asked for, which was taken for a blocked tab.
