import { z } from 'zod';

export const supportKeySchema = z.enum([
  'readAloud',
  'readingChunks',
  'focusView',
  'hintLadder',
  'flexibleResponse',
  'calmPacing',
  'breakPrompt',
]);

export const recommendationInputSchema = z.object({
  observations: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
});

export const supportRecommendationSchema = z.object({
  supportKey: supportKeySchema,
  rationale: z.string().min(1),
  basedOn: z.array(z.string().min(1)).min(1),
  confidence: z.enum(['low', 'medium', 'high']),
});

export const recommendationResultSchema = z.object({
  provider: z.literal('fake'),
  promptVersion: z.string().min(1),
  recommendations: z.array(supportRecommendationSchema).max(4),
});

export type RecommendationInput = z.infer<typeof recommendationInputSchema>;
export type RecommendationResult = z.infer<typeof recommendationResultSchema>;

export interface AiProvider {
  readonly name: string;
  recommendSupports(input: RecommendationInput): Promise<RecommendationResult>;
}
