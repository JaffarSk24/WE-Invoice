// Transport of the browser and PWA build. Peppol providers, registers and
// eKasa are reached through the gateway, because most of them do not allow
// browser (CORS) requests. Google sign-in and Drive go straight to Google
// with the user's own token (sync/google); secrets are sealed with the
// data key in the local store (sync/secrets-web.js).
import { fromFetchResponse } from './interface.js';
import { GATEWAY_URL } from '../config.js';
import { createWebAuth, dropToken } from '../sync/google/auth-web.js';
import { createDriveClient } from '../sync/google/drive-api.js';
import { createWebSecrets } from '../sync/secrets-web.js';
import { deviceAdapter } from '../store/local.js';

function saveAs(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve(true);
}

function openFile({ accept = '', multiple = false } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.remove();
      resolve(multiple ? files : files[0] || null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

// `keyProvider` returns the data key of the vault (set at boot through
// transport.secrets.useKey); until then secrets are locked.
export function createWebTransport({ gatewayUrl = GATEWAY_URL, fetchImpl = (...a) => fetch(...a), adapter = null } = {}) {
  const base = gatewayUrl.replace(/\/+$/, '');
  const auth = createWebAuth({ fetchImpl });
  const drive = createDriveClient({ fetchImpl, getToken: () => auth.getAccessToken(), onUnauthorized: dropToken });
  let getKey = () => null;
  let secretsStore = null;
  const secrets = () => {
    if (!secretsStore) secretsStore = createWebSecrets({ adapter: adapter || deviceAdapter(), getKey: () => getKey() });
    return secretsStore;
  };
  return {
    platform: 'web',
    gatewayUrl: (path) => `${base}${path.startsWith('/') ? '' : '/'}${path}`,
    async http({ url, method = 'GET', headers = {}, body = null, timeoutMs = 30000 }) {
      const response = await fetchImpl(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
      return fromFetchResponse(response);
    },
    drive: { list: (p) => drive.list(p), get: (p) => drive.get(p), put: (p, d) => drive.put(p, d), delete: (p) => drive.delete(p) },
    auth,
    files: { saveAs, openFile },
    secrets: {
      get: (name) => secrets().get(name),
      set: (name, value) => secrets().set(name, value),
      delete: (name) => secrets().delete(name),
      useKey: (provider) => { getKey = provider; }
    },
    notify(title, body) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body });
    }
  };
}
