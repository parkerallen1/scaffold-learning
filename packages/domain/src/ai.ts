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
