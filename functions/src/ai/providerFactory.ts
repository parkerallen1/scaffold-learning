import type { AiProvider } from './contracts.js';
import { fakeAiProvider } from './fakeAiProvider.js';
import { createConfiguredOpenAiRecommendationProvider } from './openAiRecommendationProvider.js';

export interface AiProviderFactoryOptions {
  mode?: string;
  isEmulator?: boolean;
  createOpenAi?: () => AiProvider;
}

export const createAiProvider = ({
  mode = process.env.AI_PROVIDER,
  isEmulator = process.env.FUNCTIONS_EMULATOR === 'true',
  createOpenAi = createConfiguredOpenAiRecommendationProvider,
}: AiProviderFactoryOptions = {}): AiProvider => {
  if (mode !== 'openai' || isEmulator) return fakeAiProvider;
  return createOpenAi();
};
