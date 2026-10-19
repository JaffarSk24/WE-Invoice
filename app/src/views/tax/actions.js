// What the tax screens write: the XML file through the transport, the
// audit entries of filed and downloaded reports, the closing and opening
// of periods through the store, and the VIES check of buyer VAT ids
// through the gateway. Errors carry codes the interface translates
// (errors.<CODE>); the technical cause goes to the console.
import { CoreError, closePeriod, openPeriod, filingEntry, splitVatId } from '@we-invoice/core';
import { emit } from '../../events.js';

export const XML_TYPE = 'application/xml';

/** File name of a report: "KV_DPH_SK2020123457_2026-03_R.xml". */
export function reportFileName(report, company, period, type) {
  const prefix = { kv: 'KV_DPH', sv: 'SV_DPH', vatReturn: 'DP_DPH' }[report] || 'DPH';
  const id = String((company && company.icDph) || '').replace(/\s+/g, '');
  return `${prefix}_${id || 'NA'}_${period}_${type}.xml`;
}

export async function saveXml(transport, name, xml) {
  if (!transport || !transport.files || typeof transport.files.saveAs !== 'function') {
    throw new CoreError('TAX_SAVE_UNAVAILABLE', 'the transport cannot save files');
  }
  await transport.files.saveAs(name, new Blob([xml], { type: XML_TYPE }));
}

export async function recordFiling(store, input) {
  if (!store) throw new CoreError('TAX_READ_ONLY', 'no writable store');
  return store.insert('auditLog', filingEntry(input));
}

async function applyPeriod(store, change) {
  if (!store) throw new CoreError('TAX_READ_ONLY', 'no writable store');
  const company = await store.updateCompany(change.patch);
  await store.insert('auditLog', change.audit);
  emit('company:switched', store.switchedPayload());
  return company;
}

export function closeTaxPeriod(store, company, period) {
  return applyPeriod(store, closePeriod(company, period));
}

export function openTaxPeriod(store, company, period, reason) {
  return applyPeriod(store, openPeriod(company, period, reason));
}

/**
 * VIES result of every VAT id through the gateway: VALID, INVALID or
 * UNKNOWN (service down, offline). Never throws for one bad answer.
 * @returns {Promise<Object<string, 'VALID'|'INVALID'|'UNKNOWN'>>}
 */
export async function checkVies(transport, vatIds) {
  const out = {};
  for (const id of [...new Set(vatIds)]) {
    const [cc, number] = splitVatId(id);
    try {
      const response = await transport.http({ url: transport.gatewayUrl(`/v1/vat/vies/${cc}/${encodeURIComponent(number)}`), method: 'GET', timeoutMs: 15000 });
      if (!response.ok) throw new Error(`VIES answered ${response.status}`);
      const data = await response.json();
      out[id] = data && data.valid === true ? 'VALID' : data && data.valid === false ? 'INVALID' : 'UNKNOWN';
    } catch (e) {
      console.warn('VIES check failed', id, e);
      out[id] = 'UNKNOWN';
    }
  }
  return out;
}
