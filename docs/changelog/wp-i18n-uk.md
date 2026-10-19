## Added

- Ukrainian interface texts for every screen of wave B: 2,497 keys in the parts sales (document lists, editor, numbering and company settings, contacts, price list, e-mail, recurring invoices, reminders), peppol, bank, purchase, exim, tax, ledger, stock and reports. The Ukrainian dictionary now has all 3,288 Slovak keys.
- The Ukrainian sales part mirrors the Slovak layout: `uk/sales.js` merges `uk/sales/documents.js` and `uk/sales/crm.js`, each with the same screen files and keys as in Slovak.

## Changed

- Ukrainian texts keep the Slovak names of forms and books in their basic form, never translated or declined: eFaktúra, Kontrolný výkaz, Súhrnný výkaz, Priznanie k DPH, Evidencia DPH, Peňažný denník. 26 existing texts in the parts common, core, desktop and ui (onboarding, overview, settings, help) now use these names, and the sentences are built around them ("рахунок eFaktúra", "форма Kontrolný výkaz", "книга Peňažný denník"). The cash desk book (pokladničná kniha) stays "касова книга".
- eFaktúra status labels and network errors in Ukrainian use neutral forms and no longer speak in the first person.
