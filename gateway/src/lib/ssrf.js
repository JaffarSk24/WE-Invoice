// SSRF guard of every outbound request whose host is not fixed in the
// configuration: the proxy to Peppol providers and the SMP lookup. A host
// is allowed only when every address it resolves to is public, and a
// redirect may only stay on the same host (06-gateway-server.md § 6.4).
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { HttpError } from './errors.js';

const PRIVATE_V4 = [
  [[0, 0, 0, 0], 8], [[10, 0, 0, 0], 8], [[100, 64, 0, 0], 10], [[127, 0, 0, 0], 8], [[169, 254, 0, 0], 16],
  [[172, 16, 0, 0], 12], [[192, 0, 0, 0], 24], [[192, 0, 2, 0], 24], [[192, 168, 0, 0], 16], [[198, 18, 0, 0], 15],
  [[198, 51, 100, 0], 24], [[203, 0, 113, 0], 24], [[224, 0, 0, 0], 4], [[240, 0, 0, 0], 4]
];

function v4ToInt(parts) {
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isPrivateV4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const ip = v4ToInt(parts);
  return PRIVATE_V4.some(([net, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ip & mask) === (v4ToInt(net) & mask);
  });
}

// Expands an IPv6 address to eight 16-bit groups.
function v6Groups(address) {
  let text = address.toLowerCase();
  const mapped = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const p = mapped[2].split('.').map(Number);
    text = `${mapped[1]}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const [head, tail = ''] = text.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const fill = new Array(Math.max(0, 8 - h.length - t.length)).fill('0');
  return h.concat(fill, t).map(g => parseInt(g || '0', 16));
}

export function isPrivateV6(address) {
  const g = v6Groups(address);
  if (g.length !== 8 || g.some(Number.isNaN)) return true;
  if (g.slice(0, 7).every(x => x === 0) && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return isPrivateV4(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`); // mapped IPv4
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

export function isPrivateAddress(address) {
  const family = isIP(address);
  if (family === 4) return isPrivateV4(address);
  if (family === 6) return isPrivateV6(address);
  return true;
}

// Resolves a host name and returns its public addresses; throws
// HOST_NOT_ALLOWED when any address is private or nothing resolves.
export async function resolvePublicHost(hostname, lookup = dnsLookup) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new HttpError(400, 'HOST_NOT_ALLOWED', 'Host not allowed');
  }
  let addresses;
  if (isIP(host)) addresses = [{ address: host, family: isIP(host) }];
  else {
    try {
      addresses = await lookup(host, { all: true });
    } catch (e) {
      throw new HttpError(502, 'UPSTREAM_UNAVAILABLE', `Cannot resolve ${host}`);
    }
  }
  if (!addresses.length || addresses.some(a => isPrivateAddress(a.address))) {
    throw new HttpError(400, 'HOST_NOT_ALLOWED', 'Host not allowed');
  }
  return addresses;
}

// A redirect may stay on the same origin only.
export function assertSameOrigin(fromUrl, location) {
  const from = new URL(fromUrl);
  const to = new URL(location, from);
  if (to.protocol !== 'https:' || to.host !== from.host) throw new HttpError(502, 'UPSTREAM_UNAVAILABLE', 'Redirect to another host refused');
  return to;
}
