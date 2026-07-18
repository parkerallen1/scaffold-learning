import { z } from 'zod';

import {
  DEFAULT_EVIDENCE_THRESHOLD,
  SUPPORT_KEYS,
  attemptEventSchema,
  auditRecommendationSchema,
  auditResultIdSchema,
  auditResultSchema,
  auditTraceIdSchema,
  auditTraceSchema,
  calculateEvidenceSummary,
  checkAuditSafety,
  classroomIdSchema,
  epochMillisSchema,
  sessionStateSchema,
  studentIdSchema,
  supportEventSchema,
  supportPlanIdSchema,
  supportSettingsSchema,
  teacherIdSchema,
  type AttemptEvent,
  type AuditResult,
  type AuditTrace,
  type EvidenceSummary,
  type SessionState,
  type SupportEvent,
  type TeacherId,
} from '@quiz-master/domain';

import {
  AuditManualFallbackError,
  type AuditEvidencePacket,
  type AuditEventFact,
  type AuditProvider,
  type AuditProviderDraft,
} from './auditContracts.js';

export const MAX_AUDIT_SESSIONS = 50;
export const MAX_AUDIT_ATTEMPTS = 50;
export const MAX_AUDIT_SUPPORT_EVENTS = 50;
export const AUDIT_THRESHOLD_PROMPT_VERSION = 'audit-threshold-v1';
export const AUDIT_THRESHOLD_MODEL = 'deterministic-evidence-threshold';
export const AUDIT_MANUAL_REVIEW_SUMMARY =
  'The evidence threshold is met, but automated suggestions are unavailable. Review the canonical session evidence manually; no support-plan change was made.';

export const auditStudentInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
  })
  .strict();

export const auditProviderDraftSchema = z
  .object({
    recommendations: z.array(auditRecommendationSchema).max(2),
  })
  .strict();

