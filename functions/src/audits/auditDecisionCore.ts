import { z } from 'zod';

import {
  auditTraceIdSchema,
  classroomIdSchema,
  epochMillisSchema,
  studentIdSchema,
  supportKeySchema,
  supportPlanIdSchema,
  supportPlanVersionSchema,
  supportSettingsSchema,
  teacherIdSchema,
  type SupportPlanVersion,
  type SupportSettings,
  type TeacherId,
} from '@scaffold-learning/domain';

import {
  activePointerFor,
  buildSupportPlanVersion,
  type ActiveSupportPlanPointer,
} from '../planning/supportPlanPersistenceCore.js';
import { auditRecordSchema, type AuditRecord } from './auditCore.js';

export const FINAL_AUDIT_DECISION_ID = 'final_decision';

const recommendationIndexSchema = z.number().int().min(0).max(1);

export const auditRecommendationDecisionInputSchema = z.discriminatedUnion('decision', [
  z
    .object({
      recommendationIndex: recommendationIndexSchema,
      decision: z.literal('approve'),
      editedSettings: supportSettingsSchema.optional(),
    })
    .strict(),
  z
    .object({
      recommendationIndex: recommendationIndexSchema,
      decision: z.literal('reject'),
    })
    .strict(),
  z
    .object({
      recommendationIndex: recommendationIndexSchema,
      decision: z.literal('observe'),
    })
    .strict(),
]);

export const reviewStudentAuditInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    auditId: auditTraceIdSchema,
    decisions: z
      .array(auditRecommendationDecisionInputSchema)
      .max(2)
      .superRefine((decisions, context) => {
        const indexes = decisions.map((decision) => decision.recommendationIndex);
        if (new Set(indexes).size !== indexes.length) {
          context.addIssue({
            code: 'custom',
            path: [],
            message: 'Each recommendation may be decided only once.',
          });
        }
      }),
    teacherNote: z.string().trim().max(1000).optional(),
  })
  .strict();

// Define this separately from the transport union so the persisted record is
// explicit about the grounded recommendation and any teacher-applied setting.
export const persistedAuditRecommendationDecisionSchema = z
  .object({
    recommendationIndex: recommendationIndexSchema,
    supportKey: supportKeySchema,
    recommendedAction: z.enum(['keep', 'add', 'adjust', 'remove', 'observe']),
    decision: z.enum(['approve', 'reject', 'observe']),
    appliedSettings: supportSettingsSchema.optional(),
  })
  .strict();

export const auditDecisionRecordSchema = z
  .object({
    id: z.literal(FINAL_AUDIT_DECISION_ID),
    auditId: auditTraceIdSchema,
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    sourcePlanId: supportPlanIdSchema,
    sourcePlanVersion: z.number().int().positive(),
    createdPlanId: supportPlanIdSchema.nullable(),
    createdPlanVersion: z.number().int().positive().nullable(),
    planChanged: z.boolean(),
    decisions: z.array(persistedAuditRecommendationDecisionSchema).max(2),
    teacherNote: z.string().trim().max(1000).optional(),
    reviewedBy: teacherIdSchema,
    reviewedAt: epochMillisSchema,
  })
  .strict();

export type AuditDecisionRecord = z.infer<typeof auditDecisionRecordSchema>;
export type AuditRecommendationDecisionInput = z.infer<
  typeof auditRecommendationDecisionInputSchema
>;

export class AuditDecisionError extends Error {
  constructor(
    readonly reason:
      | 'audit-not-pending'
      | 'duplicate-decision'
      | 'stale-plan'
      | 'invalid-selection'
      | 'invalid-edited-support'
      | 'invalid-transition',
  ) {
    super('The audit decision was rejected.');
    this.name = 'AuditDecisionError';
  }
}

const supportsEqual = (
  left: readonly SupportSettings[],
  right: readonly SupportSettings[],
): boolean => JSON.stringify(left) === JSON.stringify(right);

const validatedDecisionSettings = (
  decision: AuditRecommendationDecisionInput & { decision: 'approve' },
  recommendation: AuditRecord['result']['recommendations'][number],
): SupportSettings => {
  const candidate = decision.editedSettings ?? recommendation.proposedSettings;
  const parsed = supportSettingsSchema.safeParse(candidate);
  if (!parsed.success || parsed.data.supportKey !== recommendation.supportKey) {
    throw new AuditDecisionError('invalid-edited-support');
  }
  return parsed.data;
};

export type ResolvedAuditDecision = Readonly<{
  decisionRecord: AuditDecisionRecord;
  supportPlan: SupportPlanVersion | null;
  activePointer: ActiveSupportPlanPointer | null;
}>;

