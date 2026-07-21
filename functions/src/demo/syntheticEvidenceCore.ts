import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { z } from 'zod';

import {
  assignmentTargetIdSchema,
  attemptEventSchema,
  calculateEvidenceSummary,
  classroomIdSchema,
  epochMillisSchema,
  eventIdSchema,
  idempotencyKeySchema,
  publicQuestionSchema,
  sessionIdSchema,
  sessionStateSchema,
  studentIdSchema,
  supportEventSchema,
  supportKeySchema,
  type AssignmentTarget,
  type AttemptEvent,
  type PublicQuestion,
  type SessionState,
  type StudentId,
  type SubmittedAnswer,
  type SupportEvent,
  type SupportKey,
} from '@scaffold-learning/domain';

export const SYNTHETIC_EVIDENCE_VERSION = 1;
export const SYNTHETIC_SCORABLE_RESPONSE_COUNT = 10;
export const SYNTHETIC_SUPPORT_EVENT_COUNT = 2;

const syntheticEvidenceIdSchema = z.string().regex(/^synthetic_demo_[a-z0-9_]{8,48}$/);

export const syntheticEvidenceManifestSchema = z
  .object({
    id: syntheticEvidenceIdSchema,
    syntheticDemo: z.literal(true),
    seedVersion: z.literal(SYNTHETIC_EVIDENCE_VERSION),
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    targetId: assignmentTargetIdSchema,
    seededAt: epochMillisSchema,
    recordPaths: z.array(z.string().min(1).max(300)).min(14).max(32).readonly(),
  })
  .strict()
  .readonly();

export const seedSyntheticStudentEvidenceInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    targetId: assignmentTargetIdSchema,
  })
  .strict();

export type SyntheticEvidenceManifest = z.infer<typeof syntheticEvidenceManifestSchema>;
export type SeedSyntheticStudentEvidenceInput = z.infer<
  typeof seedSyntheticStudentEvidenceInputSchema
>;

export type SyntheticEvidenceEnvironment = Readonly<{
  functionsEmulator?: string;
  projectId?: string;
}>;

export class SyntheticEvidenceError extends Error {
  constructor(
    readonly reason:
      | 'emulator-required'
      | 'demo-project-required'
      | 'identity-mismatch'
      | 'assignment-has-no-questions'
      | 'support-required'
      | 'collision',
  ) {
    super('Synthetic demo evidence was rejected.');
    this.name = 'SyntheticEvidenceError';
  }
}

export const assertSyntheticEvidenceEnvironment = (
  environment: SyntheticEvidenceEnvironment,
): void => {
  if (environment.functionsEmulator !== 'true') {
    throw new SyntheticEvidenceError('emulator-required');
  }
  if (!environment.projectId?.startsWith('demo-')) {
    throw new SyntheticEvidenceError('demo-project-required');
  }
};

const digest = (value: string, length: number): string =>
  createHash('sha256').update(value).digest('hex').slice(0, length);

export const syntheticEvidenceManifestIdFor = (
  targetId: AssignmentTarget['id'],
): SyntheticEvidenceManifest['id'] =>
  syntheticEvidenceIdSchema.parse(`synthetic_demo_seed_${digest(targetId, 20)}`);

const sessionIdFor = (targetId: AssignmentTarget['id'], index: number) =>
  sessionIdSchema.parse(`synthetic_demo_session_${index}_${digest(targetId, 16)}`);

const attemptIdFor = (
  targetId: AssignmentTarget['id'],
  sessionIndex: number,
  responseIndex: number,
) =>
  eventIdSchema.parse(
    `synthetic_demo_attempt_${sessionIndex}_${responseIndex}_${digest(targetId, 12)}`,
  );

const supportEventIdFor = (targetId: AssignmentTarget['id'], index: number) =>
  eventIdSchema.parse(`synthetic_demo_support_${index}_${digest(targetId, 16)}`);

const attemptIdempotencyKeyFor = (
  targetId: AssignmentTarget['id'],
  sessionIndex: number,
  responseIndex: number,
) =>
  idempotencyKeySchema.parse(
    `synthetic_demo_attempt_key_${sessionIndex}_${responseIndex}_${digest(targetId, 16)}`,
  );

