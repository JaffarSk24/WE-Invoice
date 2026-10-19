// Checks a downloaded XML file with xmllint: always well-formed, and valid
// against the official XSD of Finančná správa when the schema is at hand
// (TAX_XSD_DIR or the cache of packages/core/tax/xsd.test.js). The schemas
// are not in the repository; without one the XSD part is reported as
// skipped, never as passed.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cache = fileURLToPath(new URL('../../../node_modules/.cache/we-invoice-xsd/', import.meta.url));

function xmllint(args) {
  try {
    execFileSync('xmllint', args, { stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: null, output: 'xmllint is missing' };
    return { ok: false, output: String(e.stderr || e.message) };
  }
}

/** @returns {{wellFormed: boolean|null, valid: boolean|null, output: string}} */
export function checkXml(path, schemaFile) {
  const wellFormed = xmllint(['--noout', path]);
  const schema = [process.env.TAX_XSD_DIR, cache].filter(Boolean).map(d => join(d, schemaFile)).find(p => existsSync(p));
  if (!schema || wellFormed.ok === null) return { wellFormed: wellFormed.ok, valid: null, output: wellFormed.output };
  const valid = xmllint(['--noout', '--schema', schema, path]);
  return { wellFormed: wellFormed.ok, valid: valid.ok, output: valid.output };
}
