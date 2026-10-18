// Open data of the Financial Administration (opendata.financnasprava.sk,
// Information Lists API, header "key"): DIČ and IČ DPH of a company by IČO,
// and the VAT payer lists (payers, reasons for cancellation, deleted).
// The list identifiers and filter parameters are configuration, because
// the portal renames them without notice.
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

async function fetchList(upstream, config, list, filter) {
  if (!config.fsOpenDataApiKey) throw new HttpError(503, 'NOT_CONFIGURED', 'FS open data key is not configured');
  const url = `${config.fsOpenDataUrl}/${encodeURIComponent(list)}?${new URLSearchParams({ ...filter, itemsPerPage: '50' })}`;
  const data = await upstream.json('fs-opendata', url, { headers: { key: config.fsOpenDataApiKey } });
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

// DIČ and IČ DPH of a company by IČO; null when the key is missing or the
// company is not in the lists (a company without VAT registration).
export async function fetchVatIds(upstream, config, ico) {
  if (!config.fsOpenDataApiKey) return { dic: null, icDph: null };
  const rows = await fetchList(upstream, config, config.fsLists.taxSubjects, { ico });
  const row = rows.find(r => digits(pickField(r, 'ico', 'ICO', 'IČO')) === digits(ico)) || null;
  return {
    dic: row ? pickField(row, 'dic', 'DIČ', 'tax_number') : null,
    icDph: row ? pickField(row, 'ic_dph', 'icDph', 'IČ DPH', 'vat_number') : null
  };
}

// Status of a VAT payer across the three FS lists.
export async function fetchReliability(upstream, config, icdph) {
  const matches = async (list) => {
    const rows = await fetchList(upstream, config, list, { ic_dph: icdph });
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
