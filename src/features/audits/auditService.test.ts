import { beforeEach, describe, expect, it, vi } from 'vitest';

import { auditStudentEvidence, reviewStudentAudit } from './auditService';

const firebaseHarness = vi.hoisted(() => ({
  callables: new Map<string, ReturnType<typeof vi.fn>>(),
}));

vi.mock('@/lib/firebase', () => ({
  firebaseRuntime: {
    useEmulators: false,
    callableOptions: { limitedUseAppCheckTokens: true },
  },
  functions: { name: 'test-functions' },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => {
    const callable = vi.fn();
    firebaseHarness.callables.set(name, callable);
    return callable;
  }),
}));

const identity = { classroomId: 'classroom-1', studentId: 'student-1' };
const supportCounts = {
  readAloud: 0,
  readingChunks: 1,
  focusView: 0,
  hintLadder: 0,
  flexibleResponse: 0,
  calmPacing: 0,
  breakPrompt: 0,
};
const evidenceSummary = {
  sessionCount: 2,
  completedSessionCount: 2,
  scorableResponseCount: 10,
  correctResponseCount: 8,
  firstAttemptCorrectCount: 6,
  totalScorableAttempts: 12,
  averageAttemptsToSuccess: 1.25,
  averageElapsedMs: 15_000,
  activatedSupportCounts: supportCounts,
  recoveriesAfterSupport: supportCounts,
  evidenceSufficient: true,
  threshold: { minimumSessions: 2, minimumScorableResponses: 10 },
};
const recommendation = {
  action: 'add',
  supportKey: 'focusView',
  proposedSettings: {
    supportKey: 'focusView' as const,
    enabled: true,
    hideNonessentialChrome: true,
  },
  evidence: [
    {
      metric: 'attemptOutcome',
      observation:
        'Attempt event_attempt_01 was recorded as correct on attempt 1, with 15000 ms elapsed.',
      sourceEventIds: ['event_attempt_01'],
    },
  ],
  alternativeExplanations: ['The item format may have affected the observed pattern.'],
  confidence: 'medium',
  reviewAfterSessions: 2,
};
const result = {
  id: 'audit_result_01',
  traceId: 'audit_trace_01',
  studentId: 'student-1',
  evidenceSufficient: true,
  summary: 'One teacher-review suggestion is available.',
  recommendations: [recommendation],
  reviewStatus: 'pending',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: 100,
};
const plan = {
  id: 'plan_audit_02',
  classroomId: 'classroom-1',
  studentId: 'student-1',
  version: 2,
  supports: [recommendation.proposedSettings],
  source: 'audit',
  approvedBy: 'teacher-1',
  approvedAt: 200,
  supersedesId: 'plan_manual_01',
};

describe('auditService', () => {
  beforeEach(() => {
    for (const callable of firebaseHarness.callables.values()) callable.mockReset();
  });

  it('strictly parses deterministic metrics and grounded recommendations', async () => {
    firebaseHarness.callables.get('auditStudentEvidence')?.mockResolvedValue({
      data: {
        auditId: 'audit_trace_01',
        status: 'completed',
        evidenceSummary,
        result,
        claimsRefreshRequired: false,
      },
    });

    await expect(auditStudentEvidence(identity)).resolves.toMatchObject({
      auditId: 'audit_trace_01',
      evidenceSummary: { sessionCount: 2, scorableResponseCount: 10 },
      result: { recommendations: [{ supportKey: 'focusView' }] },
    });
    expect(firebaseHarness.callables.get('auditStudentEvidence')).toHaveBeenCalledWith(identity);
  });

  it('rejects mismatched or malformed audit responses with a generic error', async () => {
    firebaseHarness.callables.get('auditStudentEvidence')?.mockResolvedValue({
      data: {
        auditId: 'audit_trace_01',
        status: 'completed',
        evidenceSummary,
        result: { ...result, studentId: 'student-2' },
        claimsRefreshRequired: false,
      },
    });

    await expect(auditStudentEvidence(identity)).rejects.toThrow(
      'Unable to update this student’s evidence review. Please try again.',
    );
  });

  it('validates an atomic audit plan transition and trims the teacher note', async () => {
    firebaseHarness.callables.get('reviewStudentAudit')?.mockResolvedValue({
      data: {
        decision: {
          id: 'final_decision',
          auditId: 'audit_trace_01',
          classroomId: 'classroom-1',
          studentId: 'student-1',
          sourcePlanId: 'plan_manual_01',
          sourcePlanVersion: 1,
          createdPlanId: 'plan_audit_02',
          createdPlanVersion: 2,
          planChanged: true,
          decisions: [
            {
              recommendationIndex: 0,
              supportKey: 'focusView',
              recommendedAction: 'add',
              decision: 'approve',
              appliedSettings: recommendation.proposedSettings,
            },
          ],
          teacherNote: 'Use for two sessions.',
          reviewedBy: 'teacher-1',
          reviewedAt: 200,
        },
        supportPlan: plan,
        activePointer: {
          classroomId: 'classroom-1',
          studentId: 'student-1',
          activePlanId: 'plan_audit_02',
          activeVersion: 2,
          updatedAt: 200,
        },
        claimsRefreshRequired: false,
      },
    });

    await expect(
      reviewStudentAudit({
        ...identity,
        auditId: 'audit_trace_01',
        decisions: [
          {
            recommendationIndex: 0,
            decision: 'approve',
            editedSettings: recommendation.proposedSettings,
          },
        ],
        teacherNote: '  Use for two sessions.  ',
      }),
    ).resolves.toMatchObject({ supportPlan: { id: 'plan_audit_02', source: 'audit' } });
    expect(firebaseHarness.callables.get('reviewStudentAudit')).toHaveBeenCalledWith(
      expect.objectContaining({ teacherNote: 'Use for two sessions.' }),
    );
  });

  it('rejects contradictory plan-change responses', async () => {
    firebaseHarness.callables.get('reviewStudentAudit')?.mockResolvedValue({
      data: {
        decision: {
          id: 'final_decision',
          auditId: 'audit_trace_01',
          classroomId: 'classroom-1',
          studentId: 'student-1',
          sourcePlanId: 'plan_manual_01',
          sourcePlanVersion: 1,
          createdPlanId: null,
          createdPlanVersion: null,
          planChanged: false,
          decisions: [
            {
              recommendationIndex: 0,
              supportKey: 'focusView',
              recommendedAction: 'add',
              decision: 'reject',
            },
          ],
          reviewedBy: 'teacher-1',
          reviewedAt: 200,
        },
        supportPlan: plan,
        activePointer: null,
        claimsRefreshRequired: false,
      },
    });

    await expect(
      reviewStudentAudit({
        ...identity,
        auditId: 'audit_trace_01',
        decisions: [{ recommendationIndex: 0, decision: 'reject' }],
      }),
    ).rejects.toThrow('Unable to update this student’s evidence review. Please try again.');
  });
});
