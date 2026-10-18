// The document skeleton shared by every page of every language: head with
// canonical, hreflang, Open Graph and structured data, the header with the
// language switcher, the footer with the company details and the consent
// banner. Page bodies come from landing.js and legal.js.
import { SITE_URL, APP_URL, GITHUB_URL, LICENSE_URL, AGENCY_URL, LANGUAGES, OTHER_APPS } from './config.js';
import { escape, attr, text, lines, indent, plain } from './html.js';

export function pageUrl(code, page) {
  return `${SITE_URL}${code}/${page === 'index.html' ? '' : page}`;
}

function rootUrl(page) {
  return `${SITE_URL}${page === 'index.html' ? '' : page}`;
}

function alternates(page) {
  const links = LANGUAGES.map(l => `<link rel="alternate" hreflang="${l.hreflang}" href="${pageUrl(l.code, page)}">`);
  links.push(`<link rel="alternate" hreflang="x-default" href="${rootUrl(page)}">`);
  return links;
}

function head({ code, page, title, description, ogTitle, ogDescription, styles, scripts, jsonLd, noindex }) {
  const lang = LANGUAGES.find(l => l.code === code);
  const url = pageUrl(code, page);
  const image = `${SITE_URL}assets/og/${code}.png`;
  return lines(
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${attr(plain(description))}">`,
    noindex ? '<meta name="robots" content="noindex">' : '',
    `<link rel="canonical" href="${url}">`,
    alternates(page),
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="WE Invoice">',
    `<meta property="og:title" content="${attr(ogTitle || title)}">`,
    `<meta property="og:description" content="${attr(plain(ogDescription || description))}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:locale" content="${lang.locale}">`,
    LANGUAGES.filter(l => l.code !== code).map(l => `<meta property="og:locale:alternate" content="${l.locale}">`),
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#090b11" media="(prefers-color-scheme: dark)">',
    '<meta name="theme-color" content="#f8fafc" media="(prefers-color-scheme: light)">',
    '<link rel="icon" type="image/png" href="../assets/favicon.png">',
    '<link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">',
    styles.map(s => `<link rel="stylesheet" href="../assets/${s}">`),
    scripts.map(s => `<script type="module" src="../assets/${s}"></script>`),
    jsonLd.map(obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
  );
}

function languageSwitch(code, page, common) {
  const items = LANGUAGES.map(l => {
    const current = l.code === code ? ' aria-current="page"' : '';
    return `<li><a href="../${l.code}/${page}" hreflang="${l.hreflang}" lang="${l.hreflang}"${current}>${l.code.toUpperCase()}</a></li>`;
  });
  return lines(
    `<nav class="langs" aria-label="${attr(common.langSwitch)}">`,
    '  <ul>',
    indent(items.join('\n'), 4),
    '  </ul>',
    '</nav>'
  );
}

function header(code, page, common) {
  const home = page === 'index.html' ? '' : './';
  const n = common.nav;
  return lines(
    '<header class="top">',
    '  <div class="wrap">',
    `    <a class="brand" href="./"><img src="../assets/icon.png" alt="" width="32" height="32">WE Invoice</a>`,
    '    <nav class="links" aria-label="WE Invoice">',
    `      <a href="${home}#features">${text(n.features)}</a>`,
    `      <a href="${home}#efaktura">${text(n.efaktura)}</a>`,
    `      <a href="${home}#compare">${text(n.compare)}</a>`,
    `      <a href="${home}#faq">${text(n.faq)}</a>`,
    `      <a href="${GITHUB_URL}" rel="noopener">${text(n.github)}</a>`,
    `      <a class="btn small primary" href="../app/">${text(n.app)}</a>`,
    '    </nav>',
    indent(languageSwitch(code, page, common), 4),
    '  </div>',
    '</header>'
  );
}

function footer(common) {
  const f = common.footer;
  const apps = OTHER_APPS.map(a => `<a href="${a.url}" rel="noopener">${a.name}</a>`).join(' &middot; ');
  return lines(
    '<footer>',
    '  <div class="wrap">',
    '    <div class="footer-grid">',
    '      <div>',
    `        <p><strong>${text(f.company)}</strong><br>${text(f.address)}<br>${text(f.ico)}</p>`,
    `        <p><a href="mailto:${attr(f.email)}">${text(f.email)}</a></p>`,
    '      </div>',
    '      <div>',
    `        <p><a href="./privacy.html">${text(f.privacy)}</a><br><a href="./terms.html">${text(f.terms)}</a><br><a href="#" class="consent-open">${text(f.cookies)}</a></p>`,
    '      </div>',
    '      <div>',
    `        <p><a href="${GITHUB_URL}" rel="noopener">${text(f.github)}</a><br><a href="${LICENSE_URL}" rel="noopener">${text(f.license)}</a></p>`,
    `        <p>${text(f.otherApps)}<br>${apps}</p>`,
    '      </div>',
    '    </div>',
    `    <p class="copy">&copy; 2026 <a href="${AGENCY_URL}" rel="noopener">${text(f.company)}</a></p>`,
    '  </div>',
    '</footer>'
  );
}

function consentBanner(common) {
  const c = common.consent;
  return lines(
    `<div class="consent" id="consent" role="region" aria-labelledby="consent-title" hidden>`,
    '  <div class="wrap">',
    `    <p class="consent-title" id="consent-title">${text(c.title)}</p>`,
    `    <p>${text(c.text)} <a href="./privacy.html">${text(c.more)}</a></p>`,
    '    <div class="consent-actions">',
    `      <button type="button" class="btn primary" data-consent="accept">${text(c.accept)}</button>`,
    `      <button type="button" class="btn" data-consent="reject">${text(c.reject)}</button>`,
    '    </div>',
    '  </div>',
    '</div>'
  );
}

// Renders a whole document. `body` is the inner HTML of <main>.
export function document(opts) {
  const { code, page, common, body, bodyClass = '' } = opts;
  return lines(
    '<!doctype html>',
    `<html lang="${code}">`,
    '<head>',
    indent(head({ styles: ['base.css'], scripts: ['site.js', 'consent.js'], jsonLd: [], ...opts })),
    '</head>',
    `<body${bodyClass ? ` class="${bodyClass}"` : ''}>`,
    `  <a class="skip" href="#main">${text(common.skipToContent)}</a>`,
    indent(header(code, page, common)),
    '  <main id="main">',
    indent(body, 4),
    '  </main>',
    indent(footer(common)),
    indent(consentBanner(common)),
    '</body>',
    '</html>',
    ''
  );
}

export { APP_URL };
