// Renders the site images with the Chromium bundled with Playwright:
//   node site/build/images.js [og|preview]
// Open Graph images, one per language, 1200 x 630 (site/assets/og/<lang>.png)
// and the product picture of the hero, 1440 x 900 (site/assets/preview.png).
// Run by hand when the texts or the design change; the PNG files are
// committed. CHROMIUM_PATH overrides the browser executable.
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { LANGUAGES, SITE_DIR } from './config.js';
import { loadContent } from './content.js';
import { ogHtml, OG_FACTS } from './og-template.js';
import { previewHtml } from './preview-template.js';

async function render(browser, html, width, height, path) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
  await page.close();
  writeFileSync(path, png);
  console.info(`${path.pathname.split('/').slice(-2).join('/')}: ${png.length} bytes`);
}

async function main() {
  const what = process.argv[2] || 'all';
  const options = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const browser = await chromium.launch(options);
  try {
    if (what === 'all' || what === 'og') {
      const dir = new URL('assets/og/', SITE_DIR);
      mkdirSync(dir, { recursive: true });
      for (const { code } of LANGUAGES) {
        const { landing } = loadContent(code);
        const html = ogHtml({ code, title: landing.meta.ogTitle, tagline: landing.meta.ogTagline, facts: OG_FACTS[code] });
        await render(browser, html, 1200, 630, new URL(`${code}.png`, dir));
      }
    }
    if (what === 'all' || what === 'preview') {
      await render(browser, previewHtml(), 1440, 900, new URL('assets/preview.png', SITE_DIR));
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
