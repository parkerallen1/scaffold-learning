import { describe, expect, it } from 'vitest';

import {
  assignmentTargetSchema,
  questionAnswerKeySchema,
  sessionStateSchema,
  SUPPORT_CATALOG,
  supportPlanVersionSchema,
  syntheticDomainFixtures,
} from '@quiz-master/domain';

import {
  advanceStudentSessionState,
  assertMatchingIdempotencyRecord,
  assertQuestionAttemptedBeforeAdvance,
  attemptRequestFingerprint,
  buildAttemptEvent,
  buildStudentSessionStartResult,
  createStudentSession,
  idempotencyDocumentId,
  requireStudentClaims,
  sessionIdempotencyRecordSchema,
  startOrResumeStudentSessionState,
  StudentSessionError,
  submitStudentAttemptInputSchema,
  transitionStudentSessionState,
} from './studentSessionLifecycleCore.js';

const { assignmentTarget, publicQuestion, supportPlan } = syntheticDomainFixtures;
const nowMs = 1_750_000_000_000;

const attemptInput = submitStudentAttemptInputSchema.parse({
  sessionId: 'session_core_01',
  questionId: publicQuestion.id,
  idempotencyKey: 'attempt_core_key_01',
  submittedAnswer: { kind: 'choice' as const, choiceId: 'choice_demo_b' },
  activeSupports: ['readingChunks' as const],
  clientOccurredAt: nowMs,
  elapsedMs: 12_000,
});

const makeSession = () =>
  createStudentSession({
    sessionId: 'session_core_01' as typeof syntheticDomainFixtures.session.id,
    target: assignmentTarget,
    firstQuestionId: publicQuestion.id,
    nowMs,
  });

describe('student session state transitions', () => {
  it('creates one pinned session state and resumes a paused session', () => {
    const session = makeSession();
    expect(session).toMatchObject({
      targetId: assignmentTarget.id,
      assignmentRevision: assignmentTarget.assignmentRevision,
      supportPlanId: assignmentTarget.supportPlanId,
      status: 'inProgress',
    });

    const paused = transitionStudentSessionState(session, 'pause', nowMs + 1_000);
    const resumed = startOrResumeStudentSessionState(paused, nowMs + 2_000);
    expect(resumed.status).toBe('inProgress');
    expect(resumed.updatedAt).toBe(nowMs + 2_000);
  });

  it('returns only the support plan pinned to the session', () => {
    const session = makeSession();
    expect(buildStudentSessionStartResult(session, supportPlan, false)).toMatchObject({
      session,
      supportPlan,
      resumed: false,
    });
    expect(() =>
      buildStudentSessionStartResult(
        session,
        supportPlanVersionSchema.parse({ ...supportPlan, version: supportPlan.version + 1 }),
        false,
      ),
    ).toThrowError(new StudentSessionError('identity-mismatch'));
  });

  it('makes repeated pause, resume, and complete requests stable', () => {
    const session = makeSession();
    const paused = transitionStudentSessionState(session, 'pause', nowMs + 1_000);
    expect(transitionStudentSessionState(paused, 'pause', nowMs + 2_000)).toEqual(paused);

    const resumed = transitionStudentSessionState(paused, 'resume', nowMs + 3_000);
    expect(startOrResumeStudentSessionState(resumed, nowMs + 4_000)).toEqual(resumed);

    const completed = transitionStudentSessionState(resumed, 'complete', nowMs + 5_000);
    expect(transitionStudentSessionState(completed, 'complete', nowMs + 6_000)).toEqual(completed);
  });

  it('keeps completion available after an incorrect attempt as the escape hatch', () => {
    const session = makeSession();
    const incorrect = buildAttemptEvent({
      eventId: 'event_core_001' as typeof syntheticDomainFixtures.attemptEvent.id,
      session,
      input: attemptInput,
      answerKey: syntheticDomainFixtures.answerKey.questionKeys[0]!,
      supportPlan,
      attemptNumber: 1,
      nowMs,
    });
    expect(incorrect.outcome).toBe('incorrect');

    const completed = transitionStudentSessionState(session, 'complete', nowMs + 1_000);
    expect(completed).toMatchObject({
      status: 'completed',
      currentQuestionId: null,
      completedAt: nowMs + 1_000,
    });
  });

  it('requires an attempt before the student can move on for later review', () => {
    expect(() => assertQuestionAttemptedBeforeAdvance(undefined, publicQuestion.id)).toThrowError(
      new StudentSessionError('invalid-transition'),
    );
    expect(
      assertQuestionAttemptedBeforeAdvance(
        { questionId: publicQuestion.id, attemptCount: 1, updatedAt: nowMs },
        publicQuestion.id,
      ).attemptCount,
    ).toBe(1);
  });

  it('advances to later work after an incorrect attempt without a correctness gate', () => {
    const session = makeSession();
    const incorrect = buildAttemptEvent({
      eventId: 'event_core_007' as typeof syntheticDomainFixtures.attemptEvent.id,
      session,
      input: attemptInput,
      answerKey: syntheticDomainFixtures.answerKey.questionKeys[0]!,
      supportPlan,
      attemptNumber: 3,
      nowMs,
    });
    expect(incorrect.outcome).toBe('incorrect');

    const nextQuestionId = 'question_core_02' as typeof publicQuestion.id;
    const advanced = advanceStudentSessionState(
      session,
      publicQuestion.id,
      nextQuestionId,
      nowMs + 1_000,
    );
    expect(advanced).toMatchObject({
      status: 'inProgress',
      currentQuestionId: nextQuestionId,
    });
  });

  it('rejects attempts while paused but still permits completion', () => {
    const paused = transitionStudentSessionState(makeSession(), 'pause', nowMs + 1);
    expect(() =>
      buildAttemptEvent({
        eventId: 'event_core_002' as typeof syntheticDomainFixtures.attemptEvent.id,
        session: paused,
        input: attemptInput,
        answerKey: syntheticDomainFixtures.answerKey.questionKeys[0]!,
        supportPlan,
        attemptNumber: 1,
        nowMs,
      }),
    ).toThrowError(new StudentSessionError('session-not-active'));
    expect(transitionStudentSessionState(paused, 'complete', nowMs + 2).status).toBe('completed');
  });
});

