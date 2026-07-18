import { z } from 'zod';

import { classroomIdSchema, studentIdSchema } from '@quiz-master/domain';

import { PIN_HASH_ALGORITHM } from './credentialCrypto.js';

export const CLASS_CODE_INDEX = 'classCodeIndex';
export const CLASSROOM_AUTH = 'classroomAuth';
export const STUDENT_CREDENTIALS = 'studentCredentials';
export const STUDENT_CREDENTIAL_POINTERS = 'studentCredentialPointers';
export const STUDENT_AUTH_THROTTLES = 'studentAuthThrottles';

export const classCodeIndexSchema = z
  .object({
    classroomId: classroomIdSchema,
    status: z.enum(['active', 'archived']),
  })
  .strict();

export const classroomAuthSchema = z
  .object({
    classCodeKey: z.string().length(64),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export const storedPinCredentialSchema = z
  .object({
    algorithm: z.literal(PIN_HASH_ALGORITHM),
    saltBase64: z.string().min(1).max(128),
    hashBase64: z.string().min(1).max(128),
  })
  .strict();

export const studentCredentialDocumentSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    normalizedHandle: z.string().min(3).max(32),
    status: z.enum(['active', 'disabled']),
    pin: storedPinCredentialSchema,
  })
  .strict();

export const studentCredentialPointerSchema = z
  .object({
    classroomId: classroomIdSchema,
    credentialKey: z.string().length(64),
  })
  .strict();
