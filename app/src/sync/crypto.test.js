import { describe, it, expect } from 'vitest';
import {
  ITERATIONS, generateDekBits, deriveKek, importAesKey, seal, open, wrapBits, unwrapBits, sameKey, toBase64, fromBase64,
  passwordStrength, randomBytes
} from './crypto.js';
import { createKeys, unlockWithPassword, unlockWithRecovery, changePassword, rotateRecovery, parseHeader, isEncrypted } from './keys.js';
import {
  generateRecoveryWords, validateRecoveryWords, normalizeWords, splitWords, confirmationPositions, recoverySecret, wordCount, WORD_COUNT
} from './recovery.js';
import { Vault } from './vault.js';
import { memoryKeyring, secretsKeyring } from './keyring.js';

// Fewer iterations keep the tests quick; the default stays OWASP's figure.
const FAST = { iterations: 2000 };
const PASSWORD = 'correct horse battery';

describe('primitives', () => {
  it('seals and opens bytes, with a fresh iv every time', async () => {
    const key = await importAesKey(generateDekBits());
    const plain = new TextEncoder().encode('faktúra 125,18 €');
    const a = await seal(key, plain);
    const b = await seal(key, plain);
    expect(toBase64(a)).not.toBe(toBase64(b));
    expect(new TextDecoder().decode(await open(key, a))).toBe('faktúra 125,18 €');
    a[20] ^= 1;
    await expect(open(key, a)).rejects.toMatchObject({ code: 'DAMAGED' });
    await expect(open(key, new Uint8Array(5))).rejects.toMatchObject({ code: 'DAMAGED' });
  });

  it('derives the same KEK from the same secret and salt', async () => {
    const salt = randomBytes(16);
    const a = await deriveKek('pässword', salt, 2000);
    const b = await deriveKek('pässword', salt, 2000);
    const c = await deriveKek('password', salt, 2000);
    expect(await sameKey(a, b)).toBe(true);
    expect(await sameKey(a, c)).toBe(false);
    await expect(deriveKek('', salt, 2000)).rejects.toMatchObject({ code: 'EMPTY_SECRET' });
    expect(ITERATIONS).toBeGreaterThanOrEqual(600000);
  });

  it('wraps and unwraps key bits', async () => {
    const kek = await deriveKek(PASSWORD, randomBytes(16), 2000);
    const bits = generateDekBits();
    const wrapped = await wrapBits(kek, bits);
    expect(toBase64(await unwrapBits(kek, wrapped))).toBe(toBase64(bits));
    await expect(unwrapBits(kek, 'not base64!')).rejects.toMatchObject({ code: 'DAMAGED' });
    expect(fromBase64(toBase64(bits))).toEqual(bits);
  });

  it('rates passwords roughly', () => {
    expect(passwordStrength('short')).toBe(0);
    expect(passwordStrength('aaaaaaaaaa')).toBe(1);
    expect(passwordStrength('Faktura2026!x')).toBeGreaterThanOrEqual(2);
    expect(passwordStrength('štyri slová za sebou a číslo 7')).toBe(3);
  });
});

describe('recovery words', () => {
  it('generates 24 valid words and validates typed input', async () => {
    expect(wordCount()).toBe(2048);
    const words = await generateRecoveryWords();
    expect(words).toHaveLength(WORD_COUNT);
    expect(await validateRecoveryWords(words)).toEqual(words);
    expect(await validateRecoveryWords(words.join('\n'))).toEqual(words);
    expect(await validateRecoveryWords(words.map((w, i) => `${i + 1}. ${w.toUpperCase()}`).join(' '))).toEqual(words);
    // A changed word breaks the checksum almost always; a shuffled list too.
    const swapped = [...words.slice(1), words[0]];
    const broken = words.map((w, i) => (i === 3 ? (w === 'abandon' ? 'zoo' : 'abandon') : w));
    expect((await validateRecoveryWords(broken)) === null || (await validateRecoveryWords(swapped)) === null).toBe(true);
    expect(await validateRecoveryWords(words.slice(0, 23))).toBeNull();
    expect(await validateRecoveryWords('not a key at all')).toBeNull();
  });

  it('is deterministic for given entropy and accepts four-letter prefixes', async () => {
    const zero = await generateRecoveryWords(new Uint8Array(32));
    expect(zero.slice(0, 3)).toEqual(['abandon', 'abandon', 'abandon']);
    expect(zero[23]).toBe('art');
    expect(normalizeWords('aban abil')).toEqual(['abandon', 'ability']);
    expect(normalizeWords('abandon xyzzy')).toBeNull();
    expect(splitWords(' 1) Abandon, 2) ability\n3.able ')).toEqual(['abandon', 'ability', 'able']);
    expect(recoverySecret(['a', 'b'])).toBe('a b');
  });

  it('picks three distinct positions to confirm', () => {
    const positions = confirmationPositions(3, new Uint8Array([5, 5, 5, 30, 7, 7, 7, 7, 7, 7, 7, 7]));
    expect(positions).toEqual([5, 6, 7]);
    const random = confirmationPositions();
    expect(new Set(random).size).toBe(3);
    random.forEach(p => expect(p).toBeLessThan(WORD_COUNT));
  });
});

