# WP-SITE: website, waitlist, privacy and terms

### Added
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

### Changed
- `site/index.html` is now the language chooser instead of a one-page placeholder.
