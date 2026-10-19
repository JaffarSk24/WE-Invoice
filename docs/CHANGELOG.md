# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Domain core

#### Added

- Money arithmetic on decimal strings (big.js): add, sub, mul, div, cmp, half-up rounding, Slovak cash rounding to 0.05 EUR, locale display through Intl, tolerant parsing of user input with "," or ".", conversion by a rate.
- Identifier checks: ICO checksum (SK and CZ), Slovak DIC, EU VAT id formats, IBAN mod-97, BIC and bank name from Slovak and Czech bank codes (packages/core/ids/bank-codes.json).
- Legislation lookup by date (getLegislation, unverifiedLegislation, exemptionReasonsOn) and the cash rounding step in legislation/sk.json.
- Document totals by EN 16931 (computeTotals): line net amounts, line and document discounts split over VAT groups, BG-23 breakdown with exemption reasons, gross prices converted to net at four places with the difference reported, advances, cash rounding, VAT in EUR for foreign currency documents; 80 fixture cases in tests/fixtures/totals.
- Numbering: mask tokens, counters per reset period from the document date, taken numbers skipped, variable symbol from a number, conflicts after a merge with proposed free numbers.
- Documents: UNCL1001 type codes, allowed statuses and transitions, status shown today, edit rules for locked and Peppol-sent documents, conversions between kinds with links and advance deduction, mandatory particulars of § 74 ods. 1 with legal texts from legislation, issuing with number, snapshots and totals.
- Payments: payment state, amount due, overdue by the local date, late payment interest from the ECB rate and the margins in legislation with the flat recovery cost.
- Peppol requirement engine with reason keys and the 15 day deadline; the duty is Slovak only, a seller outside Slovakia is never obliged.
- Local calendar date helpers for Europe/Bratislava.
- Slovak and English dictionary keys for core errors, document kinds and statuses, missing particulars, payment states, Peppol reasons and VAT categories.

#### Changed

- An issued document is printed in the language chosen on it, else the language on the client's card, else the company default, else Slovak (the client's language used to be ignored).

### Data, encryption and Google Drive

#### Added

- Local store (`app/src/store`): the workspace and the data of the active company as the two schema roots, record CRUD by collection with UUIDv7 ids, UTC timestamps and tombstones, `data:changed` and `company:switched` events, several companies with separate data files, read-only mode for data of a newer schema, IndexedDB persistence with a memory adapter for tests. A stored file that cannot be read is never overwritten.
- Encryption (`app/src/sync/crypto.js`, `keys.js`, `recovery.js`, `files.js`): a random AES-GCM 256 data key wrapped by a PBKDF2-SHA256 password key (600 000 iterations) and by a 24-word recovery key (BIP-39 English word list, MIT, kept as data); a new password rewraps only the data key; the `keys` header of the workspace documents the format; `workspace.json.enc` with an open header and a sealed body; `.gz.enc` files with a magic, gzip and AES-GCM.
- Keyring and vault: the data key kept as a non-extractable CryptoKey in IndexedDB in the browser, through `transport.secrets` on the desktop, in memory for tests.
- Sync engine (`app/src/sync/engine.js`, `cycle.js`, `merge.js`, `remote.js`): record merge where the newer `updatedAt` wins and tombstones travel, the same result from both sides; pull at start and after sign-in; upload on close, from the Sync button and 10 seconds after the last change; both originals of a merge kept in `backups/` with a rotation of 30; number conflicts after a merge resolved through `findNumberConflicts` (locked documents are only reported); `sync:status` and `sync:conflicts` events.
- Drive layout under "My Drive/WE Invoice/" with `workspace.json.enc`, `<companyId>/data.json.gz.enc`, `backups/`, `archive/`, `attachments/` and a README.txt; the `drive.file` scope only.
- Web transport: Google sign-in in a window of its own (token flow, one hour, renewal on a tap), Drive API client by path, secrets sealed with the data key. `GOOGLE_CLIENT_ID` comes from the build (`__GOOGLE_CLIENT_ID__`, environment variable with the public web client as the default).
- Desktop: `desktop/cloud.cjs` and `desktop/cloud-drive.cjs` with the PKCE loopback sign-in, refresh tokens in userData and Drive from the main process; `weCloud` bridge in the preload; `oauth-credentials.json` read as in WE Budget (userData override, then the bundled file).
- Dialogs: sign-in and renewal, encryption password, recovery key (print, save, copy, three words confirmed), unlock, recovery with the key and a new password, password change. Slovak and English texts in the `sync` part.
- Tests: crypto, recovery words, file formats, keyring and vault, merge, store, the engine over a mock Drive with two machines (merge, tombstones, idle upload, number conflict, recovery, damaged file, offline, sign-out), the Drive clients and the desktop cloud with a fake Google.

#### Changed

- `app/src/transport/web.js` and `desktop.js` implement `drive`, `auth` and `secrets` instead of the NOT_IMPLEMENTED stubs; the transport test checks that they refuse before sign-in and unlock.
- `app/vite.config.js`, `vitest.config.js` and `eslint.config.js` know the `__GOOGLE_CLIENT_ID__` define; `pages.yml` passes the `GOOGLE_CLIENT_ID` repository variable to the build.

