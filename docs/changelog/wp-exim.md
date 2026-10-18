# WP-EXIM: export, import, migration, backup

## Added

- Export for the accountant: one ZIP per period with a summary, the document register and its lines as CSV and XLSX, Pohoda XML (dataPack 2.0 with issued and received invoices, cash vouchers and the address book), Money S3 XML, the KROS Omega text import in Windows-1250, ISDOC 6.0.2 per document, UBL per document through the Peppol builder when it is available, and the PDFs of issued documents.
- Documents are placed in a period by their date of supply; drafts never leave the app. VAT rates map to the programs' rate groups through the legislation codes, so a change of rates needs no code change.
- "Exported" and "changed after export": an exported document stores the time, a fingerprint of its content and a lock, and shows as changed when anything the accountant sees changes later. Every export is written to the audit log.
- CSV with protection against formula injection, a small XLSX writer and reader, a ZIP writer and reader with CRC checks; no new dependencies.
- ISDOC 6.0.2 writer (validated against the official schema) and reader for invoices of Czech suppliers, including foreign currency documents and line discounts.
- Import and migration with a preview: iDoklad (CSV, XLSX, ISDOC), SuperFaktura (Pohoda XML, CSV, XLSX), KROS (Omega text, XML, CSV, XLSX), Pohoda XML and generic CSV with an editable column mapping. Contacts are matched by company ID, documents by number, nothing existing is overwritten, payments come along, numbering continues after the last imported number, and a report lists what was skipped and why.
- WE Time Tracker: the JSON export of the logs (or the full data file) becomes lines of a draft invoice, by project, task or day, with a status file listing the invoiced entries.
- WE Budget: the payments of a period as a CSV the WE Budget statement import reads.
- Full backup of the open company in one JSON file with a checksum, optionally sealed with a password (PBKDF2 and AES-GCM from the sync package). Restore shows what the file holds, can save the current data first, needs an explicit confirmation, migrates older schema versions, refuses newer and damaged files, and wins over the copies on other devices at the next sync.
- The "Export a import" screen at `#/exim` with the tabs Export, Import, WE Time Tracker and Backup, and the backup in Settings, Export a import.
