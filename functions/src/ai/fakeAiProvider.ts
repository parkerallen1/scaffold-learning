import {
  recommendationInputSchema,
  recommendationResultSchema,
  type AiProvider,
  type RecommendationInput,
  type RecommendationResult,
} from './contracts.js';
import { fakeRecommendationFixture } from './fixtures.js';

export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';

  async recommendSupports(input: RecommendationInput): Promise<RecommendationResult> {
    recommendationInputSchema.parse(input);
    return recommendationResultSchema.parse(structuredClone(fakeRecommendationFixture));
  }
}

export const fakeAiProvider = new FakeAiProvider();
