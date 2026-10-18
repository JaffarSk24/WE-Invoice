# Translating WE Invoice

The interface texts live in `app/src/i18n/`, one folder per language: `sk` (Slovak), `cs` (Czech), `en` (English), `de` (German), `ru` (Russian), `uk` (Ukrainian). Slovak is the reference: every other language has exactly its keys. English is the fallback: a key missing in the current language is shown in English, and a key missing in English shows the key itself, so a gap is visible rather than silent. The list of languages, their locales and decimal separators is `app/src/i18n/languages.js`.

Printed documents (PDF) have their own dictionaries, `app/src/i18n/print/{sk,cs,en,de}.json`, with the legal names of the fields. They are not part of the interface dictionaries described here.

## How a dictionary is built

Each language folder has one file per work package (a part): `common`, `core`, `sync`, `ui`, `pdf`, `desktop`, `net`, `sales`, `peppol`, `bank`, `purchase`, `exim`, `tax`, `ledger`, `stock`, `reports`, `ekasa`. `index.js` merges the parts. Parallel branches therefore never edit the same file. A large part may be split by screen into a subfolder and merged in its own file (for example `ui.js` merges `ui/components.js`, `ui/onboarding.js`, `ui/dashboard.js`, `ui/settings.js` and `ui/help.js`); every language mirrors the Slovak layout.

Rules the tests enforce:

- A key lives in exactly one part, and it is the same part in every language.
- No language has a key that Slovak does not have.
- No text is empty.
- The `{placeholders}` of a text are exactly those of the Slovak text, no more and no fewer.
- Keys are named by screen with dots, for example `invoice.editor.addLine`, `peppol.wizard.step2.title`, `errors.UPSTREAM_UNAVAILABLE`.

Keep the order of keys as in the Slovak file; it makes comparisons easy.

## Adding a key

1. Add the key to your package's part in `sk/<part>.js` and `en/<part>.js`, in the same position in both. Use it in the code through `t('your.key', { name })`; never put interface text into markup or JavaScript (a test looks for Slovak and Czech letters in `app/src` outside the dictionaries).
2. Error codes from the core, the gateway or the desktop app are shown as `errors.<CODE>`. A new code gets a key with a message that says what happened and what to do.
3. The other four languages (`cs`, `de`, `ru`, `uk`) are filled by the translation package. Until then the normal test run lists the missing keys as a warning and the interface shows English for them.

## Checking

```sh
npm ci
npm test
I18N_STRICT=1 npm test
npm run lint
```

`tests/i18n.test.js` checks the rules above. With `I18N_STRICT=1` it also requires every language to contain every Slovak key; a release is built only when this passes. `tests/hygiene.test.js` scans every file for long dashes and invisible characters.

Look at the result in the app too (`npm run dev`, then pick the language at the bottom of the menu). Check the screens with the longest texts: the sidebar, the onboarding wizard, the overview widgets, Settings and the Help, and a narrow window for the phone layout. German words are long: when a label does not fit a button or the menu, choose a shorter word rather than relying on wrapping.

## Typography

- No long dashes (U+2014, U+2013): rebuild the sentence, or use a colon, a comma or a plain hyphen. The hygiene test rejects them.
- No invisible characters and no no-break spaces (U+00A0): write a plain space.
- A space before `%` and `€` in every interface language except English: `23 %`, `2 € mesačne`. Amounts inside `{amount}` arrive already formatted by `Intl`.
- Quotation marks: Slovak, Czech and German use „...“; Russian and Ukrainian texts use plain "..." (escaped in the JavaScript string). Three dots for an ellipsis.
- Address the user politely (vy, Sie, вы, ви) and keep button labels short.

## Terminology

`app/src/i18n/GLOSSARY.md` lists the terms of the dictionaries in all six languages. Use exactly one translation for each term everywhere: in buttons, hints, errors and the help. Slovak follows the wording of the Slovak VAT act (zákon o DPH č. 222/2004 Z. z.); Czech follows the Czech VAT act; German follows German and Austrian business usage and matches the German print dictionary. Slovak identifiers such as IČO, DIČ, IČ DPH, eFaktúra and kontrolný výkaz are kept as names in Russian and Ukrainian and explained once. Product names stay untranslated: WE Invoice, White Eagles, Google Drive, Gmail, GitHub, Peppol, PAY by square, QR Platba. Codes, URLs and file formats are never translated.

When a term is missing from the glossary, add it there in the same change as the translation.
