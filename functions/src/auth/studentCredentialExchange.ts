import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { type DocumentReference, type Firestore, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { classroomIdSchema, studentIdSchema, studentSafeIdentitySchema } from '@quiz-master/domain';

import {
  authThrottleKey,
  classCodeLookupKey,
  consumeDummyPinCheck,
  CredentialFormatError,
  normalizeStudentLogin,
  studentCredentialLookupKey,
  verifyStudentPin,
  type NormalizedStudentLogin,
  type StoredPinCredential,
} from './credentialCrypto.js';
import { studentPinPepper } from './authSecrets.js';
import {
  CLASS_CODE_INDEX,
  classCodeIndexSchema,
  STUDENT_AUTH_THROTTLES,
  STUDENT_CREDENTIALS,
  studentCredentialDocumentSchema,
} from './authStorage.js';
import {
  createThrottleState,
  recordAuthOutcome,
  reserveAuthAttempt,
  type AuthThrottleState,
} from './throttle.js';

const GENERIC_AUTH_MESSAGE = 'Unable to sign in with those credentials.';
const GENERIC_INTERNAL_MESSAGE = 'Unable to complete sign-in. Please try again.';
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';

const authThrottleStateSchema = z
  .object({
    windowStartedAtMs: z.number().int().nonnegative(),
    attemptsInWindow: z.number().int().nonnegative(),
    consecutiveFailures: z.number().int().nonnegative(),
    lockedUntilMs: z.number().int().nonnegative(),
    updatedAtMs: z.number().int().nonnegative(),
  })
  .strict();

const studentTokenClaimsSchema = z
  .object({
    role: z.literal('student'),
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    authVersion: z.number().int().positive(),
  })
  .strict();

const responseSchema = z.object({ customToken: z.string().min(1) }).strict();

class AuthenticationRejectedError extends Error {}

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);
const firebaseAuth = getAuth(app);

const throttleRefFor = (db: Firestore, key: string): DocumentReference =>
  db.collection(STUDENT_AUTH_THROTTLES).doc(key);

const readThrottleState = (data: unknown, nowMs: number): AuthThrottleState =>
  data === undefined ? createThrottleState(nowMs) : authThrottleStateSchema.parse(data);

const reserveAttemptTransaction = async (
  db: Firestore,
  key: string,
  nowMs: number,
): Promise<boolean> => {
  const throttleRef = throttleRefFor(db, key);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(throttleRef);
    const current = readThrottleState(snapshot.exists ? snapshot.data() : undefined, nowMs);
    const reservation = reserveAuthAttempt(current, nowMs);
    transaction.set(throttleRef, reservation.state);
    return reservation.allowed;
  });
};

const recordOutcomeTransaction = async (
  db: Firestore,
  throttleKey: string,
  succeeded: boolean,
  nowMs: number,
): Promise<void> => {
  const throttleRef = throttleRefFor(db, throttleKey);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(throttleRef);
    const current = readThrottleState(snapshot.exists ? snapshot.data() : undefined, nowMs);
    transaction.set(throttleRef, recordAuthOutcome(current, succeeded, nowMs));
  });
};

type LocatedCredential = Readonly<{
  classRef: DocumentReference;
  credentialRef: DocumentReference;
  studentRef: DocumentReference;
  credential: z.infer<typeof studentCredentialDocumentSchema>;
  pin: StoredPinCredential;
}>;

const locateCredential = async (
  db: Firestore,
  login: NormalizedStudentLogin,
): Promise<LocatedCredential | null> => {
  const classRef = db.collection(CLASS_CODE_INDEX).doc(classCodeLookupKey(login.classCode));
  const classSnapshot = await classRef.get();
  const classIndex = classCodeIndexSchema.safeParse(classSnapshot.data());
  if (!classSnapshot.exists || !classIndex.success || classIndex.data.status !== 'active') {
    return null;
  }

  const credentialRef = db
    .collection(STUDENT_CREDENTIALS)
    .doc(studentCredentialLookupKey(classIndex.data.classroomId, login.studentHandle));
  const credentialSnapshot = await credentialRef.get();
  const credential = studentCredentialDocumentSchema.safeParse(credentialSnapshot.data());
  if (
    !credentialSnapshot.exists ||
    !credential.success ||
    credential.data.classroomId !== classIndex.data.classroomId ||
    credential.data.normalizedHandle !== login.studentHandle
  ) {
    return null;
  }

  const studentRef = db
    .collection('classrooms')
    .doc(classIndex.data.classroomId)
    .collection('students')
    .doc(credential.data.studentId);

  return Object.freeze({
    classRef,
    credentialRef,
    studentRef,
    credential: credential.data,
    pin: credential.data.pin,
  });
};