const supportIdempotencyKeyFor = (targetId: AssignmentTarget['id'], index: number) =>
  idempotencyKeySchema.parse(`synthetic_demo_support_key_${index}_${digest(targetId, 16)}`);

const submittedAnswerFor = (question: PublicQuestion): SubmittedAnswer => {
  if (question.questionType === 'numeric') return { kind: 'numeric', value: 0 };
  if (question.questionType === 'multipleChoice') {
    return { kind: 'choice', choiceId: question.choices[0]!.id };
  }
  return { kind: 'shortText', value: 'Synthetic demo response' };
};

export type SyntheticEvidenceRecord = Readonly<{
  path: string;
  kind: 'session' | 'attempt' | 'support';
  data: SessionState | AttemptEvent | SupportEvent;
}>;

export type SyntheticEvidencePacket = Readonly<{
  manifest: SyntheticEvidenceManifest;
  records: readonly SyntheticEvidenceRecord[];
  sessions: readonly SessionState[];
  attempts: readonly AttemptEvent[];
  supportEvents: readonly SupportEvent[];
}>;

export const buildSyntheticEvidencePacket = ({
  target,
  questions: rawQuestions,
  supportKey: rawSupportKey,
  seededAt: rawSeededAt,
}: Readonly<{
  target: AssignmentTarget;
  questions: readonly PublicQuestion[];
  supportKey: SupportKey;
  seededAt: number;
}>): SyntheticEvidencePacket => {
  const questions = rawQuestions.map((question) => publicQuestionSchema.parse(question));
  const supportKey = supportKeySchema.parse(rawSupportKey);
  const seededAt = epochMillisSchema.parse(rawSeededAt);
  if (questions.length === 0) {
    throw new SyntheticEvidenceError('assignment-has-no-questions');
  }
  if (
    questions.some((question) => question.assignmentId !== target.assignmentId) ||
    new Set(questions.map((question) => question.id)).size !== questions.length
  ) {
    throw new SyntheticEvidenceError('identity-mismatch');
  }

  const questionsPerSession = Math.min(questions.length, 5);
  const sessionCount = Math.max(
    2,
    Math.ceil(SYNTHETIC_SCORABLE_RESPONSE_COUNT / questionsPerSession),
  );
  const sessions: SessionState[] = [];
  const attempts: AttemptEvent[] = [];
  let responseIndex = 0;

  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    const sessionId = sessionIdFor(target.id, sessionIndex);
    const sessionStartedAt = seededAt + sessionIndex * 60_000;
    const remainingResponses = SYNTHETIC_SCORABLE_RESPONSE_COUNT - responseIndex;
    const responsesInSession = Math.min(questionsPerSession, remainingResponses);

    for (let questionIndex = 0; questionIndex < responsesInSession; questionIndex += 1) {
      const question = questions[questionIndex]!;
      const createdAt = sessionStartedAt + 5_000 + questionIndex * 5_000;
      attempts.push(
        attemptEventSchema.parse({
          id: attemptIdFor(target.id, sessionIndex, responseIndex),
          idempotencyKey: attemptIdempotencyKeyFor(target.id, sessionIndex, responseIndex),
          sessionId,
          studentId: target.studentId,
          questionId: question.id,
          attemptNumber: 1,
          submittedAnswer: submittedAnswerFor(question),
          outcome: responseIndex === 3 || responseIndex === 8 ? 'incorrect' : 'correct',
          activeSupports: [supportKey],
          clientOccurredAt: createdAt,
          createdAt,
          elapsedMs: 18_000 + responseIndex * 1_000,
        }),
      );
      responseIndex += 1;
    }

    const completedAt = sessionStartedAt + 50_000;
    sessions.push(
      sessionStateSchema.parse({
        id: sessionId,
        targetId: target.id,
        classroomId: target.classroomId,
        studentId: target.studentId,
        assignmentId: target.assignmentId,
        assignmentRevision: target.assignmentRevision,
        supportPlanId: target.supportPlanId,
        supportPlanVersion: target.supportPlanVersion,
        status: 'completed',
        currentQuestionId: null,
        startedAt: sessionStartedAt,
        updatedAt: completedAt,
        completedAt,
      }),
    );
  }

  const supportEvents = sessions.slice(0, SYNTHETIC_SUPPORT_EVENT_COUNT).map((session, index) => {
    const relatedAttempt = attempts.find((attempt) => attempt.sessionId === session.id)!;
    const createdAt = relatedAttempt.createdAt - 1_000;
    return supportEventSchema.parse({
      id: supportEventIdFor(target.id, index),
      idempotencyKey: supportIdempotencyKeyFor(target.id, index),
      sessionId: session.id,
      studentId: target.studentId,
      questionId: relatedAttempt.questionId,
      supportKey,
      action: 'activated',
      clientOccurredAt: createdAt,
      createdAt,
    });
  });

  const classroomPath = `classrooms/${target.classroomId}`;
  const records: SyntheticEvidenceRecord[] = [
    ...sessions.map((session) => ({
      path: `${classroomPath}/sessions/${session.id}`,
      kind: 'session' as const,
      data: session,
    })),
    ...attempts.map((attempt) => ({
      path: `${classroomPath}/sessions/${attempt.sessionId}/attemptEvents/${attempt.id}`,
      kind: 'attempt' as const,
      data: attempt,
    })),
    ...supportEvents.map((event) => ({
      path: `${classroomPath}/sessions/${event.sessionId}/supportEvents/${event.id}`,
      kind: 'support' as const,
      data: event,
    })),
  ];
  const manifest = syntheticEvidenceManifestSchema.parse({
    id: syntheticEvidenceManifestIdFor(target.id),
    syntheticDemo: true,
    seedVersion: SYNTHETIC_EVIDENCE_VERSION,
    classroomId: target.classroomId,
    studentId: target.studentId,
    targetId: target.id,
    seededAt,
    recordPaths: records.map((record) => record.path),
  });

  return Object.freeze({
    manifest,
    records: Object.freeze(records),
    sessions: Object.freeze(sessions),
    attempts: Object.freeze(attempts),
    supportEvents: Object.freeze(supportEvents),
  });
};