export const resolveAuditDecision = ({
  rawAudit,
  currentPlan: rawCurrentPlan,
  decisions: rawDecisions,
  decisionAlreadyExists,
  teacherId,
  teacherNote,
  newPlanId,
  reviewedAt,
}: Readonly<{
  rawAudit: unknown;
  currentPlan: SupportPlanVersion;
  decisions: readonly AuditRecommendationDecisionInput[];
  decisionAlreadyExists: boolean;
  teacherId: TeacherId;
  teacherNote?: string;
  newPlanId: string;
  reviewedAt: number;
}>): ResolvedAuditDecision => {
  const audit = auditRecordSchema.parse(rawAudit);
  const currentPlan = supportPlanVersionSchema.parse(rawCurrentPlan);
  const decisions = z.array(auditRecommendationDecisionInputSchema).max(2).parse(rawDecisions);

  if (decisionAlreadyExists) throw new AuditDecisionError('duplicate-decision');
  if (audit.result.reviewStatus !== 'pending') {
    throw new AuditDecisionError('audit-not-pending');
  }
  if (
    audit.result.traceId !== audit.trace.id ||
    audit.result.studentId !== audit.studentId ||
    audit.createdBy !== teacherId
  ) {
    throw new AuditDecisionError('audit-not-pending');
  }
  if (
    currentPlan.id !== audit.activeSupportPlanId ||
    currentPlan.version !== audit.activeSupportPlanVersion ||
    currentPlan.classroomId !== audit.classroomId ||
    currentPlan.studentId !== audit.studentId
  ) {
    throw new AuditDecisionError('stale-plan');
  }

  const recommendations = audit.result.recommendations;
  const expectedIndexes = recommendations.map((_, index) => index);
  const selectedIndexes = decisions
    .map((decision) => decision.recommendationIndex)
    .sort((left, right) => left - right);
  if (
    decisions.length !== recommendations.length ||
    expectedIndexes.some((index) => selectedIndexes[index] !== index)
  ) {
    throw new AuditDecisionError('invalid-selection');
  }

  const nextSupports = [...currentPlan.supports];
  const persistedDecisions: z.infer<typeof persistedAuditRecommendationDecisionSchema>[] = [];

  for (const decision of decisions) {
    const recommendation = recommendations[decision.recommendationIndex];
    if (recommendation === undefined) throw new AuditDecisionError('invalid-selection');
    const existingIndex = nextSupports.findIndex(
      (support) => support.supportKey === recommendation.supportKey,
    );
    let appliedSettings: SupportSettings | undefined;

    if (decision.decision === 'approve') {
      switch (recommendation.action) {
        case 'add': {
          if (existingIndex >= 0) throw new AuditDecisionError('invalid-transition');
          appliedSettings = validatedDecisionSettings(decision, recommendation);
          nextSupports.push(appliedSettings);
          break;
        }
        case 'adjust': {
          if (existingIndex < 0) throw new AuditDecisionError('invalid-transition');
          appliedSettings = validatedDecisionSettings(decision, recommendation);
          nextSupports[existingIndex] = appliedSettings;
          break;
        }
        case 'remove': {
          if (decision.editedSettings !== undefined) {
            throw new AuditDecisionError('invalid-edited-support');
          }
          if (existingIndex < 0) throw new AuditDecisionError('invalid-transition');
          nextSupports.splice(existingIndex, 1);
          break;
        }
        case 'keep': {
          if (existingIndex < 0) throw new AuditDecisionError('invalid-transition');
          if (decision.editedSettings !== undefined) {
            throw new AuditDecisionError('invalid-edited-support');
          }
          break;
        }
        case 'observe': {
          if (decision.editedSettings !== undefined) {
            throw new AuditDecisionError('invalid-edited-support');
          }
          break;
        }
      }
    }

    persistedDecisions.push(
      persistedAuditRecommendationDecisionSchema.parse({
        recommendationIndex: decision.recommendationIndex,
        supportKey: recommendation.supportKey,
        recommendedAction: recommendation.action,
        decision: decision.decision,
        ...(appliedSettings === undefined ? {} : { appliedSettings }),
      }),
    );
  }

  const planChanged = !supportsEqual(currentPlan.supports, nextSupports);
  const supportPlan = planChanged
    ? buildSupportPlanVersion({
        id: supportPlanIdSchema.parse(newPlanId),
        classroomId: audit.classroomId,
        studentId: audit.studentId,
        previous: currentPlan,
        supports: nextSupports,
        source: 'audit',
        approvedBy: teacherId,
        approvedAt: reviewedAt,
      })
    : null;
  const activePointer = supportPlan === null ? null : activePointerFor(supportPlan, reviewedAt);
  const decisionRecord = auditDecisionRecordSchema.parse({
    id: FINAL_AUDIT_DECISION_ID,
    auditId: audit.id,
    classroomId: audit.classroomId,
    studentId: audit.studentId,
    sourcePlanId: currentPlan.id,
    sourcePlanVersion: currentPlan.version,
    createdPlanId: supportPlan?.id ?? null,
    createdPlanVersion: supportPlan?.version ?? null,
    planChanged,
    decisions: persistedDecisions,
    ...(teacherNote === undefined ? {} : { teacherNote }),
    reviewedBy: teacherId,
    reviewedAt,
  });

  return Object.freeze({ decisionRecord, supportPlan, activePointer });
};
