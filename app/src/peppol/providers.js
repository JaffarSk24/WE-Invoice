// The Peppol providers offered to the user (packages/core/peppol/
// providers.json): which of them the app can connect to, where their API
// lives (production, sandbox, or a base URL the user typed for "another
// SAPI-SK provider") and how the wizard describes them.
import { PEPPOL_PROVIDERS } from '@we-invoice/core';

export function providerList() {
  return PEPPOL_PROVIDERS;
}

export function findProvider(id) {
  return PEPPOL_PROVIDERS.find(p => p.id === id) || null;
}

/** True when the app has an adapter for the provider and knows (or asks for) its address. */
export function isConnectable(provider) {
  if (!provider || !provider.adapter || provider.api !== 'AVAILABLE') return false;
  return Boolean(provider.customBaseUrl || provider.baseUrl?.prod || provider.baseUrl?.sandbox);
}

export function hasSandbox(provider) {
  return Boolean(provider?.baseUrl?.sandbox) || Boolean(provider?.customBaseUrl);
}

/** Base URL the client talks to, without a trailing slash; null when unknown. */
export function baseUrlOf(provider, { sandbox = false, customBase = null } = {}) {
  if (!provider) return null;
  const url = provider.customBaseUrl ? customBase : (sandbox ? provider.baseUrl?.sandbox : provider.baseUrl?.prod);
  return url ? String(url).replace(/\/+$/, '') : null;
}

/** Which credential fields the provider's authentication needs. */
export function credentialFields(provider) {
  switch (provider?.auth) {
    case 'API_KEY_HEADER': return ['apiKey'];
    case 'API_KEY_TO_JWT':
    case 'OAUTH2_CLIENT_CREDENTIALS':
    case 'CLIENT_CREDENTIALS_TO_JWT':
    default: return ['clientId', 'clientSecret'];
  }
}

/** Tariff text in the interface language, Slovak when there is no English one. */
export function tariffText(provider, lang) {
  const t = provider?.tariff || {};
  return (lang === 'sk' || lang === 'cs' ? t.sk : t.en) || t.sk || '';
}

/** A custom SAPI-SK base URL must be https without credentials, query or fragment. */
export function isValidCustomBase(text) {
  try {
    const url = new URL(String(text || '').trim());
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.hostname.includes('.');
  } catch {
    return false;
  }
}