### Interface shell and components

#### Added

- Sidebar of 260 px with the navigation groups, the Beta badge of e-invoices, tax items filtered by the company's VAT and bookkeeping modes (all shown while no company is known), the company switcher and the sync status line at the bottom. Both listen to the `company:switched`, `company:list` and `sync:status` events and show a neutral state without them; picking another company emits `company:switch`.
- Phone bottom bar with a FAB menu (invoice, expense, payment, scan a receipt) that works with the keyboard, and the More screen.
- Keyboard shortcuts: Ctrl/Cmd+K opens the search dialog, N, Ctrl/Cmd+S, Ctrl/Cmd+Enter and Escape reach the active screen as `hotkey:new`, `hotkey:save`, `hotkey:issue` and `hotkey:escape`. N is ignored while typing.
- White Eagles strip fixed at the bottom of the main area on wide screens, and the same block at the end of the More screen and the Overview on phones. It replaces the small promo link in the sidebar.
- Component library in `app/src/components`: table with virtual scrolling (10 000 rows drawn well under 200 ms), configurable columns, Comfortable and Compact density, totals row, bulk selection and phone cards; text, number, amount (accepts "," and "."), date, select, checkbox and radio fields with aria wiring; autocomplete combobox; document status badge for every status with colour, icon and text; empty state with one main action; undo toast; confirmation of irreversible actions; tabs; filter bar with saved filters.
- "My company" wizard: language, sign-in choice (Google through `auth:signIn` or the transport, local, sample data), encryption through `encryption:setup` (skipped with a note while nobody answers), company lookup by IČO through the gateway with manual entry on failure, VAT mode, bookkeeping mode (a limited company is offered only invoicing or an accountant), IBAN with BIC suggestion, logo, Peppol now or later with the 2027 warning for non-payers, and "Issue the first invoice". The draft is kept on the device so the wizard can be left and resumed; the finished company is emitted as `onboarding:complete` and `company:switched`.
- Sample data mode with a demo company, ten contacts and thirty documents.
- Overview with widgets that can be moved (buttons or drag and drop) and hidden, with the layout kept on the device: quick actions, issued this month and year with last year, unpaid by age, VAT registration limit with warnings at 80 % and 100 %, tax calendar from the legislation file, top clients and debtors, sales and purchases, received e-invoices, account balances. Document packages provide data through `setDashboardSource`.
- Settings with all sections of the specification; Interface (language, theme, density, sample data) and About are working, the others are filled by their packages through `registerSettingsSection` or the `settings-<section>` containers.
- Help screen built like the WE Budget guide, with Slovak and English texts, including "Getting started" and "E-invoicing 2027: what do I have to do".
- Notice "new version, reload" when the service worker updates a running app, quick links `?quick=invoice&contact=...`, safe areas of the iPhone.
- Unit tests for all of the above, Playwright tests on three viewports and axe checks in both themes (`@axe-core/playwright`, `happy-dom` added as development dependencies).

#### Changed

- The first start shows the Overview with a "Set up a company" action instead of an empty dashboard; an unfinished wizard is offered to be continued.
- The Help item was added to the navigation.
- Settings, Documents: the print language of the company's documents (Slovak by default) and an optional second language for bilingual documents, as drop-down lists. The interface language stays a separate setting of the device.

- Menu items for the screens of wave B: Quick sale, Stock, Export and import, Recycle bin and Change log; "Price list and stock" is now "Price list", as stock has its own screen.

#### Fixed

- Screens no longer show the word "null" where an optional part is missing (reports, VAT reports, quick sale and others): elements are added through the helper that skips empty parts. An end-to-end test opens every menu screen with sample data and fails on "null", "undefined", "NaN" or an untranslated dictionary key.
- The company made in the "My company" wizard is saved in the store and synced to Google Drive; it used to stay only on the device. A company kept on the device by an earlier version moves into the store at start, the device copy is dropped only after the store has written it, and the company switcher and the end of sample mode work through the store.
- Phone layout of the Overview: quick actions in a 2 by 2 grid with the icon above the label, badges no longer wrap, the page header wraps cleanly, widget titles take the free width and the move arrows are hidden on a phone (the order is changed in "Widgets"), and the create menu dims the page behind it and closes on a tap outside.

### PDF documents and QR payments

#### Added

