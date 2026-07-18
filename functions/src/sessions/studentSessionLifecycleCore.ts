import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  assignmentTargetIdSchema,
  attemptEventSchema,
  checkSubmittedAnswer,
  classroomIdSchema,
  epochMillisSchema,
  eventIdSchema,
  idempotencyKeySchema,
  questionAnswerKeySchema,
  questionIdSchema,
  sessionIdSchema,
  sessionStateSchema,
  studentIdSchema,
  submittedAnswerSchema,
  supportEventSchema,
  supportKeySchema,
  supportPlanVersionSchema,
  type AssignmentTarget,
  type AttemptEvent,
  type EventId,
  type QuestionAnswerKey,
  type QuestionId,
  type SessionId,
  type SessionState,
  type StudentId,
  type SubmittedAnswer,
  type SupportEvent,
  type SupportKey,
  type SupportPlanVersion,
} from '@quiz-master/domain';

const MAX_CLIENT_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLIENT_EVENT_FUTURE_SKEW_MS = 5 * 60 * 1000;

export const studentSessionClaimsSchema = z
  .object({
    role: z.literal('student'),
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    authVersion: z.number().int().positive(),
  })
  .strict();

export const startOrResumeStudentSessionInputSchema = z
  .object({ targetId: assignmentTargetIdSchema })
  .strict();

export const submitStudentAttemptInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    questionId: questionIdSchema,
    idempotencyKey: idempotencyKeySchema,
    submittedAnswer: submittedAnswerSchema,
    activeSupports: z.array(supportKeySchema).max(7).readonly(),
    clientOccurredAt: epochMillisSchema,
    elapsedMs: z.number().int().nonnegative().max(86_400_000),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.activeSupports).size !== input.activeSupports.length) {
      context.addIssue({
        code: 'custom',
        path: ['activeSupports'],
        message: 'Active supports must be unique.',
      });
    }
  });

export const recordStudentSupportEventInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    idempotencyKey: idempotencyKeySchema,
    questionId: questionIdSchema.nullable(),
    supportKey: supportKeySchema,
    action: z.enum(['available', 'shown', 'activated', 'completed', 'dismissed']),
    clientOccurredAt: epochMillisSchema,
  })
  .strict();

export const transitionStudentSessionInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    action: z.enum(['pause', 'resume', 'complete']),
  })
  .strict();

export const advanceStudentSessionInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    currentQuestionId: questionIdSchema,
  })
  .strict();

export const sessionTargetPointerSchema = z
  .object({
    targetId: assignmentTargetIdSchema,
    sessionId: sessionIdSchema,
    studentId: studentIdSchema,
    createdAt: epochMillisSchema,
  })
  .strict()
  .readonly();

export const sessionQuestionProgressSchema = z
  .object({
    questionId: questionIdSchema,
    attemptCount: z.number().int().nonnegative().max(1000),
    updatedAt: epochMillisSchema,
  })
  .strict()
  .readonly();

export const sessionIdempotencyRecordSchema = z
  .object({
    kind: z.enum(['attempt', 'support']),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    eventId: eventIdSchema,
    createdAt: epochMillisSchema,
  })
  .strict()
  .readonly();

export class StudentSessionError extends Error {
  constructor(
    readonly reason:
      | 'authorization-mismatch'
      | 'invalid-transition'
      | 'session-not-active'
      | 'identity-mismatch'
      | 'question-not-assigned'
      | 'support-not-approved'
      | 'idempotency-conflict'
      | 'client-time-out-of-range'
      | 'attempt-limit-reached',
  ) {
    super('Student session operation was rejected.');
    this.name = 'StudentSessionError';
  }
}

export type StudentSessionClaims = z.infer<typeof studentSessionClaimsSchema>;
export type SubmitStudentAttemptInput = z.infer<typeof submitStudentAttemptInputSchema>;
export type RecordStudentSupportEventInput = z.infer<typeof recordStudentSupportEventInputSchema>;
export type StudentSessionTransition = z.infer<
  typeof transitionStudentSessionInputSchema
>['action'];

export const requireStudentClaims = (
  uid: string | undefined,
  rawClaims: Readonly<Record<string, unknown>> | undefined,
): StudentSessionClaims => {
  const claims = studentSessionClaimsSchema.safeParse({
    role: rawClaims?.role,
    classroomId: rawClaims?.classroomId,
    studentId: rawClaims?.studentId,
    authVersion: rawClaims?.authVersion,
  });
  if (!claims.success || uid !== claims.data.studentId) {
    throw new StudentSessionError('authorization-mismatch');
  }
  return claims.data;
};

