// Maps the statistical legal form codes of Slovakia (RPO) and Czechia
// (ARES) to Company.legalForm of the core schema. Both registers use the
// same code family: 1xx natural persons and companies, 112 s. r. o.,
// 121 a. s., 117 to 119 foundations and non-profits, 7xx associations.
const NGO_CODES = new Set(['117', '118', '119', '141', '161', '701', '706', '721', '741', '751']);

export function mapLegalForm(code) {
  const c = code === undefined || code === null ? '' : String(code).trim();
  if (!c) return null;
  if (c === '112') return 'SRO';
  if (c === '121' || c === '122') return 'AS';
  if (NGO_CODES.has(c)) return 'NGO';
  if (/^10[1-9]$/.test(c)) return 'FO_ZIVNOST';
  return 'OTHER';
}

export const nullIfEmpty = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
