# WP-SYNC: data, encryption, Google Drive, store

## Added

- Local store (`app/src/store`): the workspace and the data of the active company as the two schema roots, record CRUD by collection with UUIDv7 ids, UTC timestamps and tombstones, `data:changed` and `company:switched` events, several companies with separate data files, read-only mode for data of a newer schema, IndexedDB persistence with a memory adapter for tests. A stored file that cannot be read is never overwritten.
- Encryption (`app/src/sync/crypto.js`, `keys.js`, `recovery.js`, `files.js`): a random AES-GCM 256 data key wrapped by a PBKDF2-SHA256 password key (600 000 iterations) and by a 24-word recovery key (BIP-39 English word list, MIT, kept as data); a new password rewraps only the data key; the `keys` header of the workspace documents the format; `workspace.json.enc` with an open header and a sealed body; `.gz.enc` files with a magic, gzip and AES-GCM.
- Keyring and vault: the data key kept as a non-extractable CryptoKey in IndexedDB in the browser, through `transport.secrets` on the desktop, in memory for tests.
- Sync engine (`app/src/sync/engine.js`, `cycle.js`, `merge.js`, `remote.js`): record merge where the newer `updatedAt` wins and tombstones travel, the same result from both sides; pull at start and after sign-in; upload on close, from the Sync button and 10 seconds after the last change; both originals of a merge kept in `backups/` with a rotation of 30; number conflicts after a merge resolved through `findNumberConflicts` (locked documents are only reported); `sync:status` and `sync:conflicts` events.
- Drive layout under "My Drive/WE Invoice/" with `workspace.json.enc`, `<companyId>/data.json.gz.enc`, `backups/`, `archive/`, `attachments/` and a README.txt; the `drive.file` scope only.
- Web transport: Google sign-in in a window of its own (token flow, one hour, renewal on a tap), Drive API client by path, secrets sealed with the data key. `GOOGLE_CLIENT_ID` comes from the build (`__GOOGLE_CLIENT_ID__`, environment variable with the public web client as the default).
- Desktop: `desktop/cloud.cjs` and `desktop/cloud-drive.cjs` with the PKCE loopback sign-in, refresh tokens in userData and Drive from the main process; `weCloud` bridge in the preload; `oauth-credentials.json` read as in WE Budget (userData override, then the bundled file).
- Dialogs: sign-in and renewal, encryption password, recovery key (print, save, copy, three words confirmed), unlock, recovery with the key and a new password, password change. Slovak and English texts in the `sync` part.
- Tests: crypto, recovery words, file formats, keyring and vault, merge, store, the engine over a mock Drive with two machines (merge, tombstones, idle upload, number conflict, recovery, damaged file, offline, sign-out), the Drive clients and the desktop cloud with a fake Google.

## Changed

- `app/src/transport/web.js` and `desktop.js` implement `drive`, `auth` and `secrets` instead of the NOT_IMPLEMENTED stubs; the transport test checks that they refuse before sign-in and unlock.
- `app/vite.config.js`, `vitest.config.js` and `eslint.config.js` know the `__GOOGLE_CLIENT_ID__` define; `pages.yml` passes the `GOOGLE_CLIENT_ID` repository variable to the build.
