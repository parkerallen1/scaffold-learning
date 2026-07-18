import { z } from 'zod';

import { supportRecommendationSchema } from './supports.js';

export const recommendationInputSchema = z
  .object({
    observations: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  })
  .strict();

export const recommendationResultSchema = z
  .object({
    provider: z.enum(['fake', 'openai']),
    promptVersion: z.string().trim().min(1).max(100),
    recommendations: z.array(supportRecommendationSchema).max(4),
  })
  .strict();

export type RecommendationInput = z.infer<typeof recommendationInputSchema>;
export type RecommendationResult = z.infer<typeof recommendationResultSchema>;

export type RecommendationSafetyIssue = Readonly<{
  code: 'diagnosticClaim' | 'duplicateSupport' | 'inventedEvidence' | 'nonProposedStatus';
  recommendationIndex: number;
  detail: string;
}>;

export type RecommendationSafetyResult = Readonly<{
  ok: boolean;
  issues: readonly RecommendationSafetyIssue[];
}>;

const normalizeEvidence = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

const DIAGNOSTIC_CLAIM_PATTERN =
  /\b(diagnos(?:e|ed|is)|likely has|appears to have|suffers from)\b/i;

export const checkRecommendationSafety = (
  rawInput: RecommendationInput,
  rawResult: RecommendationResult,
): RecommendationSafetyResult => {
  const input = recommendationInputSchema.parse(rawInput);
  const result = recommendationResultSchema.parse(rawResult);
  const normalizedObservations = input.observations.map(normalizeEvidence);
  const seenSupportKeys = new Set<string>();
  const issues: RecommendationSafetyIssue[] = [];

  result.recommendations.forEach((recommendation, recommendationIndex) => {
    if (seenSupportKeys.has(recommendation.supportKey)) {
      issues.push({
        code: 'duplicateSupport',
        recommendationIndex,
        detail: recommendation.supportKey,
      });
    }
    seenSupportKeys.add(recommendation.supportKey);

    if (recommendation.status !== 'proposed') {
      issues.push({
        code: 'nonProposedStatus',
        recommendationIndex,
        detail: recommendation.status,
      });
    }

    for (const evidence of recommendation.basedOn) {
      const normalizedEvidence = normalizeEvidence(evidence);
      const grounded = normalizedObservations.some(
        (observation) =>
          observation.includes(normalizedEvidence) || normalizedEvidence.includes(observation),
      );
      if (!grounded) {
        issues.push({
          code: 'inventedEvidence',
          recommendationIndex,
          detail: evidence,
        });
      }
    }

    const decisionCopy = [recommendation.rationale, ...recommendation.cautions].join(' ');
    if (DIAGNOSTIC_CLAIM_PATTERN.test(decisionCopy)) {
      issues.push({
        code: 'diagnosticClaim',
        recommendationIndex,
        detail: 'Recommendation copy makes a diagnostic claim.',
      });
    }
  });

  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
};
