import { getApps, initializeApp } from 'firebase-admin/app';
import {
  type DocumentReference,
  type DocumentSnapshot,
  getFirestore,
  type QuerySnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z, type ZodType } from 'zod';

import {
  assignmentAnswerKeySchema,
  assignmentTargetIdFor,
  assignmentTargetSchema,
  attemptEventSchema,
  classroomSchema,
  eventIdSchema,
  publicAssignmentSchema,
  publicQuestionSchema,
  sessionIdSchema,
  sessionStateSchema,
  studentSafeIdentitySchema,
  supportEventSchema,
  supportPlanVersionSchema,
  type AssignmentAnswerKey,
  type AssignmentTarget,
  type AttemptEvent,
  type Classroom,
  type PublicAssignment,
  type SessionState,
  type StudentSafeIdentity,
  type SupportEvent,
  type SupportPlanVersion,
} from '@quiz-master/domain';

import {
  advanceStudentSessionInputSchema,
  advanceStudentSessionState,
  assertMatchingIdempotencyRecord,
  assertSessionIdentity,
  attemptRequestFingerprint,
  buildAttemptEvent,
  buildSupportEvent,
  createStudentSession,
  idempotencyDocumentId,
  recordStudentSupportEventInputSchema,
  requireStudentClaims,
  sessionIdempotencyRecordSchema,
  sessionQuestionProgressSchema,
  sessionTargetPointerSchema,
  startOrResumeStudentSessionInputSchema,
  startOrResumeStudentSessionState,
  StudentSessionError,
  submitStudentAttemptInputSchema,
  supportRequestFingerprint,
  transitionStudentSessionInputSchema,
  transitionStudentSessionState,
  type RecordStudentSupportEventInput,
  type StudentSessionClaims,
  type SubmitStudentAttemptInput,
} from './studentSessionLifecycleCore.js';

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const callableOptions = Object.freeze({
  consumeAppCheckToken: !IS_EMULATOR,
  enforceAppCheck: !IS_EMULATOR,
  maxInstances: 30,
});

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

class StudentSessionNotFoundError extends Error {}
class StudentSessionStoredDataError extends Error {}

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

const translateStudentSessionError = (operation: string, error: unknown): never => {
  if (error instanceof HttpsError) throw error;
  if (error instanceof z.ZodError) {
    throw new HttpsError('invalid-argument', 'The request is invalid.');
  }
  if (error instanceof StudentSessionNotFoundError) {
    throw new HttpsError('not-found', 'The requested work was not found.');
  }
  if (error instanceof StudentSessionError) {
    if (error.reason === 'authorization-mismatch' || error.reason === 'identity-mismatch') {
      throw new HttpsError('permission-denied', 'You do not have access to that work.');
    }
    if (error.reason === 'idempotency-conflict') {
      throw new HttpsError('already-exists', 'That request identifier was already used.');
    }
    if (
      error.reason === 'question-not-assigned' ||
      error.reason === 'support-not-approved' ||
      error.reason === 'client-time-out-of-range'
    ) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }
    throw new HttpsError('failed-precondition', 'That action is not available right now.');
  }

  logger.error('Student session operation failed internally.', {
    operation,
    errorCode: errorCodeForLog(error),
  });
  throw new HttpsError('internal', 'Unable to save the work. Please try again.');
};