describe('canonical attempt construction', () => {
  it('routes a nonmatching short-text response to teacher review', () => {
    const shortTextQuestionId = 'question_text_01' as typeof publicQuestion.id;
    const target = assignmentTargetSchema.parse({ ...assignmentTarget });
    const session = sessionStateSchema.parse({
      ...makeSession(),
      currentQuestionId: shortTextQuestionId,
    });
    const answerKey = questionAnswerKeySchema.parse({
      questionId: shortTextQuestionId,
      questionType: 'shortText',
      acceptedAnswers: ['evaporation'],
      normalization: 'caseAndWhitespace',
      teacherReviewAllowed: true,
    });
    const event = buildAttemptEvent({
      eventId: 'event_core_003' as typeof syntheticDomainFixtures.attemptEvent.id,
      session,
      input: {
        ...attemptInput,
        questionId: shortTextQuestionId,
        submittedAnswer: { kind: 'shortText', value: 'Water becomes a gas.' },
      },
      answerKey,
      supportPlan: supportPlanVersionSchema.parse({
        ...supportPlan,
        supports: [SUPPORT_CATALOG.readingChunks.defaultSettings],
      }),
      attemptNumber: 1,
      nowMs,
    });
    expect(target.studentId).toBe(event.studentId);
    expect(event.outcome).toBe('teacherReview');
  });

  it('rejects supports that are not enabled in the pinned plan', () => {
    expect(() =>
      buildAttemptEvent({
        eventId: 'event_core_004' as typeof syntheticDomainFixtures.attemptEvent.id,
        session: makeSession(),
        input: { ...attemptInput, activeSupports: ['breakPrompt'] },
        answerKey: syntheticDomainFixtures.answerKey.questionKeys[0]!,
        supportPlan,
        attemptNumber: 1,
        nowMs,
      }),
    ).toThrowError(new StudentSessionError('support-not-approved'));
  });
});

describe('submission idempotency', () => {
  it('returns a matching canonical event reference for an exact retry', () => {
    const fingerprint = attemptRequestFingerprint(attemptInput);
    const record = sessionIdempotencyRecordSchema.parse({
      kind: 'attempt',
      fingerprint,
      eventId: 'event_core_005',
      createdAt: nowMs,
    });

    expect(assertMatchingIdempotencyRecord(record, 'attempt', fingerprint)).toEqual(record);
    expect(idempotencyDocumentId(attemptInput.idempotencyKey)).toHaveLength(64);
  });

  it('rejects reuse of an idempotency key for a changed submission', () => {
    const originalFingerprint = attemptRequestFingerprint(attemptInput);
    const changedFingerprint = attemptRequestFingerprint(
      submitStudentAttemptInputSchema.parse({
        ...attemptInput,
        submittedAnswer: { kind: 'choice', choiceId: 'choice_demo_a' },
      }),
    );
    const record = sessionIdempotencyRecordSchema.parse({
      kind: 'attempt',
      fingerprint: originalFingerprint,
      eventId: 'event_core_006',
      createdAt: nowMs,
    });

    expect(() =>
      assertMatchingIdempotencyRecord(record, 'attempt', changedFingerprint),
    ).toThrowError(new StudentSessionError('idempotency-conflict'));
  });
});

describe('student claim boundary', () => {
  it('requires the Firebase uid and student claim to match exactly', () => {
    const claims = requireStudentClaims(assignmentTarget.studentId, {
      role: 'student',
      classroomId: assignmentTarget.classroomId,
      studentId: assignmentTarget.studentId,
      authVersion: 1,
      email: 'ignored@example.test',
    });
    expect(claims.studentId).toBe(assignmentTarget.studentId);
    expect(() => requireStudentClaims('student_other_01', claims)).toThrowError(
      new StudentSessionError('authorization-mismatch'),
    );
  });
});