export const createStudentSession = ({
  sessionId,
  target,
  firstQuestionId,
  nowMs,
}: Readonly<{
  sessionId: SessionId;
  target: AssignmentTarget;
  firstQuestionId: QuestionId;
  nowMs: number;
}>): SessionState =>
  sessionStateSchema.parse({
    id: sessionId,
    targetId: target.id,
    classroomId: target.classroomId,
    studentId: target.studentId,
    assignmentId: target.assignmentId,
    assignmentRevision: target.assignmentRevision,
    supportPlanId: target.supportPlanId,
    supportPlanVersion: target.supportPlanVersion,
    status: 'inProgress',
    currentQuestionId: firstQuestionId,
    startedAt: nowMs,
    updatedAt: nowMs,
    completedAt: null,
  });

export const startOrResumeStudentSessionState = (
  sessionInput: SessionState,
  nowMs: number,
): SessionState => {
  const session = sessionStateSchema.parse(sessionInput);
  if (session.status === 'paused') {
    return sessionStateSchema.parse({ ...session, status: 'inProgress', updatedAt: nowMs });
  }
  if (session.status === 'abandoned') {
    throw new StudentSessionError('invalid-transition');
  }
  return session;
};

export const transitionStudentSessionState = (
  sessionInput: SessionState,
  action: StudentSessionTransition,
  nowMs: number,
): SessionState => {
  const session = sessionStateSchema.parse(sessionInput);

  if (action === 'pause') {
    if (session.status === 'paused') return session;
    if (session.status !== 'inProgress') {
      throw new StudentSessionError('invalid-transition');
    }
    return sessionStateSchema.parse({ ...session, status: 'paused', updatedAt: nowMs });
  }

  if (action === 'resume') {
    return startOrResumeStudentSessionState(session, nowMs);
  }

  if (session.status === 'completed') return session;
  if (session.status !== 'inProgress' && session.status !== 'paused') {
    throw new StudentSessionError('invalid-transition');
  }
  return sessionStateSchema.parse({
    ...session,
    status: 'completed',
    currentQuestionId: null,
    updatedAt: nowMs,
    completedAt: nowMs,
  });
};

export const advanceStudentSessionState = (
  sessionInput: SessionState,
  expectedCurrentQuestionId: QuestionId,
  nextQuestionId: QuestionId | null,
  nowMs: number,
): SessionState => {
  const session = sessionStateSchema.parse(sessionInput);
  if (session.status !== 'inProgress') {
    throw new StudentSessionError('session-not-active');
  }
  if (session.currentQuestionId !== expectedCurrentQuestionId) {
    throw new StudentSessionError('question-not-assigned');
  }
  if (nextQuestionId === expectedCurrentQuestionId) {
    throw new StudentSessionError('invalid-transition');
  }
  if (nextQuestionId === null) {
    return transitionStudentSessionState(session, 'complete', nowMs);
  }
  return sessionStateSchema.parse({
    ...session,
    currentQuestionId: nextQuestionId,
    updatedAt: nowMs,
  });
};

export const assertQuestionAttemptedBeforeAdvance = (
  rawProgress: unknown,
  expectedQuestionId: QuestionId,
): z.infer<typeof sessionQuestionProgressSchema> => {
  const progress = sessionQuestionProgressSchema.safeParse(rawProgress);
  if (
    !progress.success ||
    progress.data.questionId !== expectedQuestionId ||
    progress.data.attemptCount < 1
  ) {
    throw new StudentSessionError('invalid-transition');
  }
  return progress.data;
};

const assertClientOccurredAt = (clientOccurredAt: number, nowMs: number): void => {
  if (
    clientOccurredAt < nowMs - MAX_CLIENT_EVENT_AGE_MS ||
    clientOccurredAt > nowMs + MAX_CLIENT_EVENT_FUTURE_SKEW_MS
  ) {
    throw new StudentSessionError('client-time-out-of-range');
  }
};

const enabledSupportKeys = (planInput: SupportPlanVersion): ReadonlySet<SupportKey> => {
  const plan = supportPlanVersionSchema.parse(planInput);
  return new Set(
    plan.supports.filter((support) => support.enabled).map((support) => support.supportKey),
  );
};

const assertSupportsApproved = (
  plan: SupportPlanVersion,
  activeSupports: readonly SupportKey[],
): void => {
  const approved = enabledSupportKeys(plan);
  if (activeSupports.some((supportKey) => !approved.has(supportKey))) {
    throw new StudentSessionError('support-not-approved');
  }
};

