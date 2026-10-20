import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const spec = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));

// Every endpoint of 06-gateway-server.md § 6.3 is in the contract.
const EXPECTED = [
  ['get', '/v1/health'], ['post', '/v1/proxy/peppol/{providerId}/{path}'], ['get', '/v1/proxy/superfaktura/{market}/{path}'], ['get', '/v1/company/sk/{ico}'],
  ['get', '/v1/company/sk/search'], ['get', '/v1/company/cz/{ico}'], ['get', '/v1/vat/vies/{cc}/{number}'],
  ['get', '/v1/vat/sk/{icdph}/reliability'], ['get', '/v1/rates/ecb'], ['post', '/v1/ekasa/receipt'],
  ['get', '/v1/peppol/lookup/{scheme}/{id}'], ['post', '/v1/waitlist'], ['get', '/v1/waitlist/confirm'],
  ['get', '/v1/waitlist/unsubscribe'], ['post', '/v1/beta/redeem'], ['get', '/v1/admin/waitlist.csv'],
  ['get', '/v1/admin/stats'], ['post', '/v1/share'], ['get', '/v1/share/{id}'], ['post', '/v1/share/{id}/reply'],
  ['post', '/v1/inbox/register'], ['get', '/v1/inbox/{id}'], ['delete', '/v1/inbox/{id}/{msg}'],
  ['post', '/v1/assistant/jobs'], ['delete', '/v1/assistant/jobs']
];

describe('openapi.yaml', () => {
  it('is OpenAPI 3.1', () => {
    expect(spec.openapi).toBe('3.1.0');
  });

  it.each(EXPECTED)('defines %s %s', (method, path) => {
    expect(spec.paths[path], path).toBeTruthy();
    expect(spec.paths[path][method], `${method} ${path}`).toBeTruthy();
  });

  it('has one error format', () => {
    expect(spec.components.schemas.Error.required).toEqual(['error']);
  });
});
