// The closed beta of eFaktúra (04-peppol.md § 4.9). The section and the
// wizard are visible to everyone; sending and receiving switch on with an
// invite code from the waiting list: the gateway exchanges it for a signed
// token valid one year (POST /v1/beta/redeem), kept with the secrets of the
// device. On the desktop the user may also switch the beta on in Settings
// (a device preference), because the desktop talks to providers directly.
import { PeppolError } from './errors.js';
import { getPrefs, setPref } from '../prefs.js';

export const BETA_SECRET = 'peppol:beta';
export const DESKTOP_BETA_PREF = 'peppolBetaDesktop';

function parse(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && value.token && value.expiresAt ? value : null;
  } catch {
    return null;
  }
}

/** @returns {Promise<{enabled: boolean, via: 'code'|'desktop'|null, expiresAt?: string}>} */
export async function betaState(transport, now = () => new Date()) {
  if (transport.platform !== 'web' && getPrefs()[DESKTOP_BETA_PREF]) return { enabled: true, via: 'desktop' };
  let stored = null;
  try {
    stored = parse(await transport.secrets.get(BETA_SECRET));
  } catch (error) {
    console.warn('peppol: beta token not readable', error.code || error.name);
  }
  if (stored && new Date(stored.expiresAt) > now()) return { enabled: true, via: 'code', expiresAt: stored.expiresAt };
  return { enabled: false, via: null };
}

export async function redeemBetaCode(transport, code) {
  const text = String(code || '').trim();
  if (!text || text.length > 40) throw new PeppolError('PEPPOL_BETA_CODE_INVALID', 'empty or too long code');
  let response;
  try {
    response = await transport.http({
      url: transport.gatewayUrl('/v1/beta/redeem'), method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ code: text }), timeoutMs: 20000
    });
  } catch (error) {
    throw new PeppolError('PEPPOL_NETWORK', `beta redeem: ${error.name || error.code}`, { retryable: true });
  }
  if (response.status === 400 || response.status === 404) throw new PeppolError('PEPPOL_BETA_CODE_INVALID', 'code not accepted', { status: response.status });
  if (!response.ok) throw new PeppolError('PEPPOL_SERVER', `beta redeem answered ${response.status}`, { status: response.status, retryable: true });
  const body = await response.json();
  if (!body?.token || !body?.expiresAt) throw new PeppolError('PEPPOL_BAD_RESPONSE', 'beta answer without token');
  await transport.secrets.set(BETA_SECRET, JSON.stringify({ token: body.token, expiresAt: body.expiresAt }));
  return { enabled: true, via: 'code', expiresAt: body.expiresAt };
}

export function setDesktopBeta(on) {
  setPref(DESKTOP_BETA_PREF, Boolean(on));
}
