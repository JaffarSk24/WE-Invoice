// Bank statements as PDF: the text the app reads from the PDF (lines,
// columns split by two spaces, app/src/ocr/text-layout.js) to
// transactions. Only the layout of Tatra banka is known so far, checked
// against a real statement on 2026-10-30: every movement starts with a
// line "processing date  description  [booking date]  amount" where a
// trailing minus marks a debit ("1,130.00-"), followed by labelled lines
// (payer reference with the symbols, the counterparty's IBAN with the name
// on the next line, a detail that may run over several lines, the shop or
// cash machine of a card). A movement
// may continue after a page header. The balances printed at the start and
// the end check that every movement was read.
import { normalizeTransaction } from './normalize.js';
import { normalizeText } from './text.js';
import { add, sub, round, cmp, isZero } from '../../money/index.js';
import { CoreError } from '../../errors.js';

const DATE = '(\\d{2}\\.\\d{2}\\.\\d{4})';
const AMOUNT = '(\\d{1,3}(?:,\\d{3})*\\.\\d{2})(-?)';
const START = new RegExp(`^${DATE}\\s{2,}(.+?)(?:\\s{2,}${DATE})?\\s{2,}${AMOUNT}\\s*$`);

const iso = (d) => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
const amountOf = (digits, minus) => round(`${minus ? '-' : ''}${digits.replace(/,/g, '')}`, 2);
// A labelled line: its label without case, diacritics or doubled spaces, and the value after the colon.
function labelled(line) {
  const at = line.indexOf(':');
  if (at < 0) return null;
  return { label: normalizeText(line.slice(0, at)).replace(/\s+/g, ' '), value: line.slice(at + 1).trim() };
}

const REF = new Set(['odoslana platba', 'prijata platba', 'inkaso']);
const SYMBOLS = new Set(['referencia platitela', 'referencia prijemcu']);
const PARTY = new Set(['prijemca', 'platitel']);

/** True when the text is a statement of Tatra banka. */
export function isTatraPdfText(text) {
  const n = normalizeText(text);
  return n.includes('tatra banka') && /datum sprac\.\s+popis/.test(n);
}

function parseTatra(text) {
  const lines = String(text || '').split('\n').map(l => l.trim());
  const ibanLine = lines.find(l => /^IBAN\s+[A-Z]{2}\d{2}/.test(l));
  const currency = (lines.map(l => /^Mena\s+([A-Z]{3})\b/.exec(l)).find(Boolean) || [])[1] || 'EUR';
  const account = { iban: ibanLine ? ibanLine.replace(/^IBAN\s+/, '').replace(/\s+/g, '').slice(0, 34) : null, currency };
  let opening = null;
  let closing = null;
  const raws = [];
  let tx = null;
  let last = null;
  for (const line of lines) {
    const n = normalizeText(line);
    if (n.startsWith('zostatok na ucte ku dnu vystavenia vypisu')) {
      const m = new RegExp(`${AMOUNT}\\s*$`).exec(line);
      if (m) closing = { amount: amountOf(m[1], m[2]), date: null };
      break;
    }
    if (n.startsWith('posledny vypis')) {
      const m = new RegExp(`${DATE}\\s+${AMOUNT}\\s*$`).exec(line);
      if (m) opening = { amount: amountOf(m[2], m[3]), date: iso(m[1]) };
      continue;
    }
    const start = START.exec(line);
    if (start) {
      tx = { processed: iso(start[1]), description: start[2].trim(), booked: start[3] ? iso(start[3]) : null, amount: amountOf(start[4], start[5]), detail: [] };
      raws.push(tx);
      last = null;
      continue;
    }
    if (!tx) continue;
    if (/^-{10,}$/.test(line)) { last = null; continue; }
    const field = labelled(line);
    if (field && REF.has(field.label)) { tx.ref = field.value.split(/\s+/)[0] || null; last = null; continue; }
    if (field && SYMBOLS.has(field.label)) { tx.symbols = field.value; last = null; continue; }
    if (field && PARTY.has(field.label)) { tx.account = field.value.split(/\s{2,}/)[0] || null; last = 'party'; continue; }
    if (field && field.label === 'detail') { tx.detail.push(field.value); last = 'detail'; continue; }
    // Where a card paid ("BRATISLAVA -  GOPAY  *IDOKLAD.SK") or took cash ("Bratislava  TB Lamac"):
    // the shop or the cash machine is the counterparty, the town goes to the message.
    if (field && field.label === 'miesto platby') {
      const [town, ...shop] = field.value.split(/\s+-\s+/);
      tx.name = tx.name || shop.join(' - ').replace(/\s+/g, ' ').trim() || null;
      tx.place = town.trim();
      last = null;
      continue;
    }
    if (field && field.label === 'miesto vyberu') {
      const parts = field.value.split(/\s{2,}/);
      tx.place = parts[0];
      tx.name = tx.name || parts.slice(1).join(' ') || null;
      last = null;
      continue;
    }
    if (field) { last = null; continue; }
    if (last === 'party' && !tx.name) { tx.name = line; last = null; continue; }
    if (last === 'detail') tx.detail.push(line);
  }
  return { account, opening, closing, raws };
}

/**
 * A PDF statement from its text.
 * @returns {{format: 'PDF', profile: string, account: {iban: string|null, currency: string}, openingBalance: object|null,
 *   closingBalance: object|null, transactions: object[], warnings: string[], invalid: number, pending: number}}
 */
export function parsePdfStatementText(text, options = {}) {
  if (!isTatraPdfText(text)) throw new CoreError('BANK_PDF_UNKNOWN', 'not a PDF statement of a known bank');
  const { account, opening, closing, raws } = parseTatra(text);
  const transactions = raws.filter(r => !isZero(r.amount)).map(r => normalizeTransaction({
    date: r.booked || r.processed,
    valueDate: r.processed,
    amount: r.amount,
    currency: account.currency,
    counterpartyName: r.name || null,
    counterpartyAccount: r.account || null,
    symbols: r.symbols || null,
    message: r.detail.join(' ').trim() || [r.description, r.place].filter(Boolean).join(', '),
    ref: r.ref || null
  }, { currency: account.currency, country: options.country || 'SK' }));
  const warnings = [];
  if (opening && closing) {
    const moved = round(raws.reduce((s, r) => add(s, r.amount), '0'), 2);
    if (cmp(round(add(opening.amount, moved), 2), closing.amount) !== 0) warnings.push('BANK_PDF_BALANCE_MISMATCH');
  }
  if (!transactions.length && !opening) throw new CoreError('BANK_PDF_UNKNOWN', 'no movements found in the PDF text');
  return {
    format: 'PDF', profile: 'tatra-pdf', account, openingBalance: opening, closingBalance: closing,
    transactions, warnings, invalid: 0, pending: 0, difference: opening && closing ? round(sub(closing.amount, opening.amount), 2) : null
  };
}
