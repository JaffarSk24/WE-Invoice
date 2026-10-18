// Logger options: only method, route, status and duration. Bodies, query
// strings and authorization headers are never logged (06-gateway-server.md
// § 6.4); proxy paths are cut to the route pattern.

export const REDACTED_HEADERS = ['authorization', 'x-upstream-authorization', 'cookie', 'x-api-key'];

export function loggerOptions(level = 'info') {
  return {
    level,
    redact: { paths: REDACTED_HEADERS.map(h => `req.headers["${h}"]`), censor: '[redacted]' },
    serializers: {
      req(request) {
        return { method: request.method, route: request.routeOptions && request.routeOptions.url ? request.routeOptions.url : 'unknown' };
      },
      res(reply) {
        return { statusCode: reply.statusCode };
      }
    }
  };
}