const claimsForRequest = (request: CallableRequest<unknown>): StudentSessionClaims => {
  if (request.auth === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  return requireStudentClaims(request.auth.uid, request.auth.token);
};

const executeStudentSessionOperation = async <Input, Result extends Record<string, unknown>>(
  operation: string,
  request: CallableRequest<unknown>,
  inputSchema: ZodType<Input>,
  handler: (claims: StudentSessionClaims, input: Input) => Promise<Result>,
): Promise<Result> => {
  try {
    const claims = claimsForRequest(request);
    const input = inputSchema.parse(request.data);
    return await handler(claims, input);
  } catch (error) {
    return translateStudentSessionError(operation, error);
  }
};

const parseClassroom = (snapshot: DocumentSnapshot): Classroom => {
  const classroom = classroomSchema.safeParse(snapshot.data());
  if (!snapshot.exists) throw new StudentSessionNotFoundError();
  if (!classroom.success || classroom.data.id !== snapshot.id) {
    throw new StudentSessionStoredDataError();
  }
  return classroom.data;
};

const parseStudent = (snapshot: DocumentSnapshot): StudentSafeIdentity => {
  const student = studentSafeIdentitySchema.safeParse(snapshot.data());
  if (!snapshot.exists) throw new StudentSessionNotFoundError();
  if (!student.success || student.data.id !== snapshot.id) {
    throw new StudentSessionStoredDataError();
  }
  return student.data;
};

const requireCurrentStudent = async (
  transaction: Transaction,
  claims: StudentSessionClaims,
): Promise<Readonly<{ classroom: Classroom; student: StudentSafeIdentity }>> => {
  const classroomRef = firestore.collection('classrooms').doc(claims.classroomId);
  const studentRef = classroomRef.collection('students').doc(claims.studentId);
  const [classroomSnapshot, studentSnapshot] = await Promise.all([
    transaction.get(classroomRef),
    transaction.get(studentRef),
  ]);
  const classroom = parseClassroom(classroomSnapshot);
  const student = parseStudent(studentSnapshot);
  if (
    classroom.status !== 'active' ||
    student.status !== 'active' ||
    student.classroomId !== classroom.id ||
    student.id !== claims.studentId ||
    student.authVersion !== claims.authVersion
  ) {
    throw new StudentSessionError('authorization-mismatch');
  }
  return Object.freeze({ classroom, student });
};

const parseTarget = (
  snapshot: DocumentSnapshot,
  claims: StudentSessionClaims,
): AssignmentTarget => {
  if (!snapshot.exists) throw new StudentSessionNotFoundError();
  const target = assignmentTargetSchema.safeParse(snapshot.data());
  if (!target.success || target.data.id !== snapshot.id) {
    throw new StudentSessionStoredDataError();
  }
  if (
    target.data.classroomId !== claims.classroomId ||
    target.data.studentId !== claims.studentId ||
    target.data.id !== assignmentTargetIdFor(target.data.assignmentId, target.data.studentId)
  ) {
    throw new StudentSessionError('identity-mismatch');
  }
  return target.data;
};

const requireSessionTarget = async (
  transaction: Transaction,
  classroomRef: DocumentReference,
  session: SessionState,
  claims: StudentSessionClaims,
): Promise<AssignmentTarget> => {
  const targetSnapshot = await transaction.get(
    classroomRef.collection('assignmentTargets').doc(session.targetId),
  );
  const target = parseTarget(targetSnapshot, claims);
  if (
    target.assignmentId !== session.assignmentId ||
    target.assignmentRevision !== session.assignmentRevision ||
    target.supportPlanId !== session.supportPlanId ||
    target.supportPlanVersion !== session.supportPlanVersion
  ) {
    throw new StudentSessionStoredDataError();
  }
  return target;
};

const parseSession = (snapshot: DocumentSnapshot, claims: StudentSessionClaims): SessionState => {
  if (!snapshot.exists) throw new StudentSessionNotFoundError();
  const session = sessionStateSchema.safeParse(snapshot.data());
  if (!session.success || session.data.id !== snapshot.id) {
    throw new StudentSessionStoredDataError();
  }
  return assertSessionIdentity(session.data, claims);
};

const parseAssignment = (snapshot: DocumentSnapshot): PublicAssignment => {
  if (!snapshot.exists) throw new StudentSessionNotFoundError();
  const assignment = publicAssignmentSchema.safeParse(snapshot.data());
  if (!assignment.success || assignment.data.id !== snapshot.id) {
    throw new StudentSessionStoredDataError();
  }
  return assignment.data;
};

const requirePublishedTargetAssignment = (
  assignment: PublicAssignment,
  target: AssignmentTarget,
): void => {
  if (
    assignment.status !== 'published' ||
    assignment.publishedAt === null ||
    assignment.id !== target.assignmentId ||
    assignment.classroomId !== target.classroomId ||
    assignment.revision !== target.assignmentRevision
  ) {
    throw new StudentSessionStoredDataError();
  }
};

const parseSupportPlan = (
  snapshot: DocumentSnapshot,
  sessionOrTarget: Pick<
    SessionState | AssignmentTarget,
    'supportPlanId' | 'supportPlanVersion' | 'classroomId' | 'studentId'
  >,
): SupportPlanVersion => {
  if (!snapshot.exists) throw new StudentSessionNotFoundError();
  const plan = supportPlanVersionSchema.safeParse(snapshot.data());
  if (!plan.success || plan.data.id !== snapshot.id) {
    throw new StudentSessionStoredDataError();
  }
  if (
    plan.data.id !== sessionOrTarget.supportPlanId ||
    plan.data.version !== sessionOrTarget.supportPlanVersion ||
    plan.data.classroomId !== sessionOrTarget.classroomId ||
    plan.data.studentId !== sessionOrTarget.studentId
  ) {
    throw new StudentSessionStoredDataError();
  }
  return plan.data;
};

const startOrResumeSessionRecord = async (
  claims: StudentSessionClaims,
  targetId: z.infer<typeof startOrResumeStudentSessionInputSchema>['targetId'],
  nowMs: number,
): Promise<{ session: SessionState; resumed: boolean }> => {
  const classroomRef = firestore.collection('classrooms').doc(claims.classroomId);
  const targetRef = classroomRef.collection('assignmentTargets').doc(targetId);
  const pointerRef = classroomRef.collection('sessionTargets').doc(targetId);

  return firestore.runTransaction(async (transaction) => {
    await requireCurrentStudent(transaction, claims);
    const [targetSnapshot, pointerSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(pointerRef),
    ]);
    const target = parseTarget(targetSnapshot, claims);

    if (pointerSnapshot.exists) {
      const pointer = sessionTargetPointerSchema.safeParse(pointerSnapshot.data());
      if (
        !pointer.success ||
        pointer.data.targetId !== target.id ||
        pointer.data.studentId !== claims.studentId
      ) {
        throw new StudentSessionStoredDataError();
      }
      const sessionRef = classroomRef.collection('sessions').doc(pointer.data.sessionId);
      const sessionSnapshot = await transaction.get(sessionRef);
      const existing = parseSession(sessionSnapshot, claims);
      if (
        existing.targetId !== target.id ||
        existing.assignmentId !== target.assignmentId ||
        existing.assignmentRevision !== target.assignmentRevision ||
        existing.supportPlanId !== target.supportPlanId ||
        existing.supportPlanVersion !== target.supportPlanVersion
      ) {
        throw new StudentSessionStoredDataError();
      }
      const assignmentRef = classroomRef.collection('assignments').doc(target.assignmentId);
      const planRef = firestore
        .collection('supportPlans')
        .doc(target.studentId)
        .collection('versions')
        .doc(target.supportPlanId);
      const [assignmentSnapshot, planSnapshot] = await Promise.all([
        transaction.get(assignmentRef),
        transaction.get(planRef),
      ]);
      requirePublishedTargetAssignment(parseAssignment(assignmentSnapshot), target);
      parseSupportPlan(planSnapshot, target);
      const session = startOrResumeStudentSessionState(existing, nowMs);
      if (session !== existing) transaction.set(sessionRef, session);
      return { session, resumed: true };
    }

    const assignmentRef = classroomRef.collection('assignments').doc(target.assignmentId);
    const planRef = firestore
      .collection('supportPlans')
      .doc(target.studentId)
      .collection('versions')
      .doc(target.supportPlanId);
    const firstQuestionQuery = assignmentRef.collection('questions').orderBy('order').limit(1);
    const [assignmentSnapshot, planSnapshot, questionSnapshot] = await Promise.all([
      transaction.get(assignmentRef),
      transaction.get(planRef),
      transaction.get(firstQuestionQuery),
    ]);
    const assignment = parseAssignment(assignmentSnapshot);
    parseSupportPlan(planSnapshot, target);
    const firstQuestionDocument = questionSnapshot.docs[0];
    const firstQuestion = publicQuestionSchema.safeParse(firstQuestionDocument?.data());
    if (
      !firstQuestionDocument ||
      !firstQuestion.success ||
      firstQuestion.data.id !== firstQuestionDocument.id ||
      firstQuestion.data.assignmentId !== assignment.id
    ) {
      throw new StudentSessionStoredDataError();
    }
    requirePublishedTargetAssignment(assignment, target);

    const sessionRef = classroomRef.collection('sessions').doc();
    const sessionId = sessionIdSchema.parse(sessionRef.id);
    const session = createStudentSession({
      sessionId,
      target,
      firstQuestionId: firstQuestion.data.id,
      nowMs,
    });
    transaction.create(sessionRef, session);
    transaction.create(
      pointerRef,
      sessionTargetPointerSchema.parse({
        targetId: target.id,
        sessionId,
        studentId: target.studentId,
        createdAt: nowMs,
      }),
    );
    return { session, resumed: false };
  });
};

