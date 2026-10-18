// transport.secrets of the web build: small secrets (Peppol API keys)
// kept in the local store sealed with the data key, since a browser has
// no system keychain. Reading or writing needs the workspace to be
// unlocked; the key comes from a provider set at boot (the vault).
import { KEYS } from '../store/local.js';
import { seal, open, toBase64, fromBase64, cryptoError } from './crypto.js';

const utf8 = new TextEncoder();
const utf8d = new TextDecoder();

export function createWebSecrets({ adapter, getKey }) {
  const key = () => {
    const k = getKey();
    if (!k) throw cryptoError('LOCKED');
    return k;
  };

  async function readAll() {
    const text = await adapter.get(KEYS.secrets);
    if (!text) return {};
    let sealed;
    try {
      sealed = JSON.parse(text);
    } catch (e) {
      throw cryptoError('DAMAGED', 'The secrets file is not JSON');
    }
    const plain = utf8d.decode(await open(key(), fromBase64(sealed.body)));
    return JSON.parse(plain);
  }

  async function writeAll(values) {
    const body = await seal(key(), utf8.encode(JSON.stringify(values)));
    await adapter.put(KEYS.secrets, JSON.stringify({ v: 1, body: toBase64(body) }));
  }

  return {
    async get(name) {
      const all = await readAll();
      return Object.prototype.hasOwnProperty.call(all, name) ? all[name] : null;
    },
    async set(name, value) {
      const all = await readAll();
      all[name] = value;
      await writeAll(all);
    },
    async delete(name) {
      const all = await readAll();
      delete all[name];
      await writeAll(all);
    }
  };
}
