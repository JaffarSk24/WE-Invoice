// The supplier in the text of an invoice: its identifiers, IBAN and name.
// An invoice carries two parties; the user's own company is recognised by
// its identifiers and IBANs and skipped, and otherwise the values printed
// in the supplier's block ("Dodávateľ", "Supplier") win.
import { findAll, fold } from './text-scan.js';
import { LABELS, ID_LABELS } from './text-labels.js';
import { classifyId, normalizeId, isOwn, normalizeIban } from './party.js';
import { setField } from './result.js';

// Where the supplier and the buyer blocks start (or -1).
function blocks(scan) {
  const first = (labels) => {
    const hits = labels.flatMap(l => findAll(scan.folded, `(?:^|[^a-z])${l}\\b`).map(h => h.index));
    return hits.length ? Math.min(...hits) : -1;
  };
  return { supplier: first(LABELS.supplier), buyer: first(LABELS.buyer) };
}

// Whether a position lies in the supplier block, the buyer block or neither.
function side(pos, b) {
  if (b.supplier < 0 || b.buyer < 0) return b.supplier >= 0 && pos > b.supplier ? 'supplier' : 'unknown';
  if (b.supplier < b.buyer) return pos >= b.supplier && pos < b.buyer ? 'supplier' : pos >= b.buyer ? 'buyer' : 'unknown';
  return pos >= b.supplier ? 'supplier' : pos >= b.buyer ? 'buyer' : 'unknown';
}

const SCORE = { supplier: 3, unknown: 2, buyer: 1 };

function pick(candidates, b) {
  return candidates.map(c => ({ ...c, score: SCORE[side(c.index, b)] + (c.labeled ? 0.5 : 0) }))
    .sort((x, y) => y.score - x.score || x.index - y.index)[0] || null;
}

/** IČO, DIČ and IČ DPH of the supplier. */
export function findIds(scan, result, ctx) {
  const b = blocks(scan);
  const found = { ico: [], dic: [], icDph: [] };
  const consider = (raw, index, labeled) => {
    const kind = classifyId(raw);
    if (!kind) return;
    const value = normalizeId(kind, raw);
    if (isOwn(ctx.company, kind, value)) return;
    found[kind].push({ value, index, labeled });
  };
  for (const label of Object.values(ID_LABELS)) {
    for (const hit of findAll(scan.folded, `(?:^|[^a-z])${label}[ \\t]*[:.]?[ \\t]*([a-z]{2}[ \\t]?[0-9a-z]{2,13}|\\d[\\d ]{4,11}\\d)`)) {
      consider(scan.text.slice(hit.end - hit.groups[0].length, hit.end), hit.index, true);
    }
  }
  for (const hit of findAll(scan.folded, '\\b((?:sk|cz)\\d{8,10})\\b')) consider(hit.groups[0], hit.index, false);
  for (const kind of ['ico', 'dic', 'icDph']) {
    const best = pick(found[kind], b);
    if (best) setField(result, kind, best.value, ctx.source, best.labeled ? 0.95 : 0.8);
  }
  // A Slovak IČ DPH is "SK" + DIČ: one confirms the other.
  const { dic, icDph } = result.fields;
  if (!dic && icDph && icDph.startsWith('SK')) setField(result, 'dic', icDph.slice(2), ctx.source, 0.8);
}

/** The supplier's IBAN: the first valid one that is not the user's own. */
export function findIbans(scan, result, ctx) {
  const b = blocks(scan);
  const upper = scan.text.toUpperCase();
  const candidates = [];
  for (const hit of findAll(upper, '\\b([A-Z]{2}\\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?)')) {
    // Greedy groups may run into the next word: shorten until the checksum fits.
    const groups = hit.groups[0].split(' ');
    for (let n = groups.length; n > 0; n--) {
      const iban = normalizeIban(groups.slice(0, n).join(''));
      if (iban) {
        if (!isOwn(ctx.company, 'iban', iban)) candidates.push({ value: iban, index: hit.index, labeled: true });
        break;
      }
    }
  }
  const best = pick(candidates, b);
  if (best) setField(result, 'iban', best.value, ctx.source, 0.95);
}

// A line that is itself a label ("Odberateľ:", "IČO: ...") is not a name.
function isLabel(line) {
  const f = fold(line);
  return /:\s*$/.test(line) || [...LABELS.buyer, ...LABELS.supplier].some(l => f.startsWith(l)) || /^(ico|ic|dic|ic dph|iban)\b/.test(f);
}

/** The name printed after the supplier label, on its line or the next one. */
export function findSupplierName(scan, result, ctx) {
  for (const label of LABELS.supplier) {
    const hit = findAll(scan.folded, `(?:^|[^a-z])${label}\\b[ \\t]*:?`)[0];
    if (!hit) continue;
    const rest = scan.text.slice(hit.end).split('\n');
    const name = [rest[0], rest[1], rest[2]].map(s => (s || '').trim().replace(/\s{2,}.*$/, ''))
      .find(s => s.length >= 2 && /[A-Za-z\u00c0-\u024f]/.test(s) && !isLabel(s));
    if (name) {
      setField(result, 'supplierName', name.slice(0, 200), ctx.source, 0.6);
      return;
    }
  }
}