export type SyntheticEvidenceWriteState = Readonly<{
  manifest: unknown | undefined;
  recordsByPath: ReadonlyMap<string, unknown>;
}>;

export const assertSyntheticEvidenceWriteAvailable = (
  packet: SyntheticEvidencePacket,
  existing: SyntheticEvidenceWriteState,
): Readonly<{ alreadySeeded: boolean }> => {
  if (existing.manifest === undefined) {
    if ([...existing.recordsByPath.values()].some((value) => value !== undefined)) {
      throw new SyntheticEvidenceError('collision');
    }
    return Object.freeze({ alreadySeeded: false });
  }

  const manifest = syntheticEvidenceManifestSchema.safeParse(existing.manifest);
  if (!manifest.success || !isDeepStrictEqual(manifest.data, packet.manifest)) {
    throw new SyntheticEvidenceError('collision');
  }
  if (
    packet.records.some(
      (record) => !isDeepStrictEqual(existing.recordsByPath.get(record.path), record.data),
    )
  ) {
    throw new SyntheticEvidenceError('collision');
  }
  return Object.freeze({ alreadySeeded: true });
};

export const syntheticEvidenceSummary = (packet: SyntheticEvidencePacket) =>
  calculateEvidenceSummary({
    sessions: packet.sessions,
    attempts: packet.attempts,
    supportEvents: packet.supportEvents,
  });

export const enabledSyntheticSupportKey = (
  supports: readonly Readonly<{ supportKey: SupportKey; enabled: boolean }>[],
): SupportKey => {
  const support = supports.find((candidate) => candidate.enabled);
  if (support === undefined) throw new SyntheticEvidenceError('support-required');
  return support.supportKey;
};

export const assertSyntheticTargetIdentity = (
  target: AssignmentTarget,
  input: SeedSyntheticStudentEvidenceInput,
): void => {
  if (
    target.id !== input.targetId ||
    target.classroomId !== input.classroomId ||
    target.studentId !== input.studentId
  ) {
    throw new SyntheticEvidenceError('identity-mismatch');
  }
};

export const syntheticEvidenceStudentId = (packet: SyntheticEvidencePacket): StudentId =>
  studentIdSchema.parse(packet.manifest.studentId);
