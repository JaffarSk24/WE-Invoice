// ECB reference rates (eurofxref): the 90-day file for recent dates, the
// full history for older ones. The parsed tables stay in memory for an
// hour; the per-date answers go to the SQLite cache. Rates are strings,
// never floats (money rule of the project).
import { addDays, localDate } from '../lib/time.js';
import { upstreamUnavailable } from '../lib/errors.js';

const MEMO_MS = 60 * 60 * 1000;

// Parses the eurofxref XML into {date: {currency: rate}}.
export function parseEurofxref(xml) {
  const table = {};
  const dayRe = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  const rateRe = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']/g;
  let day;
  while ((day = dayRe.exec(xml))) {
    const rates = {};
    let r;
    while ((r = rateRe.exec(day[2]))) rates[r[1]] = r[2];
    table[day[1]] = rates;
  }
  return table;
}

// Latest published day on or before the requested date.
export function pickDay(table, date) {
  const days = Object.keys(table).filter(d => d <= date).sort();
  return days.length ? days[days.length - 1] : null;
}

export function createEcbRates(upstream, config, { now = () => new Date() } = {}) {
  const memo = new Map();

  async function table(file) {
    const hit = memo.get(file);
    if (hit && now().getTime() - hit.at < MEMO_MS) return hit.table;
    const xml = await upstream.text('ecb', `${config.ecbUrl}/${file}`, { headers: { accept: 'application/xml, text/xml' } });
    const parsed = parseEurofxref(xml);
    if (!Object.keys(parsed).length) throw upstreamUnavailable('ECB answered with an unexpected file');
    memo.set(file, { at: now().getTime(), table: parsed });
    return parsed;
  }

  return {
    async forDate(date = localDate(now())) {
      const recent = date >= addDays(localDate(now()), -80);
      let t = await table(recent ? 'eurofxref-hist-90d.xml' : 'eurofxref-hist.xml');
      let day = pickDay(t, date);
      if (!day && recent) {
        t = await table('eurofxref-hist.xml');
        day = pickDay(t, date);
      }
      if (!day) return null;
      return { date: day, base: 'EUR', rates: t[day] };
    }
  };
}
