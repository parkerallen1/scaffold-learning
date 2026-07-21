import { describe, expect, it } from 'vitest';

import { emulatorUsesLiveOpenAi, liveOpenAiRuntimeEnabled } from './runtimeConfig.js';

describe('OpenAI runtime configuration', () => {
  it('requires the provider and feature switches', () => {
    expect(liveOpenAiRuntimeEnabled({})).toBe(false);
    expect(liveOpenAiRuntimeEnabled({ AI_PROVIDER: 'openai', AI_FEATURES_ENABLED: 'true' })).toBe(
      true,
    );
  });

  it('requires a separate opt-in in the emulator', () => {
    const base = {
      AI_PROVIDER: 'openai',
      AI_FEATURES_ENABLED: 'true',
      FUNCTIONS_EMULATOR: 'true',
    };
    expect(liveOpenAiRuntimeEnabled(base)).toBe(false);
    expect(emulatorUsesLiveOpenAi(base)).toBe(false);
    expect(liveOpenAiRuntimeEnabled({ ...base, AI_EMULATOR_LIVE_OPENAI: 'true' })).toBe(true);
    expect(emulatorUsesLiveOpenAi({ ...base, AI_EMULATOR_LIVE_OPENAI: 'true' })).toBe(true);
  });
});
