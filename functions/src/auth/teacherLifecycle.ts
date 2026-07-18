import { getApps, initializeApp } from 'firebase-admin/app';
import { type Auth, getAuth } from 'firebase-admin/auth';
import {
  type DocumentReference,
  type DocumentSnapshot,
  getFirestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z, type ZodType } from 'zod';

import {
  classroomIdSchema,
  classroomSchema,
  studentIdSchema,
  studentSafeIdentitySchema,
  teacherIdSchema,
  type Classroom,
  type StudentSafeIdentity,
  type TeacherId,
} from '@quiz-master/domain';

import { studentPinPepper } from './authSecrets.js';
import {
  CLASS_CODE_INDEX,
  CLASSROOM_AUTH,
  classCodeIndexSchema,
  classroomAuthSchema,
  STUDENT_CREDENTIAL_POINTERS,
  STUDENT_CREDENTIALS,
  studentCredentialDocumentSchema,
  studentCredentialPointerSchema,
} from './authStorage.js';
import {
  classCodeLookupKey,
  hashStudentPin,
  normalizeClassCode,
  studentCredentialLookupKey,
} from './credentialCrypto.js';
import {
  bootstrapTeacherInputSchema,
  classroomActionInputSchema,
  createClassroomInputSchema,
  createStudentInputSchema,
  disableStudentIdentity,
  generateClassCode,
  generateStudentPin,
  requireTeacherPrincipal,
  resetStudentIdentityAuth,
  StudentLifecycleError,
  studentActionInputSchema,
  teacherClaimNeedsRefresh,
  TeacherAuthorizationError,
  type TeacherCallerAuth,
} from './teacherLifecycleCore.js';

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const MAX_CODE_GENERATION_ATTEMPTS = 5;

export const teacherCallableOptions = Object.freeze({
  consumeAppCheckToken: !IS_EMULATOR,
  enforceAppCheck: !IS_EMULATOR,
  maxInstances: 20,
});

const teacherDocumentSchema = z
  .object({
    id: teacherIdSchema,
    status: z.literal('active'),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export class LifecycleNotFoundError extends Error {}
export class LifecycleOwnershipError extends Error {}
class LifecycleConflictError extends Error {}
export class LifecycleStateError extends Error {}
class ClassCodeCollisionError extends Error {}
export class StoredDataError extends Error {}

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);
const firebaseAuth = getAuth(app);

const callableAuth = (request: CallableRequest<unknown>): TeacherCallerAuth | undefined =>
  request.auth === undefined
    ? undefined
    : Object.freeze({ uid: request.auth.uid, token: request.auth.token });

const errorCodeForLog = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'unknown';
};

const translateLifecycleError = (operation: string, error: unknown): never => {
  if (error instanceof HttpsError) {
    throw error;
  }
  if (error instanceof TeacherAuthorizationError) {
    throw error.reason === 'unauthenticated'
      ? new HttpsError('unauthenticated', 'Sign in to continue.')
      : new HttpsError('permission-denied', 'Use a permitted teacher sign-in method.');
  }
  if (error instanceof z.ZodError) {
    throw new HttpsError('invalid-argument', 'The request is invalid.');
  }
  if (error instanceof LifecycleOwnershipError) {
    throw new HttpsError('permission-denied', 'You do not have access to that resource.');
  }
  if (error instanceof LifecycleNotFoundError) {
    throw new HttpsError('not-found', 'The requested resource was not found.');
  }
  if (error instanceof LifecycleConflictError) {
    throw new HttpsError('already-exists', 'That identifier is already in use.');
  }
  if (error instanceof LifecycleStateError || error instanceof StudentLifecycleError) {
    throw new HttpsError('failed-precondition', 'That action is not available right now.');
  }

  logger.error('Teacher lifecycle operation failed internally.', {
    operation,
    errorCode: errorCodeForLog(error),
  });
  throw new HttpsError('internal', 'Unable to complete that action. Please try again.');
};

