import { randomInt } from 'node:crypto';

import { z } from 'zod';

import {
  classroomIdSchema,
  studentIdSchema,
  studentSafeIdentitySchema,
  teacherIdSchema,
  type StudentSafeIdentity,
  type TeacherId,
} from '@quiz-master/domain';

const CLASS_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CLASS_CODE_LENGTH = 8;
const PIN_RANGE = 1_000_000;

export type TeacherCallerAuth = Readonly<{
  uid: string;
  token: Readonly<Record<string, unknown>>;
}>;

export class TeacherAuthorizationError extends Error {
  constructor(readonly reason: 'unauthenticated' | 'provider-not-allowed') {
    super('Teacher authorization failed.');
    this.name = 'TeacherAuthorizationError';
  }
}

const providerFor = (token: Readonly<Record<string, unknown>>): string | null => {
  const firebase = token.firebase;
  if (typeof firebase !== 'object' || firebase === null || Array.isArray(firebase)) {
    return null;
  }
  const provider = (firebase as Record<string, unknown>).sign_in_provider;
  return typeof provider === 'string' ? provider : null;
};

export const requireTeacherPrincipal = (
  auth: TeacherCallerAuth | null | undefined,
  isEmulator: boolean,
): TeacherId => {
  if (auth === null || auth === undefined) {
    throw new TeacherAuthorizationError('unauthenticated');
  }

  const teacherId = teacherIdSchema.safeParse(auth.uid);
  if (!teacherId.success) {
    throw new TeacherAuthorizationError('unauthenticated');
  }

  const provider = providerFor(auth.token);
  const providerAllowed = provider === 'google.com' || (isEmulator && provider === 'anonymous');
  if (!providerAllowed) {
    throw new TeacherAuthorizationError('provider-not-allowed');
  }
  return teacherId.data;
};

export const teacherClaimNeedsRefresh = (token: Readonly<Record<string, unknown>>): boolean =>
  token.role !== 'teacher' ||
  'classroomId' in token ||
  'studentId' in token ||
  'authVersion' in token;

type RandomInt = (maxExclusive: number) => number;

export const generateClassCode = (nextInt: RandomInt = randomInt): string => {
  let compact = '';
  for (let index = 0; index < CLASS_CODE_LENGTH; index += 1) {
    const characterIndex = nextInt(CLASS_CODE_ALPHABET.length);
    if (
      !Number.isInteger(characterIndex) ||
      characterIndex < 0 ||
      characterIndex >= CLASS_CODE_ALPHABET.length
    ) {
      throw new Error('Class-code random source returned an invalid value.');
    }
    compact += CLASS_CODE_ALPHABET[characterIndex];
  }
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
};

export const generateStudentPin = (nextInt: RandomInt = randomInt): string => {
  const value = nextInt(PIN_RANGE);
  if (!Number.isInteger(value) || value < 0 || value >= PIN_RANGE) {
    throw new Error('PIN random source returned an invalid value.');
  }
  return value.toString().padStart(6, '0');
};

const emptyInputSchema = z.object({}).strict();

export const bootstrapTeacherInputSchema = emptyInputSchema;
export const createClassroomInputSchema = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();
export const classroomActionInputSchema = z.object({ classroomId: classroomIdSchema }).strict();
export const createStudentInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    displayName: z.string().trim().min(1).max(80),
    studentHandle: z
      .string()
      .max(128)
      .transform((value) => value.normalize('NFKC').trim().toLowerCase())
      .pipe(z.string().regex(/^[a-z0-9][a-z0-9_-]{2,31}$/)),
  })
  .strict();
export const studentActionInputSchema = z
  .object({ classroomId: classroomIdSchema, studentId: studentIdSchema })
  .strict();

export const disableStudentIdentity = (
  input: StudentSafeIdentity,
  nowMs: number,
): StudentSafeIdentity => {
  const student = studentSafeIdentitySchema.parse(input);
  if (student.status === 'disabled') {
    return student;
  }
  return studentSafeIdentitySchema.parse({
    ...student,
    status: 'disabled',
    authVersion: student.authVersion + 1,
    updatedAt: nowMs,
  });
};

export const resetStudentIdentityAuth = (
  input: StudentSafeIdentity,
  nowMs: number,
): StudentSafeIdentity => {
  const student = studentSafeIdentitySchema.parse(input);
  return studentSafeIdentitySchema.parse({
    ...student,
    status: 'active',
    authVersion: student.authVersion + 1,
    updatedAt: nowMs,
  });
};
