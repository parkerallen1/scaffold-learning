import {
  recommendationInputSchema,
  type RecommendationInput,
  type RecommendationResult,
} from '@scaffold-learning/domain';

import type { AiProvider } from './contracts.js';
import { fakeRecommendationFixture } from './fixtures.js';
import { validateProviderRecommendationResult } from './providerSafety.js';

export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';
  readonly model = 'deterministic-recommendation-fixture';
  readonly promptVersion = fakeRecommendationFixture.promptVersion;

  async recommendSupports(input: RecommendationInput): Promise<RecommendationResult> {
    const parsedInput = recommendationInputSchema.parse(input);
    const groundedResult = {
      ...structuredClone(fakeRecommendationFixture),
      recommendations: fakeRecommendationFixture.recommendations.map((recommendation, index) => ({
        ...structuredClone(recommendation),
        basedOn: [parsedInput.observations[index % parsedInput.observations.length]!],
      })),
    };

    return validateProviderRecommendationResult(
      parsedInput,
      groundedResult,
      'fake',
      fakeRecommendationFixture.promptVersion,
    );
  }
}

export const fakeAiProvider = new FakeAiProvider();
