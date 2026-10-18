// Dashboard numbers from a list of documents: issued per month and year,
// unpaid by age, top clients and debtors, the sales and purchase balance.
// Pure functions on decimal strings; the widgets only draw the results.
// The documents of the sales package will replace the demo set with the
// same fields: kind, status, issueDate, dueDate, contactId, contactName,
// totalNet, totalGross, paidAmount.
import { add, sum, cmp } from '../../components/decimal.js';
import { daysBetween } from '../../components/dates.js';

const SALES = new Set(['INVOICE', 'ADVANCE_TAX_DOC', 'SALES_RECEIPT']);
const PURCHASE = new Set(['RECEIVED_INVOICE', 'EXPENSE_RECEIPT']);
const COUNTS = (d) => d.status !== 'DRAFT' && d.status !== 'CANCELLED';

export const AGE_BUCKETS = Object.freeze(['d1to15', 'd16to30', 'd31to60', 'd60plus']);

export function isSale(doc) { return SALES.has(doc.kind); }
export function isPurchase(doc) { return PURCHASE.has(doc.kind); }

export function outstanding(doc) {
  const open = add(doc.totalGross || '0', `-${doc.paidAmount || '0'}`);
  return cmp(open, '0') > 0 ? open : '0';
}

// Net and gross totals of sales issued in a period (YYYY-MM or YYYY).
export function issuedIn(docs, prefix) {
  const hits = docs.filter(d => isSale(d) && COUNTS(d) && String(d.issueDate || '').startsWith(prefix));
  return { count: hits.length, net: sum(hits.map(d => d.totalNet)), gross: sum(hits.map(d => d.totalGross)) };
}

export function issuedSummary(docs, today) {
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const lastYear = String(Number(year) - 1);
  return {
    month: issuedIn(docs, month), year: issuedIn(docs, year), lastYear: issuedIn(docs, lastYear),
    lastYearSameMonth: issuedIn(docs, `${lastYear}${today.slice(4, 7)}`)
  };
}

export function ageBucket(dueDate, today) {
  const days = daysBetween(dueDate, today);
  if (days <= 0) return null;
  if (days <= 15) return 'd1to15';
  if (days <= 30) return 'd16to30';
  if (days <= 60) return 'd31to60';
  return 'd60plus';
}

// Open sales: total not yet paid, the overdue part and its split by age.
export function unpaidSummary(docs, today) {
  const open = docs.filter(d => isSale(d) && COUNTS(d) && cmp(outstanding(d), '0') > 0);
  const buckets = Object.fromEntries(AGE_BUCKETS.map(b => [b, { count: 0, amount: '0' }]));
  let overdue = '0';
  open.forEach(d => {
    const bucket = ageBucket(d.dueDate, today);
    if (!bucket) return;
    const amount = outstanding(d);
    buckets[bucket] = { count: buckets[bucket].count + 1, amount: add(buckets[bucket].amount, amount) };
    overdue = add(overdue, amount);
  });
  return { count: open.length, total: sum(open.map(outstanding)), overdue, buckets };
}

function topBy(docs, valueOf, n) {
  const byContact = new Map();
  docs.forEach(d => {
    const value = valueOf(d);
    if (cmp(value, '0') <= 0) return;
    const key = d.contactId || d.contactName;
    const prev = byContact.get(key) || { contactId: d.contactId, name: d.contactName, amount: '0', count: 0 };
    byContact.set(key, { ...prev, amount: add(prev.amount, value), count: prev.count + 1 });
  });
  return Array.from(byContact.values()).sort((a, b) => cmp(b.amount, a.amount)).slice(0, n);
}

export function topClients(docs, year, n = 5) {
  return topBy(docs.filter(d => isSale(d) && COUNTS(d) && String(d.issueDate || '').startsWith(year)), d => d.totalGross || '0', n);
}

export function topDebtors(docs, today, n = 5) {
  return topBy(docs.filter(d => isSale(d) && COUNTS(d) && ageBucket(d.dueDate, today)), outstanding, n);
}

export function balanceSummary(docs, year) {
  const inYear = docs.filter(d => COUNTS(d) && String(d.issueDate || '').startsWith(year));
  const sales = sum(inYear.filter(isSale).map(d => d.totalNet));
  const purchases = sum(inYear.filter(isPurchase).map(d => d.totalNet));
  return { sales, purchases, balance: add(sales, `-${purchases}`) };
}

// Turnover of the last twelve months (sales, net) against the VAT
// registration threshold; level: 'ok' | 'warn' (80 %) | 'over' (100 %).
export function vatThresholdSummary(docs, today, threshold) {
  const [y, m] = today.split('-').map(Number);
  const months = [];
  for (let i = 0; i < 12; i++) {
    let mm = m - i;
    let yy = y;
    while (mm < 1) { mm += 12; yy -= 1; }
    months.push(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  const turnover = sum(docs.filter(d => isSale(d) && COUNTS(d) && months.includes(String(d.issueDate || '').slice(0, 7))).map(d => d.totalNet));
  const limit = threshold || '0';
  const ratio = cmp(limit, '0') > 0 ? Number(turnover) / Number(limit) : 0;
  const level = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
  return { turnover, limit, percent: Math.min(999, Math.round(ratio * 100)), level };
}
