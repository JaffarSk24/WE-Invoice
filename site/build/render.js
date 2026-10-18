// Renders every file of the site in memory, as { relative path: content }.
// build.js writes them; the site tests compare them with the committed
// files so the output can never drift from the templates and the texts.
import { PAGES } from './config.js';
import { loadAll } from './content.js';
import { document } from './page.js';
import { landingBody } from './landing.js';
import { legalBody, thanksBody } from './legal.js';
import { softwareApplication, faqPage, sitemap, robots } from './seo.js';
import { chooser, notFound } from './root.js';
import { appsMarkdown, appsHtml } from './apps-block.js';

// The four pages of one language as { fileName: html }.
export function renderLanguage(c) {
  const { code, common, landing, privacy, terms } = c;
  const base = { code, common };
  return {
    'index.html': document({
      ...base,
      page: 'index.html',
      title: landing.meta.title,
      description: landing.meta.description,
      ogTitle: landing.meta.ogTitle,
      ogDescription: landing.meta.ogDescription,
      styles: ['base.css', 'landing.css'],
      scripts: ['site.js', 'consent.js', 'waitlist.js'],
      jsonLd: [softwareApplication(code, landing, common), faqPage(code, landing)],
      body: landingBody(code, landing)
    }),
    'thanks.html': document({
      ...base,
      page: 'thanks.html',
      title: `${common.thanks.title}: WE Invoice`,
      description: common.thanks.description,
      styles: ['base.css', 'doc.css'],
      noindex: true,
      body: thanksBody(common.thanks)
    }),
    'privacy.html': document({
      ...base,
      page: 'privacy.html',
      title: privacy.meta.title,
      description: privacy.meta.description,
      styles: ['base.css', 'doc.css'],
      body: legalBody(privacy)
    }),
    'terms.html': document({
      ...base,
      page: 'terms.html',
      title: terms.meta.title,
      description: terms.meta.description,
      styles: ['base.css', 'doc.css'],
      body: legalBody(terms)
    })
  };
}

// Everything the build produces, as { relative path: content }, so a test
// can compare it with the committed files without writing anything.
export function renderAll(contents = loadAll()) {
  const out = {};
  for (const c of contents) {
    const pages = renderLanguage(c);
    for (const page of PAGES) out[`site/${c.code}/${page}`] = pages[page];
    out[`docs/whiteeagles-apps-block/${c.code}.md`] = appsMarkdown(c.code, c.apps);
    out[`docs/whiteeagles-apps-block/${c.code}.html`] = appsHtml(c.code, c.apps);
  }
  for (const page of PAGES) out[`site/${page}`] = chooser(contents, page);
  out['site/404.html'] = notFound(contents);
  out['site/sitemap.xml'] = sitemap();
  out['site/robots.txt'] = robots();
  return out;
}