- PAY by square (SBA 1.2.0, through the bysquare library) and QR Platba (SPD 1.0) in `packages/core/paybysquare`: encoding from the app's decimal-string payment, decoding for the round-trip test and the Inbox, and the format choice by account country and currency (`paymentQr`).
- PDF of a document in `app/src/pdf`: `buildPdf(document, company, options)` returns a Blob, `buildDocDefinition` is the pure pdfmake definition for snapshot tests. pdfmake and the Inter font files (Latin, Latin Extended and Cyrillic subset, SIL OFL) load lazily on the first PDF, outside the initial bundle.
- Four templates: Klasický, Moderný, Minimalistický, Kompaktný, with the brand colour, logo, stamp and signature (PNG with transparency), the particulars of § 74 ods. 1 zákona o DPH, a line table whose header repeats on every page, totals and the VAT summary from `document.totals`, the payment block with IBAN, BIC, VS, KS, SS and the QR code, legal notes from the legislation file, free texts and a footer with the register entry, contacts, the optional "Vystavené vo WE Invoice" and the page number.
- Print languages SK, CS, EN, DE and a bilingual mode (every label in two languages). The print dictionaries carry the same keys in all four files.
- The mandatory particulars check (`missingRequisites`): a tax document without them is refused with `PDF_MISSING_FIELDS` and the list of fields; a draft preview may pass `allowIncomplete`.
- File names by the company's mask (`{kind}_{number}_{buyer}` by default), transliterated and without forbidden characters.
- PDF/A-3b with embedded files (`options.attachments`, for the UBL XML) when attachments are given.
- The PDF service on the event bus (`pdf:build`, `pdf:download`, `pdf:preview`, `pdf:check`) in `app/src/boot/pdf.js`.
- Interface keys `pdf.*` and `errors.PDF_*`, `errors.QR_*` in Slovak and English.

#### Changed

- `bysquare` added as a dependency of the core, `pdfmake` as a build dependency of the app.

### Gateway

#### Added

