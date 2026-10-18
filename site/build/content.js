// Loads the texts of one language from site/content/<lang>/*.json. Each
// file is one part of the site, so the landing page, the legal pages and
// the apps block are edited independently.
import { readFileSync } from 'node:fs';
import { CONTENT_DIR, LANGUAGES } from './config.js';

const PARTS = ['common', 'landing', 'privacy', 'terms', 'apps'];

function readJson(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

export function loadContent(code) {
  const dir = new URL(`${code}/`, CONTENT_DIR);
  const content = { code };
  for (const part of PARTS) content[part] = readJson(new URL(`${part}.json`, dir));
  return content;
}

export function loadAll() {
  return LANGUAGES.map(l => loadContent(l.code));
}

export { PARTS };
