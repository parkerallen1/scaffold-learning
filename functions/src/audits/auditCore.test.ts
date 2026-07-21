import { describe, expect, it, vi } from 'vitest';

import {
  attemptEventSchema,
  eventIdSchema,
  sessionStateSchema,
  syntheticDomainFixtures,
  syntheticIds,
  type AuditRecommendation,
} from '@scaffold-learning/domain';

import {
  AuditManualFallbackError,
  type AuditProvider,
  type AuditProviderDraft,
} from './auditContracts.js';
import {
  AUDIT_MANUAL_REVIEW_SUMMARY,
  buildAuditEvidence,
  MAX_AUDIT_ATTEMPTS,
  runEvidenceAudit,
} from './auditCore.js';
import type { AuditEvidenceError } from './auditCore.js';
import { FakeAuditProvider } from './fakeAuditProvider.js';

const sessions = ['session_audit_01', 'session_audit_02'].map((id, index) =>
  sessionStateSchema.parse({
    ...syntheticDomainFixtures.session,
    id,
    status: 'completed',
    currentQuestionId: null,
    startedAt: syntheticIds.now + index * 100_000,
    updatedAt: syntheticIds.now + index * 100_000 + 50_000,
    completedAt: syntheticIds.now + index * 100_000 + 50_000,
  }),
);

const attempts = Array.from({ length: 10 }, (_, index) =>
  attemptEventSchema.parse({
    ...syntheticDomainFixtures.attemptEvent,
    id: `event_audit_${String(index).padStart(2, '0')}`,
    idempotencyKey: `audit_attempt_key_${String(index).padStart(2, '0')}`,
    sessionId: sessions[index % sessions.length]!.id,
    questionId: `question_audit_${String(index).padStart(2, '0')}`,
    attemptNumber: 1,
    createdAt: syntheticIds.now + index * 1_000,
    clientOccurredAt: syntheticIds.now + index * 1_000,
    elapsedMs: 10_000 + index,
  }),
);

const sufficientEvidence = () =>
  buildAuditEvidence({
    studentId: syntheticIds.studentId,
    sessions,
    attempts,
    supportEvents: [
      {
        ...syntheticDomainFixtures.supportEvent,
        sessionId: sessions[0]!.id,
      },
    ],
    activeSupports: syntheticDomainFixtures.supportPlan.supports,
  });

const run = (provider: AuditProvider, evidence = sufficientEvidence()) =>
  runEvidenceAudit({
    auditId: 'audit_trace_packet_01',
    resultId: 'audit_result_packet_01',
    classroomId: syntheticIds.classroomId,
    studentId: syntheticIds.studentId,
    teacherId: syntheticIds.teacherId,
    activeSupportPlanId: syntheticIds.supportPlanId,
    activeSupportPlanVersion: 1,
    evidence,
    provider,
    createdAt: syntheticIds.now + 300_000,
  });

const providerReturning = (recommendations: readonly AuditRecommendation[]): AuditProvider => ({
  name: 'openai',
  model: 'test-model',
  promptVersion: 'test-audit-v1',
  auditSupports: vi.fn<() => Promise<AuditProviderDraft>>().mockResolvedValue({ recommendations }),
});

describe('bounded deterministic audit evidence', () => {
  it('calculates the canonical threshold without exposing submitted answers in event facts', () => {
    const evidence = sufficientEvidence();

    expect(evidence.packet.summary).toMatchObject({
      sessionCount: 2,
      scorableResponseCount: 10,
      evidenceSufficient: true,
    });
    expect(JSON.stringify(evidence.packet)).not.toContain('submittedAnswer');
    expect(evidence.packet.eventFacts).toHaveLength(11);
  });

  it('rejects oversized and cross-student windows', () => {
    expect(() =>
      buildAuditEvidence({
        studentId: syntheticIds.studentId,
        sessions,
        attempts: Array.from({ length: MAX_AUDIT_ATTEMPTS + 1 }, () => attempts[0]),
        supportEvents: [],
        activeSupports: syntheticDomainFixtures.supportPlan.supports,
      }),
    ).toThrowError(expect.objectContaining<Partial<AuditEvidenceError>>({ reason: 'too-large' }));

    expect(() =>
      buildAuditEvidence({
        studentId: 'student_other_01',
        sessions,
        attempts,
        supportEvents: [],
        activeSupports: syntheticDomainFixtures.supportPlan.supports,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AuditEvidenceError>>({ reason: 'identity-mismatch' }),
    );
  });

  it('does not call a provider or recommend a change below the default threshold', async () => {
    const provider = providerReturning([]);
    const insufficient = buildAuditEvidence({
      studentId: syntheticIds.studentId,
      sessions: [sessions[0]],
      attempts: attempts.filter((attempt) => attempt.sessionId === sessions[0]!.id),
      supportEvents: [],
      activeSupports: syntheticDomainFixtures.supportPlan.supports,
    });

    const record = await run(provider, insufficient);

    expect(provider.auditSupports).not.toHaveBeenCalled();
    expect(record.trace.status).toBe('insufficientEvidence');
    expect(record.result.evidenceSufficient).toBe(false);
    expect(record.result.recommendations).toEqual([]);
  });
});

describe('audit grounding and fallback', () => {
  it('accepts the deterministic fake provider as a conservative observe result', async () => {
    const record = await run(new FakeAuditProvider());

    expect(record.trace).toMatchObject({ status: 'completed', provider: 'fake' });
    expect(record.result.recommendations).toHaveLength(1);
    expect(record.result.recommendations[0]).toMatchObject({
      action: 'observe',
      confidence: 'low',
    });
  });

  it('falls back when a provider invents an event or paraphrases a supplied fact', async () => {
    const provider = providerReturning([
      {
        action: 'observe',
        supportKey: 'readingChunks',
        evidence: [
          {
            metric: 'supportUse',
            observation: 'The student benefited from chunking.',
            sourceEventIds: [eventIdSchema.parse('event_invented_01')],
          },
        ],
        alternativeExplanations: ['The item may have been easier.'],
        confidence: 'low',
        reviewAfterSessions: 2,
      },
    ]);

    const record = await run(provider);

    expect(record.trace.status).toBe('failed');
    expect(record.result.summary).toBe(AUDIT_MANUAL_REVIEW_SUMMARY);
    expect(record.result.recommendations).toEqual([]);
  });

  it('falls back for diagnostic, causal, or peer-comparison language', async () => {
    const fact = sufficientEvidence().packet.eventFacts[0]!;
    const provider = providerReturning([
      {
        action: 'observe',
        supportKey: 'readingChunks',
        evidence: [
          {
            metric: fact.metric,
            observation: fact.observation,
            sourceEventIds: [eventIdSchema.parse(fact.eventId)],
          },
        ],
        alternativeExplanations: ['This may be caused by ADHD compared with peers.'],
        confidence: 'low',
        reviewAfterSessions: 2,
      },
    ]);

    expect((await run(provider)).trace.status).toBe('failed');
  });

  it('turns refusal, timeout, or malformed provider output into the same stable result', async () => {
    const provider: AuditProvider = {
      name: 'openai',
      model: 'test-model',
      promptVersion: 'test-audit-v1',
      auditSupports: vi.fn().mockRejectedValue(new AuditManualFallbackError('refusal')),
    };

    const record = await run(provider);

    expect(record.trace.status).toBe('failed');
    expect(record.result).toMatchObject({
      evidenceSufficient: true,
      summary: AUDIT_MANUAL_REVIEW_SUMMARY,
      recommendations: [],
      reviewStatus: 'pending',
    });
  });
});
