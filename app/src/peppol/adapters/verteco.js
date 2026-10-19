// Verteco (EFSK 031): SAPI-SK 1.0 at peppol.verteco.digital/sapi. The API
// key works as the client secret (vpt_...) with its UUID as the client id;
// a separate test environment exists. Everything else is plain SAPI-SK.
import { createSapiSkAdapter } from './sapi-sk.js';

export function createVertecoAdapter(options) {
  return { ...createSapiSkAdapter(options), id: 'verteco' };
}
