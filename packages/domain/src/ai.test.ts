import { describe, expect, it } from 'vitest';

import {
  checkRecommendationSafety,
  recommendationInputSchema,
  recommendationResultSchema,
} from './ai.js';

const input = recommendationInputSchema.parse({
  observations: [
    'The student begins more readily when directions are shown one step at a time.',
    'A visible timer has been stressful during independent work.',
  ],
});

const safeRecommendation = {
  supportKey: 'readingChunks' as const,
  proposedSettings: {
    supportKey: 'readingChunks' as const,
    enabled: true,
    chunkMode: 'step' as const,
    revealAllAllowed: true as const,
  },
  rationale: 'Showing one approved step at a time may reduce the effort needed to begin.',
  basedOn: ['The student begins more readily when directions are shown one step at a time.'],
  confidence: 'medium' as const,
  cautions: ['Keep a reveal-all control available.'],
  status: 'proposed' as const,
};

describe('checkRecommendationSafety', () => {
  it('accepts a unique, proposed recommendation grounded in supplied observations', () => {
    const result = recommendationResultSchema.parse({
      provider: 'fake',
      promptVersion: 'test-v1',
      recommendations: [safeRecommendation],
    });

    expect(checkRecommendationSafety(input, result)).toEqual({ ok: true, issues: [] });
  });

  it('rejects invented evidence even when the output shape is valid', () => {
    const result = recommendationResultSchema.parse({
      provider: 'fake',
      promptVersion: 'test-v1',
      recommendations: [
        { ...safeRecommendation, basedOn: ['The student always succeeds with background music.'] },
      ],
    });

    expect(checkRecommendationSafety(input, result).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'inventedEvidence' })]),
    );
  });

  it('rejects duplicate support proposals and non-proposed output', () => {
    const result = recommendationResultSchema.parse({
      provider: 'fake',
      promptVersion: 'test-v1',
      recommendations: [safeRecommendation, { ...safeRecommendation, status: 'approved' }],
    });

    expect(checkRecommendationSafety(input, result).issues.map((issue) => issue.code)).toEqual([
      'duplicateSupport',
      'nonProposedStatus',
    ]);
  });

  it('rejects diagnostic claims while allowing cautious support language', () => {
    const result = recommendationResultSchema.parse({
      provider: 'openai',
      promptVersion: 'test-v1',
      recommendations: [
        {
          ...safeRecommendation,
          rationale: 'The student appears to have a disorder, so this support is required.',
        },
      ],
    });

    expect(checkRecommendationSafety(input, result).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'diagnosticClaim' })]),
    );
  });
});