export const auditRecordSchema = z
  .object({
    id: auditTraceIdSchema,
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    createdBy: teacherIdSchema,
    activeSupportPlanId: supportPlanIdSchema,
    activeSupportPlanVersion: z.number().int().positive(),
    evidenceCounts: z
      .object({
        sessions: z.number().int().min(1).max(MAX_AUDIT_SESSIONS),
        attempts: z.number().int().nonnegative().max(MAX_AUDIT_ATTEMPTS),
        supportEvents: z.number().int().nonnegative().max(MAX_AUDIT_SUPPORT_EVENTS),
      })
      .strict(),
    evidenceSummary: z
      .object({
        sessionCount: z.number().int().nonnegative(),
        completedSessionCount: z.number().int().nonnegative(),
        scorableResponseCount: z.number().int().nonnegative(),
        correctResponseCount: z.number().int().nonnegative(),
        firstAttemptCorrectCount: z.number().int().nonnegative(),
        totalScorableAttempts: z.number().int().nonnegative(),
        averageAttemptsToSuccess: z.number().nonnegative().nullable(),
        averageElapsedMs: z.number().nonnegative().nullable(),
        activatedSupportCounts: z
          .object(
            Object.fromEntries(
              SUPPORT_KEYS.map((key) => [key, z.number().int().nonnegative()]),
            ) as Record<(typeof SUPPORT_KEYS)[number], z.ZodNumber>,
          )
          .strict(),
        recoveriesAfterSupport: z
          .object(
            Object.fromEntries(
              SUPPORT_KEYS.map((key) => [key, z.number().int().nonnegative()]),
            ) as Record<(typeof SUPPORT_KEYS)[number], z.ZodNumber>,
          )
          .strict(),
        evidenceSufficient: z.boolean(),
        threshold: z
          .object({
            minimumSessions: z.number().int().positive(),
            minimumScorableResponses: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
    trace: auditTraceSchema,
    result: auditResultSchema,
    createdAt: epochMillisSchema,
  })
  .strict();

export type AuditRecord = z.infer<typeof auditRecordSchema>;

export class AuditEvidenceError extends Error {
  constructor(readonly reason: 'empty' | 'too-large' | 'identity-mismatch') {
    super('The audit evidence window is invalid.');
    this.name = 'AuditEvidenceError';
  }
}

const eventFactForAttempt = (event: AttemptEvent): AuditEventFact =>
  Object.freeze({
    eventId: event.id,
    metric: 'attemptOutcome',
    observation: `Attempt ${event.id} was recorded as ${event.outcome} on attempt ${event.attemptNumber}, with ${event.elapsedMs} ms elapsed.`,
  });

const eventFactForSupport = (event: SupportEvent): AuditEventFact =>
  Object.freeze({
    eventId: event.id,
    metric: 'supportUse',
    observation: `Support event ${event.id} recorded ${event.action} for ${event.supportKey}.`,
  });

export type BuiltAuditEvidence = Readonly<{
  sessions: readonly SessionState[];
  attempts: readonly AttemptEvent[];
  supportEvents: readonly SupportEvent[];
  packet: AuditEvidencePacket;
}>;

export const buildAuditEvidence = ({
  studentId,
  sessions: rawSessions,
  attempts: rawAttempts,
  supportEvents: rawSupportEvents,
  activeSupports: rawActiveSupports,
}: Readonly<{
  studentId: string;
  sessions: readonly unknown[];
  attempts: readonly unknown[];
  supportEvents: readonly unknown[];
  activeSupports: readonly unknown[];
}>): BuiltAuditEvidence => {
  if (rawSessions.length === 0) throw new AuditEvidenceError('empty');
  if (
    rawSessions.length > MAX_AUDIT_SESSIONS ||
    rawAttempts.length > MAX_AUDIT_ATTEMPTS ||
    rawSupportEvents.length > MAX_AUDIT_SUPPORT_EVENTS
  ) {
    throw new AuditEvidenceError('too-large');
  }

  const sessions = rawSessions.map((session) => sessionStateSchema.parse(session));
  const attempts = rawAttempts.map((attempt) => attemptEventSchema.parse(attempt));
  const supportEvents = rawSupportEvents.map((event) => supportEventSchema.parse(event));
  const activeSupports = rawActiveSupports.map((support) => supportSettingsSchema.parse(support));
  const sessionIds = new Set(sessions.map((session) => session.id));

  if (
    sessions.some((session) => session.studentId !== studentId) ||
    attempts.some(
      (attempt) => attempt.studentId !== studentId || !sessionIds.has(attempt.sessionId),
    ) ||
    supportEvents.some((event) => event.studentId !== studentId || !sessionIds.has(event.sessionId))
  ) {
    throw new AuditEvidenceError('identity-mismatch');
  }

  const summary = calculateEvidenceSummary({
    sessions,
    attempts,
    supportEvents,
    threshold: DEFAULT_EVIDENCE_THRESHOLD,
  });
  const eventFacts = [
    ...attempts.map(eventFactForAttempt),
    ...supportEvents.map(eventFactForSupport),
  ];

  return Object.freeze({
    sessions: Object.freeze(sessions),
    attempts: Object.freeze(attempts),
    supportEvents: Object.freeze(supportEvents),
    packet: Object.freeze({
      summary,
      activeSupports: Object.freeze(activeSupports),
      eventFacts: Object.freeze(eventFacts),
    }),
  });
};

const FORBIDDEN_AUDIT_LANGUAGE =
  /\b(adhd|autis(?:m|tic)|dyslex(?:ia|ic)|diagnos\w*|disorder|disability|impairment|caus(?:e|ed|es|al)|due to|proves?|indicates? (?:a|the) condition|peers?|classmates?)\b/i;

const assertGroundedAndConservative = (
  packet: AuditEvidencePacket,
  rawDraft: unknown,
): AuditProviderDraft => {
  const draft = auditProviderDraftSchema.parse(rawDraft);
  const factsById = new Map(packet.eventFacts.map((fact) => [fact.eventId, fact]));
  const activeSupportKeys = new Set(packet.activeSupports.map((support) => support.supportKey));
  const recommendedKeys = new Set<string>();

  for (const recommendation of draft.recommendations) {
    if (recommendedKeys.has(recommendation.supportKey)) {
      throw new AuditManualFallbackError('unsafe_output');
    }
    recommendedKeys.add(recommendation.supportKey);

    const isActive = activeSupportKeys.has(recommendation.supportKey);
    if (
      (recommendation.action === 'add' && isActive) ||
      ((recommendation.action === 'keep' ||
        recommendation.action === 'adjust' ||
        recommendation.action === 'remove') &&
        !isActive) ||
      ((recommendation.action === 'add' || recommendation.action === 'adjust') &&
        recommendation.proposedSettings === undefined) ||
      ((recommendation.action === 'keep' ||
        recommendation.action === 'remove' ||
        recommendation.action === 'observe') &&
        recommendation.proposedSettings !== undefined)
    ) {
      throw new AuditManualFallbackError('unsafe_output');
    }

    const prose = [
      ...recommendation.evidence.map((evidence) => evidence.observation),
      ...recommendation.alternativeExplanations,
    ].join(' ');
    if (FORBIDDEN_AUDIT_LANGUAGE.test(prose)) {
      throw new AuditManualFallbackError('unsafe_output');
    }

    for (const evidence of recommendation.evidence) {
      if (evidence.sourceEventIds.length !== 1) {
        throw new AuditManualFallbackError('unsafe_output');
      }
      const fact = factsById.get(evidence.sourceEventIds[0]!);
      if (
        fact === undefined ||
        evidence.metric !== fact.metric ||
        evidence.observation !== fact.observation
      ) {
        throw new AuditManualFallbackError('unsafe_output');
      }
    }
  }

  return draft;
};

const deterministicSummary = (summary: EvidenceSummary, recommendationCount: number): string =>
  `Reviewed ${summary.sessionCount} sessions and ${summary.scorableResponseCount} scorable responses. ${recommendationCount === 0 ? 'No support change is suggested; continue observing.' : `${recommendationCount} teacher-review suggestion${recommendationCount === 1 ? '' : 's'} ${recommendationCount === 1 ? 'is' : 'are'} available.`}`;

const insufficientSummary = (summary: EvidenceSummary): string =>
  `More evidence is needed before suggesting a support change. Current evidence includes ${summary.sessionCount} of ${summary.threshold.minimumSessions} required sessions and ${summary.scorableResponseCount} of ${summary.threshold.minimumScorableResponses} required scorable responses.`;

const resultAndTrace = ({
  auditId,
  resultId,
  studentId,
  sessionIds,
  evidenceStartAt,
  evidenceEndAt,
  provider,
  model,
  promptVersion,
  status,
  summary,
  recommendations,
  evidenceSufficient,
  createdAt,
}: Readonly<{
  auditId: string;
  resultId: string;
  studentId: string;
  sessionIds: readonly string[];
  evidenceStartAt: number;
  evidenceEndAt: number;
  provider: 'fake' | 'openai';
  model: string;
  promptVersion: string;
  status: AuditTrace['status'];
  summary: string;
  recommendations: readonly z.infer<typeof auditRecommendationSchema>[];
  evidenceSufficient: boolean;
  createdAt: number;
}>): Readonly<{ trace: AuditTrace; result: AuditResult }> => {
  auditTraceIdSchema.parse(auditId);
  auditResultIdSchema.parse(resultId);
  const trace = auditTraceSchema.parse({
    id: auditId,
    studentId,
    sessionIds,
    evidenceStartAt,
    evidenceEndAt,
    promptVersion,
    model,
    provider,
    status,
    createdAt,
  });
  const result = auditResultSchema.parse({
    id: resultId,
    traceId: trace.id,
    studentId,
    evidenceSufficient,
    summary,
    recommendations,
    reviewStatus: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt,
  });
  return Object.freeze({ trace, result });
};

export const runEvidenceAudit = async ({
  auditId,
  resultId,
  classroomId,
  studentId,
  teacherId,
  activeSupportPlanId,
  activeSupportPlanVersion,
  evidence,
  provider,
  createdAt,
}: Readonly<{
  auditId: string;
  resultId: string;
  classroomId: string;
  studentId: string;
  teacherId: TeacherId;
  activeSupportPlanId: string;
  activeSupportPlanVersion: number;
  evidence: BuiltAuditEvidence;
  provider: AuditProvider;
  createdAt: number;
}>): Promise<AuditRecord> => {
  const timestamps = [
    ...evidence.sessions.flatMap((session) => [session.startedAt, session.updatedAt]),
    ...evidence.attempts.map((attempt) => attempt.createdAt),
    ...evidence.supportEvents.map((event) => event.createdAt),
  ];
  const common = {
    auditId,
    resultId,
    studentId,
    sessionIds: evidence.sessions.map((session) => session.id),
    evidenceStartAt: Math.min(...timestamps),
    evidenceEndAt: Math.max(...timestamps),
    createdAt,
  } as const;

  let completed: Readonly<{ trace: AuditTrace; result: AuditResult }>;
  if (!evidence.packet.summary.evidenceSufficient) {
    completed = resultAndTrace({
      ...common,
      provider: 'fake',
      model: AUDIT_THRESHOLD_MODEL,
      promptVersion: AUDIT_THRESHOLD_PROMPT_VERSION,
      status: 'insufficientEvidence',
      summary: insufficientSummary(evidence.packet.summary),
      recommendations: [],
      evidenceSufficient: false,
    });
  } else {
    try {
      const draft = assertGroundedAndConservative(
        evidence.packet,
        await provider.auditSupports(evidence.packet),
      );
      const candidate = resultAndTrace({
        ...common,
        provider: provider.name,
        model: provider.model,
        promptVersion: provider.promptVersion,
        status: 'completed',
        summary: deterministicSummary(evidence.packet.summary, draft.recommendations.length),
        recommendations: draft.recommendations,
        evidenceSufficient: true,
      });
      const safety = checkAuditSafety(
        candidate.result,
        new Set(evidence.packet.eventFacts.map((fact) => fact.eventId)),
      );
      if (!safety.ok || FORBIDDEN_AUDIT_LANGUAGE.test(candidate.result.summary)) {
        throw new AuditManualFallbackError('unsafe_output');
      }
      completed = candidate;
    } catch (error) {
      if (!(error instanceof AuditManualFallbackError) && !(error instanceof z.ZodError)) {
        throw error;
      }
      completed = resultAndTrace({
        ...common,
        provider: provider.name,
        model: provider.model,
        promptVersion: provider.promptVersion,
        status: 'failed',
        summary: AUDIT_MANUAL_REVIEW_SUMMARY,
        recommendations: [],
        evidenceSufficient: true,
      });
    }
  }

  return auditRecordSchema.parse({
    id: auditId,
    classroomId,
    studentId,
    createdBy: teacherId,
    activeSupportPlanId,
    activeSupportPlanVersion,
    evidenceCounts: {
      sessions: evidence.sessions.length,
      attempts: evidence.attempts.length,
      supportEvents: evidence.supportEvents.length,
    },
    evidenceSummary: evidence.packet.summary,
    trace: completed.trace,
    result: completed.result,
    createdAt,
  });
};

export const auditSupportedActions = Object.freeze({
  supportKeys: SUPPORT_KEYS,
  actions: ['keep', 'add', 'remove', 'observe'] as const,
});