const ensureTeacherClaim = async (
  authService: Auth,
  teacherId: TeacherId,
  requestToken: Readonly<Record<string, unknown>>,
): Promise<boolean> => {
  const user = await authService.getUser(teacherId);
  const storedClaims = user.customClaims ?? {};
  const storedClaimsNeedRefresh = teacherClaimNeedsRefresh(storedClaims);
  if (storedClaimsNeedRefresh) {
    // This app owns its custom-claim namespace. Replacing student-scoped claims avoids
    // accidentally creating a principal that is both a teacher and a student.
    await authService.setCustomUserClaims(teacherId, { role: 'teacher' });
  }
  return storedClaimsNeedRefresh || teacherClaimNeedsRefresh(requestToken);
};

const requireActiveTeacherRecord = async (teacherId: TeacherId): Promise<void> => {
  const snapshot = await firestore.collection('teachers').doc(teacherId).get();
  const teacher = teacherDocumentSchema.safeParse(snapshot.data());
  if (!snapshot.exists || !teacher.success || teacher.data.id !== teacherId) {
    throw new LifecycleStateError();
  }
};

export const executeTeacherOperation = async <Input, Result extends Record<string, unknown>>(
  operation: string,
  request: CallableRequest<unknown>,
  inputSchema: ZodType<Input>,
  handler: (teacherId: TeacherId, input: Input) => Promise<Result>,
  options: Readonly<{ bootstrap?: boolean }> = {},
): Promise<Result & { claimsRefreshRequired: boolean }> => {
  try {
    const auth = callableAuth(request);
    const teacherId = requireTeacherPrincipal(auth, IS_EMULATOR);
    const input = inputSchema.parse(request.data);
    if (!options.bootstrap) {
      await requireActiveTeacherRecord(teacherId);
    }
    const result = options.bootstrap ? await handler(teacherId, input) : undefined;
    const claimsRefreshRequired = await ensureTeacherClaim(
      firebaseAuth,
      teacherId,
      auth?.token ?? {},
    );
    return {
      ...(result ?? (await handler(teacherId, input))),
      claimsRefreshRequired,
    };
  } catch (error) {
    return translateLifecycleError(operation, error);
  }
};

const parseStoredClassroom = (snapshot: DocumentSnapshot): Classroom => {
  if (!snapshot.exists) {
    throw new LifecycleNotFoundError();
  }
  const parsed = classroomSchema.safeParse(snapshot.data());
  if (!parsed.success) {
    throw new StoredDataError();
  }
  return parsed.data;
};

export const requireOwnedClassroom = (
  snapshot: DocumentSnapshot,
  teacherId: TeacherId,
  requireActive = false,
): Classroom => {
  const classroom = parseStoredClassroom(snapshot);
  if (classroom.teacherId !== teacherId) {
    throw new LifecycleOwnershipError();
  }
  if (requireActive && classroom.status !== 'active') {
    throw new LifecycleStateError();
  }
  return classroom;
};

const parseStoredStudent = (snapshot: DocumentSnapshot): StudentSafeIdentity => {
  if (!snapshot.exists) {
    throw new LifecycleNotFoundError();
  }
  const parsed = studentSafeIdentitySchema.safeParse(snapshot.data());
  if (!parsed.success) {
    throw new StoredDataError();
  }
  return parsed.data;
};

const bootstrapTeacherRecord = async (teacherId: TeacherId, nowMs: number): Promise<void> => {
  const teacherRef = firestore.collection('teachers').doc(teacherId);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(teacherRef);
    if (!snapshot.exists) {
      transaction.create(
        teacherRef,
        teacherDocumentSchema.parse({
          id: teacherId,
          status: 'active',
          createdAt: nowMs,
          updatedAt: nowMs,
        }),
      );
      return;
    }
    const teacher = teacherDocumentSchema.safeParse(snapshot.data());
    if (!teacher.success || teacher.data.id !== teacherId) {
      throw new StoredDataError();
    }
    transaction.set(teacherRef, { ...teacher.data, updatedAt: nowMs });
  });
};

