// Open data of the Financial Administration (opendata.financnasprava.sk,
// Information Lists API 1.2, header "key"): DIČ and IČ DPH of a company by
// IČO, and the VAT payer lists (payers, reasons for cancellation, deleted).
// A search is GET {base}/data/{list}/search?page=1&column=..&search=..; the
// API answers 404 when nothing matches. The list identifiers are
// configuration, because the portal renames them without notice.
import { nullIfEmpty } from './legal-form.js';
import { HttpError } from '../lib/errors.js';

const digits = (v) => (v === undefined || v === null ? '' : String(v).replace(/\D/g, ''));

// Finds a field by several candidate names, ignoring case and separators.
export function pickField(row, ...names) {
  if (!row || typeof row !== 'object') return null;
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = names.map(norm);
  for (const [key, value] of Object.entries(row)) {
    if (wanted.includes(norm(key))) return nullIfEmpty(value);
  }
  return null;
}

async function fetchList(upstream, config, list, column, value) {
  if (!config.fsOpenDataApiKey) throw new HttpError(503, 'NOT_CONFIGURED', 'FS open data key is not configured');
  const query = new URLSearchParams({ page: '1', column, search: value });
  const url = `${config.fsOpenDataUrl}/data/${encodeURIComponent(list)}/search?${query}`;
  let data;
  try {
    data = await upstream.json('fs-opendata', url, { headers: { key: config.fsOpenDataApiKey } });
  } catch (e) {
    if (e instanceof HttpError && e.code === 'NOT_FOUND') return [];
    throw e;
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

// DIČ (income tax register) and IČ DPH (VAT register) of a company by IČO;
// null when the key is missing or the company is not in a list.
export async function fetchVatIds(upstream, config, ico) {
  if (!config.fsOpenDataApiKey) return { dic: null, icDph: null };
  const byIco = (rows) => rows.find(r => digits(pickField(r, 'ico', 'ICO', 'IČO')) === digits(ico)) || null;
  const [subjects, payers] = await Promise.all([
    fetchList(upstream, config, config.fsLists.taxSubjects, 'ico', ico),
    fetchList(upstream, config, config.fsLists.vatPayers, 'ico', ico)
  ]);
  const subject = byIco(subjects);
  const payer = byIco(payers);
  return {
    dic: subject ? pickField(subject, 'dic', 'DIČ', 'tax_number') : null,
    icDph: payer ? pickField(payer, 'ic_dph', 'icDph', 'IČ DPH', 'vat_number') : null
  };
}

// Status of a VAT payer across the three FS lists.
export async function fetchReliability(upstream, config, icdph) {
  const matches = async (list) => {
    const rows = await fetchList(upstream, config, list, 'ic_dph', icdph);
    return rows.some(r => String(pickField(r, 'ic_dph', 'icDph', 'IČ DPH', 'vat_number') || '').replace(/\s/g, '').toUpperCase() === icdph);
  };
  const lists = [];
  if (await matches(config.fsLists.deleted)) lists.push('deleted');
  if (await matches(config.fsLists.cancellationReasons)) lists.push('cancellation-reasons');
  if (await matches(config.fsLists.vatPayers)) lists.push('vat-payers');
  let status = 'NOT_REGISTERED';
  if (lists.includes('deleted')) status = 'DELETED';
  else if (lists.includes('cancellation-reasons')) status = 'REASONS_FOR_CANCELLATION';
  else if (lists.includes('vat-payers')) status = 'OK';
  return { status, lists, checkedAt: new Date().toISOString() };
}
