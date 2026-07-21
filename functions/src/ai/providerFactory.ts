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
  emulatorLiveOpenAi?: string;
  featuresEnabled?: string;
  forceFakeForTests?: string;
  createOpenAi?: () => AiProvider;
}

export const createAiProvider = ({
  mode = process.env.AI_PROVIDER,
  isEmulator = process.env.FUNCTIONS_EMULATOR === 'true',
  emulatorLiveOpenAi = process.env.AI_EMULATOR_LIVE_OPENAI,
  featuresEnabled = process.env.AI_FEATURES_ENABLED,
  forceFakeForTests = process.env.AI_FORCE_FAKE_FOR_TESTS,
  createOpenAi = createConfiguredOpenAiRecommendationProvider,
}: AiProviderFactoryOptions = {}): AiProvider => {
  if (forceFakeForTests === 'true') return fakeAiProvider;
  if (mode !== 'openai' || (isEmulator && emulatorLiveOpenAi !== 'true')) return fakeAiProvider;
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
