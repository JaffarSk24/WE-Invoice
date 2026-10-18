// Builds the static site from the templates and the per-language texts:
//   node site/build/build.js
// Writes site/<lang>/{index,thanks,privacy,terms}.html, the root chooser
// pages, 404.html, sitemap.xml, robots.txt and the whiteeagles.sk apps
// block in docs/. The output is committed: GitHub Pages serves site/ as is.
// Images are rendered separately by site/build/images.js.
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { SITE_DIR, DOCS_BLOCK_DIR, LANGUAGES } from './config.js';
import { renderAll } from './render.js';

function write(url, body) {
  mkdirSync(new URL('./', url), { recursive: true });
  writeFileSync(url, body);
}

const files = renderAll();
const root = new URL('../', SITE_DIR);
for (const [path, body] of Object.entries(files)) write(new URL(path, root), body);
const assets = new URL('assets/', DOCS_BLOCK_DIR);
mkdirSync(assets, { recursive: true });
for (const name of ['icon.png', 'preview.png']) copyFileSync(new URL(`assets/${name}`, SITE_DIR), new URL(name, assets));
console.info(`Site built: ${Object.keys(files).length} files, ${LANGUAGES.length} languages`);
