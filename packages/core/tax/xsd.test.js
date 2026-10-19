// Validates the XML of the tax golden examples against the official XSD
// schemas of Finančná správa (05-accounting-tax.md § 5.3.4). The schemas are
// not in the repository (see tests/fixtures/tax/xsd/README.md): they come
// from TAX_XSD_DIR, the local cache or a download, and the test is skipped
// with a warning when there is none or xmllint is missing. A schema whose
// SHA-256 differs from tests/fixtures/tax/xsd/sources.json fails the test:
// a silent change on the server must not change the result unnoticed.
// Every file is always checked to be well-formed when xmllint is there.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMS } from './forms.js';

const root = fileURLToPath(new URL('../../../tests/fixtures/tax/', import.meta.url));
const cache = fileURLToPath(new URL('../../../node_modules/.cache/we-invoice-xsd/', import.meta.url));
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

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

// Throws when a schema is not the one sources.json names.
function checked(file, path) {
  const expected = sources[file] && sources[file].sha256;
  const actual = sha256(path);
  if (expected && actual !== expected) throw new Error(`${file} at ${path} has SHA-256 ${actual}, expected ${expected}: the schema changed, check the new version`);
  return path;
}

const resolved = new Map();

async function schemaPath(file) {
  if (!resolved.has(file)) resolved.set(file, findSchema(file));
  return resolved.get(file);
}

async function findSchema(file) {
  const dirs = [process.env.TAX_XSD_DIR, cache].filter(Boolean);
  for (const dir of dirs) if (existsSync(join(dir, file))) return checked(file, join(dir, file));
  const url = sources[file] && sources[file].url;
  if (!url) return null;
  let bytes;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (e) {
    console.warn(`[tax-xsd] ${file} could not be downloaded: ${e.message}`);
    return null;
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  const expected = sources[file].sha256;
  if (expected && actual !== expected) throw new Error(`${file} downloaded from ${url} has SHA-256 ${actual}, expected ${expected}: the schema changed, check the new version`);
  mkdirSync(cache, { recursive: true });
  writeFileSync(join(cache, file), bytes);
  return join(cache, file);
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

  it('names a download address and a checksum for every schema of the forms', () => {
    const named = new Set(Object.values(FORMS).flatMap(form => form.versions.map(v => v.xsdFile)));
    for (const file of named) {
      expect(sources[file], file).toBeTruthy();
      expect(sources[file].url, file).toMatch(/^https:\/\//);
      expect(sources[file].sha256, file).toMatch(/^[0-9a-f]{64}$/);
    }
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
