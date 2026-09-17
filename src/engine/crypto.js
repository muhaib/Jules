// Local-only security layer. SmartBudget's MVP has no server: all data
// lives on-device (see README "Architecture & privacy"). To still satisfy
// "secure authentication" / "encrypted data" in that context, an optional
// PIN lock derives an AES-GCM key (via PBKDF2) that encrypts the entire
// app-state blob at rest in localStorage. Without a PIN, data is simply
// stored locally and never transmitted anywhere.

const PBKDF2_ITERATIONS = 150000;

function getSubtle() {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('Web Crypto API is not available in this environment.');
  return subtle;
}

export function randomBytes(length) {
  const arr = new Uint8Array(length);
  globalThis.crypto.getRandomValues(arr);
  return arr;
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function deriveKeyFromPin(pin, saltBase64) {
  return deriveKey(pin, base64ToBytes(saltBase64));
}

export async function encryptWithKey(plaintext, key) {
  const subtle = getSubtle();
  const iv = randomBytes(12);
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { v: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptWithKey(envelope, key) {
  const subtle = getSubtle();
  const iv = base64ToBytes(envelope.iv);
  const plainBuffer = await subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(envelope.data));
  return new TextDecoder().decode(plainBuffer);
}

async function deriveKey(pin, saltBytes) {
  const subtle = getSubtle();
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a plaintext string with a PIN. Returns a self-contained envelope. */
export async function encryptWithPin(plaintext, pin) {
  const subtle = getSubtle();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(pin, salt);
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return {
    v: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/** Decrypt an envelope produced by encryptWithPin. Throws on wrong PIN. */
export async function decryptWithPin(envelope, pin) {
  const subtle = getSubtle();
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const key = await deriveKey(pin, salt);
  const plainBuffer = await subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(envelope.data));
  return new TextDecoder().decode(plainBuffer);
}

/** One-way hash of a PIN, used only to verify a re-entered PIN quickly
 * without touching the encrypted blob (e.g. to show "wrong PIN" fast). */
export async function hashPin(pin, saltBase64) {
  const subtle = getSubtle();
  const salt = saltBase64 ? base64ToBytes(saltBase64) : randomBytes(16);
  const keyMaterial = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, keyMaterial, 256);
  return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(salt) };
}
