# WP-DESKTOP

## Added

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
