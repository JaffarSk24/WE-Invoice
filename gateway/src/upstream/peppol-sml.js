// SML lookup of a Peppol participant (Policy for use of Identifiers 4.4,
// SML 1.3): the DNS name is base32(SHA-256(lowercase id)) without padding,
// then the scheme "iso6523-actorid-upis" and the SML zone; the NAPTR record
// with service "Meta:SMP" carries the SMP URL in its regexp. The legacy
// "B-" + hex(MD5) CNAME form is kept behind a flag for an SML that still
// publishes it.
import { createHash } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { upstreamUnavailable } from '../lib/errors.js';

export const SCHEME_ID = 'iso6523-actorid-upis';
const NOT_FOUND = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

// RFC 4648 base32 without padding.
export function base32(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

export const participantValue = (scheme, id) => `${scheme}:${id}`;

export function naptrLabel(value) {
  return base32(createHash('sha256').update(value.toLowerCase(), 'utf8').digest()).toLowerCase();
}

export function legacyLabel(value) {
  return `B-${createHash('md5').update(value.toLowerCase(), 'utf8').digest('hex')}`;
}

export const naptrName = (value, zone) => `${naptrLabel(value)}.${SCHEME_ID}.${zone}`;
export const legacyName = (value, zone) => `${legacyLabel(value)}.${SCHEME_ID}.${zone}`;

// SMP URL from the NAPTR regexp "!^.*$!https://smp.example.com!".
export function smpUrlFromNaptr(records) {
  for (const r of records || []) {
    if (String(r.service || '').toLowerCase() !== 'meta:smp') continue;
    const regexp = String(r.regexp || '').replace(/^"|"$/g, '');
    const delimiter = regexp[0];
    const parts = delimiter ? regexp.slice(1).split(delimiter) : [];
    const url = parts[1];
    if (url && /^https?:\/\//i.test(url)) return url.replace(/\/+$/, '');
  }
  return null;
}

export function createSmlLookup({ zone, legacyCname = false, resolver = new Resolver() }) {
  return async function lookupSmp(scheme, id) {
    const value = participantValue(scheme, id);
    let records;
    try {
      records = await resolver.resolveNaptr(naptrName(value, zone));
    } catch (e) {
      if (!NOT_FOUND.has(e.code)) throw upstreamUnavailable(`SML lookup failed: ${e.code || e.message}`);
      records = [];
    }
    const url = smpUrlFromNaptr(records);
    if (url) return url;
    if (!legacyCname) return null;
    try {
      const name = legacyName(value, zone);
      const cname = await resolver.resolveCname(name);
      return cname && cname.length ? `http://${name}` : null;
    } catch (e) {
      if (NOT_FOUND.has(e.code)) return null;
      throw upstreamUnavailable(`SML lookup failed: ${e.code || e.message}`);
    }
  };
}
