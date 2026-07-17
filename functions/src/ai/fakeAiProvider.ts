import {
  recommendationInputSchema,
  recommendationResultSchema,
  type RecommendationInput,
  type RecommendationResult,
} from '@quiz-master/domain';
import { fakeRecommendationFixture } from './fixtures.js';

export interface AiProvider {
  readonly name: string;
  recommendSupports(input: RecommendationInput): Promise<RecommendationResult>;
}

export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';

  async recommendSupports(input: RecommendationInput): Promise<RecommendationResult> {
    recommendationInputSchema.parse(input);
    return recommendationResultSchema.parse(structuredClone(fakeRecommendationFixture));
  }
}

export const fakeAiProvider = new FakeAiProvider();
