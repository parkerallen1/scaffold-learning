import { describe, expect, it } from 'vitest';

import {
  PIN_HASH_ALGORITHM,
  authThrottleKey,
  classCodeLookupKey,
  hashStudentPin,
  normalizeStudentLogin,
  studentCredentialLookupKey,
  verifyStudentPin,
} from './credentialCrypto.js';

const TEST_PEPPER = 'test-only-pepper-with-at-least-32-bytes';
const TEST_SALT = Buffer.from('00112233445566778899aabbccddeeff', 'hex');

describe('student credential normalization', () => {
  it('normalizes equivalent printable identifiers deterministically', () => {
    expect(
      normalizeStudentLogin({
        classCode: ' ab-c 123 ',
        studentHandle: ' Student_07 ',
        pin: ' １２３４５６ ',
      }),
    ).toEqual({ classCode: 'ABC123', studentHandle: 'student_07', pin: '123456' });
  });

  it('rejects unknown fields and invalid identifier shapes', () => {
    expect(() =>
      normalizeStudentLogin({
        classCode: 'ABC123',
        studentHandle: 'student_07',
        pin: '123456',
        displayName: 'Do not accept extra data',
      }),
    ).toThrow();
    expect(() =>
      normalizeStudentLogin({ classCode: 'ABC123', studentHandle: '../student', pin: '123456' }),
    ).toThrow();
  });

  it('creates opaque, domain-separated lookup keys', () => {
    const classKey = classCodeLookupKey('ABC123');
    const credentialKey = studentCredentialLookupKey('class_demo_01', 'student_07');
    const throttleKey = authThrottleKey('ABC123', 'student_07');

    expect(classKey).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set([classKey, credentialKey, throttleKey])).toHaveLength(3);
    expect(credentialKey).not.toContain('student_07');
  });
});

describe('student PIN hashing', () => {
  it('derives a deterministic scrypt verifier for a supplied salt', async () => {
    const first = await hashStudentPin('123456', TEST_PEPPER, TEST_SALT);
    const second = await hashStudentPin('123456', TEST_PEPPER, TEST_SALT);

    expect(first).toEqual(second);
    expect(first.algorithm).toBe(PIN_HASH_ALGORITHM);
    await expect(verifyStudentPin('123456', TEST_PEPPER, first)).resolves.toBe(true);
    await expect(verifyStudentPin('654321', TEST_PEPPER, first)).resolves.toBe(false);
  });

  it('rejects malformed stored verifiers without throwing', async () => {
    await expect(
      verifyStudentPin('123456', TEST_PEPPER, {
        algorithm: PIN_HASH_ALGORITHM,
        saltBase64: 'not-base64',
        hashBase64: 'also-not-base64',
      }),
    ).resolves.toBe(false);
  });

  it('requires a high-entropy server pepper', async () => {
    await expect(hashStudentPin('123456', 'too-short', TEST_SALT)).rejects.toThrow(
      'STUDENT_PIN_PEPPER must contain at least 32 bytes.',
    );
  });
});
