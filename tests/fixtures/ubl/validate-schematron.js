// Validates the UBL of every fixture case with the official Schematron
// artefacts (04-peppol.md § 4.8), compiled to XSLT and run by Saxon-HE.
// The XML is built fresh from cases.json, so the check covers the current
// builder, not only the committed expected files. Fatal and error asserts
// fail the run; warnings are printed.
//   node tests/fixtures/ubl/validate-schematron.js <saxon-classpath> <xslt>...
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { buildUbl } from '../../../packages/core/ubl/index.js';
import { parseXml, children, text } from '../../../packages/core/ubl/xml-parse.js';
import { UBL_CASES } from './load.js';

const [classpath, ...stylesheets] = process.argv.slice(2);
if (!classpath || !stylesheets.length) {
  console.error('usage: validate-schematron.js <saxon-classpath> <xslt>...');
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'ubl-'));
const input = join(work, 'xml');
mkdirSync(input);
for (const c of UBL_CASES) writeFileSync(join(input, `${c.id}.xml`), buildUbl(c.document, c.company, c.options));

// Every svrl:failed-assert or successful-report anywhere in the report.
function asserts(el, out = []) {
  for (const c of el.children) {
    if (c.name === 'failed-assert' || c.name === 'successful-report') out.push(c);
    else asserts(c, out);
  }
  return out;
}

let failures = 0;
for (const xslt of stylesheets) {
  const output = join(work, basename(xslt));
  mkdirSync(output);
  execFileSync('java', ['-cp', classpath, 'net.sf.saxon.Transform', `-s:${input}`, `-xsl:${xslt}`, `-o:${output}`], { stdio: ['ignore', 'inherit', 'inherit'] });
  const files = readdirSync(output).sort();
  if (files.length !== UBL_CASES.length) throw new Error(`${basename(xslt)}: expected ${UBL_CASES.length} reports, got ${files.length}`);
  for (const file of files) {
    for (const a of asserts(parseXml(readFileSync(join(output, file), 'utf8')))) {
      const flag = a.attrs.flag || 'error';
      const message = `${basename(xslt)} ${file}: [${flag}] ${a.attrs.id || ''} ${text(children(a, 'text')[0]) || ''}`;
      if (flag === 'warning' || flag === 'information') console.warn(message);
      else { console.error(message); failures++; }
    }
  }
  console.log(`${basename(xslt)}: ${files.length} documents checked`);
}
if (failures) {
  console.error(`${failures} Schematron failures`);
  process.exit(1);
}
console.log('All UBL fixtures pass the Schematron rules');