describe('keys header', () => {
  it('opens with the password and with the recovery words', async () => {
    const { header, dekBits, words } = await createKeys(PASSWORD, FAST);
    expect(parseHeader(header)).toBe(header);
    expect(header.kdf).toBe('PBKDF2-SHA256');
    expect(header.iterations).toBe(2000);
    expect(isEncrypted({ keys: header })).toBe(true);
    expect(isEncrypted({ keys: null })).toBe(false);
    expect(toBase64(await unlockWithPassword(header, PASSWORD))).toBe(toBase64(dekBits));
    expect(toBase64(await unlockWithRecovery(header, words.join(' ')))).toBe(toBase64(dekBits));
    await expect(unlockWithPassword(header, 'wrong horse battery')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(unlockWithPassword(header, '')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    const other = await generateRecoveryWords();
    await expect(unlockWithRecovery(header, other)).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' });
    await expect(unlockWithRecovery(header, 'nonsense')).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' });
  });

  it('refuses weak passwords and malformed headers', async () => {
    await expect(createKeys('short', FAST)).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    const { header } = await createKeys(PASSWORD, FAST);
    expect(() => parseHeader({ ...header, salt: '***' })).toThrow('Malformed');
    expect(() => parseHeader({ ...header, kdf: 'ARGON2ID' })).toThrow(/Unknown key derivation/);
    expect(() => parseHeader(null)).toThrow(/No encryption header/);
    expect(() => parseHeader({ ...header, iterations: 10 })).toThrow('Malformed');
  });

  it('changes the password without touching the DEK or the recovery wrapping', async () => {
    const { header, dekBits, words } = await createKeys(PASSWORD, FAST);
    const bits = await unlockWithPassword(header, PASSWORD);
    const changed = await changePassword(header, bits, 'another long password', { now: '2026-10-18T10:00:00.000Z' });
    expect(changed.salt).not.toBe(header.salt);
    expect(changed.wrappedByPassword).not.toBe(header.wrappedByPassword);
    expect(changed.wrappedByRecovery).toBe(header.wrappedByRecovery);
    expect(changed.recoverySalt).toBe(header.recoverySalt);
    expect(changed.passwordChangedAt).toBe('2026-10-18T10:00:00.000Z');
    expect(toBase64(await unlockWithPassword(changed, 'another long password'))).toBe(toBase64(dekBits));
    await expect(unlockWithPassword(changed, PASSWORD)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(toBase64(await unlockWithRecovery(changed, words))).toBe(toBase64(dekBits));
    await expect(changePassword(header, bits, 'short')).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
  });

  it('recovers with the words and sets a new password', async () => {
    const { header, dekBits, words } = await createKeys(PASSWORD, FAST);
    const bits = await unlockWithRecovery(header, words);
    const changed = await changePassword(header, bits, 'password after recovery');
    expect(toBase64(await unlockWithPassword(changed, 'password after recovery'))).toBe(toBase64(dekBits));
    const rotated = await rotateRecovery(changed, bits);
    expect(rotated.words).toHaveLength(24);
    expect(rotated.header.wrappedByPassword).toBe(changed.wrappedByPassword);
    expect(toBase64(await unlockWithRecovery(rotated.header, rotated.words))).toBe(toBase64(dekBits));
    await expect(unlockWithRecovery(rotated.header, words)).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' });
  });
});

describe('vault and keyrings', () => {
  it('keeps the key in the keyring and reloads it', async () => {
    const keyring = memoryKeyring();
    const vault = new Vault(keyring);
    expect(vault.locked).toBe(true);
    const bits = generateDekBits();
    await vault.unlock(bits);
    expect(vault.locked).toBe(false);
    expect(vault.keyStored).toBe(true);
    expect(await vault.holds(bits)).toBe(true);
    expect(await vault.holds(generateDekBits())).toBe(false);
    const again = new Vault(keyring);
    await again.load();
    expect(again.locked).toBe(false);
    await again.lock();
    expect(await keyring.load()).toBeNull();
  });

  it('reports a keyring that cannot keep the key', async () => {
    const vault = new Vault({ load: async () => null, save: async () => false, forget: async () => {} });
    await vault.unlock(generateDekBits());
    expect(vault.keyStored).toBe(false);
    expect(vault.locked).toBe(false);
  });

  it('the secrets keyring stores the bits through the transport', async () => {
    const stored = new Map();
    const secrets = { get: async (n) => stored.get(n) || null, set: async (n, v) => { stored.set(n, v); }, delete: async (n) => { stored.delete(n); } };
    const keyring = secretsKeyring(secrets);
    const bits = generateDekBits();
    const vault = new Vault(keyring);
    await vault.unlock(bits);
    expect(stored.get('dek')).toBe(toBase64(bits));
    const again = new Vault(keyring);
    await again.load();
    expect(await again.holds(bits)).toBe(true);
    await again.lock();
    expect(stored.size).toBe(0);
  });
});
