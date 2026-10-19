// Builds the synthetic scans of the Inbox fixtures: the text fixtures drawn
// as paper in Chromium, slightly rotated, blurred and saved as JPEG, the
// way a phone photo or an office scanner delivers them. Used to measure
// OCR quality (AC § 3.11: at least 70 % of the key fields on scans).
// Run from the repository root: node tests/fixtures/inbox/make-scans.js
// (CHROMIUM_PATH points to a Chromium binary when Playwright has none).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export const SCANS = [
  { id: 'sk-invoice-simple', width: 820, rotate: 0.6 },
  { id: 'sk-invoice-multirate', width: 820, rotate: -0.8 },
  { id: 'sk-invoice-nonpayer', width: 820, rotate: 0.4 },
  { id: 'cz-invoice', width: 820, rotate: -0.5 },
  { id: 'sk-receipt-ekasa', width: 460, rotate: 1.2 },
  { id: 'sk-receipt-shop', width: 420, rotate: -1 }
];

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ deviceScaleFactor: 1.5 });
for (const scan of SCANS) {
  const text = readFileSync(here(`text/${scan.id}.txt`), 'utf8');
  await page.setViewportSize({ width: scan.width + 80, height: 900 });
  await page.setContent(`<body style="margin:0;background:#d8d8d4">
    <pre style="margin:30px;padding:28px;width:${scan.width - 56}px;background:#f7f6f1;color:#222;font:15px/1.45 'DejaVu Sans',Arial,sans-serif;
      white-space:pre-wrap;transform:rotate(${scan.rotate}deg);filter:blur(0.45px) contrast(0.9)">${escape(text)}</pre></body>`);
  const box = await page.locator('pre').boundingBox();
  await page.screenshot({ path: here(`scans/${scan.id}.jpg`), type: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: scan.width + 80, height: Math.ceil(box.y + box.height + 30) } });
}
await browser.close();
console.log('Scan fixtures written');
