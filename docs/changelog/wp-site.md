# WP-SITE: eFaktura open to everyone

### Changed
- The eFaktura block of the landing page in all six languages no longer collects sign-ups: it explains that the feature is marked Beta because it is new but is open to everyone, lists three short steps (choose an accredited provider, enter its API key in Settings, eFaktúra, send and receive) and links to the app. It states that the feature costs nothing on our side and that the provider charges under its own price list.
- The hero hint and the connection steps no longer mention a closed beta; the settings path in the Czech, German, Russian and Ukrainian steps uses the app label eFaktúra.
- Privacy policy: the server keeps only the cache of public register data; the waiting list, invitation codes, the e-mail processor of sign-up notices and the withdrawal of the waiting list consent are gone. Effective from 30 October 2026.
- Terms of use: the waiting list section and the closed beta wording are gone; the eFaktura feature is described as Beta, open to everyone and working through the provider the user chooses, without liability for the provider's services. Effective from 30 October 2026.

### Removed
- The waiting list form, `site/assets/waitlist.js` and its styles.
- The thank-you and unsubscribed pages (`thanks.html`, `unsubscribed.html` at the root and per language) and their texts.
- `site/emails/` (confirmation and invitation texts); the gateway keeps its own texts in `gateway/src/mail/texts/`.

### Added
- `tests/site/start.test.js`: the eFaktura block of every language opens the app with three steps and no form, the pages of the old sign-up flow are gone, and no site file mentions the waiting list or invitations.
