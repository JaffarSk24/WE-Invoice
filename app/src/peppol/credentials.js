// Provider credentials (client id and secret, or an API key) live only in
// transport.secrets (§ 4.11): on the desktop in the system keychain
// (safeStorage), in the browser sealed with the data key. They never enter
// the company record, a document, the audit log or the console.
import { PeppolError } from './errors.js';
import { credentialFields } from './providers.js';

export const secretName = (companyId, providerId) => `peppol:${companyId}:${providerId}`;

function parse(raw) {
  if (!raw) return null;
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && typeof value === 'object' ? value : null;
  } catch (error) {
    console.warn('peppol: stored credentials are not readable', error.name);
    return null;
  }
}

export async function loadCredentials(transport, companyId, provider) {
  const value = parse(await transport.secrets.get(secretName(companyId, provider.id)));
  if (!value) return null;
  // An API-key provider reads the key as both id and secret of the SAPI-SK token call.
  if (value.apiKey && !value.clientSecret) return { clientId: value.clientId || value.apiKey, clientSecret: value.apiKey, apiKey: value.apiKey };
  return value;
}

/** Saves what the wizard collected; empty or missing fields are refused before anything is stored. */
export async function saveCredentials(transport, companyId, provider, input) {
  const fields = credentialFields(provider);
  const value = {};
  for (const field of fields) {
    const text = String(input?.[field] || '').trim();
    if (!text) throw new PeppolError('PEPPOL_NO_CREDENTIALS', `missing ${field}`);
    value[field] = text;
  }
  await transport.secrets.set(secretName(companyId, provider.id), JSON.stringify(value));
  return value;
}

export function deleteCredentials(transport, companyId, providerId) {
  return transport.secrets.delete(secretName(companyId, providerId));
}

/** Masked form for the screen: the last four characters only. */
export function maskSecret(text) {
  const s = String(text || '');
  return s.length > 4 ? `${'*'.repeat(Math.min(12, s.length - 4))}${s.slice(-4)}` : '****';
}
