// The provider connection of the open company: company.peppol says which
// provider, which environment and which base URL (for "another SAPI-SK
// provider"); the credentials come from transport.secrets. Returns an
// adapter ready to use, or throws a PeppolError that tells the user what
// is missing.
import { participantId } from '@we-invoice/core';
import { PeppolError } from './errors.js';
import { findProvider, isConnectable } from './providers.js';
import { createProviderClient } from './http.js';
import { createAdapter } from './adapters/index.js';
import { loadCredentials } from './credentials.js';

/** The Peppol settings of a company with their defaults. */
export function peppolSettings(company) {
  const p = company?.peppol || {};
  return {
    providerId: p.providerId || null,
    baseUrl: p.baseUrl || null,
    participantId: p.participantId || (company?.dic ? participantId(company.dic) : null),
    enabled: Boolean(p.enabled),
    sandbox: Boolean(p.sandbox),
    autoReceive: p.autoReceive !== false,
    emailCopy: Boolean(p.emailCopy),
    vpdsDone: Boolean(p.vpdsDone),
    lastCheckAt: p.lastCheckAt || null,
    registered: p.registered ?? null,
    capabilities: p.capabilities || {}
  };
}

// On the desktop a custom base URL must be allowed in the main process first.
async function allowCustomHost(transport, provider, base) {
  if (transport.platform === 'web' || !provider.customBaseUrl || !base) return;
  const net = typeof window !== 'undefined' ? window.weNet : null;
  if (net && typeof net.allowHost === 'function') {
    const result = await net.allowHost(new URL(base).hostname);
    if (result && result.ok === false) throw new PeppolError('PEPPOL_NOT_CONFIGURED', `host not allowed: ${result.code || ''}`);
  }
}

/**
 * @param {{transport: object, company: object, settings?: object, credentials?: object}} options
 *   settings and credentials override the stored ones (the wizard tests before saving)
 */
export async function openConnection({ transport, company, settings = null, credentials = null }) {
  const s = settings || peppolSettings(company);
  const provider = findProvider(s.providerId);
  if (!provider || !isConnectable(provider)) throw new PeppolError('PEPPOL_NO_PROVIDER', `provider ${s.providerId} cannot be connected`);
  if (!s.participantId) throw new PeppolError('PEPPOL_NOT_ALLOWED', 'the company has no DIČ');
  const creds = credentials || await loadCredentials(transport, company.id, provider);
  if (!creds) throw new PeppolError('PEPPOL_NO_CREDENTIALS', 'no credentials stored');
  const customBase = provider.customBaseUrl ? s.baseUrl : null;
  await allowCustomHost(transport, provider, customBase);
  const client = createProviderClient({ transport, provider, sandbox: s.sandbox, customBase });
  const adapter = createAdapter(provider, { client, credentials: creds, participantId: s.participantId });
  return { provider, adapter, participantId: s.participantId, sandbox: s.sandbox, settings: s };
}
