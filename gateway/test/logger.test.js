import { describe, it, expect } from 'vitest';
import { loggerOptions, REDACTED_HEADERS } from '../src/lib/logger.js';

describe('logger options', () => {
  it('redacts authorization headers', () => {
    const paths = loggerOptions().redact.paths;
    REDACTED_HEADERS.forEach(h => expect(paths).toContain(`req.headers["${h}"]`));
    expect(REDACTED_HEADERS).toContain('x-upstream-authorization');
  });

  it('logs the route pattern, not the path or query', () => {
    const req = loggerOptions().serializers.req({ method: 'GET', url: '/v1/proxy/peppol/x/secret?q=1', routeOptions: { url: '/v1/proxy/peppol/:providerId/*' } });
    expect(req).toEqual({ method: 'GET', route: '/v1/proxy/peppol/:providerId/*' });
  });
});