const findAnswerKey = (snapshot: QuerySnapshot, session: SessionState): AssignmentAnswerKey => {
  if (snapshot.size !== 1) throw new StudentSessionStoredDataError();
  const answerKey = assignmentAnswerKeySchema.safeParse(snapshot.docs[0]?.data());
  if (
    !answerKey.success ||
    answerKey.data.assignmentId !== session.assignmentId ||
    answerKey.data.assignmentRevision !== session.assignmentRevision
  ) {
    throw new StudentSessionStoredDataError();
  }
  return answerKey.data;
};

const readPinnedPlan = async (
  transaction: Transaction,
  session: SessionState,
): Promise<SupportPlanVersion> => {
  const planSnapshot = await transaction.get(
    firestore
      .collection('supportPlans')
      .doc(session.studentId)
      .collection('versions')
      .doc(session.supportPlanId),
  );
  return parseSupportPlan(planSnapshot, session);
};

const submitAttemptRecord = async (
  claims: StudentSessionClaims,
  input: SubmitStudentAttemptInput,
  nowMs: number,
): Promise<{ session: SessionState; event: AttemptEvent; duplicate: boolean }> => {
  const classroomRef = firestore.collection('classrooms').doc(claims.classroomId);
  const sessionRef = classroomRef.collection('sessions').doc(input.sessionId);
  const eventRef = sessionRef.collection('attemptEvents').doc();
  const eventId = eventIdSchema.parse(eventRef.id);
  const fingerprint = attemptRequestFingerprint(input);
  const idempotencyRef = sessionRef
    .collection('idempotency')
    .doc(idempotencyDocumentId(input.idempotencyKey));

  return firestore.runTransaction(async (transaction) => {
    await requireCurrentStudent(transaction, claims);
    const [sessionSnapshot, idempotencySnapshot] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(idempotencyRef),
    ]);
    const session = parseSession(sessionSnapshot, claims);
    await requireSessionTarget(transaction, classroomRef, session, claims);

    if (idempotencySnapshot.exists) {
      const record = assertMatchingIdempotencyRecord(
        idempotencySnapshot.data(),
        'attempt',
        fingerprint,
      );
      const duplicateSnapshot = await transaction.get(
        sessionRef.collection('attemptEvents').doc(record.eventId),
      );
      const duplicate = attemptEventSchema.safeParse(duplicateSnapshot.data());
      if (
        !duplicateSnapshot.exists ||
        !duplicate.success ||
        duplicate.data.id !== duplicateSnapshot.id ||
        duplicate.data.sessionId !== session.id ||
        duplicate.data.idempotencyKey !== input.idempotencyKey
      ) {
        throw new StudentSessionStoredDataError();
      }
      return { session, event: duplicate.data, duplicate: true };
    }

    const assignmentRef = classroomRef.collection('assignments').doc(session.assignmentId);
    const answerKeyQuery = assignmentRef
      .collection('answerKeys')
      .where('assignmentRevision', '==', session.assignmentRevision)
      .limit(2);
    const progressRef = sessionRef.collection('questionProgress').doc(input.questionId);
    const [answerKeySnapshot, progressSnapshot, plan] = await Promise.all([
      transaction.get(answerKeyQuery),
      transaction.get(progressRef),
      readPinnedPlan(transaction, session),
    ]);
    const answerKey = findAnswerKey(answerKeySnapshot, session);
    const questionKey = answerKey.questionKeys.find((key) => key.questionId === input.questionId);
    if (questionKey === undefined) throw new StudentSessionError('question-not-assigned');
    const progress = progressSnapshot.exists
      ? sessionQuestionProgressSchema.safeParse(progressSnapshot.data())
      : undefined;
    if (
      progress !== undefined &&
      (!progress.success || progress.data.questionId !== input.questionId)
    ) {
      throw new StudentSessionStoredDataError();
    }
    const attemptNumber = (progress?.success ? progress.data.attemptCount : 0) + 1;
    const event = buildAttemptEvent({
      eventId,
      session,
      input,
      answerKey: questionKey,
      supportPlan: plan,
      attemptNumber,
      nowMs,
    });
    const updatedSession = sessionStateSchema.parse({ ...session, updatedAt: nowMs });

    transaction.create(eventRef, event);
    transaction.create(
      idempotencyRef,
      sessionIdempotencyRecordSchema.parse({
        kind: 'attempt',
        fingerprint,
        eventId,
        createdAt: nowMs,
      }),
    );
    transaction.set(
      progressRef,
      sessionQuestionProgressSchema.parse({
        questionId: input.questionId,
        attemptCount: attemptNumber,
        updatedAt: nowMs,
      }),
    );
    transaction.set(sessionRef, updatedSession);
    return { session: updatedSession, event, duplicate: false };
  });
};

