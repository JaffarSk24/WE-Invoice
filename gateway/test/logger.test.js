import { describe, it, expect } from 'vitest';
import { loggerOptions, REDACTED_HEADERS, anonymizeIp, serializeRequest } from '../src/lib/logger.js';

describe('logger options', () => {
  it('redacts authorization headers, the url, query, params and body', () => {
    const paths = loggerOptions().redact.paths;
    REDACTED_HEADERS.forEach(h => expect(paths).toContain(`req.headers["${h}"]`));
    expect(REDACTED_HEADERS).toContain('x-upstream-authorization');
    expect(REDACTED_HEADERS).toContain('x-upstream-base');
    ['req.url', 'req.query', 'req.params', 'req.body'].forEach(p => expect(paths).toContain(p));
  });

  it('logs the route pattern and an anonymised ip, not the path or query', () => {
    const req = loggerOptions().serializers.req({ method: 'GET', url: '/v1/proxy/peppol/x/secret?q=1', ip: '203.0.113.77', routeOptions: { url: '/v1/proxy/peppol/:providerId/*' } });
    expect(req).toEqual({ method: 'GET', route: '/v1/proxy/peppol/:providerId/*', ip: '203.0.113.0' });
    expect(JSON.stringify(req)).not.toContain('secret');
    expect(serializeRequest({ method: 'GET' })).toMatchObject({ route: 'unknown', ip: 'unknown' });
  });

  it('serializes the response as the status code only', () => {
    expect(loggerOptions().serializers.res({ statusCode: 201, raw: {} })).toEqual({ statusCode: 201 });
  });

  it('passes a stream through for tests', () => {
    const stream = { write() {} };
    expect(loggerOptions('debug', stream)).toMatchObject({ level: 'debug', stream });
    expect(loggerOptions('info').stream).toBeUndefined();
  });

  it('anonymises IPv4, mapped IPv4 and IPv6 addresses', () => {
    expect(anonymizeIp('192.168.1.42')).toBe('192.168.1.0');
    expect(anonymizeIp('::ffff:10.1.2.3')).toBe('10.1.2.0');
    expect(anonymizeIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::');
    expect(anonymizeIp('2001:db8::1')).toBe('2001:db8::');
    expect(anonymizeIp('')).toBe('unknown');
    expect(anonymizeIp('garbage')).toBe('unknown');
  });
});
