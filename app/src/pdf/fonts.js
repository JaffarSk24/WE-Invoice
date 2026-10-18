// The Inter font files for pdfmake (app/public/fonts, subset to Latin,
// Latin Extended and Cyrillic, SIL OFL). Loaded once, on the first PDF,
// as bytes through fetch (http) or XMLHttpRequest (the file:// origin of
// the desktop, where fetch refuses local files), then handed to pdfmake's
// virtual file system as base64.
import { CoreError } from '@we-invoice/core';

export const FONT_FILES = Object.freeze({
  normal: 'Inter-Regular.ttf',
  bold: 'Inter-Bold.ttf',
  italics: 'Inter-Italic.ttf',
  bolditalics: 'Inter-BoldItalic.ttf'
});

let cache = null;

export function fontBaseUrl() {
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
  return `${base.endsWith('/') ? base : `${base}/`}fonts/`;
}

function viaXhr(url) {
  return new Promise((resolve, reject) => {
    const xhr = new globalThis.XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.response)) resolve(xhr.response);
      else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.send();
  });
}

export async function loadBytes(url) {
  if (typeof fetch === 'function' && !url.startsWith('file:')) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.arrayBuffer();
    } catch (e) {
      console.warn(`fetch of ${url} failed, trying XMLHttpRequest`, e);
    }
  }
  return viaXhr(url);
}

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return globalThis.btoa(binary);
}

/** @returns {Promise<Object<string, string>>} file name to base64, for pdfmake's virtual file system */
export function loadFontFiles(baseUrl = fontBaseUrl()) {
  if (!cache) {
    cache = Promise.all(Object.values(FONT_FILES).map(async name => [name, toBase64(await loadBytes(baseUrl + name))]))
      .then(entries => Object.fromEntries(entries))
      .catch(e => {
        cache = null;
        throw new CoreError('PDF_FONT_LOAD_FAILED', `Font files could not be loaded from ${baseUrl}: ${e.message}`, { cause: e.message });
      });
  }
  return cache;
}
