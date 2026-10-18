# WE Invoice

Free invoicing, e-invoicing (Peppol) and simple bookkeeping for small businesses in Slovakia and the Czech Republic. The third free app of the WE line after [WE Time Tracker](https://github.com/JaffarSk24/WE-Time-Tracker) and [WE Budget](https://github.com/JaffarSk24/WE-Budget).

- Free, without plans, limits or registration.
- Your data stays yours: encrypted on your device and stored in your own Google Drive. The White Eagles server is only a gateway and keeps no business data.
- Web app (also on the phone, as a PWA) and desktop app for macOS and Windows.
- eFaktura through Peppol, mandatory in Slovakia from 1 January 2027: sending and receiving through a provider of your choice.

> Status: early development. Nothing is released yet.

## Installing the desktop app

The installers come from [GitHub Releases](https://github.com/JaffarSk24/WE-Invoice/releases). The app updates itself from there and checks the sha512 of every download against the release's `latest-mac.yml` or `latest.yml`.

### macOS (10.15 or newer, Intel and Apple silicon)

1. Download `WE-Invoice-<version>-mac-universal.dmg`, open it and drag WE Invoice to Applications.
2. Before opening the app for the first time, run this once in Terminal:

   ```bash
   xattr -cr "/Applications/WE Invoice.app"
   ```

   The app is signed ad hoc and not yet notarized by Apple. Files downloaded in a browser carry a flag that makes macOS refuse such apps, and the command removes that flag. After it WE Invoice opens like any other app, and its own updates need no such step.

### Windows (10 or newer, 64-bit)

1. Download `WE-Invoice-<version>-win-x64.exe` and run it. It installs for the current user only, without administrator rights, and puts a shortcut on the desktop and in the Start menu.
2. The installer is not signed with a paid certificate, so SmartScreen shows "Windows protected your PC". Click "More info", then "Run anyway". Updates installed by the app itself do not show this screen.

Data of the desktop app lives in `we-invoice-data` inside the user's application data folder (`~/Library/Application Support` on macOS, `%APPDATA%` on Windows), with a daily local backup of the last 14 days in `backups/`.

## Repository

| Folder | What it is |
|---|---|
| `packages/core` | Pure domain logic: money, VAT, documents, numbering, UBL, tax reports, bookkeeping. No DOM, no network. |
| `app` | The client (vanilla JS + Vite), the same code for the web and the desktop. |
| `desktop` | Electron main process and preload bridges. |
| `gateway` | Stateless Fastify gateway (Node 22): proxy to Peppol providers, public registers, VIES, ECB rates, waitlist. |
| `site` | Landing page, privacy policy and terms (GitHub Pages). |
| `tests` | Repository checks, end-to-end tests and fixtures. |

## Development

```bash
npm install
npm run dev            # web client at http://localhost:5173
npm run dev:desktop    # Electron
npm test               # unit tests (core, app, desktop)
npm run lint
npm run build:web      # dist-web/ for GitHub Pages (/WE-Invoice/app/)
npm --prefix gateway install && npm run test:gateway
```

## License

[MIT](LICENSE), White Eagles & Co. s.r.o.
