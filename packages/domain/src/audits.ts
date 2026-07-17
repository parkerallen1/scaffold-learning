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
