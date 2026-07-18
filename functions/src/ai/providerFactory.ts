import type { AiProvider } from './contracts.js';
import { RecommendationManualFallbackError } from './contracts.js';
import { fakeAiProvider } from './fakeAiProvider.js';
import {
  createConfiguredOpenAiRecommendationProvider,
  readOpenAiRecommendationConfig,
} from './openAiRecommendationProvider.js';

export interface AiProviderFactoryOptions {
  mode?: string;
  isEmulator?: boolean;
  featuresEnabled?: string;
  createOpenAi?: () => AiProvider;
}

export const createAiProvider = ({
  mode = process.env.AI_PROVIDER,
  isEmulator = process.env.FUNCTIONS_EMULATOR === 'true',
  featuresEnabled = process.env.AI_FEATURES_ENABLED,
  createOpenAi = createConfiguredOpenAiRecommendationProvider,
}: AiProviderFactoryOptions = {}): AiProvider => {
  if (mode !== 'openai' || isEmulator) return fakeAiProvider;
  if (featuresEnabled !== 'true') {
    const config = readOpenAiRecommendationConfig();
    return Object.freeze({
      name: 'openai',
      model: config.model,
      promptVersion: config.promptVersion,
      async recommendSupports() {
        throw new RecommendationManualFallbackError('provider_unavailable');
      },
    });
  }
  return createOpenAi();
};