const createClassroomRecord = async (
  teacherId: TeacherId,
  name: string,
  nowMs: number,
): Promise<{ classroom: Classroom; classCode: string }> => {
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const classCode = generateClassCode();
    const normalizedCode = normalizeClassCode(classCode);
    const classCodeKey = classCodeLookupKey(normalizedCode);
    const classroomRef = firestore.collection('classrooms').doc();
    const classroomId = classroomIdSchema.parse(classroomRef.id);
    const classCodeRef = firestore.collection(CLASS_CODE_INDEX).doc(classCodeKey);
    const classroomAuthRef = firestore.collection(CLASSROOM_AUTH).doc(classroomId);
    const classroom = classroomSchema.parse({
      id: classroomId,
      teacherId,
      name,
      status: 'active',
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    try {
      await firestore.runTransaction(async (transaction) => {
        const codeSnapshot = await transaction.get(classCodeRef);
        if (codeSnapshot.exists) {
          throw new ClassCodeCollisionError();
        }
        transaction.create(classroomRef, classroom);
        transaction.create(classCodeRef, { classroomId, status: 'active' });
        transaction.create(classroomAuthRef, { classCodeKey, updatedAt: nowMs });
      });
      return { classroom, classCode };
    } catch (error) {
      if (!(error instanceof ClassCodeCollisionError)) {
        throw error;
      }
    }
  }
  throw new Error('Unable to allocate a unique class code.');
};

const archiveClassroomRecord = async (
  teacherId: TeacherId,
  classroomId: string,
  nowMs: number,
): Promise<Classroom> => {
  const classroomRef = firestore.collection('classrooms').doc(classroomId);
  const classroomAuthRef = firestore.collection(CLASSROOM_AUTH).doc(classroomId);

  return firestore.runTransaction(async (transaction) => {
    const [classroomSnapshot, authSnapshot] = await Promise.all([
      transaction.get(classroomRef),
      transaction.get(classroomAuthRef),
    ]);
    const classroom = requireOwnedClassroom(classroomSnapshot, teacherId);
    const classAuth = classroomAuthSchema.safeParse(authSnapshot.data());
    if (!authSnapshot.exists || !classAuth.success) {
      throw new StoredDataError();
    }
    const classCodeRef = firestore.collection(CLASS_CODE_INDEX).doc(classAuth.data.classCodeKey);
    const classCodeSnapshot = await transaction.get(classCodeRef);
    const classCodeIndex = classCodeIndexSchema.safeParse(classCodeSnapshot.data());
    if (
      !classCodeSnapshot.exists ||
      !classCodeIndex.success ||
      classCodeIndex.data.classroomId !== classroom.id ||
      classCodeIndex.data.status !== classroom.status
    ) {
      throw new StoredDataError();
    }
    const archived = classroomSchema.parse({
      ...classroom,
      status: 'archived',
      updatedAt: classroom.status === 'archived' ? classroom.updatedAt : nowMs,
    });
    transaction.set(classroomRef, archived);
    transaction.set(classCodeRef, { classroomId: classroom.id, status: 'archived' });
    return archived;
  });
};

const rotateClassCodeRecord = async (
  teacherId: TeacherId,
  classroomId: string,
  nowMs: number,
): Promise<string> => {
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const classCode = generateClassCode();
    const newCodeKey = classCodeLookupKey(normalizeClassCode(classCode));
    const classroomRef = firestore.collection('classrooms').doc(classroomId);
    const classroomAuthRef = firestore.collection(CLASSROOM_AUTH).doc(classroomId);
    const newCodeRef = firestore.collection(CLASS_CODE_INDEX).doc(newCodeKey);

    try {
      await firestore.runTransaction(async (transaction) => {
        const [classroomSnapshot, authSnapshot, newCodeSnapshot] = await Promise.all([
          transaction.get(classroomRef),
          transaction.get(classroomAuthRef),
          transaction.get(newCodeRef),
        ]);
        const classroom = requireOwnedClassroom(classroomSnapshot, teacherId, true);
        const classAuth = classroomAuthSchema.safeParse(authSnapshot.data());
        if (!authSnapshot.exists || !classAuth.success) {
          throw new StoredDataError();
        }
        if (newCodeSnapshot.exists) {
          throw new ClassCodeCollisionError();
        }
        const oldCodeRef = firestore.collection(CLASS_CODE_INDEX).doc(classAuth.data.classCodeKey);
        const oldCodeSnapshot = await transaction.get(oldCodeRef);
        const oldCodeIndex = classCodeIndexSchema.safeParse(oldCodeSnapshot.data());
        if (
          !oldCodeSnapshot.exists ||
          !oldCodeIndex.success ||
          oldCodeIndex.data.classroomId !== classroom.id ||
          oldCodeIndex.data.status !== 'active'
        ) {
          throw new StoredDataError();
        }
        transaction.set(oldCodeRef, { classroomId: classroom.id, status: 'archived' });
        transaction.create(newCodeRef, { classroomId: classroom.id, status: 'active' });
        transaction.set(classroomAuthRef, { classCodeKey: newCodeKey, updatedAt: nowMs });
      });
      return classCode;
    } catch (error) {
      if (!(error instanceof ClassCodeCollisionError)) {
        throw error;
      }
    }
  }
  throw new Error('Unable to allocate a unique class code.');
};

