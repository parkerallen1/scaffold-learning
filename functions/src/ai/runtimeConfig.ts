export type AiRuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export const liveOpenAiRuntimeEnabled = (
  environment: AiRuntimeEnvironment = process.env,
): boolean =>
  environment.AI_FORCE_FAKE_FOR_TESTS !== 'true' &&
  environment.AI_PROVIDER === 'openai' &&
  environment.AI_FEATURES_ENABLED === 'true' &&
  (environment.FUNCTIONS_EMULATOR !== 'true' || environment.AI_EMULATOR_LIVE_OPENAI === 'true');

export const emulatorUsesLiveOpenAi = (environment: AiRuntimeEnvironment = process.env): boolean =>
  environment.FUNCTIONS_EMULATOR === 'true' && liveOpenAiRuntimeEnabled(environment);
