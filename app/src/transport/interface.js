// The transport bridge (02-architecture.md § 2.7): everything the app needs
// from the outside world, behind one interface. The app never asks where it
// runs, except transport.platform for UI hints. Contract file: change
// through a "contract:" PR only.
//
//   http(request)        { url, method, headers, body, timeoutMs } -> Response-like
//                        web: through the gateway (/v1/proxy/*, /v1/...);
//                        desktop: straight from the main process (weNet)
//   gatewayUrl(path)     absolute URL of a gateway endpoint
//   drive.list(path) / get(path) / put(path, data) / delete(path)
//                        files under "My Drive/WE Invoice/" (drive.file scope)
//   auth.signIn() / signOut() / getAccessToken() / status()
//   files.saveAs(name, blob) / openFile({accept, multiple})
//   secrets.get(name) / set(name, value) / delete(name)
//                        desktop: safeStorage; web: kept in the encrypted data
//   notify(title, body)  system notification
//   platform             'web' | 'mac' | 'win'

/**
 * @typedef {object} HttpRequest
 * @property {string} url
 * @property {string} [method]
 * @property {Object<string, string>} [headers]
 * @property {string|Uint8Array|null} [body]
 * @property {number} [timeoutMs]
 */

/**
 * @typedef {object} HttpResponse
 * @property {number} status
 * @property {boolean} ok
 * @property {Object<string, string>} headers
 * @property {() => Promise<string>} text
 * @property {() => Promise<any>} json
 * @property {() => Promise<Uint8Array>} bytes
 */

/**
 * @typedef {object} Transport
 * @property {'web'|'mac'|'win'} platform
 * @property {(request: HttpRequest) => Promise<HttpResponse>} http
 * @property {(path: string) => string} gatewayUrl
 * @property {{list: Function, get: Function, put: Function, delete: Function}} drive
 * @property {{signIn: Function, signOut: Function, getAccessToken: Function, status: Function}} auth
 * @property {{saveAs: Function, openFile: Function}} files
 * @property {{get: Function, set: Function, delete: Function}} secrets
 * @property {(title: string, body: string) => void} notify
 */

export const TRANSPORT_SHAPE = Object.freeze({
  functions: ['http', 'gatewayUrl', 'notify'],
  groups: {
    drive: ['list', 'get', 'put', 'delete'],
    auth: ['signIn', 'signOut', 'getAccessToken', 'status'],
    files: ['saveAs', 'openFile'],
    secrets: ['get', 'set', 'delete']
  },
  platforms: ['web', 'mac', 'win']
});

// Throws when an object does not have the full transport shape.
export function assertTransport(transport) {
  const missing = [];
  if (!TRANSPORT_SHAPE.platforms.includes(transport && transport.platform)) missing.push('platform');
  TRANSPORT_SHAPE.functions.forEach(name => { if (typeof transport[name] !== 'function') missing.push(name); });
  Object.entries(TRANSPORT_SHAPE.groups).forEach(([group, names]) => {
    names.forEach(name => {
      if (!transport[group] || typeof transport[group][name] !== 'function') missing.push(`${group}.${name}`);
    });
  });
  if (missing.length) throw new Error(`Transport is missing: ${missing.join(', ')}`);
  return transport;
}

// Wraps a fetch Response into the HttpResponse shape.
export function fromFetchResponse(response) {
  const headers = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  return {
    status: response.status,
    ok: response.ok,
    headers,
    text: () => response.text(),
    json: () => response.json(),
    bytes: async () => new Uint8Array(await response.arrayBuffer())
  };
}
