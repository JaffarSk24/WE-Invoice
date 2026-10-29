// A SAPI-SK Peppol provider behind the gateway proxy of the end-to-end
// tests: the in-memory provider of the unit tests (app/src/peppol/
// mock-provider.js) answers what the web app sends to
// <gateway>/v1/proxy/peppol/<provider>/<path>, and the participant lookup
// of the gateway says every receiver is registered.
import { createSapiProvider } from '../../../app/src/peppol/mock-provider.js';
import { json } from './seed.js';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

export async function routePeppol(target, { providerId = 'verteco', clientId, clientSecret, inbox = [] }) {
  const provider = createSapiProvider({ clientId, clientSecret, inbox });
  await target.route('**/v1/peppol/lookup/**', route => json(route, { registered: true, documentTypes: [], checkedAt: '2026-10-18T08:00:00Z' }));
  await target.route('**/v1/proxy/peppol/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const full = new URL(request.url());
    const path = `${full.pathname.replace(/^.*\/v1\/proxy\/peppol\//, '')}${full.search}`.replace(new RegExp(`^${providerId}/`), '');
    const headers = request.headers();
    const res = provider.handle({ method: request.method(), path, headers: { ...headers, authorization: headers['x-upstream-authorization'] || headers.authorization }, body: request.postData() });
    return route.fulfill({ status: res.status, headers: { ...CORS, 'content-type': res.headers['content-type'] }, body: await res.text() });
  });
  return provider.state;
}
