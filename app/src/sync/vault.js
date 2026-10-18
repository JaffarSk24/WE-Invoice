// The data key of this device for the sync engine: one DEK as a CryptoKey
// that cannot be read out, loaded from the keyring at start and set when
// the user types the password, the recovery words, or turns encryption on.
//
//   vault.key        the DEK, or null while locked
//   vault.locked     no key here (the password has to be typed)
//   vault.keyStored  the keyring keeps the key across restarts
import { importAesKey, sameKey } from './crypto.js';
import { memoryKeyring } from './keyring.js';

export class Vault {
  constructor(keyring = memoryKeyring()) {
    this.keyring = keyring;
    this.key = null;
    this.keyStored = true;
    this.loaded = false;
  }

  get locked() {
    return !this.key;
  }

  async load() {
    if (this.loaded) return this.key;
    this.loaded = true;
    try {
      this.key = (await this.keyring.load()) || null;
    } catch (e) {
      console.error('The data key could not be loaded', e);
      this.key = null;
    }
    return this.key;
  }

  // The DEK bits just unwrapped (keys.js): imported non-extractable and
  // handed to the keyring. The bits themselves are not kept.
  async unlock(dekBits) {
    this.loaded = true;
    this.key = await importAesKey(dekBits, false);
    try {
      this.keyStored = (await this.keyring.save(this.key, dekBits)) !== false;
    } catch (e) {
      console.warn('The data key could not be kept', e);
      this.keyStored = false;
    }
    return this.key;
  }

  // Forgets the key here (sign-out, or "ask for the password again").
  async lock() {
    this.loaded = true;
    this.key = null;
    this.keyStored = true;
    await this.keyring.forget();
  }

  // Whether `dekBits` is the key this device holds (a header from the
  // cloud opened with the password matches the key in the keyring).
  async holds(dekBits) {
    if (!this.key) return false;
    return sameKey(this.key, await importAesKey(dekBits, false));
  }
}
