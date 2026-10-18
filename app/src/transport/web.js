// Transport of the browser and PWA build. Peppol providers, registers and
// eKasa are reached through the gateway, because most of them do not allow
// browser (CORS) requests. Drive and Google sign-in arrive with WP-SYNC.
import { NotImplementedError } from '@we-invoice/core';
import { fromFetchResponse } from './interface.js';
import { GATEWAY_URL } from '../config.js';

const notYet = (name) => () => Promise.reject(new NotImplementedError(name));

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

export function createWebTransport({ gatewayUrl = GATEWAY_URL, fetchImpl = (...a) => fetch(...a) } = {}) {
  const base = gatewayUrl.replace(/\/+$/, '');
  return {
    platform: 'web',
    gatewayUrl: (path) => `${base}${path.startsWith('/') ? '' : '/'}${path}`,
    async http({ url, method = 'GET', headers = {}, body = null, timeoutMs = 30000 }) {
      const response = await fetchImpl(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
      return fromFetchResponse(response);
    },
    drive: { list: notYet('drive.list'), get: notYet('drive.get'), put: notYet('drive.put'), delete: notYet('drive.delete') },
    auth: { signIn: notYet('auth.signIn'), signOut: notYet('auth.signOut'), getAccessToken: notYet('auth.getAccessToken'), status: () => Promise.resolve({ signedIn: false }) },
    files: { saveAs, openFile },
    secrets: { get: notYet('secrets.get'), set: notYet('secrets.set'), delete: notYet('secrets.delete') },
    notify(title, body) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body });
    }
  };
}
