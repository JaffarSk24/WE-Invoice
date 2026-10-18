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

#### Fixed

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