- Gateway routes of 06-gateway-server.md § 6.3: streaming proxy to allow-listed Peppol providers (X-Upstream-Authorization becomes Authorization, 15 MB limit, private networks and cross-host redirects refused, answers never cached), Slovak company by IČO and search (RPO plus DIČ and IČ DPH from the FS open data), Czech company (ARES), VIES, Slovak VAT payer reliability (FS lists), ECB rates with history, eKasa receipt lookup (configurable URL), Peppol participant lookup (SML NAPTR with SHA-256 Base32 per Policy for use of Identifiers 4.4, optional legacy MD5 CNAME, SMP ServiceGroup), waitlist with double opt-in, confirm, unsubscribe, beta code redeem (HMAC token for one year), admin CSV export and counters.
- SQLite storage (better-sqlite3): waitlist, invite codes, public data cache with TTL per entry, request counters per route and day.
- Security: CORS for the site and the dev server only, per-route rate limits (@fastify/rate-limit) and a shared concurrency ceiling per upstream, security headers, one error format {error: {code, message}}, 502 UPSTREAM_UNAVAILABLE on every upstream failure, DNS guard against private addresses at connect time.
- Logging: route pattern, status, duration and anonymised IP only; authorization headers, URL, query, params and bodies are redacted; the proxy adds Cache-Control: no-store.
- Waitlist e-mails (confirmation and beta invitation) in Slovak, Czech, English, German, Russian and Ukrainian as data in gateway/src/mail/texts.
- Owner's script gateway/scripts/send-invites.mjs: invite codes from a CSV and the invitation e-mails, run by hand.
- Deployment files without deploying: deploy/discover.sh (read-only survey), deploy/nginx-invoice-api.conf, Dockerfile and docker-compose.yml, systemd unit, deploy/backup-sqlite.sh (14-day rotation), deploy/rollback.sh, deploy/README.md with the commands for Docker Compose and for systemd with Node 22.
- Tests with undici MockAgent for every route, SSRF guard, log masking, rate limit, double opt-in and a contract test against openapi.yaml with ajv; coverage threshold 90 % in npm test.
- Client dictionaries (sk, en) for the gateway error codes in app/src/i18n/*/net.js.

#### Changed

- The proxy allow-list is built from packages/core/peppol/providers.json at start (PROVIDERS_FILE and PROVIDER_BASE_URLS in .env adjust it); the Docker image is built from the repository root so it carries that file.
- gateway/.env.example lists every setting of the gateway.

### Desktop app

#### Added

- Desktop main process, ported from WE Budget and split into small modules: data file in `we-invoice-data` with atomic writes, a daily local backup named by the local calendar day (last 14 kept) and copies that are never rotated away; a corrupt or unreadable data file is kept as a copy and never overwritten with an empty one.
- Main window with a remembered position and size that always fits a display (minimum 1024 x 700), external links in the system browser, and a close that waits up to 8 s for the page to push unsent changes (`app:before-close` / `app:close-ready`).
- Preload bridges: `weStorage`, `weApp`, `wePlatform`, `weUpdates`, `weNet`, `weMail`, `weSecrets`, `weTray`, `weScheduler`; a place for `weCloud` of WP-SYNC (`exposeCloud()` in the preload, `loadCloud()` in the main process).
- `weNet`: HTTP requests from the main process without CORS, limited to https and to the hosts of the Peppol providers in `packages/core/peppol/providers.json` (entries with a base URL), the registers and the gateway; a custom SAPI-SK host can be added after public-DNS and private-address checks; timeouts, a 15 MB size limit and redirects only to allowed hosts.
- `weSecrets`: provider keys and the SMTP password sealed by the system keychain (safeStorage), nothing written when the keychain is not usable.
- `weMail`: sending through the user's own SMTP account with nodemailer in the main process (P1), with a connection test and error codes shown as `errors.MAIL_*`.
- Tray: a template icon in the macOS menu bar (with the amount to collect next to it) or an icon in the Windows notification area, with "To collect", "Overdue", "New invoice", "Receive e-invoices", "Open" and "Quit" in the page's language; with the tray on, closing the window keeps the app running in the background.
- Scheduler: wakes the page for recurring invoices and reminders once an hour and at start, and for receiving e-invoices every 15 minutes, also after sleep; remembers the last runs across restarts; "Start at login" option that starts the app hidden in the tray.
- Updates from GitHub Releases of WE-Invoice with sha512 verification from `latest-mac.yml` / `latest.yml`, preferring the universal macOS build.
- `weinvoice://` deep links (P2): `weinvoice://<route>/<path>?params`, single instance, delivered to the page after start.
- App side: the desktop transport (http through `weNet`, secrets through `weSecrets`, notifications through the main process), the desktop boot module with the close handshake, tray state built from the `desktop:tray` summary, scheduler wake-ups as `scheduler:<kind>` events, and the `#/desktop` settings screen (tray, start at login, background tasks, backups, updates, SMTP account).
- Slovak and English texts of the tray, updates, SMTP and desktop settings, and the `errors.NET_*`, `errors.MAIL_*`, `errors.SECRETS_*` and `errors.STORAGE_*` codes.
- Build: universal macOS dmg and zip (10.15+) signed ad hoc, Windows NSIS x64 per user; tray icon assets and the providers list packed; `nodemailer` as the only production dependency.
- Workflows: `release.yml` builds both platforms and creates a draft release with `latest-mac.yml` and `latest.yml` (run by hand only); `windows-install.yml` installs, runs, updates and uninstalls the app with Microsoft Defender on, by hand or when a push to develop changes the packaging; `release-check.yml` verifies the published release (checksums, `codesign --verify --deep --strict`, universal binary, version in Info.plist, bundled Google client, a 20-second run).
- README: installing on macOS (`xattr -cr`) and Windows (SmartScreen).
- Tests for every pure part of the main process (backups, data checks, window bounds, network policy and requests, update utils, tray menu, scheduler, deep links, mail, secrets, packaging check) and the app side (transport, close handshake, tray state, updates, boot).

### Website, waitlist, privacy and terms

#### Added
- Landing page in six languages (`site/sk/`, `cs/`, `en/`, `de/`, `ru/`, `uk/`) with hreflang and canonical links: hero, the eFaktura 2027 block with the waitlist form, nine feature cards, the comparison with paid apps without competitor names (facts as of 10/2026), privacy and openness, the three steps to connect an e-invoicing provider, FAQ including what the app deliberately does not do, the White Eagles block and the footer with the company details.
- Root pages (`site/index.html`, `privacy.html`, `terms.html`, `thanks.html`) choose the language of the browser, remember the visitor's choice and fall back to Slovak; `404.html` for GitHub Pages.
- Waitlist form posting to `POST /v1/waitlist` of the gateway: e-mail, language, four interests, VAT payer, GDPR consent, honeypot and form open time; messages in the language of the page; thank-you page per language.
- Privacy policy and terms of use per language: data on the device and in the user's Google Drive, what passes through the gateway without being stored (including provider API keys in the web version and the direct connection of the desktop version), what the server keeps, Google API Services User Data Policy (Limited Use), GDPR rights, retention, the e-invoicing provider as an independent controller; free "as is" under MIT, the user's responsibility for tax documents.
- SEO: titles and descriptions, Open Graph image per language (1200 x 630, rendered from a template by `site/build/images.js`), schema.org `SoftwareApplication` with a zero price and `FAQPage`, `sitemap.xml` with hreflang links, `robots.txt`.
- Cookie consent banner in six languages with Google Consent Mode v2; Google Analytics 4 loads only after consent and only when `GA4_MEASUREMENT_ID` in `site/assets/config.js` is set (empty for now).
- Site generator `site/build/` (templates plus `site/content/<lang>/*.json`), the committed output is checked against the templates by the tests.
- Waitlist e-mail texts (confirmation and beta invitation) in six languages in `site/emails/`.
- Texts and assets of the WE Invoice block for the apps page of whiteeagles.sk in `docs/whiteeagles-apps-block/`.
- Tests `tests/site/`: every language page exists with the same structure, hreflang and canonical are correct, no broken internal link, the form carries every field of the contract, structured data, sitemap, Open Graph image sizes, e-mail placeholders, number and unit spacing; e2e `tests/e2e/site.spec.js` for the redirect, the consent banner and the form.

#### Changed
- `site/index.html` is now the language chooser instead of a one-page placeholder.
- Waitlist without e-mails to applicants by default: a sign-up is stored at once and the owner gets a notice (Mailgun HTTP API or SMTP) with Reply-To set to the applicant, to answer personally; the double opt-in stays available with `WAITLIST_CONFIRM_EMAIL=true`. The form, the success message and the privacy policy say so in all six languages and name Mailgun (EU servers) as the processor of the notice.
- The privacy policy now says the desktop app looks for updates at start-up and once a day.

### Reports, search, recycle bin and change log

#### Added

- Report functions in the core (`packages/core/reports`), pure and on decimal strings: sales and purchases by period, client or supplier, item, label and project with the same periods of last year (`salesReport`); receivables and payables by age in the 1-15, 16-30, 31-60 and 60+ day buckets on the local date (`agingReport`); the cash flow forecast from open invoices, recurring templates and received invoices, shifted by how late each client usually pays (`cashflowForecast`); profitability by item, client and project from average purchase prices (`profitability`). Credit notes lower every total, foreign currency documents are converted by their stored ECB rate. 10 000 documents take well under 200 ms per report (performance tests).
- Global search (`searchIndex`, `searchQuery`): documents, received documents, contacts and price list items by number, variable symbol, client, IČO, label and amount in any usual format, without regard to case and diacritics. The Ctrl/Cmd+K dialog of the shell lists the best hits (Enter opens the first one); the new search screen `#/search?q=...` lists all of them by type. Results open the list route of their kind (`#/invoices/<id>`, `#/contacts/<id>`...).
- Reports screen: period presets or custom dates, chart step by month, quarter or year, label and project filters; tabs for sales, purchases, receivables and payables, cash flow and profitability with SVG charts drawn without a library, tables, CSV export (semicolons, decimal commas, byte order mark) and printing. The screen loads on first use, so the start of the app stays light.
- Recycle bin `#/trash`: deleted drafts, contacts, price list items and recurring templates can be restored under their own id for 30 days and removed for good (a bare tombstone stays so the removal syncs); deleted issued or received documents stay restorable and are never removed for good.
- Change log `#/audit` (and `#/audit/<record id>` for one record): every local change of a document, contact, item or recurring template is written to `auditLog` with the time, the signed-in account, the device, the kind of change and the changed field names; values are kept only for status, number and dates, never amounts. Filters by dates, change, record type and text.
- Label and project helpers (`collectLabels`, `collectProjects`, `normalizeLabels`) and a CSV writer (`toCsv`).
- End-to-end tests: the search finds an invoice by its variable symbol and opens it; the reports draw every tab; axe checks of the new screens.

### Stock, price levels and the quick sale

#### Added

- Stock core in `packages/core/stock`: validation of stock moves (receipt, issue, transfer, stocktaking difference), levels per item and warehouse on any date, warnings for balances below zero (checked at the end of each day, so backdated sales warn too) and for items under their minimum.
- Stock valuation by weighted average cost or FIFO per item across warehouses, with the cost of every move and the balance after it; a shortfall is costed at the last known cost and covered by the next receipt.
- Moves caused by documents (`movesForDocument`): issued invoices, delivery notes and sales receipts take goods out, received invoices bring them in at the net cost in EUR (with VAT for companies that cannot deduct it), credit notes marked with `stockReturn` bring goods back. An invoice whose goods left on a delivery note moves nothing. `reconcileDocumentMoves` and `documentMoveIds` keep the stored moves idempotent and identical on every device.
- Reservations by open received orders and the quantity free to sell.
- Prices for a client (`priceFor`): price levels with their own item prices or a discount, optional validity, the client's own prices and quantity discounts given as a line discount.
- Stocktaking differences as inventory adjustments, and a CSV writer (semicolon separated, decimal comma, BOM, formula cells neutralised).
- Quick sale (predajka): `issueSalesReceipt` issues a paid sales receipt without a client from a cart, cash rounded to the legal step, card not, partial payment possible; `vrpSummary` gives the data to type into the virtual cash register (VRP2).
- Stock screen (`#/stock`) with tabs for levels (reserved, available, unit cost, value, below minimum), the movement report for a period, stocktaking, warehouses with the valuation method, and price levels with item prices; CSV export of levels and moves.
- Receipt, issue and transfer dialogs with a quick way to add a stock item and a confirmation before a balance goes below zero.
- Quick sale screen (`#/quick-sale`) with search, barcode scanner input, cart, cash or card, partial payment and the VRP2 summary after the sale.
- Stock moves follow documents on the `stock:document-issued` event and on every local change of a document, so cancelling or deleting a document takes its moves back. The quick sale emits `stock:sales-receipt-issued`.
- Unit, DOM and end-to-end tests (receipt, quick sale, level drops) and a performance test of levels and valuation over 10 000 moves.

### Export, import, migration and backup

#### Added

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

### Bookkeeping for sole traders

#### Added

- Bookkeeping core for sole traders in `packages/core/ledger`: automatic cash book entries from document payments (split by line category, VAT kept apart for payers, foreign currency by the document rate, stable ids so two devices create the same record), the peňažný denník with every column of the MF SR form, month totals and cash and bank balances carried between years, books of receivables and payables at a day, tax depreciation (straight and accelerated, every group, months of use, disposal, rounding up to whole euros) and an accounting plan, travel compensation (km rate, fuel, meal allowance), the Výkaz o príjmoch a výdavkoch and the Výkaz o majetku a záväzkoch, the year closing checklist, the tax records with flat-rate expenses and the DPFO typ B table 1 summary, and a CSV writer.
- Ten golden years in `tests/fixtures/ledger` (non-payer, payer, transfers, assets, year-end books, advances and credit notes, warnings, trips and foreign currency, flat-rate below and over the cap).
- Screens for the `cash-journal`, `assets` and `closing` routes: the cash book with its books and trip log (or the income records and the type B summary with flat-rate expenses), the asset register with asset cards and plans, and the closing wizard with both statements. Tables become cards on a phone; print to PDF and CSV on every screen; demo mode shows the sample company and writes nothing; companies without bookkeeping get an explanation.
- Automatic entries kept in line with payments in the background while a bookkeeping company is open.

#### Changed

- `legislation/sk.json`: accelerated depreciation coefficients, rounding and proration switches in `depreciation`; travel rates (km rate and meal allowance bands) with validity dates from April 2025 in `travel`; `prorateByMonths` and the separate cap of § 6 ods. 4 in `flatExpenses`. All values stay unverified until checked against the source.

### VAT records and returns

#### Added

- VAT records (evidencia DPH, § 70) for a month or a quarter, built from issued and received documents: tax point by the date of supply, deduction period chosen by the user or the period of receipt, the § 20 date rule for intra-EU goods, the cash scheme (§ 68d) by the payments of the period, advance tax documents taken out of the final invoice, credit and debit notes with a negative sign, documents in other currencies converted by the rate on the document.
- Treatment of every VAT group: domestic supply, domestic reverse charge (§ 69 ods. 12), intra-EU goods and services, export, exempt, outside the scope, OSS, acquisitions from the EU, services from abroad (§ 69 ods. 3), import and foreign VAT.
- Kontrolný výkaz DPH with sections A.1, A.2, B.1, B.2, B.3.1 or B.3.2 (threshold of 3000 EUR deducted from simplified invoices), C.1, C.2, D.1 and D.2, filing types R, O and D, and its XML.
- Súhrnný výkaz DPH per buyer VAT id and supply code, with the VIES check through the gateway, filing types R and O, and its XML.
- Daňové priznanie k DPH (DPHv25, periods from July 2025): amounts under stable names mapped to the rows of the form by a data file, own liability and excess deduction, filing types R, O and D, and its XML.
- Checks before export with links to the documents: missing date of supply or receipt, missing or invalid VAT ids, corrections without the original invoice, stored totals that differ from the lines, broken or unsettled advances, documents changed after export, drafts in the period, rates without a row on the form.
- Closing and opening of a period (company.closedPeriods, with an audit entry and a required reason to open) and canChangeInPeriod for the document editors.
- Filed reports recorded in the audit log with a digest of their documents, a warning when documents change after filing, and the suggested filing type by the deadline.
- VAT registration limit: turnover of the calendar year, the previous year and the last 12 months against vatRegistrationThreshold, with warnings from 80 % and over the immediate limit.
- OSS data per country and rate for a quarter, as CSV.
- Screens vat-records, kv, sv and vat-return: period switcher, summary, checks, preview of the rows, XML download, the "filed" mark, the disclaimer, and read-only sample data in demo mode. The screens load on first use.
- Twelve golden examples in tests/fixtures/tax with the expected rows and XML, and an XSD validation test that uses the official schemas once they are provided.

#### Changed

- Form layouts (KVDPHv25, SVDPH, DPHv25) are data files in packages/core/tax/forms marked unverified until they are checked against the official XSD schemas of Finančná správa.

### eFaktúra through Peppol

#### Added

- E-invoices in Peppol BIS Billing 3.0 (UBL 2.1) with the Slovak rules: `buildUbl(document, company, options)` writes an Invoice or a CreditNote from `computeTotals` without recomputing any amount, with the legal notes (reverse charge, cash accounting scheme, self-billing), the reference to the corrected invoice (BT-25, BT-26), the VAT in EUR for other currencies (BT-6, BT-111), the delivery country of intra-community supplies and the optional PDF attachment (`company.defaults.attachPdfToEInvoice`, on by default).
- `parseUbl(xml, { received })` reads a received Invoice or CreditNote back into a document with parties, lines, VAT by rate, payment details, references and attachments; it keeps the stated totals and reports differences as warnings. The XML parser has no dependencies and refuses DOCTYPE declarations.
- `validateUblLocal` and `hasBlockingIssues`: the Slovak rules of `packages/core/ubl/sk-rules.json` (one test per rule) checked before sending.
- 28 UBL fixtures in `tests/fixtures/ubl` (rates 23, 19 and 5 %, line and document discounts and charges, reverse charge, exempt, intra-community and export supplies, not subject to VAT, foreign currencies, the tax document to a payment, a final invoice after an advance, credit and debit notes, gross prices, base quantity, cash rounding, PDF attachment) with expected XML, a build, parse and build round trip, and invalid cases.
- CI workflow `ubl-validate.yml`: the fixture XML is checked against the UBL 2.1 schema, the OpenPeppol BIS Billing 3.0.21 rules and the CEN EN 16931 rules (1.3.17), run by Saxon-HE on the runner's Java, with every artefact pinned by version and SHA-256.
- Provider adapters behind one interface: SAPI-SK (for every provider that speaks it), Verteco and the ePošťák API. In the browser the calls go through the gateway proxy, on the desktop straight to the provider; keys stay in `transport.secrets`, tokens only in memory.
- Sending queue: local checks, provider validation where offered, the XML archived in Drive before it leaves, an idempotency key per document revision, retries with back-off for network and server failures, locking of accepted documents and delivery checks where the provider reports them.
- Receiving: polling, the original XML archived before anything else, the document stored as a received invoice or credit note to process with its attachments, the supplier matched or created by DIČ, duplicates detected, and the provider acknowledged only after the document is safe.
- Settings > eFaktúra: a connection wizard with the beta code, the provider cards from `providers.json`, the VPDS instructions, keys with a connection test, the Peppol registration check through the gateway and the options (automatic receiving, PDF attachment, e-mail copy).
- Screens `efaktury-out` (what was sent or must be sent, with the 15-day deadline, single and bulk sending, retry, XML download) and `efaktury-in` (received e-invoices with a receive-now button).
- Events for other modules: `peppol:send`, `peppol:sendMany`, `peppol:receive`, and `peppol:status`, `peppol:received` in return. Background rounds at start, every 5 minutes on the web and on the desktop scheduler tick `scheduler:efaktury`.
- Slovak and English texts of the module.

#### Changed

- `providers.json`: API addresses of ePošťák, Verteco and eFaktúra.sk from their own documentation, with the sources listed; Dativery uses the SAPI-SK adapter; iPoštár has no adapter until its API is documented publicly.
- The tax document to a received payment is written with type code 388.

### Bank, cash and payments

#### Added

- Bank statement import in packages/core/payments/bank: CSV with bank profiles kept as data (Tatra banka, Slovenská sporiteľňa, VÚB, ČSOB SK, 365.bank, Prima banka, UniCredit, Fio, mBank, Revolut Business, Wise) and a generic layout, profile detection from the header, windows-1250 decoding, CAMT.053, MT940 and ABO/GPC. Transactions are normalised to bankTransactions records with decimal string amounts, calendar dates, VS/KS/SS, counterparty and IBAN (built from SK and CZ domestic numbers when needed).
- Idempotent import: keys of account, date, amount and reference, with a counter for identical lines of one file.
- Matching of transactions with documents: VS and amount (100), IBAN and amount (90), VS with another amount (85), document number in the message (80 or 70), amount and name (60), IBAN with another amount (50); partial payments and overpayments, one payment for several documents, several payments for one document, explanations as codes, confirmation before anything is written, undo.
- SEPA pain.001.001.03 batches for open received invoices with IBAN, BIC, amount and currency checks, validated against the ISO 20022 schema in tests.
- Cash desk: cash books with their own numbering series, príjmový and výdavkový pokladničný doklad, running balance, negative balance warning, pokladničná kniha as CSV and in the print window, vouchers created with cash payments.
- B2B cash payment limit from legislation (cashPaymentLimitB2b), counting earlier cash on the same document.
- Offset (zápočet) of receivables and payables with one party: protocol document, OFFSET payments, printed agreement, cancellation.
- eKasa stage 1: data for manual entry in VRP2 (invoice number and amount, VAT lines only for a sale that is not an invoice), a link to the financial administration's site, receipt ID and OKP fields on the payment; no integration with VRP2.
- Screens Bank, Cash desk and Payments with filters and phone cards, loaded on first use; events payment:record and payment:ekasa for other modules.
- Synthetic fixtures for every format and profile, unit tests and an end to end test of import, matching and the paid invoice.

### Contacts, price list, recurring invoices, reminders and e-mail

#### Added

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

#### Changed

- The CRM dictionaries are split by screen under `app/src/i18n/{sk,en}/sales/crm/` and merged in `sales/crm.js`, so no dictionary file grows past the size limit.

### Sales documents and the document editor

#### Added

- Lists of invoices, proforma invoices, credit and debit notes, quotes, orders and delivery notes: search, filters by period, status, client, label, currency and payment, sorting, totals per currency, bulk PDF download, sending and marking as paid, cards on a phone, an empty state with one main action, the status from the core and the "eFaktúra povinná" badge for Slovak sellers.
- One document editor for every sales kind: client search with a simple contact created on the spot, item, text and subtotal lines with price list suggestions, units in the print language, line and document discounts, VAT rates and exemption references from legislation, prices with or without VAT, live totals by EN 16931, the number the series will give, dates from the client or company due days, symbols, payment method and bank account, currency with the ECB rate, print language and second language, template, texts and an internal note, autosave of drafts and deletion with Undo.
- Issuing with the check of mandatory particulars shown at the fields, conversions (quote to proforma, invoice or order; proforma to the tax document for the received payment and to the final invoice that deducts the advance; invoice to credit note, debit note or delivery note), copies, statuses the user may set, unlocking a locked document with a reason in the audit log.
- Document card with the status ribbon, payments (partial payments, removal with Undo), related documents, the send log, PDF download and print.
- eKasa stage 1: for cash, card and on-site QR payments a screen with the invoice number and amount to copy into VRP2, the link to VRP2, the field for the receipt id, and a warning for cash between businesses above the legal limit.
- Settings: document defaults, numbering series with masks, resets, variable symbol masks and a protected next counter, and the company section with identifiers checked, bank accounts, logo, signature and stamp.
- Events for other packages: `document:send`, `peppol:send`, `stock:document-issued`; the editor opens on `document:new`, `fab:action` and `quick:invoice`; item prices for the client come from `priceFor` of the core stock module.
- The dashboard reads documents, contacts, accounts and the inbox count from the store while a company is open.
- Unit labels in the print dictionaries.

#### Fixed

- Leaving the editor right after issuing no longer writes the stale draft over the issued document.

### Purchases, Inbox and expenses

#### Added

- Inbox for received documents: drop, paste, pick or photograph PDFs, pictures and ISDOC or UBL XML files; every file is read on the device and waits in the queue "Na spracovanie" until the user checks it.
- Recognition in the core (`packages/core/imports/inbox`): UBL 2.1, ISDOC 6 and CII (ZUGFeRD, Factur-X) e-invoices, also embedded in a PDF; PAY by square and QR Platba payment codes; eKasa receipt codes (online receipts completed through `POST /v1/ekasa/receipt`, offline codes read directly); invoice fields from the PDF text layer or OCR text in Slovak, Czech, English and German, with IČO, DIČ, IČ DPH and IBAN accepted only when their checksums hold and amounts cross-checked against the VAT breakdown.
- `registerInboxParser` lets the Peppol and import packages plug in their full UBL and ISDOC parsers; the core `parseUbl` and `parseIsdoc` are used as soon as they exist.
- PDF reading with pdf.js (text layer, attachments, page rendering), QR codes with the browser's BarcodeDetector or jsQR, and OCR with tesseract.js and the Slovak, Czech and English models shipped with the app; all of it loads on first use and runs without any CDN.
- Review screen with the document preview: fields the recognition was unsure of are marked, "Vybrať" fills a field from the text clicked on the preview, and every value shows where it came from.
- Remembered suppliers: confirming a document creates or updates the supplier contact with a purchase template (category, payment method, line text and the place of each picked field), applied to the next document from the same IČO.
- Received invoices and expenses lists with filters, totals, payments, an expense summary by category with the input VAT to deduct, and manual entry.
- Expense categories as data (`expense-categories.json`) with their peňažný denník column and income tax and VAT deductibility; the input VAT period of a received document follows the company VAT period and the later of supply and receipt; `receivedKvSections` tells the tax package where a document belongs in the kontrolný výkaz.
- Inbox fixtures: five XML e-invoices, seven QR payloads, eleven invoice and receipt texts, three PDFs and six synthetic scans with expected fields; an OCR quality test in the performance suite and Playwright tests of the purchase flow.

### Interface translations

#### Added

- Complete Czech, German, Russian and Ukrainian interface dictionaries: every Slovak key of every part (common, core, sync, ui, pdf, desktop, net), in the same part and order as Slovak, with the help texts translated in full. `I18N_STRICT=1 npm test` passes for all six languages.
- `TRANSLATING.md`: how the dictionaries are built, how to add a key, how to check a translation and the typography rules.
- Full glossary in `app/src/i18n/GLOSSARY.md` with the terms of documents, parties, VAT, payments, accounting and e-invoicing in all six languages.

#### Changed

- German interface terms follow the German print dictionary: Proformarechnung for a proforma invoice, Rechnungskorrektur for a credit note, Nachbelastung for a debit note and Gutschrift only for a self-billed invoice, as German VAT law uses it.
- Czech names of the Slovak returns are kept literal (Kontrolní výkaz, Souhrnný výkaz), because the app files the Slovak forms.

### Skeleton

#### Added
- Monorepo skeleton: npm workspaces, Vite (web and desktop modes), Vitest, ESLint flat config, Playwright.
- `packages/core/schema`: JSON Schemas and JSDoc typedefs of every entity, schema version 1, migration runner.
- `packages/core` public API with the contract signatures; unimplemented functions throw `NotImplementedError`.
- `packages/core/legislation/sk.json` skeleton with validity dates and sources, all values unverified.
- `packages/core/peppol/providers.json` with the first-wave providers and a generic SAPI-SK entry.
- App shell: sidebar and phone bottom bar with FAB, language (6) and theme switching, placeholder views for every route.
- i18n engine with Slovak and English bundled and Czech, German, Russian, Ukrainian loaded on demand; print dictionaries for SK, CS, EN, DE.
- Design tokens of the WE line with the WE Invoice cyan-blue accent and document status colours.
- Transport bridge interface with web and desktop implementations.
- Electron main process with the `app://` scheme and a minimal preload.
- Gateway skeleton (Fastify 5) with `/v1/health` and the full `openapi.yaml` contract.
- CI: lint, unit tests, gateway tests, web build, bundle size and legislation checks; workflow skeletons for e2e, UBL validation, Pages, release and the gateway image.
- Repository hygiene, dictionary completeness and hardcoded-text tests.

#### Notes
- Data model additions beyond the specification: document kind `SALES_RECEIPT` (predajka) and payment method `QR_ON_SITE` (QR payment at the point of sale, relevant for eKasa).
