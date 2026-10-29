// Pages at the site root: the language chooser that redirects by browser
// language (index.html, privacy.html, terms.html) and the 404 page GitHub
// Pages serves for unknown paths.
// The chooser works without JavaScript too: it lists every language.
import { SITE_URL, LANGUAGES, DEFAULT_LANGUAGE } from './config.js';
import { escape, attr, lines, indent } from './html.js';

function alternates(page) {
  const links = LANGUAGES.map(l => `<link rel="alternate" hreflang="${l.hreflang}" href="${SITE_URL}${l.code}/${page === 'index.html' ? '' : page}">`);
  links.push(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}${page === 'index.html' ? '' : page}">`);
  return links;
}

function languageList(contents, page, absolute) {
  return contents.map(c => {
    const href = absolute ? `${SITE_URL}${c.code}/${page}` : `${c.code}/${page}`;
    return `<li><a href="${href}" hreflang="${c.code}" lang="${c.code}">${escape(c.common.langName)}</a></li>`;
  });
}

// contents: the loaded content of every language, Slovak first.
export function chooser(contents, page) {
  const sk = contents.find(c => c.code === DEFAULT_LANGUAGE);
  const title = page === 'index.html' ? sk.landing.meta.title : sk.common.redirect.title;
  return lines(
    '<!doctype html>',
    `<html lang="${DEFAULT_LANGUAGE}">`,
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escape(title)}</title>`,
    `  <meta name="description" content="${attr(sk.landing.meta.description)}">`,
    `  <link rel="canonical" href="${SITE_URL}${page === 'index.html' ? '' : page}">`,
    indent(alternates(page).join('\n')),
    '  <link rel="icon" type="image/png" href="assets/favicon.png">',
    '  <link rel="stylesheet" href="assets/base.css">',
    '  <script type="module" src="assets/site.js"></script>',
    '</head>',
    `<body class="chooser" data-redirect="${page}">`,
    '  <main id="main">',
    '    <div class="wrap narrow">',
    `      <h1><img src="assets/icon.png" alt="" width="48" height="48">WE Invoice</h1>`,
    `      <p class="lead">${escape(sk.landing.hero.lead)}</p>`,
    `      <p>${escape(sk.common.redirect.text)}</p>`,
    '      <ul class="lang-list">',
    indent(languageList(contents, page, false).join('\n'), 8),
    '      </ul>',
    '    </div>',
    '  </main>',
    '</body>',
    '</html>',
    ''
  );
}

export function notFound(contents) {
  const sk = contents.find(c => c.code === DEFAULT_LANGUAGE);
  const nf = sk.common.notFound;
  return lines(
    '<!doctype html>',
    `<html lang="${DEFAULT_LANGUAGE}">`,
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escape(nf.title)}: WE Invoice</title>`,
    '  <meta name="robots" content="noindex">',
    `  <link rel="icon" type="image/png" href="${SITE_URL}assets/favicon.png">`,
    `  <link rel="stylesheet" href="${SITE_URL}assets/base.css">`,
    '</head>',
    '<body class="chooser">',
    '  <main id="main">',
    '    <div class="wrap narrow">',
    `      <h1>${escape(nf.h1)}</h1>`,
    `      <p class="lead">${escape(nf.text)}</p>`,
    `      <p><a class="btn primary" href="${SITE_URL}">${escape(nf.cta)}</a></p>`,
    '      <ul class="lang-list">',
    indent(languageList(contents, 'index.html', true).join('\n'), 8),
    '      </ul>',
    '    </div>',
    '  </main>',
    '</body>',
    '</html>',
    ''
  );
}
