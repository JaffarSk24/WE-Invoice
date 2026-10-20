// Fresh, valid roots for a new workspace and a new company data file.
import { COLLECTIONS } from './entities/workspace.js';

export function emptyWorkspace({ workspaceId, now, schemaVersion }) {
  return { schemaVersion, workspaceId, updatedAt: now, companies: [], activeCompanyId: null, keys: null, settings: {}, betaToken: null };
}

export function emptyCompanyData({ company, now, schemaVersion }) {
  const data = { schemaVersion, companyId: company.id, updatedAt: now, company };
  COLLECTIONS.forEach(name => { data[name] = []; });
  return data;
}
