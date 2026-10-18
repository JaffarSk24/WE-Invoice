// Writes the UBL of every fixture case into a directory, for the schema
// check in CI (XsdValidate.java).
//   node tests/fixtures/ubl/write-xml.js <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildUbl } from '../../../packages/core/ubl/index.js';
import { UBL_CASES } from './load.js';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: write-xml.js <dir>');
  process.exit(2);
}
mkdirSync(dir, { recursive: true });
for (const c of UBL_CASES) writeFileSync(join(dir, `${c.id}.xml`), buildUbl(c.document, c.company, c.options));
console.log(`${UBL_CASES.length} UBL documents written to ${dir}`);
