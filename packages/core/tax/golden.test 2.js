// Golden examples of the tax reports (05-accounting-tax.md § 5.5): each
// folder of tests/fixtures/tax holds the documents of a period
// (input.json), the expected amounts and problems (expected.json) and the
// expected XML of the kontrolný výkaz, súhrnný výkaz and VAT return. After
// a deliberate change of the reports, regenerate with
//   UPDATE_TAX_GOLDEN=1 npx vitest run packages/core/tax/golden.test.js
// and have the diff checked by an accountant before it is committed.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { vatRecords, buildKv, buildSv, buildVatReturn, exportChecks, mergeProblems } from '../index.js';

const dir = new URL('../../../tests/fixtures/tax/', import.meta.url);
const UPDATE = process.env.UPDATE_TAX_GOLDEN === '1';
const scenarios = readdirSync(dir).filter(name => statSync(new URL(name, dir)).isDirectory() && existsSync(new URL(`${name}/input.json`, dir))).sort();

const codes = (problems) => problems.map(p => `${p.severity}:${p.code}:${p.number || '-'}`);

function run(input) {
  const ctx = { company: input.company, today: input.today, vies: input.vies || {} };
  const records = vatRecords(input.documents, input.period, input.company);
  const checks = exportChecks(records, input.documents, input.company);
  const out = { records, checks, xml: {} };
  const attempt = (name, fn) => {
    try {
      const report = fn();
      out[name] = report;
      out.xml[name] = report.xml;
    } catch (e) {
      out[name] = { error: e.code || e.message };
    }
  };
  attempt('kv', () => buildKv(records, ctx));
  attempt('sv', () => buildSv(records, ctx));
  attempt('dph', () => buildVatReturn(records, ctx));
  return out;
}

function summary(out) {
  const problems = (report) => (report && report.problems ? codes(mergeProblems(out.checks, report.problems)) : null);
  return {
    totals: out.records.totals,
    kv: out.kv.error ? { error: out.kv.error } : { sections: Object.fromEntries(Object.entries(out.kv.sections).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])), problems: problems(out.kv) },
    sv: out.sv.error ? { error: out.sv.error } : { rows: out.sv.rows.map(r => `${r.vatId}|${r.code}|${r.value}`), problems: problems(out.sv) },
    dph: out.dph.error ? { error: out.dph.error } : { rows: Object.fromEntries(out.dph.rows.map(r => [r.row, r.amount])), problems: problems(out.dph) }
  };
}

describe('tax golden examples', () => {
  it('has at least 10 scenarios', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(10);
  });

  it.each(scenarios)('%s', (name) => {
    const input = JSON.parse(readFileSync(new URL(`${name}/input.json`, dir), 'utf8'));
    const out = run(input);
    const actual = summary(out);
    const expectedFile = new URL(`${name}/expected.json`, dir);
    if (UPDATE) {
      writeFileSync(expectedFile, `${JSON.stringify(actual, null, 2)}\n`);
      for (const [report, xml] of Object.entries(out.xml)) {
        const file = new URL(`${name}/${report}.xml`, dir);
        if (xml) writeFileSync(file, xml);
        else rmSync(file, { force: true });
      }
    }
    expect(actual).toEqual(JSON.parse(readFileSync(expectedFile, 'utf8')));
    // A report with an open error has no XML, so its file must not exist:
    // the XSD test checks only files the generator would really produce.
    for (const [report, xml] of Object.entries(out.xml)) {
      const file = new URL(`${name}/${report}.xml`, dir);
      if (xml) expect(xml, `${name}/${report}.xml`).toBe(readFileSync(file, 'utf8'));
      else expect(existsSync(file), `${name}/${report}.xml should not exist`).toBe(false);
    }
  });
});
