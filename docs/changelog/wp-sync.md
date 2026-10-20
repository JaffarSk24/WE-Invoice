# WP-SYNC: attachment files in Google Drive

## Added

- Attachment files of documents (sales attachments and the original files of the Inbox) live in Google Drive under `<companyId>/attachments/<attachmentId>.enc`, sealed with the data key like the company data. The file name carries only the attachment id; the original name, type and the positioned text of its pages travel inside the encrypted content (`app/src/sync/attachments/codec.js`).
- The sync uploads the files of the open company after its data, in the syncs that may write (closing, the Sync button, 10 seconds after a change). A file that a device knew as listed and that no live document lists after the merge (the attachment was removed, or its document was deleted as a tombstone) is removed from Drive and from the device; a device that never saw the reference removes nothing (`app/src/sync/attachments/files.js`).
- A file this device lacks is taken from Drive when it is opened, previewed or sent by e-mail, and kept on the device as a cache. Attachments of received eFaktúry stored earlier as `<id>.<ext>.enc` open the same way.
- States of an attachment file next to its name: waiting for the upload, in Google Drive, downloading, not uploaded yet by the other device, Google Drive out of reach. A file that cannot be opened says why; Settings, Synchronizácia counts the files waiting for their upload.
- Texts in all six languages; unit tests on the content format, the file store and two devices over the mock Drive; an end-to-end test with two devices over the mocked Drive.

## Changed

- `views/purchase/file-store.js` keeps `putFile`, `getFile` and `deleteFile` as they were and gains `localFiles` and `setRemoteFiles`: the sync registers itself at start, so the editor, the Inbox, the preview and the e-mail need no change to read files from Drive.
- The Slovak sync texts say "Google Drive" instead of "Google Disk", as the glossary keeps the name.
