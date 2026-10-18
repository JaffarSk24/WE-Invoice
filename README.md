# WE Invoice

Free invoicing, e-invoicing (Peppol) and simple bookkeeping for small businesses in Slovakia and the Czech Republic. The third free app of the WE line after [WE Time Tracker](https://github.com/JaffarSk24/WE-Time-Tracker) and [WE Budget](https://github.com/JaffarSk24/WE-Budget).

- Free, without plans, limits or registration.
- Your data stays yours: encrypted on your device and stored in your own Google Drive. The White Eagles server is only a gateway and keeps no business data.
- Web app (also on the phone, as a PWA) and desktop app for macOS and Windows.
- eFaktura through Peppol, mandatory in Slovakia from 1 January 2027: sending and receiving through a provider of your choice.

> Status: early development. Nothing is released yet.

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
