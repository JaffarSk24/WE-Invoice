// @font-face rules for the image renderer, pointing at the Inter and Outfit
// files bundled with the app (devDependencies @fontsource/*), so the images
// use the same type as the app and render the same on every machine.
import { existsSync } from 'node:fs';

const FONTS_DIR = new URL('../../node_modules/@fontsource/', import.meta.url);

function face(family, file, weight) {
  const url = new URL(file, FONTS_DIR);
  if (!existsSync(url)) throw new Error(`Font file missing: ${url.pathname}`);
  return `@font-face { font-family: '${family}'; font-weight: ${weight}; font-style: normal; src: url('${url.href}') format('woff2'); }`;
}

export function fontFaces() {
  const rules = [];
  for (const weight of [400, 600, 700, 800]) {
    for (const subset of ['latin', 'latin-ext', 'cyrillic']) rules.push(face('Inter', `inter/files/inter-${subset}-${weight}-normal.woff2`, weight));
  }
  for (const weight of [600, 700, 800]) {
    for (const subset of ['latin', 'latin-ext']) rules.push(face('Outfit', `outfit/files/outfit-${subset}-${weight}-normal.woff2`, weight));
  }
  return rules.join('\n');
}
