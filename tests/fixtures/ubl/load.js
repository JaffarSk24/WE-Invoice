// Loads the UBL fixture cases of cases.json: resolves the company and
// buyer keys and merges each document over the defaults. Shared by the
// unit tests and by the Schematron run in CI (validate-schematron.js).
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));

function resolve(entry) {
  const company = typeof entry.company === 'string' ? data.companies[entry.company] : entry.company;
  const buyer = typeof entry.buyer === 'string' ? data.buyers[entry.buyer] : entry.buyer;
  const document = { ...data.defaults, ...entry.document, buyer };
  return { id: entry.id, company: structuredClone(company), document: structuredClone(document), options: structuredClone(entry.options || {}), expect: entry.expect };
}

/** Valid cases: each must build, pass the official Schematron and parse back. */
export const UBL_CASES = data.cases.map(resolve);

/** Invalid cases with the issue codes the local validation must report. */
export const UBL_INVALID_CASES = data.invalid.map(resolve);

/** Path of the expected XML of a case, relative to the repository root. */
export const expectedPath = (id) => `tests/fixtures/ubl/expected/${id}.xml`;
