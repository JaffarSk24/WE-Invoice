# Waitlist e-mails

One file per language with the two e-mails of the waitlist flow (09-site-waitlist-marketing.md § 9.2). The gateway picks the file by the `lang` of the sign-up and fills the placeholders.

| Key | When | Placeholders |
|---|---|---|
| `confirm` | Right after `POST /v1/waitlist`: asks to confirm the address (double opt-in). | `{confirmUrl}`, `{siteUrl}` |
| `invite` | When the owner opens a beta wave (`gateway/scripts/send-invites.mjs`). | `{code}`, `{appUrl}`, `{unsubscribeUrl}` |

Each e-mail has `subject` and a plain-text `body` with `\n` line breaks. The tests in `tests/site/content.test.js` check that every language carries the same placeholders.
