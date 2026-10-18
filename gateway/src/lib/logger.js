// Logger options: only method, route, status, duration and an anonymised
// IP. Bodies, query strings and authorization headers are never logged
// (06-gateway-server.md § 6.4); proxy paths are cut to the route pattern.

export const REDACTED_HEADERS = ['authorization', 'x-upstream-authorization', 'x-upstream-base', 'cookie', 'x-api-key', 'proxy-authorization'];

// Last octet of IPv4 and the last 80 bits of IPv6 are dropped, so a log
// line never identifies one person. The mapped form ::ffff:1.2.3.4 counts
// as IPv4.
export function anonymizeIp(ip) {
  if (!ip || typeof ip !== 'string') return 'unknown';
  const v4 = ip.match(/^(?:::ffff:)?(\d+\.\d+\.\d+)\.\d+$/);
  if (v4) return `${v4[1]}.0`;
  if (ip.includes(':')) {
    const parts = ip.split('::')[0].split(':').filter(Boolean);
    return `${parts.slice(0, 3).join(':')}::`;
  }
  return 'unknown';
}

export function serializeRequest(request) {
  return {
    method: request.method,
    route: request.routeOptions && request.routeOptions.url ? request.routeOptions.url : 'unknown',
    ip: anonymizeIp(request.ip)
  };
}

export function loggerOptions(level = 'info', stream) {
  return {
    level,
    ...(stream ? { stream } : {}),
    redact: { paths: REDACTED_HEADERS.map(h => `req.headers["${h}"]`).concat(['req.url', 'req.query', 'req.params', 'req.body']), censor: '[redacted]' },
    serializers: {
      req: serializeRequest,
      res(reply) {
        return { statusCode: reply.statusCode };
      }
    }
  };
}
