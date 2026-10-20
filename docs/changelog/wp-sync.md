# WP-SYNC: attachment files kept for the archive

## Added

- `removedAttachments` on a document (contract change of the Document schema): the attachments removed from an issued or received document, with id, name, type, size, the time and the reason of the removal. The screens do not list them; the change log still records the removal.
- Retention rules of attachment files in Google Drive (`app/src/sync/attachments/retention.js`), with the archive period from the legislation value `archiveYears` (§ 76 zákona o DPH): an attachment removed from a draft, and the file of a deleted Inbox record that is not a document yet, leave Drive and the devices as before; an attachment removed from an issued or received document stays in Drive as an archived reference; a document in the recycle bin keeps its files, which may go only when it is removed for good and it was a draft or its archive period is over.
- The sync records the last day each known file must be kept, so a file of an archived document that disappears from the data stays in Drive until its archive period ends. A device that never saw a reference still removes nothing.

## Changed

- Removing an attachment from an issued or received document moves it to `removedAttachments` and keeps the file on the device and in Drive; removing it from a draft still drops the file.
- Deleting a received document from the purchase screens keeps its files (the document can be restored from the bin); deleting an Inbox record that is not a document yet still drops its file. Received eFaktúry waiting in the Inbox count as received documents.
- A copy of a document starts without `removedAttachments`, as it starts without attachments.
