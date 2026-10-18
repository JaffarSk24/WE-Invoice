# WP-CRM: contacts, price list, recurring invoices, reminders, e-mail

## Added

- Contacts (Adresár) at `#/contacts`: search by name, IČO, DIČ, e-mail and tag, a table on the desktop and cards on the phone, the amount due of every client, and a card with identifiers, addresses, e-mails by purpose (invoices, reminders, copy to the accountant), contact persons, delivery addresses, the client's terms (due days, discount, currency, print language, reminders on or off, price level), the balance, all documents and the e-mail history.
- New contacts from the register: Slovak companies by IČO or name (RPO) and Czech companies by IČO (ARES) through the gateway; an existing IČO opens the existing card instead of a duplicate.
- VAT traffic light of a contact from VIES and the Financial Administration lists, with the date of the check, kept for seven days.
- Merging duplicate contacts found by IČO or name: empty fields are filled, lists joined, documents moved to the kept card.
- "New invoice" on the contact card emits `document:new { kind, contactId }` for the sales package.
- Price list (Cenník) at `#/items`: items with code, barcode, unit (UN/ECE codes), price without or with VAT and the other price computed, VAT treatment and rate, category, and a CSV import that recognises Slovak, Czech and English column names and reports skipped rows by line number.
- `registerItemSection(render)` in `app/src/views/items/sections.js`, so the stock package can add stock levels and price levels to the item card.
- E-mail of documents: the event `document:send { documentId, purpose?, penalties? }` opens a window with the recipients from the contact, the language of the printed document and the template of the purpose. The desktop app sends through the user's SMTP account with the PDF attached; the browser downloads the PDF and opens the mail program with a mailto: link. Every sending is written to the document's send log and marks an issued document as sent.
- Built-in e-mail templates for sending, the reminder before the due date, three reminder levels and the thank-you note in Slovak, Czech, English and German (print dictionaries), and user templates per purpose, language and document kind in Settings, section E-mail, with copies (blind copy to the company, copy to the client's accountant) and a reply-to address.
- Recurring invoices at `#/recurring`: weekly, monthly, quarterly, half-yearly, yearly or every N months, first run, end date or number of runs, due days, date of supply at the end of the period, `{period}` in lines and texts written out in the document language, a draft or an issued invoice, automatic e-mail, pause and resume, history, and a start from an existing invoice (`recurring:from-document`).
- The schedule runs at start, when a company opens and when the desktop scheduler wakes the page; the run key `templateId + periodStart` keeps it idempotent, and duplicate drafts made by two devices at once are removed after the sync merges them.
- Payment reminders at `#/reminders`: today's reminders by the company policy (before the due date and up to three levels after it, minimum amount, no weekends, contacts left out), thank-you notes after payment, overdue invoices by client with the printed reminder (PDF), the reminder log, and sending by hand or automatically with an SMTP account.
- Late payment interest through the core (`lateInterest`, margins from legislation) with the ECB base rate entered in Settings, section Reminders, and the optional flat recovery cost for companies.

## Changed

- The CRM dictionaries are split by screen under `app/src/i18n/{sk,en}/sales/crm/` and merged in `sales/crm.js`, so no dictionary file grows past the size limit.
