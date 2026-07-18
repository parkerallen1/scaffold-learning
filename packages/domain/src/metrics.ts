import type { AttemptEvent, SessionState, SupportEvent } from './sessions.js';
import { SUPPORT_KEYS, type SupportKey } from './supports.js';

export type EvidenceThreshold = Readonly<{
  minimumSessions: number;
  minimumScorableResponses: number;
}>;

export const DEFAULT_EVIDENCE_THRESHOLD: EvidenceThreshold = Object.freeze({
  minimumSessions: 2,
  minimumScorableResponses: 10,
});

export type EvidenceSummary = Readonly<{
  sessionCount: number;
  completedSessionCount: number;
  scorableResponseCount: number;
  correctResponseCount: number;
  firstAttemptCorrectCount: number;
  totalScorableAttempts: number;
  averageAttemptsToSuccess: number | null;
  averageElapsedMs: number | null;
  activatedSupportCounts: Readonly<Record<SupportKey, number>>;
  recoveriesAfterSupport: Readonly<Record<SupportKey, number>>;
  evidenceSufficient: boolean;
  threshold: EvidenceThreshold;
}>;

const emptySupportCounts = (): Record<SupportKey, number> =>
  Object.fromEntries(SUPPORT_KEYS.map((supportKey) => [supportKey, 0])) as Record<
    SupportKey,
    number
  >;

const responseKey = (event: Pick<AttemptEvent, 'questionId' | 'sessionId'>): string =>
  `${event.sessionId}\0${event.questionId}`;

export const calculateEvidenceSummary = ({
  sessions,
  attempts,
  supportEvents,
  threshold = DEFAULT_EVIDENCE_THRESHOLD,
}: Readonly<{
  sessions: readonly SessionState[];
  attempts: readonly AttemptEvent[];
  supportEvents: readonly SupportEvent[];
  threshold?: EvidenceThreshold;
}>): EvidenceSummary => {
  const sessionIds = new Set(sessions.map((session) => session.id));
  const scopedAttempts = attempts
    .filter(
      (attempt) =>
        sessionIds.has(attempt.sessionId) &&
        (attempt.outcome === 'correct' || attempt.outcome === 'incorrect'),
    )
    .sort(
      (left, right) => left.createdAt - right.createdAt || left.attemptNumber - right.attemptNumber,
    );
  const scopedSupportEvents = supportEvents.filter((event) => sessionIds.has(event.sessionId));

  const attemptsByResponse = new Map<string, AttemptEvent[]>();
  for (const attempt of scopedAttempts) {
    const key = responseKey(attempt);
    attemptsByResponse.set(key, [...(attemptsByResponse.get(key) ?? []), attempt]);
  }

  let correctResponseCount = 0;
  let firstAttemptCorrectCount = 0;
  let totalAttemptsToSuccess = 0;
  let successfulResponseCount = 0;

  for (const responseAttempts of attemptsByResponse.values()) {
    const orderedAttempts = responseAttempts.sort(
      (left, right) => left.attemptNumber - right.attemptNumber || left.createdAt - right.createdAt,
    );
    const successfulAttemptIndex = orderedAttempts.findIndex(
      (attempt) => attempt.outcome === 'correct',
    );
    if (successfulAttemptIndex >= 0) {
      correctResponseCount += 1;
      successfulResponseCount += 1;
      totalAttemptsToSuccess += successfulAttemptIndex + 1;
      if (successfulAttemptIndex === 0) {
        firstAttemptCorrectCount += 1;
      }
    }
  }

  const activatedSupportCounts = emptySupportCounts();
  const recoveriesAfterSupport = emptySupportCounts();
  const activatedByResponse = new Map<string, SupportEvent[]>();
  for (const event of scopedSupportEvents) {
    if (event.action !== 'activated') continue;
    activatedSupportCounts[event.supportKey] += 1;
    if (event.questionId === null) continue;
    const key = `${event.sessionId}\0${event.questionId}`;
    activatedByResponse.set(key, [...(activatedByResponse.get(key) ?? []), event]);
  }

  for (const [key, activatedEvents] of activatedByResponse) {
    const firstCorrect = (attemptsByResponse.get(key) ?? []).find(
      (attempt) => attempt.outcome === 'correct',
    );
    if (!firstCorrect) continue;

    for (const supportKey of new Set(
      activatedEvents
        .filter((event) => event.createdAt <= firstCorrect.createdAt)
        .map((event) => event.supportKey),
    )) {
      recoveriesAfterSupport[supportKey] += 1;
    }
  }

  const totalElapsedMs = scopedAttempts.reduce((total, attempt) => total + attempt.elapsedMs, 0);
  const scorableResponseCount = attemptsByResponse.size;
  const completedSessionCount = new Set(
    sessions.filter((session) => session.status === 'completed').map((session) => session.id),
  ).size;
  const evidenceSufficient =
    sessionIds.size >= threshold.minimumSessions &&
    scorableResponseCount >= threshold.minimumScorableResponses;

  return Object.freeze({
    sessionCount: sessionIds.size,
    completedSessionCount,
    scorableResponseCount,
    correctResponseCount,
    firstAttemptCorrectCount,
    totalScorableAttempts: scopedAttempts.length,
    averageAttemptsToSuccess:
      successfulResponseCount === 0 ? null : totalAttemptsToSuccess / successfulResponseCount,
    averageElapsedMs: scopedAttempts.length === 0 ? null : totalElapsedMs / scopedAttempts.length,
    activatedSupportCounts: Object.freeze(activatedSupportCounts),
    recoveriesAfterSupport: Object.freeze(recoveriesAfterSupport),
    evidenceSufficient,
    threshold: Object.freeze({ ...threshold }),
  });
};