const createStudentRecord = async (
  teacherId: TeacherId,
  input: z.infer<typeof createStudentInputSchema>,
  pepper: string,
  nowMs: number,
): Promise<{ student: StudentSafeIdentity; studentHandle: string; oneTimePin: string }> => {
  const studentRef = firestore
    .collection('classrooms')
    .doc(input.classroomId)
    .collection('students')
    .doc();
  const studentId = studentIdSchema.parse(studentRef.id);
  const credentialKey = studentCredentialLookupKey(input.classroomId, input.studentHandle);
  const credentialRef = firestore.collection(STUDENT_CREDENTIALS).doc(credentialKey);
  const pointerRef = firestore.collection(STUDENT_CREDENTIAL_POINTERS).doc(studentId);
  const classroomRef = firestore.collection('classrooms').doc(input.classroomId);
  const oneTimePin = generateStudentPin();
  const pin = await hashStudentPin(oneTimePin, pepper);
  const student = studentSafeIdentitySchema.parse({
    id: studentId,
    classroomId: input.classroomId,
    displayName: input.displayName,
    status: 'active',
    authVersion: 1,
    createdAt: nowMs,
    updatedAt: nowMs,
  });

  await firestore.runTransaction(async (transaction) => {
    const [classroomSnapshot, credentialSnapshot] = await Promise.all([
      transaction.get(classroomRef),
      transaction.get(credentialRef),
    ]);
    requireOwnedClassroom(classroomSnapshot, teacherId, true);
    if (credentialSnapshot.exists) {
      throw new LifecycleConflictError();
    }
    transaction.create(studentRef, student);
    transaction.create(credentialRef, {
      classroomId: input.classroomId,
      studentId,
      normalizedHandle: input.studentHandle,
      status: 'active',
      pin,
    });
    transaction.create(pointerRef, { classroomId: input.classroomId, credentialKey });
  });

  return { student, studentHandle: input.studentHandle, oneTimePin };
};

type StudentCredentialContext = Readonly<{
  student: StudentSafeIdentity;
  credential: z.infer<typeof studentCredentialDocumentSchema>;
  credentialRef: DocumentReference;
  studentRef: DocumentReference;
}>;

const readStudentCredentialContext = async (
  transaction: Transaction,
  teacherId: TeacherId,
  classroomId: string,
  studentId: string,
): Promise<StudentCredentialContext> => {
  const classroomRef = firestore.collection('classrooms').doc(classroomId);
  const studentRef = classroomRef.collection('students').doc(studentId);
  const pointerRef = firestore.collection(STUDENT_CREDENTIAL_POINTERS).doc(studentId);
  const [classroomSnapshot, studentSnapshot, pointerSnapshot] = await Promise.all([
    transaction.get(classroomRef),
    transaction.get(studentRef),
    transaction.get(pointerRef),
  ]);
  requireOwnedClassroom(classroomSnapshot, teacherId, true);
  const student = parseStoredStudent(studentSnapshot);
  const pointer = studentCredentialPointerSchema.safeParse(pointerSnapshot.data());
  if (
    student.classroomId !== classroomId ||
    !pointerSnapshot.exists ||
    !pointer.success ||
    pointer.data.classroomId !== classroomId
  ) {
    throw new StoredDataError();
  }
  const credentialRef = firestore.collection(STUDENT_CREDENTIALS).doc(pointer.data.credentialKey);
  const credentialSnapshot = await transaction.get(credentialRef);
  const credential = studentCredentialDocumentSchema.safeParse(credentialSnapshot.data());
  if (
    !credentialSnapshot.exists ||
    !credential.success ||
    credential.data.classroomId !== classroomId ||
    credential.data.studentId !== studentId
  ) {
    throw new StoredDataError();
  }
  return { student, credential: credential.data, credentialRef, studentRef };
};

