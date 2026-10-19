// HTTP to a Peppol provider. In the browser every call goes through the
// gateway proxy /v1/proxy/peppol/{providerId}/{path} (the providers do not
// allow browser requests); the credential travels in X-Upstream-Authorization
// and the gateway forwards it without logging or storing it (§ 4.11). On
// the desktop the main process calls the provider directly. Either way the
// adapters see one client: request({method, path, headers, body, auth}).
import { PeppolError, errorFromResponse, networkError } from './errors.js';
import { baseUrlOf } from './providers.js';

function encodePath(path) {
  return String(path).replace(/^\/+/, '');
}

async function readBody(response) {
  let text;
  try {
    text = await response.text();
  } catch (error) {
    console.warn('peppol: provider answer could not be read', error && error.name);
    return null;
  }
  if (!text) return null;
  const type = String(response.headers?.['content-type'] || '');
  if (type.includes('json') || /^[[{]/.test(text.trim())) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * @param {{transport: object, provider: object, sandbox?: boolean, customBase?: string|null, timeoutMs?: number}} options
 */
export function createProviderClient({ transport, provider, sandbox = false, customBase = null, timeoutMs = 60000 }) {
  const viaGateway = transport.platform === 'web';
  const base = baseUrlOf(provider, { sandbox, customBase });
  if (!base && !(viaGateway && !provider.customBaseUrl)) {
    throw new PeppolError('PEPPOL_NOT_CONFIGURED', `no API address for ${provider.id}`);
  }
  const proxyId = `${provider.id}${sandbox && !provider.customBaseUrl ? '-sandbox' : ''}`;

  function urlOf(path) {
    if (viaGateway) return transport.gatewayUrl(`/v1/proxy/peppol/${proxyId}/${encodePath(path)}`);
    return `${base}/${encodePath(path)}`;
  }

  /**
   * @param {{method?: string, path: string, headers?: object, body?: string|null, json?: object, auth?: string|null}} req
   *   auth: the full Authorization value ("Bearer ...") or null
   * @returns {Promise<{status: number, headers: object, body: any}>}  body parsed as JSON when it is JSON
   */
  async function request({ method = 'GET', path, headers = {}, body = null, json, auth = null }) {
    const out = { accept: 'application/json', ...headers };
    let payload = body;
    if (json !== undefined) {
      payload = JSON.stringify(json);
      out['content-type'] = 'application/json';
    }
    if (auth) out[viaGateway ? 'x-upstream-authorization' : 'authorization'] = auth;
    if (viaGateway && provider.customBaseUrl) out['x-upstream-base'] = base;
    const context = `${provider.id} ${method} ${path.split('?')[0]}`;
    let response;
    try {
      response = await transport.http({ url: urlOf(path), method, headers: out, body: payload, timeoutMs });
    } catch (error) {
      throw networkError(error, context);
    }
    const parsed = await readBody(response);
    if (!response.ok) throw errorFromResponse(response, parsed, context);
    return { status: response.status, headers: response.headers || {}, body: parsed };
  }

  return { request, provider, sandbox, base, viaGateway };
}
