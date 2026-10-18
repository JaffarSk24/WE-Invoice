// Peppol decision engine (04-peppol.md § 4.5) and the provider list.
// peppolRequirement belongs to WP-CORE; the provider list is a contract.
import { NotImplementedError } from '../errors.js';
import providers from './providers.json' with { type: 'json' };

export const PEPPOL_PROVIDERS = Object.freeze(providers.providers);

/**
 * @returns {{requirement: 'MANDATORY'|'OPTIONAL'|'NOT_ALLOWED'|'NOT_APPLICABLE', reason: string}}
 *   reason is an i18n key, e.g. "peppol.reason.payerB2bDomestic"
 */
export function peppolRequirement(company, contact, document, date) { throw new NotImplementedError('peppolRequirement'); }

/** Peppol participant id of a Slovak DIČ: "0245:<DIČ>". */
export function participantId(dic) {
  return `0245:${String(dic || '').replace(/\D/g, '')}`;
}
