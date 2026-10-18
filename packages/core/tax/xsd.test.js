// Validates the XML of the tax golden examples against the official XSD
// schemas of Finančná správa (05-accounting-tax.md § 5.3.4). The schemas are
// not in the repository (see tests/fixtures/tax/xsd/README.md): they come
// from TAX_XSD_DIR, the local cache or a download, and the test is skipped
// with a warning when there is none or xmllint is missing. Every file is
// always checked to be well-formed when xmllint is there.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FORMS } from './forms.js';

const root = new URL('../../../tests/fixtures/tax/', import.meta.url).pathname;
const cache = new URL('../../../node_modules/.cache/we-invoice-xsd/', import.meta.url).pathname;
const sources = JSON.parse(readFileSync(join(root, 'xsd/sources.json'), 'utf8')).files;
const REPORT_FORM = { kv: 'kv', sv: 'sv', dph: 'dph' };

function hasXmllint() {
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function schemaPath(file) {
  const dirs = [process.env.TAX_XSD_DIR, cache].filter(Boolean);
  for (const dir of dirs) if (existsSync(join(dir, file))) return join(dir, file);
  const url = sources[file] && sources[file].url;
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, file), Buffer.from(await response.arrayBuffer()));
    return join(cache, file);
  } catch (e) {
    console.warn(`[tax-xsd] ${file} could not be downloaded: ${e.message}`);
    return null;
  }
}

const files = readdirSync(root)
  .filter(name => statSync(join(root, name)).isDirectory() && name !== 'xsd')
  .flatMap(name => readdirSync(join(root, name)).filter(f => f.endsWith('.xml')).map(f => join(name, f)))
  .sort();
const xmllint = hasXmllint();
if (!xmllint) console.warn('[tax-xsd] xmllint is not installed: XML checks skipped');

describe('tax XML files', () => {
  it('there are XML files to check', () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  it.skipIf(!xmllint).each(files)('%s is well-formed', (file) => {
    expect(() => execFileSync('xmllint', ['--noout', join(root, file)], { stdio: 'pipe' })).not.toThrow();
  });

  it.skipIf(!xmllint).each(files)('%s validates against the official XSD', async (file) => {
    const report = file.split('/').pop().replace('.xml', '');
    const input = JSON.parse(readFileSync(join(root, file.split('/')[0], 'input.json'), 'utf8'));
    const from = `${input.period.slice(0, 4)}-${input.period.includes('Q') ? String((Number(input.period.slice(-1)) - 1) * 3 + 1).padStart(2, '0') : input.period.slice(5, 7)}-01`;
    const version = FORMS[REPORT_FORM[report]].versions.find(v => v.validFrom <= from && (!v.validTo || v.validTo >= from));
    const xsd = version ? await schemaPath(version.xsdFile) : null;
    if (!xsd) {
      console.warn(`[tax-xsd] ${version ? version.xsdFile : report} not available: validation of ${file} skipped`);
      return;
    }
    expect(() => execFileSync('xmllint', ['--noout', '--schema', xsd, join(root, file)], { stdio: 'pipe' })).not.toThrow();
  });
});
