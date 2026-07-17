import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PIN_SALT_BYTES = 16;
const PIN_HASH_BYTES = 32;
const MIN_PEPPER_BYTES = 32;

const SCRYPT_OPTIONS = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});

export const PIN_HASH_ALGORITHM = 'scrypt-v1' as const;

export type NormalizedStudentLogin = Readonly<{
  classCode: string;
  studentHandle: string;
  pin: string;
}>;

export type StoredPinCredential = Readonly<{
  algorithm: typeof PIN_HASH_ALGORITHM;
  saltBase64: string;
  hashBase64: string;
}>;

export class CredentialFormatError extends Error {
  constructor() {
    super('Invalid student credential format.');
    this.name = 'CredentialFormatError';
  }
}

const requireString = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 128) {
    throw new CredentialFormatError();
  }
  return value;
};

export const normalizeClassCode = (value: unknown): string => {
  const normalized = requireString(value)
    .normalize('NFKC')
    .trim()
    .replace(/[\s-]+/g, '')
    .toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(normalized)) {
    throw new CredentialFormatError();
  }
  return normalized;
};

export const normalizeStudentHandle = (value: unknown): string => {
  const normalized = requireString(value).normalize('NFKC').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalized)) {
    throw new CredentialFormatError();
  }
  return normalized;
};

export const normalizePin = (value: unknown): string => {
  const normalized = requireString(value).normalize('NFKC').trim();
  if (!/^\d{4,12}$/.test(normalized)) {
    throw new CredentialFormatError();
  }
  return normalized;
};

export const normalizeStudentLogin = (input: unknown): NormalizedStudentLogin => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new CredentialFormatError();
  }

  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['classCode', 'studentHandle', 'pin'].includes(key))) {
    throw new CredentialFormatError();
  }

  return Object.freeze({
    classCode: normalizeClassCode(data.classCode),
    studentHandle: normalizeStudentHandle(data.studentHandle),
    pin: normalizePin(data.pin),
  });
};

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const classCodeLookupKey = (classCode: string): string =>
  sha256Hex(`class-code\0${classCode}`);

export const studentCredentialLookupKey = (classroomId: string, studentHandle: string): string =>
  sha256Hex(`student-credential\0${classroomId}\0${studentHandle}`);

export const authThrottleKey = (classCode: string, studentHandle: string): string =>
  sha256Hex(`student-auth-throttle\0${classCode}\0${studentHandle}`);

const assertPepper = (pepper: string): void => {
  if (Buffer.byteLength(pepper, 'utf8') < MIN_PEPPER_BYTES) {
    throw new Error('STUDENT_PIN_PEPPER must contain at least 32 bytes.');
  }
};

const decodeCanonicalBase64 = (value: string, expectedBytes: number): Buffer | null => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === expectedBytes && decoded.toString('base64') === value ? decoded : null;
};

const derivePinKey = async (pin: string, pepper: string, salt: Buffer): Promise<Buffer> => {
  assertPepper(pepper);
  const pinMaterial = createHmac('sha256', pepper).update(pin, 'utf8').digest();

  return new Promise((resolve, reject) => {
    scrypt(pinMaterial, salt, PIN_HASH_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
};

export const hashStudentPin = async (
  pin: string,
  pepper: string,
  salt: Buffer = randomBytes(PIN_SALT_BYTES),
): Promise<StoredPinCredential> => {
  const normalizedPin = normalizePin(pin);
  if (salt.length !== PIN_SALT_BYTES) {
    throw new Error(`Student PIN salts must be ${PIN_SALT_BYTES} bytes.`);
  }
  const derivedKey = await derivePinKey(normalizedPin, pepper, salt);
  return Object.freeze({
    algorithm: PIN_HASH_ALGORITHM,
    saltBase64: salt.toString('base64'),
    hashBase64: derivedKey.toString('base64'),
  });
};

export const verifyStudentPin = async (
  pin: string,
  pepper: string,
  credential: StoredPinCredential,
): Promise<boolean> => {
  const normalizedPin = normalizePin(pin);
  const decodedSalt = decodeCanonicalBase64(credential.saltBase64, PIN_SALT_BYTES);
  const decodedHash = decodeCanonicalBase64(credential.hashBase64, PIN_HASH_BYTES);
  const salt = decodedSalt ?? Buffer.alloc(PIN_SALT_BYTES);
  const expectedHash = decodedHash ?? Buffer.alloc(PIN_HASH_BYTES);
  const derivedKey = await derivePinKey(normalizedPin, pepper, salt);

  return credential.algorithm === PIN_HASH_ALGORITHM && decodedSalt !== null && decodedHash !== null
    ? timingSafeEqual(derivedKey, expectedHash)
    : false;
};

export const consumeDummyPinCheck = async (pin: unknown, pepper: string): Promise<void> => {
  let normalizedPin = '000000';
  try {
    normalizedPin = normalizePin(pin);
  } catch {
    // The fixed fallback keeps malformed requests on the same scrypt work path.
  }
  const derivedKey = await derivePinKey(normalizedPin, pepper, Buffer.alloc(PIN_SALT_BYTES));
  timingSafeEqual(derivedKey, Buffer.alloc(PIN_HASH_BYTES));
};
