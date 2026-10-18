// Data for the one-stop shop (OSS, § 68c zákona o DPH): supplies to
// consumers in other member states taxed at the rate of the buyer's
// country, summed per country and rate for a calendar quarter, and the
// same as CSV for the OSS portal or the accountant. The rate is the one on
// the invoice line; the table of EU rates (legislation/eu-vat-rates.json)
// is only used to warn about a rate that the country does not have.
import { add, round, cmp } from '../money/index.js';
import euRates from '../legislation/eu-vat-rates.json' with { type: 'json' };
import { parsePeriod } from './periods.js';
import { problem } from './problems.js';

/**
 * @param {ReturnType<import('./records.js').vatRecords>} records  records of a quarter
 * @returns {{period: string, rows: Array<{country: string, rate: string, base: string, vat: string}>, problems: Array}}
 */
export function ossData(records) {
  const problems = [];
  if (parsePeriod(records.period).kind !== 'QUARTER') problems.push(problem('OSS_QUARTER_ONLY', null, { severity: 'error' }));
  const rates = euRates.countries || {};
  const map = new Map();
  for (const e of records.entries) {
    if (e.direction !== 'OUT' || e.treatment !== 'OSS') continue;
    const key = `${e.partner.country}|${e.rate ?? ''}`;
    if (!map.has(key)) map.set(key, { country: e.partner.country, rate: e.rate ?? '0', base: '0', vat: '0' });
    const row = map.get(key);
    row.base = add(row.base, e.base);
    row.vat = add(row.vat, e.vat);
    const known = rates[e.partner.country];
    if (known && Array.isArray(known.rates) && !known.rates.some(r => cmp(r, e.rate ?? '0') === 0)) {
      problems.push(problem('OSS_RATE_UNKNOWN', { id: e.docId, number: e.number, kind: e.kind }, { severity: 'warning', params: { country: e.partner.country, rate: e.rate ?? '' } }));
    }
  }
  const rows = [...map.values()]
    .map(r => ({ ...r, base: round(r.base, 2), vat: round(r.vat, 2) }))
    .sort((a, b) => a.country.localeCompare(b.country) || cmp(b.rate, a.rate));
  return { period: records.period, rows, problems };
}

/** CSV with a header line, semicolon separated, dot as the decimal mark. */
export function ossCsv(data) {
  const lines = ['period;country;rate;base;vat'];
  for (const r of data.rows) lines.push([data.period, r.country, r.rate, r.base, r.vat].join(';'));
  return `${lines.join('\n')}\n`;
}