const recordSupportEventRecord = async (
  claims: StudentSessionClaims,
  input: RecordStudentSupportEventInput,
  nowMs: number,
): Promise<{ session: SessionState; event: SupportEvent; duplicate: boolean }> => {
  const classroomRef = firestore.collection('classrooms').doc(claims.classroomId);
  const sessionRef = classroomRef.collection('sessions').doc(input.sessionId);
  const eventRef = sessionRef.collection('supportEvents').doc();
  const eventId = eventIdSchema.parse(eventRef.id);
  const fingerprint = supportRequestFingerprint(input);
  const idempotencyRef = sessionRef
    .collection('idempotency')
    .doc(idempotencyDocumentId(input.idempotencyKey));

  return firestore.runTransaction(async (transaction) => {
    await requireCurrentStudent(transaction, claims);
    const [sessionSnapshot, idempotencySnapshot] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(idempotencyRef),
    ]);
    const session = parseSession(sessionSnapshot, claims);
    await requireSessionTarget(transaction, classroomRef, session, claims);

    if (idempotencySnapshot.exists) {
      const record = assertMatchingIdempotencyRecord(
        idempotencySnapshot.data(),
        'support',
        fingerprint,
      );
      const duplicateSnapshot = await transaction.get(
        sessionRef.collection('supportEvents').doc(record.eventId),
      );
      const duplicate = supportEventSchema.safeParse(duplicateSnapshot.data());
      if (
        !duplicateSnapshot.exists ||
        !duplicate.success ||
        duplicate.data.id !== duplicateSnapshot.id ||
        duplicate.data.sessionId !== session.id ||
        duplicate.data.idempotencyKey !== input.idempotencyKey
      ) {
        throw new StudentSessionStoredDataError();
      }
      return { session, event: duplicate.data, duplicate: true };
    }

    const plan = await readPinnedPlan(transaction, session);
    const event = buildSupportEvent({ eventId, session, input, supportPlan: plan, nowMs });
    const updatedSession = sessionStateSchema.parse({ ...session, updatedAt: nowMs });
    transaction.create(eventRef, event);
    transaction.create(
      idempotencyRef,
      sessionIdempotencyRecordSchema.parse({
        kind: 'support',
        fingerprint,
        eventId,
        createdAt: nowMs,
      }),
    );
    transaction.set(sessionRef, updatedSession);
    return { session: updatedSession, event, duplicate: false };
  });
};

