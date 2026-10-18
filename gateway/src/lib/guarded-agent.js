// undici Agent whose DNS lookup refuses private addresses at connect time,
// so a host that passed the pre-check cannot rebind to an internal address
// between the check and the connection (06-gateway-server.md § 6.4).
import { lookup as dnsLookup } from 'node:dns';
import { Agent } from 'undici';
import { isPrivateAddress } from './ssrf.js';

export function guardedLookup(lookup = dnsLookup) {
  return function guarded(hostname, options, callback) {
    lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const list = Array.isArray(addresses) ? addresses : [addresses];
      if (!list.length || list.some(a => isPrivateAddress(a.address))) {
        const refused = new Error(`Host ${hostname} resolves to a private address`);
        refused.code = 'HOST_NOT_ALLOWED';
        return callback(refused);
      }
      if (options && options.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

export function createGuardedAgent({ timeoutMs = 15000, lookup } = {}) {
  return new Agent({
    connect: { timeout: timeoutMs, lookup: guardedLookup(lookup) },
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs * 4
  });
}
