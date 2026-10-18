// Which adapter serves which provider (providers.json "adapter"). Only
// providers with a published API description have an adapter of their own;
// a provider that speaks SAPI-SK uses the universal one. Dativery and
// iPoštár get no native adapter until their API is documented publicly.
import { PeppolError } from '../errors.js';
import { assertAdapter } from './interface.js';
import { createSapiSkAdapter } from './sapi-sk.js';
import { createVertecoAdapter } from './verteco.js';
import { createEpostakAdapter } from './epostak.js';

const FACTORIES = Object.freeze({
  'sapi-sk': createSapiSkAdapter,
  verteco: createVertecoAdapter,
  epostak: createEpostakAdapter
});

export const ADAPTER_IDS = Object.freeze(Object.keys(FACTORIES));

/**
 * @param {object} provider  entry of providers.json
 * @param {{client: object, credentials: object, participantId: string}} deps
 */
export function createAdapter(provider, deps) {
  const factory = FACTORIES[provider?.adapter];
  if (!factory) throw new PeppolError('PEPPOL_NO_PROVIDER', `no adapter for ${provider?.id}`);
  return assertAdapter(factory(deps));
}
