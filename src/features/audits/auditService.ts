import { httpsCallable } from 'firebase/functions';
import { z } from 'zod';

import {
  SUPPORT_KEYS,
  auditResultSchema,
  auditTraceIdSchema,
  classroomIdSchema,
  studentIdSchema,
  supportKeySchema,
  supportPlanIdSchema,
  supportPlanVersionSchema,
  supportSettingsSchema,
  teacherIdSchema,
  type AuditResult,
  type EvidenceSummary,
  type SupportPlanVersion,
  type SupportSettings,
} from '@/lib/domain';
import { firebaseRuntime, functions } from '@/lib/firebase';

const AUDIT_ERROR = 'Unable to update this student’s evidence review. Please try again.';

type AuditIdentity = Readonly<{ classroomId: string; studentId: string }>;

const supportCountsSchema = z
  .object(
    Object.fromEntries(
      SUPPORT_KEYS.map((supportKey) => [supportKey, z.number().int().nonnegative()]),
    ) as Record<(typeof SUPPORT_KEYS)[number], z.ZodNumber>,
  )
  .strict();

const evidenceSummarySchema = z
  .object({
    sessionCount: z.number().int().nonnegative(),
    completedSessionCount: z.number().int().nonnegative(),
    scorableResponseCount: z.number().int().nonnegative(),
    correctResponseCount: z.number().int().nonnegative(),
    firstAttemptCorrectCount: z.number().int().nonnegative(),
    totalScorableAttempts: z.number().int().nonnegative(),
    averageAttemptsToSuccess: z.number().nonnegative().nullable(),
    averageElapsedMs: z.number().nonnegative().nullable(),
    activatedSupportCounts: supportCountsSchema,
    recoveriesAfterSupport: supportCountsSchema,
    evidenceSufficient: z.boolean(),
    threshold: z
      .object({
        minimumSessions: z.number().int().positive(),
        minimumScorableResponses: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

const auditResponseSchema = z
  .object({
    auditId: auditTraceIdSchema,
    status: z.enum(['insufficientEvidence', 'completed', 'failed']),
    evidenceSummary: evidenceSummarySchema,
    result: auditResultSchema,
    claimsRefreshRequired: z.boolean(),
  })
  .strict();

export const auditDecisionInputSchema = z.discriminatedUnion('decision', [
  z
    .object({
      recommendationIndex: z.number().int().min(0).max(1),
      decision: z.literal('approve'),
      editedSettings: supportSettingsSchema.optional(),
    })
    .strict(),
  z
    .object({
      recommendationIndex: z.number().int().min(0).max(1),
      decision: z.literal('reject'),
    })
    .strict(),
  z
    .object({
      recommendationIndex: z.number().int().min(0).max(1),
      decision: z.literal('observe'),
    })
    .strict(),
]);

const persistedDecisionItemSchema = z
  .object({
    recommendationIndex: z.number().int().min(0).max(1),
    supportKey: supportKeySchema,
    recommendedAction: z.enum(['keep', 'add', 'adjust', 'remove', 'observe']),
    decision: z.enum(['approve', 'reject', 'observe']),
    appliedSettings: supportSettingsSchema.optional(),
  })
  .strict();

const auditDecisionRecordSchema = z
  .object({
    id: z.literal('final_decision'),
    auditId: auditTraceIdSchema,
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    sourcePlanId: supportPlanIdSchema,
    sourcePlanVersion: z.number().int().positive(),
    createdPlanId: supportPlanIdSchema.nullable(),
    createdPlanVersion: z.number().int().positive().nullable(),
    planChanged: z.boolean(),
    decisions: z.array(persistedDecisionItemSchema).max(2),
    teacherNote: z.string().trim().max(1000).optional(),
    reviewedBy: teacherIdSchema,
    reviewedAt: z.number().int().nonnegative(),
  })
  .strict();

const activePointerSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    activePlanId: supportPlanIdSchema,
    activeVersion: z.number().int().positive(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

const reviewResponseSchema = z
  .object({
    decision: auditDecisionRecordSchema,
    supportPlan: supportPlanVersionSchema.nullable(),
    activePointer: activePointerSchema.nullable(),
    claimsRefreshRequired: z.boolean(),
  })
  .strict();

export type AuditDecisionInput = z.infer<typeof auditDecisionInputSchema>;
export type AuditDecisionRecord = z.infer<typeof auditDecisionRecordSchema>;

export type StudentAudit = Readonly<{
  auditId: string;
  status: 'insufficientEvidence' | 'completed' | 'failed';
  evidenceSummary: EvidenceSummary;
  result: AuditResult;
}>;

export type AuditReviewOutcome = Readonly<{
  decision: AuditDecisionRecord;
  supportPlan: SupportPlanVersion | null;
}>;

const auditStudentEvidenceCallable = httpsCallable<AuditIdentity, unknown>(
  functions,
  'auditStudentEvidence',
  firebaseRuntime.callableOptions,
);
const reviewStudentAuditCallable = httpsCallable<
  AuditIdentity & {
    auditId: string;
    decisions: AuditDecisionInput[];
    teacherNote?: string;
  },
  unknown
>(functions, 'reviewStudentAudit', firebaseRuntime.callableOptions);

const identityFor = (identity: AuditIdentity) => ({
  classroomId: classroomIdSchema.parse(identity.classroomId),
  studentId: studentIdSchema.parse(identity.studentId),
});

const safely = async <Result>(action: () => Promise<Result>): Promise<Result> => {
  try {
    return await action();
  } catch {
    throw new Error(AUDIT_ERROR);
  }
};

export const auditStudentEvidence = (input: AuditIdentity): Promise<StudentAudit> =>
  safely(async () => {
    const identity = identityFor(input);
    const response = await auditStudentEvidenceCallable(identity);
    const parsed = auditResponseSchema.parse(response.data);
    if (
      parsed.result.traceId !== parsed.auditId ||
      parsed.result.studentId !== identity.studentId ||
      parsed.result.reviewStatus !== 'pending' ||
      parsed.result.reviewedBy !== null ||
      parsed.result.reviewedAt !== null ||
      parsed.result.evidenceSufficient !== parsed.evidenceSummary.evidenceSufficient ||
      (parsed.status === 'insufficientEvidence' &&
        (parsed.evidenceSummary.evidenceSufficient || parsed.result.recommendations.length > 0)) ||
      (parsed.status !== 'insufficientEvidence' && !parsed.evidenceSummary.evidenceSufficient) ||
      (parsed.status === 'failed' && parsed.result.recommendations.length > 0)
    ) {
      throw new Error(AUDIT_ERROR);
    }
    return {
      auditId: parsed.auditId,
      status: parsed.status,
      evidenceSummary: parsed.evidenceSummary,
      result: parsed.result,
    };
  });

export const reviewStudentAudit = (
  input: AuditIdentity & {
    auditId: string;
    decisions: readonly AuditDecisionInput[];
    teacherNote?: string;
  },
): Promise<AuditReviewOutcome> =>
  safely(async () => {
    const identity = identityFor(input);
    const auditId = auditTraceIdSchema.parse(input.auditId);
    const decisions = z.array(auditDecisionInputSchema).max(2).parse(input.decisions);
    if (
      new Set(decisions.map(({ recommendationIndex }) => recommendationIndex)).size !==
      decisions.length
    ) {
      throw new Error(AUDIT_ERROR);
    }
    const teacherNote = input.teacherNote?.trim();
    if (teacherNote !== undefined && teacherNote.length > 1000) throw new Error(AUDIT_ERROR);

    const response = await reviewStudentAuditCallable({
      ...identity,
      auditId,
      decisions,
      ...(teacherNote ? { teacherNote } : {}),
    });
    const parsed = reviewResponseSchema.parse(response.data);
    const { decision, supportPlan, activePointer } = parsed;
    const decisionsMatch = decisions.every((inputDecision) => {
      const persisted = decision.decisions.find(
        ({ recommendationIndex }) => recommendationIndex === inputDecision.recommendationIndex,
      );
      return persisted?.decision === inputDecision.decision;
    });
    if (
      decision.auditId !== auditId ||
      decision.classroomId !== identity.classroomId ||
      decision.studentId !== identity.studentId ||
      decision.decisions.length !== decisions.length ||
      !decisionsMatch ||
      decision.teacherNote !== (teacherNote || undefined) ||
      (decision.planChanged &&
        (supportPlan === null ||
          activePointer === null ||
          decision.createdPlanId !== supportPlan.id ||
          decision.createdPlanVersion !== supportPlan.version ||
          supportPlan.source !== 'audit' ||
          supportPlan.classroomId !== identity.classroomId ||
          supportPlan.studentId !== identity.studentId ||
          supportPlan.supersedesId !== decision.sourcePlanId ||
          supportPlan.version !== decision.sourcePlanVersion + 1 ||
          activePointer.classroomId !== identity.classroomId ||
          activePointer.studentId !== identity.studentId ||
          activePointer.activePlanId !== supportPlan.id ||
          activePointer.activeVersion !== supportPlan.version)) ||
      (!decision.planChanged &&
        (supportPlan !== null ||
          activePointer !== null ||
          decision.createdPlanId !== null ||
          decision.createdPlanVersion !== null))
    ) {
      throw new Error(AUDIT_ERROR);
    }
    return { decision, supportPlan };
  });

export const auditServiceErrorMessage = AUDIT_ERROR;

export const parseEditedAuditSettings = (settings: unknown): SupportSettings =>
  supportSettingsSchema.parse(settings);