const transitionSessionRecord = async (
  claims: StudentSessionClaims,
  input: z.infer<typeof transitionStudentSessionInputSchema>,
  nowMs: number,
): Promise<{ session: SessionState }> => {
  const sessionRef = firestore
    .collection('classrooms')
    .doc(claims.classroomId)
    .collection('sessions')
    .doc(input.sessionId);
  return firestore.runTransaction(async (transaction) => {
    await requireCurrentStudent(transaction, claims);
    const snapshot = await transaction.get(sessionRef);
    const existing = parseSession(snapshot, claims);
    await requireSessionTarget(
      transaction,
      firestore.collection('classrooms').doc(claims.classroomId),
      existing,
      claims,
    );
    const session = transitionStudentSessionState(existing, input.action, nowMs);
    if (session !== existing) transaction.set(sessionRef, session);
    return { session };
  });
};

const advanceSessionRecord = async (
  claims: StudentSessionClaims,
  input: z.infer<typeof advanceStudentSessionInputSchema>,
  nowMs: number,
): Promise<{ session: SessionState }> => {
  const classroomRef = firestore.collection('classrooms').doc(claims.classroomId);
  const sessionRef = classroomRef.collection('sessions').doc(input.sessionId);
  return firestore.runTransaction(async (transaction) => {
    await requireCurrentStudent(transaction, claims);
    const sessionSnapshot = await transaction.get(sessionRef);
    const existing = parseSession(sessionSnapshot, claims);
    await requireSessionTarget(transaction, classroomRef, existing, claims);
    if (existing.currentQuestionId !== input.currentQuestionId) {
      throw new StudentSessionError('question-not-assigned');
    }

    const questionsRef = classroomRef
      .collection('assignments')
      .doc(existing.assignmentId)
      .collection('questions');
    const currentSnapshot = await transaction.get(questionsRef.doc(input.currentQuestionId));
    const current = publicQuestionSchema.safeParse(currentSnapshot.data());
    if (
      !currentSnapshot.exists ||
      !current.success ||
      current.data.id !== currentSnapshot.id ||
      current.data.assignmentId !== existing.assignmentId
    ) {
      throw new StudentSessionStoredDataError();
    }
    const nextSnapshot = await transaction.get(
      questionsRef.where('order', '>', current.data.order).orderBy('order').limit(1),
    );
    const nextDocument = nextSnapshot.docs[0];
    const next =
      nextDocument === undefined ? undefined : publicQuestionSchema.safeParse(nextDocument.data());
    if (
      next !== undefined &&
      (!next.success ||
        next.data.id !== nextDocument?.id ||
        next.data.assignmentId !== existing.assignmentId ||
        next.data.order <= current.data.order)
    ) {
      throw new StudentSessionStoredDataError();
    }
    const session = advanceStudentSessionState(
      existing,
      input.currentQuestionId,
      next?.success ? next.data.id : null,
      nowMs,
    );
    transaction.set(sessionRef, session);
    return { session };
  });
};

