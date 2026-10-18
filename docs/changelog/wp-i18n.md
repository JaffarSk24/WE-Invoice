# WP-I18N: interface translations

## Added

- Complete Czech, German, Russian and Ukrainian interface dictionaries: every Slovak key of every part (common, core, sync, ui, pdf, desktop, net), in the same part and order as Slovak, with the help texts translated in full. `I18N_STRICT=1 npm test` passes for all six languages.
- `TRANSLATING.md`: how the dictionaries are built, how to add a key, how to check a translation and the typography rules.
- Full glossary in `app/src/i18n/GLOSSARY.md` with the terms of documents, parties, VAT, payments, accounting and e-invoicing in all six languages.

## Changed

- German interface terms follow the German print dictionary: Proformarechnung for a proforma invoice, Rechnungskorrektur for a credit note, Nachbelastung for a debit note and Gutschrift only for a self-billed invoice, as German VAT law uses it.
- Czech names of the Slovak returns are kept literal (Kontrolní výkaz, Souhrnný výkaz), because the app files the Slovak forms.
