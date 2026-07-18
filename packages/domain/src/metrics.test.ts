import { describe, expect, it } from 'vitest';

import type { AttemptEvent, SessionState, SupportEvent } from './sessions.js';
import { syntheticDomainFixtures } from './fixtures.js';
import { calculateEvidenceSummary } from './metrics.js';

const baseSession = syntheticDomainFixtures.session;
const baseAttempt = syntheticDomainFixtures.attemptEvent;
const baseSupportEvent = syntheticDomainFixtures.supportEvent;

describe('calculateEvidenceSummary', () => {
  it('calculates response, attempt, timing, and recovery metrics deterministically', () => {
    const firstAttempt = {
      ...baseAttempt,
      id: 'event_attempt_02',
      idempotencyKey: 'attempt_key_demo_02',
      attemptNumber: 1,
      outcome: 'incorrect',
      createdAt: 1_750_000_000_100,
      elapsedMs: 10_000,
    } as AttemptEvent;
    const secondAttempt = {
      ...baseAttempt,
      id: 'event_attempt_03',
      idempotencyKey: 'attempt_key_demo_03',
      attemptNumber: 2,
      outcome: 'correct',
      createdAt: 1_750_000_000_300,
      elapsedMs: 20_000,
    } as AttemptEvent;
    const activated = {
      ...baseSupportEvent,
      action: 'activated',
      createdAt: 1_750_000_000_200,
    } as SupportEvent;

    const summary = calculateEvidenceSummary({
      sessions: [baseSession, baseSession],
      attempts: [secondAttempt, firstAttempt],
      supportEvents: [activated],
      threshold: { minimumSessions: 1, minimumScorableResponses: 1 },
    });

    expect(summary).toMatchObject({
      sessionCount: 1,
      scorableResponseCount: 1,
      correctResponseCount: 1,
      firstAttemptCorrectCount: 0,
      totalScorableAttempts: 2,
      averageAttemptsToSuccess: 2,
      averageElapsedMs: 15_000,
      evidenceSufficient: true,
    });
    expect(summary.activatedSupportCounts.readingChunks).toBe(1);
    expect(summary.recoveriesAfterSupport.readingChunks).toBe(1);
  });

  it('counts distinct session-question responses and ignores pending or foreign events', () => {
    const foreignSession = {
      ...baseSession,
      id: 'session_demo_02',
    } as SessionState;
    const pending = { ...baseAttempt, outcome: 'pending' } as AttemptEvent;
    const foreign = {
      ...baseAttempt,
      id: 'event_attempt_04',
      idempotencyKey: 'attempt_key_demo_04',
      sessionId: foreignSession.id,
    } as AttemptEvent;

    const summary = calculateEvidenceSummary({
      sessions: [baseSession],
      attempts: [baseAttempt, pending, foreign],
      supportEvents: [],
    });

    expect(summary.scorableResponseCount).toBe(1);
    expect(summary.totalScorableAttempts).toBe(1);
    expect(summary.evidenceSufficient).toBe(false);
  });

  it('returns explicit missing-data values instead of fabricated averages', () => {
    const summary = calculateEvidenceSummary({ sessions: [], attempts: [], supportEvents: [] });

    expect(summary.averageAttemptsToSuccess).toBeNull();
    expect(summary.averageElapsedMs).toBeNull();
    expect(summary.evidenceSufficient).toBe(false);
  });
});