export const startOrResumeStudentSession = onCall(callableOptions, (request) =>
  executeStudentSessionOperation(
    'startOrResumeStudentSession',
    request,
    startOrResumeStudentSessionInputSchema,
    (claims, input) => startOrResumeSessionRecord(claims, input.targetId, Date.now()),
  ),
);

export const submitStudentAttempt = onCall(callableOptions, (request) =>
  executeStudentSessionOperation(
    'submitStudentAttempt',
    request,
    submitStudentAttemptInputSchema,
    (claims, input) => submitAttemptRecord(claims, input, Date.now()),
  ),
);

export const recordStudentSupportEvent = onCall(callableOptions, (request) =>
  executeStudentSessionOperation(
    'recordStudentSupportEvent',
    request,
    recordStudentSupportEventInputSchema,
    (claims, input) => recordSupportEventRecord(claims, input, Date.now()),
  ),
);

export const transitionStudentSession = onCall(callableOptions, (request) =>
  executeStudentSessionOperation(
    'transitionStudentSession',
    request,
    transitionStudentSessionInputSchema,
    (claims, input) => transitionSessionRecord(claims, input, Date.now()),
  ),
);

export const advanceStudentSession = onCall(callableOptions, (request) =>
  executeStudentSessionOperation(
    'advanceStudentSession',
    request,
    advanceStudentSessionInputSchema,
    (claims, input) => advanceSessionRecord(claims, input, Date.now()),
  ),
);

export const studentSessionCallableNames = Object.freeze([
  'startOrResumeStudentSession',
  'submitStudentAttempt',
  'recordStudentSupportEvent',
  'transitionStudentSession',
  'advanceStudentSession',
] as const);
