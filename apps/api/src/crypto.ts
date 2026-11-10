/**
 * Cryptography for JAD+ (docs/SECURITY.md C-AUTH-1, C-SES-1, C-PD-2), built only on Web Crypto.
 *
 * - Session tokens: 32 random bytes (256 bits); only SHA-256 of the token is stored.
 * - Blind indexes: HMAC-SHA-256 with INDEX_KEY and a purpose label, so the same email gives the same lookup
 *   value without the email being stored. Also used for sign-in code hashes and IP hashes, because a
 *   6-digit code or an IP address hashed without a secret key could be recovered by trying every value.
 * - Field encryption: AES-256-GCM with DATA_KEY, a fresh 12-byte IV per value, and the record and column
 *   as additional data, so a ciphertext copied to another row or column fails to decrypt.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Format version of encrypted fields, stored as the first byte so keys/algorithms can be rotated later. */
const FIELD_FORMAT_V1 = 1;
const IV_BYTES = 12;

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** D1 returns BLOB columns as number arrays or ArrayBuffers depending on the API; accept every form. */
export function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value) && value.every((n) => typeof n === 'number')) return Uint8Array.from(value);
  throw new TypeError('Expected binary column value');
}

/** A new session token (C-SES-1): 256 random bits, URL-safe. */
export function newToken(): string {
  return toBase64Url(randomBytes(32));
}

/** A random id for database rows (128 bits). */
export function newId(): string {
  return toBase64Url(randomBytes(16));
}

/** A uniformly random 6-digit code (C-AUTH-1). Rejection sampling avoids bias towards low numbers. */
export function newSignInCode(): string {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  for (;;) {
    const [n] = crypto.getRandomValues(new Uint32Array(1));
    if (n !== undefined && n < limit) return String(n % 1_000_000).padStart(6, '0');
  }
}

export async function sha256(text: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

/** Compares two byte strings in time independent of where they differ. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function decodeKey(base64: string, name: string): Uint8Array<ArrayBuffer> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  } catch {
    throw new Error(`${name} is not valid base64`);
  }
  if (bytes.length !== 32) throw new Error(`${name} must be 32 bytes`);
  return bytes;
}

/** The two keys, imported once per Worker instance. Raw key bytes never leave this module. */
export interface Keys {
  readonly index: CryptoKey;
  readonly data: CryptoKey;
}

export async function importKeys(indexKeyB64: string, dataKeyB64: string): Promise<Keys> {
  const [index, data] = await Promise.all([
    crypto.subtle.importKey(
      'raw',
      decodeKey(indexKeyB64, 'INDEX_KEY'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    ),
    crypto.subtle.importKey('raw', decodeKey(dataKeyB64, 'DATA_KEY'), 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]),
  ]);
  return { index, data };
}

/** Purposes keep blind indexes for different things apart (the same input never gives the same value). */
export type IndexPurpose = 'email' | 'phone' | 'ip' | 'sign_in_code' | 'csrf';

export async function blindIndex(
  keys: Keys,
  purpose: IndexPurpose,
  value: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const mac = await crypto.subtle.sign('HMAC', keys.index, encoder.encode(`${purpose}\u0000${value}`));
  return new Uint8Array(mac);
}

/** Encrypts one personal-data field. `context` names the row and column, e.g. "users.email:<id>". */
export async function encryptField(
  keys: Keys,
  plaintext: string,
  context: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = randomBytes(IV_BYTES);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
      keys.data,
      encoder.encode(plaintext),
    ),
  );
  const out = new Uint8Array(1 + IV_BYTES + sealed.length);
  out[0] = FIELD_FORMAT_V1;
  out.set(iv, 1);
  out.set(sealed, 1 + IV_BYTES);
  return out;
}

/** Decrypts a field written by encryptField; throws if the data, key or context do not match. */
export async function decryptField(keys: Keys, stored: Uint8Array, context: string): Promise<string> {
  if (stored[0] !== FIELD_FORMAT_V1 || stored.length <= 1 + IV_BYTES) {
    throw new Error('Unknown encrypted field format');
  }
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: stored.slice(1, 1 + IV_BYTES),
      additionalData: encoder.encode(context),
    },
    keys.data,
    stored.slice(1 + IV_BYTES),
  );
  return decoder.decode(plain);
}