const revokeStudentTokens = async (authService: Auth, studentId: string): Promise<void> => {
  try {
    await authService.revokeRefreshTokens(studentId);
  } catch (error) {
    if (errorCodeForLog(error) !== 'auth/user-not-found') {
      throw error;
    }
  }
};

const disableStudentRecord = async (
  teacherId: TeacherId,
  classroomId: string,
  studentId: string,
  nowMs: number,
): Promise<StudentSafeIdentity> => {
  const student = await firestore.runTransaction(async (transaction) => {
    const context = await readStudentCredentialContext(
      transaction,
      teacherId,
      classroomId,
      studentId,
    );
    const disabled = disableStudentIdentity(context.student, nowMs);
    transaction.set(context.studentRef, disabled);
    transaction.set(context.credentialRef, { ...context.credential, status: 'disabled' });
    return disabled;
  });
  await revokeStudentTokens(firebaseAuth, studentId);
  return student;
};

const resetStudentPinRecord = async (
  teacherId: TeacherId,
  classroomId: string,
  studentId: string,
  pepper: string,
  nowMs: number,
): Promise<{ student: StudentSafeIdentity; oneTimePin: string }> => {
  const oneTimePin = generateStudentPin();
  const pin = await hashStudentPin(oneTimePin, pepper);
  const student = await firestore.runTransaction(async (transaction) => {
    const context = await readStudentCredentialContext(
      transaction,
      teacherId,
      classroomId,
      studentId,
    );
    const updated = resetStudentIdentityAuth(context.student, nowMs);
    transaction.set(context.studentRef, updated);
    transaction.set(context.credentialRef, { ...context.credential, status: 'active', pin });
    return updated;
  });
  await revokeStudentTokens(firebaseAuth, studentId);
  return { student, oneTimePin };
};

export const bootstrapTeacher = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'bootstrapTeacher',
    request,
    bootstrapTeacherInputSchema,
    async (teacherId) => {
      await bootstrapTeacherRecord(teacherId, Date.now());
      return { teacherId, role: 'teacher' as const };
    },
    { bootstrap: true },
  ),
);

export const createClassroom = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'createClassroom',
    request,
    createClassroomInputSchema,
    async (teacherId, input) => createClassroomRecord(teacherId, input.name, Date.now()),
  ),
);

export const archiveClassroom = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'archiveClassroom',
    request,
    classroomActionInputSchema,
    async (teacherId, input) => ({
      classroom: await archiveClassroomRecord(teacherId, input.classroomId, Date.now()),
    }),
  ),
);

export const rotateClassCode = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'rotateClassCode',
    request,
    classroomActionInputSchema,
    async (teacherId, input) => ({
      classroomId: input.classroomId,
      classCode: await rotateClassCodeRecord(teacherId, input.classroomId, Date.now()),
    }),
  ),
);

export const createStudent = onCall(
  { ...teacherCallableOptions, secrets: [studentPinPepper] },
  (request) =>
    executeTeacherOperation(
      'createStudent',
      request,
      createStudentInputSchema,
      (teacherId, input) =>
        createStudentRecord(teacherId, input, studentPinPepper.value(), Date.now()),
    ),
);

export const disableStudent = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'disableStudent',
    request,
    studentActionInputSchema,
    async (teacherId, input) => ({
      student: await disableStudentRecord(
        teacherId,
        input.classroomId,
        input.studentId,
        Date.now(),
      ),
    }),
  ),
);

export const resetStudentPin = onCall(
  { ...teacherCallableOptions, secrets: [studentPinPepper] },
  (request) =>
    executeTeacherOperation(
      'resetStudentPin',
      request,
      studentActionInputSchema,
      async (teacherId, input) => {
        const result = await resetStudentPinRecord(
          teacherId,
          input.classroomId,
          input.studentId,
          studentPinPepper.value(),
          Date.now(),
        );
        return result;
      },
    ),
);
