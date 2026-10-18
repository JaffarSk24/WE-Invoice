# WE Invoice block for whiteeagles.sk/{lang}/apps/

Texts and assets of the WE Invoice block for the apps page of the agency site, in the six languages of the site: `sk`, `cs`, `en`, `de`, `ru`, `uk`. The agency site lives in its own repository; these files are copied there.

| File | What it is |
|---|---|
| `<lang>.md` | The block as Markdown: name, tagline, description, feature list, buttons, FAQ. |
| `<lang>.html` | The same block as an HTML fragment (`<section class="app-block" id="we-invoice">`), ready to paste into the page; class names follow the Time Tracker and Budget blocks (`app-block`, `app-icon`, `app-shot`, `tagline`, `buttons`, `btn`). |
| `assets/icon.png` | The app icon, 192 x 192. |
| `assets/preview.png` | The product picture, 1440 x 900. |

The files are generated from `site/content/<lang>/apps.json` by `node site/build/build.js`; edit the JSON, not the output.
