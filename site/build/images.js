// Renders the site images with the Chromium bundled with Playwright:
//   node site/build/images.js [og|preview]
// Open Graph images, one per language, 1200 x 630 (site/assets/og/<lang>.png)
// and the product picture of the hero, 1440 x 900 (site/assets/preview.png)
// with WebP copies at 720 and 1440 px for the <picture> element.
// Run by hand when the texts or the design change; the PNG files are
// committed. CHROMIUM_PATH overrides the browser executable.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { LANGUAGES, SITE_DIR } from './config.js';
import { loadContent } from './content.js';
import { ogHtml, OG_FACTS } from './og-template.js';
import { previewHtml } from './preview-template.js';

function report(path, bytes) {
  console.info(`${path.pathname.split('/').slice(-2).join('/')}: ${bytes.length} bytes`);
}

async function render(browser, html, width, height, path) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
  await page.close();
  writeFileSync(path, png);
  report(path, png);
  return png;
}

// WebP copies of a PNG at the given widths, encoded by the browser's canvas.
async function webp(browser, png, widths, dir, name) {
  const page = await browser.newPage();
  for (const width of widths) {
    const dataUrl = await page.evaluate(async ({ src, w }) => {
      const img = document.createElement('img');
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = Math.round(img.height * w / img.width);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', 0.88);
    }, { src: `data:image/png;base64,${png.toString('base64')}`, w: width });
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
    const path = new URL(`${name}-${width}.webp`, dir);
    writeFileSync(path, bytes);
    report(path, bytes);
  }
  await page.close();
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
      const png = await render(browser, previewHtml(), 1440, 900, new URL('assets/preview.png', SITE_DIR));
      await webp(browser, png, [720, 1440], new URL('assets/', SITE_DIR), 'preview');
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
