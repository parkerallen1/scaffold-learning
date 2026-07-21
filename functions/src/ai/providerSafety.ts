import {
  checkRecommendationSafety,
  recommendationInputSchema,
  recommendationResultSchema,
} from '@scaffold-learning/domain';
import type { RecommendationInput, RecommendationResult } from '@scaffold-learning/domain';

import { RecommendationManualFallbackError } from './contracts.js';

const TIMER_STRESS_PATTERN =
  /(?:timer|countdown).{0,60}(?:stress|anxious|anxiety|upset|overwhelm)|(?:stress|anxious|anxiety|upset|overwhelm).{0,60}(?:timer|countdown)/i;
const NON_ADVANCING_CAUTION_PATTERN =
  /(?:never|does not|doesn't).{0,50}(?:submit|advance|move on)/i;

export const validateProviderRecommendationResult = (
  rawInput: RecommendationInput,
  rawResult: unknown,
  expectedProvider: RecommendationResult['provider'],
  expectedPromptVersion: string,
): RecommendationResult => {
  const input = recommendationInputSchema.parse(rawInput);
  const parsed = recommendationResultSchema.safeParse(rawResult);

  if (
    !parsed.success ||
    parsed.data.provider !== expectedProvider ||
    parsed.data.promptVersion !== expectedPromptVersion
  ) {
    throw new RecommendationManualFallbackError('malformed_output');
  }

  const safety = checkRecommendationSafety(input, parsed.data);
  if (!safety.ok) {
    throw new RecommendationManualFallbackError('unsafe_output');
  }

  const timerStressObserved = input.observations.some((observation) =>
    TIMER_STRESS_PATTERN.test(observation),
  );

  for (const recommendation of parsed.data.recommendations) {
    if (
      recommendation.supportKey !== 'calmPacing' ||
      recommendation.proposedSettings.supportKey !== 'calmPacing'
    ) {
      continue;
    }

    const settings = recommendation.proposedSettings;
    const cautionCopy = recommendation.cautions.join(' ');
    if (timerStressObserved && settings.timerMode !== 'off') {
      throw new RecommendationManualFallbackError('unsafe_output');
    }
    if (
      settings.timerMode === 'nonExpiringCountdown' &&
      !NON_ADVANCING_CAUTION_PATTERN.test(cautionCopy)
    ) {
      throw new RecommendationManualFallbackError('unsafe_output');
    }
  }

  return parsed.data;
};
