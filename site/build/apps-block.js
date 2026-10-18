// The WE Invoice block for the apps page of whiteeagles.sk, one Markdown
// file and one HTML fragment per language, built from site/content/<lang>/
// apps.json so the texts stay in step with the landing page.
import { SITE_URL, APP_URL, GITHUB_URL, RELEASES_URL } from './config.js';
import { text, inline, attr, lines, indent } from './html.js';

export function appsMarkdown(code, a) {
  const faq = a.faq.map(f => `**${f.q}**\n\n${f.a}`).join('\n\n');
  return lines(
    `# ${a.name}`,
    '',
    `*${a.tagline}*`,
    '',
    a.description,
    '',
    `![${a.screenshotAlt}](assets/preview.png)`,
    '',
    `## ${a.featuresTitle}`,
    '',
    a.features.map(f => `- ${f}`),
    '',
    `[${a.buttons.open}](${APP_URL}) · [${a.buttons.download}](${RELEASES_URL}) · [${a.buttons.site}](${SITE_URL}${code}/) · [${a.buttons.github}](${GITHUB_URL})`,
    '',
    `## ${a.faqTitle}`,
    '',
    faq,
    ''
  );
}

export function appsHtml(code, a) {
  const faq = a.faq.map(f => lines('<details>', `  <summary>${text(f.q)}</summary>`, `  <p>${inline(f.a)}</p>`, '</details>')).join('\n');
  return lines(
    `<section class="app-block" id="we-invoice" lang="${code}">`,
    `  <img class="app-icon" src="assets/icon.png" alt="" width="96" height="96">`,
    `  <h2>${text(a.name)}</h2>`,
    `  <p class="tagline">${text(a.tagline)}</p>`,
    `  <p>${inline(a.description)}</p>`,
    `  <img class="app-shot" src="assets/preview.png" alt="${attr(a.screenshotAlt)}" width="1440" height="900" loading="lazy">`,
    `  <h3>${text(a.featuresTitle)}</h3>`,
    '  <ul>',
    indent(a.features.map(f => `<li>${inline(f)}</li>`).join('\n'), 4),
    '  </ul>',
    '  <p class="buttons">',
    `    <a class="btn primary" href="${APP_URL}">${text(a.buttons.open)}</a>`,
    `    <a class="btn" href="${RELEASES_URL}">${text(a.buttons.download)}</a>`,
    `    <a class="btn" href="${SITE_URL}${code}/">${text(a.buttons.site)}</a>`,
    `    <a class="btn" href="${GITHUB_URL}">${text(a.buttons.github)}</a>`,
    '  </p>',
    `  <h3>${text(a.faqTitle)}</h3>`,
    indent(faq),
    '</section>',
    ''
  );
}