const finalizeSuccessfulAttempt = async (
  db: Firestore,
  throttleKey: string,
  located: LocatedCredential,
  nowMs: number,
): Promise<z.infer<typeof studentTokenClaimsSchema> | null> => {
  const throttleRef = throttleRefFor(db, throttleKey);

  return db.runTransaction(async (transaction) => {
    const [throttleSnapshot, classSnapshot, credentialSnapshot, studentSnapshot] =
      await Promise.all([
        transaction.get(throttleRef),
        transaction.get(located.classRef),
        transaction.get(located.credentialRef),
        transaction.get(located.studentRef),
      ]);

    const throttle = readThrottleState(
      throttleSnapshot.exists ? throttleSnapshot.data() : undefined,
      nowMs,
    );
    const classIndex = classCodeIndexSchema.safeParse(classSnapshot.data());
    const credential = studentCredentialDocumentSchema.safeParse(credentialSnapshot.data());
    const student = studentSafeIdentitySchema.safeParse(studentSnapshot.data());

    const isCurrent =
      classSnapshot.exists &&
      classIndex.success &&
      classIndex.data.status === 'active' &&
      credentialSnapshot.exists &&
      credential.success &&
      credential.data.status === 'active' &&
      credential.data.classroomId === located.credential.classroomId &&
      credential.data.studentId === located.credential.studentId &&
      credential.data.normalizedHandle === located.credential.normalizedHandle &&
      credential.data.pin.hashBase64 === located.credential.pin.hashBase64 &&
      credential.data.pin.saltBase64 === located.credential.pin.saltBase64 &&
      studentSnapshot.exists &&
      student.success &&
      student.data.status === 'active' &&
      student.data.id === credential.data.studentId &&
      student.data.classroomId === credential.data.classroomId;

    transaction.set(throttleRef, recordAuthOutcome(throttle, isCurrent, nowMs));
    if (!isCurrent || !student.success) {
      return null;
    }

    return studentTokenClaimsSchema.parse({
      role: 'student',
      classroomId: student.data.classroomId,
      studentId: student.data.id,
      authVersion: student.data.authVersion,
    });
  });
};

const authenticateStudent = async (
  data: unknown,
  pepper: string,
): Promise<z.infer<typeof responseSchema>> => {
  let login: NormalizedStudentLogin;
  try {
    login = normalizeStudentLogin(data);
  } catch (error) {
    if (error instanceof CredentialFormatError) {
      const rawPin =
        typeof data === 'object' && data !== null
          ? (data as Record<string, unknown>).pin
          : undefined;
      await consumeDummyPinCheck(rawPin, pepper);
      throw new AuthenticationRejectedError();
    }
    throw error;
  }

  const throttleKey = authThrottleKey(login.classCode, login.studentHandle);
  const reserved = await reserveAttemptTransaction(firestore, throttleKey, Date.now());
  if (!reserved) {
    await consumeDummyPinCheck(login.pin, pepper);
    throw new AuthenticationRejectedError();
  }

  const located = await locateCredential(firestore, login);
  if (located === null) {
    await consumeDummyPinCheck(login.pin, pepper);
    await recordOutcomeTransaction(firestore, throttleKey, false, Date.now());
    throw new AuthenticationRejectedError();
  }

  const pinMatches = await verifyStudentPin(login.pin, pepper, located.pin);
  if (!pinMatches || located.credential.status !== 'active') {
    await recordOutcomeTransaction(firestore, throttleKey, false, Date.now());
    throw new AuthenticationRejectedError();
  }

  const claims = await finalizeSuccessfulAttempt(firestore, throttleKey, located, Date.now());
  if (claims === null) {
    throw new AuthenticationRejectedError();
  }

  await firebaseAuth.setCustomUserClaims(claims.studentId, claims);
  const customToken = await firebaseAuth.createCustomToken(claims.studentId, claims);
  return responseSchema.parse({ customToken });
};

export const exchangeStudentCredentials = onCall(
  {
    consumeAppCheckToken: !IS_EMULATOR,
    enforceAppCheck: !IS_EMULATOR,
    maxInstances: 20,
    secrets: [studentPinPepper],
  },
  async (request) => {
    try {
      return await authenticateStudent(request.data, studentPinPepper.value());
    } catch (error) {
      if (error instanceof AuthenticationRejectedError) {
        throw new HttpsError('unauthenticated', GENERIC_AUTH_MESSAGE);
      }

      const errorCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'unknown';
      logger.error('Student credential exchange failed internally.', { errorCode });
      throw new HttpsError('internal', GENERIC_INTERNAL_MESSAGE);
    }
  },
);
