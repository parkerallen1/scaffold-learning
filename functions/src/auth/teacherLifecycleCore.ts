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
const STUDENT_HANDLE_MAX_LENGTH = 32;
export const BUILD_WEEK_STUDENT_PIN = '1234';

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

export const generateBuildWeekClassCode = (sequence: number): string => {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99) {
    throw new Error('Build Week class-code sequence must be between 1 and 99.');
  }
  return `DEMO-${sequence.toString().padStart(2, '0')}`;
};

export const generateStudentPin = (nextInt: RandomInt = randomInt): string => {
  const value = nextInt(PIN_RANGE);
  if (!Number.isInteger(value) || value < 0 || value >= PIN_RANGE) {
    throw new Error('PIN random source returned an invalid value.');
  }
  return value.toString().padStart(6, '0');
};

export const generateStudentHandle = (displayName: string, sequence = 1): string => {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new Error('Student-handle sequence must be between 1 and 999.');
  }
  const normalizedName = displayName
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '');
  const readableBase =
    normalizedName.length >= 3 ? normalizedName : `${normalizedName || 'student'}_student`;
  const suffix = sequence === 1 ? '' : `_${sequence}`;
  const truncatedBase = readableBase
    .slice(0, STUDENT_HANDLE_MAX_LENGTH - suffix.length)
    .replace(/[-_]+$/g, '');
  return `${truncatedBase}${suffix}`;
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
