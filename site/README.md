# WE Invoice site

The landing page, privacy policy, terms and the waitlist, published by GitHub Pages at `https://jaffarsk24.github.io/WE-Invoice/` next to the web app at `/WE-Invoice/app/`. Static HTML and CSS, no framework, six languages.

| Folder | What it is |
|---|---|
| `<lang>/` | The pages of one language: `index.html`, `thanks.html`, `privacy.html`, `terms.html`. Generated, do not edit by hand. |
| `index.html`, `privacy.html`, `terms.html`, `thanks.html`, `404.html` | Root pages: the language chooser that redirects by browser language (Slovak by default) and the not-found page. Generated. |
| `content/<lang>/` | The texts of one language: `common.json`, `landing.json`, `privacy.json`, `terms.json`, `apps.json`. Slovak is the reference. |
| `build/` | The generator: templates and the image renderer. |
| `assets/` | Stylesheets, scripts (`site.js`, `consent.js`, `waitlist.js`, `config.js`), icons, the Open Graph images in `og/` and the product picture. |
| `emails/` | The waitlist e-mail texts the gateway sends. |

```bash
node site/build/build.js      # pages, sitemap, robots, the whiteeagles.sk block
node site/build/images.js     # Open Graph images and the product picture (Chromium)
npx vitest run tests/site     # checks the committed output against the templates
```

Analytics: `GA4_MEASUREMENT_ID` in `assets/config.js` is empty, so no analytics script is loaded. Once set, Google Analytics 4 loads only after the visitor agrees in the consent banner (Consent Mode v2).
