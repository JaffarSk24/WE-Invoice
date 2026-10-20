// Structured data (schema.org), the sitemap and robots.txt.
import { SITE_URL, GITHUB_URL, AGENCY_URL, LANGUAGES, PAGES, UNLISTED } from './config.js';
import { plain } from './html.js';
import { pageUrl } from './page.js';

const ORGANIZATION = { '@type': 'Organization', name: 'White Eagles & Co. s. r. o.', url: AGENCY_URL };

export function softwareApplication(code, landing, common) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'WE Invoice',
    url: pageUrl(code, 'index.html'),
    inLanguage: code,
    description: plain(landing.meta.description),
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, macOS, Windows',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    license: 'https://opensource.org/licenses/MIT',
    isAccessibleForFree: true,
    featureList: landing.features.items.map(i => i.title),
    image: `${SITE_URL}assets/og/${code}.png`,
    downloadUrl: `${GITHUB_URL}/releases/latest`,
    author: ORGANIZATION,
    publisher: ORGANIZATION
  };
}

export function faqPage(code, landing) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: code,
    mainEntity: landing.faq.items.map(it => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: plain(it.a) }
    }))
  };
}

// One <url> per language page, each with hreflang links to its siblings.
export function sitemap() {
  const indexed = PAGES.filter(p => !UNLISTED.includes(p));
  const entries = [];
  for (const page of indexed) {
    for (const lang of LANGUAGES) {
      const links = LANGUAGES.map(l => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${pageUrl(l.code, page)}"/>`);
      links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${page === 'index.html' ? '' : page}"/>`);
      entries.push([
        '  <url>',
        `    <loc>${pageUrl(lang.code, page)}</loc>`,
        ...links,
        `    <priority>${page === 'index.html' ? '1.0' : '0.4'}</priority>`,
        '  </url>'
      ].join('\n'));
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    ''
  ].join('\n');
}

export function robots() {
  return ['User-agent: *', 'Allow: /', ...UNLISTED.map(p => `Disallow: /WE-Invoice/*/${p}`), '', `Sitemap: ${SITE_URL}sitemap.xml`, ''].join('\n');
}
