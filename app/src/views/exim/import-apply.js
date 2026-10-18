// Applying a confirmed import plan: the new records are added in one write
// and every numbering series continues after the highest imported number.
import { applyImportPlan, continueSeries } from './core-bridge.js';
import { replaceCompanyData, withAudit } from './store-bulk.js';

export async function applyImport(store, plan, now = new Date().toISOString()) {
  const { data, added } = applyImportPlan(store.data, plan, { now });
  const company = data.company || {};
  const { series, changed } = continueSeries(company.series, plan.documents.map(p => p.draft));
  const next = changed ? { ...data, company: { ...company, series, updatedAt: now } } : data;
  await replaceCompanyData(store, withAudit(store.data, next, { now, reason: 'import' }));
  return { added, seriesChanged: changed };
}
