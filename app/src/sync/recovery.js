// The recovery key: 24 English words that encode 256 random bits plus an
// 8-bit checksum, the BIP-39 way (the word list is the BIP-39 English list,
// MIT licence, kept as data in wordlist-en.json). The phrase is the second
// secret the data key is wrapped with (keys.js): whoever has the words can
// open the workspace without the password.
//
// Words are matched case-insensitively and by their first four letters,
// which are unique in the list, so a typo in a word ending still resolves.
import WORDS from './wordlist-en.json';
import { randomBytes, sha256, cryptoError } from './crypto.js';

export const WORD_COUNT = 24;
const ENTROPY_BITS = 256;
const CHECKSUM_BITS = ENTROPY_BITS / 32;
const byPrefix = new Map(WORDS.map((w, i) => [w.slice(0, 4), i]));

function bitsOf(bytes) {
  return Array.from(bytes, b => b.toString(2).padStart(8, '0')).join('');
}

// 24 words from 32 random bytes (or the given ones, for tests).
export async function generateRecoveryWords(entropy = randomBytes(ENTROPY_BITS / 8)) {
  if (entropy.length !== ENTROPY_BITS / 8) throw cryptoError('BAD_ENTROPY');
  const checksum = bitsOf(await sha256(entropy)).slice(0, CHECKSUM_BITS);
  const bits = bitsOf(entropy) + checksum;
  const words = [];
  for (let i = 0; i < WORD_COUNT; i++) words.push(WORDS[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]);
  return words;
}

// Splits typed text into words: any whitespace, commas or numbering
// ("1. abandon") between them.
export function splitWords(text) {
  return String(text || '').toLowerCase().normalize('NFKC')
    .split(/[\s,;]+/).map(w => w.replace(/^\d+[.)]?/, '').trim()).filter(Boolean);
}

// The canonical words of a typed phrase, or null when a word is unknown.
export function normalizeWords(input) {
  const words = Array.isArray(input) ? input.map(w => String(w).toLowerCase().trim()) : splitWords(input);
  const out = [];
  for (const w of words) {
    const index = WORDS.indexOf(w) >= 0 ? WORDS.indexOf(w) : (w.length >= 4 ? byPrefix.get(w.slice(0, 4)) : undefined);
    if (index === undefined || index < 0) return null;
    out.push(WORDS[index]);
  }
  return out;
}

// Whether a phrase is a valid recovery key: 24 known words with a matching
// checksum. Returns the canonical words or null.
export async function validateRecoveryWords(input) {
  const words = normalizeWords(input);
  if (!words || words.length !== WORD_COUNT) return null;
  const bits = words.map(w => WORDS.indexOf(w).toString(2).padStart(11, '0')).join('');
  const entropy = new Uint8Array(ENTROPY_BITS / 8);
  for (let i = 0; i < entropy.length; i++) entropy[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const checksum = bitsOf(await sha256(entropy)).slice(0, CHECKSUM_BITS);
  return bits.slice(ENTROPY_BITS) === checksum ? words : null;
}

// The secret text a KEK is derived from: the words joined by one space.
export function recoverySecret(words) {
  return words.join(' ');
}

// Positions (0-based) of the words the user must type back to prove the
// key was written down: `count` distinct ones, in ascending order.
export function confirmationPositions(count = 3, random = randomBytes(count * 4)) {
  const picked = new Set();
  let i = 0;
  while (picked.size < count && i < random.length) {
    picked.add(random[i] % WORD_COUNT);
    i++;
  }
  // The random bytes are not enough only in theory; fill the gaps in order.
  for (let p = 0; picked.size < count; p++) picked.add(p);
  return Array.from(picked).sort((a, b) => a - b);
}

export function wordCount() {
  return WORDS.length;
}
