import { describe, expect, it } from 'vitest';

import {
  auditResultSchema,
  calculateEvidenceSummary,
  syntheticDomainFixtures,
  syntheticIds,
  type AuditRecommendation,
} from '@scaffold-learning/domain';

import { buildSupportPlanVersion } from '../planning/supportPlanPersistenceCore.js';
import {
  resolveAuditDecision,
  type AuditRecommendationDecisionInput,
} from './auditDecisionCore.js';
import type { AuditDecisionError } from './auditDecisionCore.js';
import { auditRecordSchema } from './auditCore.js';

const evidenceSummary = calculateEvidenceSummary({
  sessions: [syntheticDomainFixtures.session],
  attempts: [syntheticDomainFixtures.attemptEvent],
  supportEvents: [syntheticDomainFixtures.supportEvent],
});

const evidence = [
  {
    metric: 'supportUse',
    observation: 'Support event event_support_01 recorded activated for readingChunks.',
    sourceEventIds: [syntheticIds.supportEventId],
  },
];

const auditFor = (recommendations: readonly AuditRecommendation[]) =>
  auditRecordSchema.parse({
    id: syntheticIds.auditTraceId,
    classroomId: syntheticIds.classroomId,
    studentId: syntheticIds.studentId,
    createdBy: syntheticIds.teacherId,
    activeSupportPlanId: syntheticIds.supportPlanId,
    activeSupportPlanVersion: syntheticDomainFixtures.supportPlan.version,
    evidenceCounts: { sessions: 1, attempts: 1, supportEvents: 1 },
    evidenceSummary,
    trace: { ...syntheticDomainFixtures.auditTrace, status: 'completed' },
    result: auditResultSchema.parse({
      ...syntheticDomainFixtures.auditResult,
      recommendations,
      reviewStatus: 'pending',
      reviewedBy: null,
      reviewedAt: null,
    }),
    createdAt: syntheticIds.now,
  });

const addFocusView: AuditRecommendation = {
  action: 'add',
  supportKey: 'focusView',
  proposedSettings: {
    supportKey: 'focusView',
    enabled: true,
    hideNonessentialChrome: true,
  },
  evidence,
  alternativeExplanations: ['The item format may have affected the observed pattern.'],
  confidence: 'medium',
  reviewAfterSessions: 2,
};

const removeReadingChunks: AuditRecommendation = {
  action: 'remove',
  supportKey: 'readingChunks',
  evidence,
  alternativeExplanations: ['Recent items may have required less direction reading.'],
  confidence: 'medium',
  reviewAfterSessions: 2,
};

const resolve = (
  recommendations: readonly AuditRecommendation[],
  decisions: readonly AuditRecommendationDecisionInput[],
  overrides: Partial<Parameters<typeof resolveAuditDecision>[0]> = {},
) =>
  resolveAuditDecision({
    rawAudit: auditFor(recommendations),
    currentPlan: syntheticDomainFixtures.supportPlan,
    decisions,
    decisionAlreadyExists: false,
    teacherId: syntheticIds.teacherId,
    newPlanId: 'plan_audit_next_01',
    reviewedAt: syntheticIds.now + 10_000,
    ...overrides,
  });

describe('audit decision support-plan transitions', () => {
  it('approves an add with teacher-edited settings in a new immutable audit plan', () => {
    const resolved = resolve(
      [addFocusView],
      [
        {
          recommendationIndex: 0,
          decision: 'approve',
          editedSettings: {
            supportKey: 'focusView',
            enabled: true,
            hideNonessentialChrome: false,
          },
        },
      ],
      { teacherNote: 'Trial this setting for two more sessions.' },
    );

    expect(resolved.supportPlan).toMatchObject({
      id: 'plan_audit_next_01',
      version: 2,
      source: 'audit',
      supersedesId: syntheticIds.supportPlanId,
      approvedBy: syntheticIds.teacherId,
    });
    expect(resolved.supportPlan?.supports).toContainEqual({
      supportKey: 'focusView',
      enabled: true,
      hideNonessentialChrome: false,
    });
    expect(resolved.activePointer?.activePlanId).toBe('plan_audit_next_01');
    expect(resolved.decisionRecord).toMatchObject({
      planChanged: true,
      teacherNote: 'Trial this setting for two more sessions.',
      reviewedBy: syntheticIds.teacherId,
      createdPlanId: 'plan_audit_next_01',
    });
  });

  it('approves removal of only the support named by the stored recommendation', () => {
    const resolved = resolve(
      [removeReadingChunks],
      [{ recommendationIndex: 0, decision: 'approve' }],
    );

    expect(resolved.supportPlan?.supports.map((support) => support.supportKey)).toEqual([
      'calmPacing',
    ]);
    expect(resolved.decisionRecord.decisions[0]).toMatchObject({
      supportKey: 'readingChunks',
      recommendedAction: 'remove',
      decision: 'approve',
    });
  });

  it('records reject and observe decisions without creating a plan version', () => {
    const rejected = resolve([addFocusView], [{ recommendationIndex: 0, decision: 'reject' }]);
    const observed = resolve([addFocusView], [{ recommendationIndex: 0, decision: 'observe' }]);

    for (const resolved of [rejected, observed]) {
      expect(resolved.supportPlan).toBeNull();
      expect(resolved.activePointer).toBeNull();
      expect(resolved.decisionRecord).toMatchObject({
        planChanged: false,
        createdPlanId: null,
        createdPlanVersion: null,
      });
    }
  });

  it('rejects a stale audit when the active plan has advanced', () => {
    const advancedPlan = buildSupportPlanVersion({
      id: 'plan_advanced_01' as typeof syntheticIds.supportPlanId,
      classroomId: syntheticIds.classroomId,
      studentId: syntheticIds.studentId,
      previous: syntheticDomainFixtures.supportPlan,
      supports: syntheticDomainFixtures.supportPlan.supports,
      source: 'manual',
      approvedBy: syntheticIds.teacherId,
      approvedAt: syntheticIds.now + 5_000,
    });

    expect(() =>
      resolve([addFocusView], [{ recommendationIndex: 0, decision: 'approve' }], {
        currentPlan: advancedPlan,
      }),
    ).toThrowError(expect.objectContaining<Partial<AuditDecisionError>>({ reason: 'stale-plan' }));
  });

  it('prevents a second decision for the same audit', () => {
    expect(() =>
      resolve([addFocusView], [{ recommendationIndex: 0, decision: 'reject' }], {
        decisionAlreadyExists: true,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AuditDecisionError>>({ reason: 'duplicate-decision' }),
    );
  });

  it('rejects edited settings for a different support key', () => {
    expect(() =>
      resolve(
        [addFocusView],
        [
          {
            recommendationIndex: 0,
            decision: 'approve',
            editedSettings: { supportKey: 'readAloud', enabled: true, speed: 1 },
          },
        ],
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AuditDecisionError>>({
        reason: 'invalid-edited-support',
      }),
    );
  });
});
