import { z } from 'zod';

import {
  auditResultIdSchema,
  auditTraceIdSchema,
  epochMillisSchema,
  eventIdSchema,
  sessionIdSchema,
  studentIdSchema,
  teacherIdSchema,
} from './ids.js';
import { supportKeySchema, supportSettingsSchema } from './supports.js';

export const auditEvidenceSchema = z
  .object({
    metric: z.string().trim().min(1).max(120),
    observation: z.string().trim().min(1).max(600),
    sourceEventIds: z.array(eventIdSchema).max(100),
  })
  .strict();

export const auditTraceSchema = z
  .object({
    id: auditTraceIdSchema,
    studentId: studentIdSchema,
    sessionIds: z.array(sessionIdSchema).min(1).max(50),
    evidenceStartAt: epochMillisSchema,
    evidenceEndAt: epochMillisSchema,
    promptVersion: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    provider: z.enum(['fake', 'openai']),
    status: z.enum(['insufficientEvidence', 'completed', 'failed']),
    createdAt: epochMillisSchema,
  })
  .strict()
  .readonly();

export const auditRecommendationSchema = z
  .object({
    action: z.enum(['keep', 'add', 'adjust', 'remove', 'observe']),
    supportKey: supportKeySchema,
    proposedSettings: supportSettingsSchema.optional(),
    evidence: z.array(auditEvidenceSchema).min(1).max(12),
    alternativeExplanations: z.array(z.string().trim().min(1).max(500)).max(6),
    confidence: z.enum(['low', 'medium', 'high']),
    reviewAfterSessions: z.number().int().min(1).max(20),
  })
  .strict()
  .superRefine((recommendation, context) => {
    if (
      recommendation.proposedSettings !== undefined &&
      recommendation.proposedSettings.supportKey !== recommendation.supportKey
    ) {
      context.addIssue({
        code: 'custom',
        path: ['proposedSettings', 'supportKey'],
        message: 'The proposed settings must match the support key.',
      });
    }
  });

export const auditResultSchema = z
  .object({
    id: auditResultIdSchema,
    traceId: auditTraceIdSchema,
    studentId: studentIdSchema,
    evidenceSufficient: z.boolean(),
    summary: z.string().trim().min(1).max(1000),
    recommendations: z.array(auditRecommendationSchema).max(2),
    reviewStatus: z.enum(['pending', 'approved', 'rejected', 'edited']),
    reviewedBy: teacherIdSchema.nullable(),
    reviewedAt: epochMillisSchema.nullable(),
    createdAt: epochMillisSchema,
  })
  .strict();

export type AuditEvidence = z.infer<typeof auditEvidenceSchema>;
export type AuditTrace = z.infer<typeof auditTraceSchema>;
export type AuditRecommendation = z.infer<typeof auditRecommendationSchema>;
export type AuditResult = z.infer<typeof auditResultSchema>;

export type AuditSafetyIssue = Readonly<{
  code:
    | 'diagnosticOrCausalClaim'
    | 'insufficientEvidenceChange'
    | 'lowConfidenceChange'
    | 'unknownEventCitation';
  recommendationIndex: number | null;
  detail: string;
}>;

export type AuditSafetyResult = Readonly<{
  ok: boolean;
  issues: readonly AuditSafetyIssue[];
}>;

const UNSAFE_AUDIT_CLAIM_PATTERN =
  /\b(diagnos(?:e|ed|is)|disorder|caused by|proves? that|because of (?:their|his|her)|compared (?:with|to) (?:peers|classmates)|below (?:peers|classmates))\b/i;

export const checkAuditSafety = (
  rawResult: AuditResult,
  allowedEventIds: ReadonlySet<string>,
): AuditSafetyResult => {
  const result = auditResultSchema.parse(rawResult);
  const issues: AuditSafetyIssue[] = [];

  if (!result.evidenceSufficient && result.recommendations.length > 0) {
    issues.push({
      code: 'insufficientEvidenceChange',
      recommendationIndex: null,
      detail: 'An insufficient-evidence result cannot propose support changes.',
    });
  }

  if (UNSAFE_AUDIT_CLAIM_PATTERN.test(result.summary)) {
    issues.push({
      code: 'diagnosticOrCausalClaim',
      recommendationIndex: null,
      detail: 'Audit summary contains diagnostic, causal, or peer-comparison language.',
    });
  }

  result.recommendations.forEach((recommendation, recommendationIndex) => {
    if (recommendation.confidence === 'low' && recommendation.action !== 'observe') {
      issues.push({
        code: 'lowConfidenceChange',
        recommendationIndex,
        detail: 'Low-confidence evidence may only produce an observe recommendation.',
      });
    }

    const recommendationCopy = [
      ...recommendation.evidence.map((evidence) => evidence.observation),
      ...recommendation.alternativeExplanations,
    ].join(' ');
    if (UNSAFE_AUDIT_CLAIM_PATTERN.test(recommendationCopy)) {
      issues.push({
        code: 'diagnosticOrCausalClaim',
        recommendationIndex,
        detail: 'Recommendation contains diagnostic, causal, or peer-comparison language.',
      });
    }

    for (const evidence of recommendation.evidence) {
      for (const eventId of evidence.sourceEventIds) {
        if (!allowedEventIds.has(eventId)) {
          issues.push({
            code: 'unknownEventCitation',
            recommendationIndex,
            detail: eventId,
          });
        }
      }
    }
  });

  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
};