export const buildAttemptEvent = ({
  eventId,
  session: sessionInput,
  input: rawInput,
  answerKey: answerKeyInput,
  supportPlan,
  attemptNumber,
  nowMs,
}: Readonly<{
  eventId: EventId;
  session: SessionState;
  input: SubmitStudentAttemptInput;
  answerKey: QuestionAnswerKey;
  supportPlan: SupportPlanVersion;
  attemptNumber: number;
  nowMs: number;
}>): AttemptEvent => {
  const session = sessionStateSchema.parse(sessionInput);
  const input = submitStudentAttemptInputSchema.parse(rawInput);
  const answerKey = questionAnswerKeySchema.parse(answerKeyInput);
  if (session.status !== 'inProgress') {
    throw new StudentSessionError('session-not-active');
  }
  if (
    input.sessionId !== session.id ||
    input.questionId !== answerKey.questionId ||
    session.currentQuestionId !== input.questionId
  ) {
    throw new StudentSessionError('question-not-assigned');
  }
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new StudentSessionError('identity-mismatch');
  }
  if (attemptNumber > 1000) {
    throw new StudentSessionError('attempt-limit-reached');
  }
  assertClientOccurredAt(input.clientOccurredAt, nowMs);
  assertSupportsApproved(supportPlan, input.activeSupports);
  const result = checkSubmittedAnswer(answerKey, input.submittedAnswer);

  return attemptEventSchema.parse({
    id: eventId,
    idempotencyKey: input.idempotencyKey,
    sessionId: session.id,
    studentId: session.studentId,
    questionId: input.questionId,
    attemptNumber,
    submittedAnswer: input.submittedAnswer,
    outcome: result.outcome,
    activeSupports: input.activeSupports,
    clientOccurredAt: input.clientOccurredAt,
    createdAt: nowMs,
    elapsedMs: input.elapsedMs,
  });
};

export const buildSupportEvent = ({
  eventId,
  session: sessionInput,
  input: rawInput,
  supportPlan,
  nowMs,
}: Readonly<{
  eventId: EventId;
  session: SessionState;
  input: RecordStudentSupportEventInput;
  supportPlan: SupportPlanVersion;
  nowMs: number;
}>): SupportEvent => {
  const session = sessionStateSchema.parse(sessionInput);
  const input = recordStudentSupportEventInputSchema.parse(rawInput);
  if (session.status !== 'inProgress' || input.sessionId !== session.id) {
    throw new StudentSessionError('session-not-active');
  }
  if (input.questionId !== null && input.questionId !== session.currentQuestionId) {
    throw new StudentSessionError('question-not-assigned');
  }
  assertClientOccurredAt(input.clientOccurredAt, nowMs);
  assertSupportsApproved(supportPlan, [input.supportKey]);

  return supportEventSchema.parse({
    id: eventId,
    idempotencyKey: input.idempotencyKey,
    sessionId: session.id,
    studentId: session.studentId,
    questionId: input.questionId,
    supportKey: input.supportKey,
    action: input.action,
    clientOccurredAt: input.clientOccurredAt,
    createdAt: nowMs,
  });
};

const stableAnswer = (answer: SubmittedAnswer): Readonly<Record<string, unknown>> => {
  if (answer.kind === 'numeric') {
    return {
      kind: answer.kind,
      value: answer.value,
      ...(answer.unit === undefined ? {} : { unit: answer.unit }),
    };
  }
  if (answer.kind === 'choice') {
    return { kind: answer.kind, choiceId: answer.choiceId };
  }
  return { kind: answer.kind, value: answer.value };
};

const fingerprint = (value: Readonly<Record<string, unknown>>): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const attemptRequestFingerprint = (rawInput: SubmitStudentAttemptInput): string => {
  const input = submitStudentAttemptInputSchema.parse(rawInput);
  return fingerprint({
    sessionId: input.sessionId,
    questionId: input.questionId,
    submittedAnswer: stableAnswer(input.submittedAnswer),
    activeSupports: [...input.activeSupports],
    clientOccurredAt: input.clientOccurredAt,
    elapsedMs: input.elapsedMs,
  });
};

export const supportRequestFingerprint = (rawInput: RecordStudentSupportEventInput): string => {
  const input = recordStudentSupportEventInputSchema.parse(rawInput);
  return fingerprint({
    sessionId: input.sessionId,
    questionId: input.questionId,
    supportKey: input.supportKey,
    action: input.action,
    clientOccurredAt: input.clientOccurredAt,
  });
};

export const idempotencyDocumentId = (idempotencyKey: string): string =>
  createHash('sha256').update(idempotencyKey).digest('hex');

export const assertMatchingIdempotencyRecord = (
  rawRecord: unknown,
  expectedKind: 'attempt' | 'support',
  expectedFingerprint: string,
): z.infer<typeof sessionIdempotencyRecordSchema> => {
  const record = sessionIdempotencyRecordSchema.parse(rawRecord);
  if (record.kind !== expectedKind || record.fingerprint !== expectedFingerprint) {
    throw new StudentSessionError('idempotency-conflict');
  }
  return record;
};

export const assertSessionIdentity = (
  sessionInput: SessionState,
  claims: StudentSessionClaims,
): SessionState => {
  const session = sessionStateSchema.parse(sessionInput);
  if (session.classroomId !== claims.classroomId || session.studentId !== claims.studentId) {
    throw new StudentSessionError('identity-mismatch');
  }
  return session;
};

export type { SessionState, StudentId };
