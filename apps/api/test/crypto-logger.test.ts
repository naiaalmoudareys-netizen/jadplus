/** C-PD-2 field encryption, C-AUTH-1 code generation, C-LOG-1 redaction. */
import { describe, expect, it } from 'vitest';
import {
  blindIndex,
  constantTimeEqual,
  decryptField,
  encryptField,
  importKeys,
  newSignInCode,
  newToken,
  toBytes,
} from '../src/crypto.js';
import { REDACTED, createLogger, redact } from '../src/logger.js';
import { TEST_DATA_KEY, TEST_INDEX_KEY } from './harness.js';

const keys = () => importKeys(TEST_INDEX_KEY, TEST_DATA_KEY);

describe('crypto', () => {
  it('C-PD-2: a field decrypts only with the same key and the same row/column context', async () => {
    const k = await keys();
    const sealed = await encryptField(k, '+971 50 000 0000', 'users.phone:u-1');
    expect(await decryptField(k, sealed, 'users.phone:u-1')).toBe('+971 50 000 0000');
    await expect(decryptField(k, sealed, 'users.phone:u-2')).rejects.toThrow();
    const other = await importKeys(TEST_INDEX_KEY, btoa('x'.repeat(32)));
    await expect(decryptField(other, sealed, 'users.phone:u-1')).rejects.toThrow();
  });

  it('C-PD-2: encrypting the same value twice gives different ciphertexts (fresh IV every time)', async () => {
    const k = await keys();
    const a = await encryptField(k, 'demo@jadplus.ae', 'ctx');
    const b = await encryptField(k, 'demo@jadplus.ae', 'ctx');
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('C-PD-2: blind indexes are stable per purpose and differ between purposes', async () => {
    const k = await keys();
    const email1 = await blindIndex(k, 'email', 'demo@jadplus.ae');
    const email2 = await blindIndex(k, 'email', 'demo@jadplus.ae');
    const phone = await blindIndex(k, 'phone', 'demo@jadplus.ae');
    expect(constantTimeEqual(email1, email2)).toBe(true);
    expect(constantTimeEqual(email1, phone)).toBe(false);
  });

  it('refuses keys that are not 32 bytes of base64', async () => {
    await expect(importKeys(btoa('short'), TEST_DATA_KEY)).rejects.toThrow(/32 bytes/);
    await expect(importKeys('%%%', TEST_DATA_KEY)).rejects.toThrow(/base64/);
  });

  it('C-AUTH-1: codes are 6 digits and spread over the whole range; tokens are 256-bit', () => {
    const codes = Array.from({ length: 2000 }, newSignInCode);
    expect(codes.every((c) => /^\d{6}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(1990);
    expect(codes.some((c) => c.startsWith('0'))).toBe(true);
    expect(codes.some((c) => c.startsWith('9'))).toBe(true);
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('reads binary columns in every form D1 returns them', () => {
    expect(Array.from(toBytes([1, 2]))).toEqual([1, 2]);
    expect(Array.from(toBytes(new Uint8Array([3]).buffer))).toEqual([3]);
    expect(() => toBytes('text')).toThrow();
  });
});

describe('redacting logger (C-LOG-1)', () => {
  it('C-LOG-1: removes emails, phone numbers and tokens from any text', () => {
    const out = redact(
      'Code for demo@jadplus.ae, mobile +971 50 000 0000, token abcdefghijklmnopqrstuvwxyz0123456789',
    );
    expect(out).toBe(`Code for ${REDACTED}, mobile ${REDACTED}, token ${REDACTED}`);
  });

  it('C-LOG-1: blanks fields whose names suggest personal data or secrets, at any depth', () => {
    const out = redact({
      requestId: '3f1c9a5e-1b2c-4d5e-8f90-123456789abc',
      user: {
        email: 'x',
        phoneNumber: 'y',
        fullName: 'Layla Haddad',
        authorization: 'Bearer z',
        code: '123456',
      },
      count: 3,
    });
    expect(out).toEqual({
      requestId: '3f1c9a5e-1b2c-4d5e-8f90-123456789abc',
      user: {
        email: REDACTED,
        phoneNumber: REDACTED,
        fullName: REDACTED,
        authorization: REDACTED,
        code: REDACTED,
      },
      count: 3,
    });
  });

  it('C-LOG-1: errors keep their type but lose personal data in the message', () => {
    const lines: string[] = [];
    createLogger({}, (l) => lines.push(l)).log('error', 'failed', {
      err: new TypeError('bad demo@jadplus.ae'),
    });
    const entry = JSON.parse(lines[0] ?? '{}') as { level: string; err: { error: string; message: string } };
    expect(entry.level).toBe('error');
    expect(entry.err).toEqual({ error: 'TypeError', message: `bad ${REDACTED}` });
  });
});
