// HTML of one Open Graph image (1200 x 630): the app icon, the brand, the
// localized headline and tagline, and three short facts, on the dark WE
// background with the cyan-blue accent of WE Invoice.
import { readFileSync } from 'node:fs';
import { escape } from './html.js';
import { fontFaces } from './fonts.js';

const ICON = `data:image/png;base64,${readFileSync(new URL('../assets/icon-512.png', import.meta.url)).toString('base64')}`;

export function ogHtml({ code, title, tagline, facts }) {
  return `<!doctype html>
<html lang="${code}">
<head>
<meta charset="utf-8">
<style>
${fontFaces()}
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body {
  position: relative; box-sizing: border-box; padding: 64px 72px;
  background: #090b11; color: #ffffff; font-family: 'Inter', sans-serif;
}
.glow { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.55; }
.glow.a { width: 520px; height: 520px; right: -140px; top: -200px; background: #4facfe; }
.glow.b { width: 420px; height: 420px; right: 160px; bottom: -260px; background: #00f2fe; opacity: 0.35; }
.brand { position: relative; display: flex; align-items: center; gap: 18px; font-weight: 700; font-size: 30px; }
.brand img { width: 64px; height: 64px; border-radius: 16px; }
h1 {
  position: relative; margin: 76px 0 22px; max-width: 900px;
  font-family: 'Outfit', 'Inter', sans-serif; font-weight: 800; font-size: 72px; line-height: 1.05; letter-spacing: -0.02em;
}
.tagline { position: relative; margin: 0; max-width: 860px; font-size: 32px; line-height: 1.3; color: #a3b1c6; }
.facts { position: absolute; left: 72px; bottom: 56px; display: flex; gap: 14px; }
.facts span {
  padding: 12px 22px; border-radius: 999px; font-weight: 600; font-size: 24px;
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.14);
}
.facts span.hot { background: linear-gradient(135deg, #00f2fe, #4facfe); color: #04121f; border: 0; }
</style>
</head>
<body>
<div class="glow a"></div><div class="glow b"></div>
<div class="brand"><img src="${ICON}" alt="">WE Invoice</div>
<h1>${escape(title)}</h1>
<p class="tagline">${escape(tagline)}</p>
<div class="facts">${facts.map((f, i) => `<span${i === 0 ? ' class="hot"' : ''}>${escape(f)}</span>`).join('')}</div>
</body>
</html>`;
}

// Three facts per language for the badges at the bottom of the image.
export const OG_FACTS = {
  sk: ['0 € navždy', 'Open source (MIT)', 'Dáta vo vašom Google Drive'],
  cs: ['0 € navždy', 'Open source (MIT)', 'Data ve vašem Google Drive'],
  en: ['0 € forever', 'Open source (MIT)', 'Data in your Google Drive'],
  de: ['0 € für immer', 'Open Source (MIT)', 'Daten in Ihrem Google Drive'],
  ru: ['0 € навсегда', 'Открытый код (MIT)', 'Данные в вашем Google Drive'],
  uk: ['0 € назавжди', 'Відкритий код (MIT)', 'Дані у вашому Google Drive']
};
