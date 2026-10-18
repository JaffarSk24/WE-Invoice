// Inbox recognition of received invoices and receipts (WP-PURCHASE):
// e-invoice XML (UBL, ISDOC, CII), payment and eKasa QR codes, fields from
// PDF text or OCR with checksum-verified identifiers, the draft received
// document, "Vybrať" and remembered suppliers, expense categories and the
// input VAT of a received document. Pure functions, no DOM, no network.
export { extractInvoiceFields, findBreakdown } from './text-fields.js';
export { parseEkasaQr, detectQrFormat, recognizeQr, recognizeEkasaReceipt } from './recognize-qr.js';
export { recognizeXml, detectXmlFormat, registerInboxParser, fieldsFromDocument } from './recognize-xml.js';
export { recognizeFound, detectInboxFile } from './recognize.js';
export { mergeRecognitions, emptyRecognition, FIELDS as INBOX_FIELDS, KEY_FIELDS as INBOX_KEY_FIELDS } from './result.js';
export { draftFromRecognition, draftLines, receivedTotals, supplierSnapshot } from './draft.js';
export { pickFieldValue, applyUserValue, learnTemplate, applyTemplateRegions, findSupplierContact } from './templates.js';
export { EXPENSE_CATEGORIES, JOURNAL_COLUMNS, expenseCategory, documentCategory as expenseCategoryOf, withCategory as withExpenseCategory } from './categories.js';
export { periodOf as vatPeriodKey, deductionPeriod as vatDeductionPeriodOf, deductibleVat, kvSections as receivedKvSections } from './vat-deduction.js';
