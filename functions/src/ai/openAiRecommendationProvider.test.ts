import { describe, expect, it, vi } from 'vitest';

import { recommendationResultSchema, supportSettingsSchema } from '@quiz-master/domain';
import type { RecommendationInput } from '@quiz-master/domain';

import type { RecommendationManualFallbackError } from './contracts.js';
import { FakeAiProvider } from './fakeAiProvider.js';
import {
  DEFAULT_OPENAI_RECOMMENDATION_MODEL,
  OPENAI_RECOMMENDATION_PROMPT_VERSION,
  OpenAiRecommendationProvider,
  createOpenAiRecommendationResponseBody,
  type OpenAiRecommendationConfig,
  type OpenAiRecommendationRequester,
} from './openAiRecommendationProvider.js';
import { createAiProvider } from './providerFactory.js';

const observations = [
  'The student starts sooner when directions are shown one step at a time.',
  'Visible timers are stressful for the student.',
];
const input: RecommendationInput = { observations };
const config: OpenAiRecommendationConfig = {
  model: DEFAULT_OPENAI_RECOMMENDATION_MODEL,
  promptVersion: OPENAI_RECOMMENDATION_PROMPT_VERSION,
  timeoutMs: 50,
};

const safeResult = recommendationResultSchema.parse({
  provider: 'openai',
  promptVersion: OPENAI_RECOMMENDATION_PROMPT_VERSION,
  recommendations: [
    {
      supportKey: 'readingChunks',
      proposedSettings: {
        supportKey: 'readingChunks',
        enabled: true,
        chunkMode: 'step',
        revealAllAllowed: true,
      },
      rationale: 'Showing one approved step at a time may make the starting point easier to find.',
      basedOn: [observations[0]],
      confidence: 'medium',
      cautions: ['The student can always reveal all directions.'],
      status: 'proposed',
    },
  ],
});

const requesterReturning = (parsed: unknown): OpenAiRecommendationRequester =>
  vi.fn().mockResolvedValue({ parsed, refused: false });

const expectManualFallback = async (
  promise: Promise<unknown>,
  code: RecommendationManualFallbackError['code'],
) => {
  await expect(promise).rejects.toMatchObject({
    name: 'RecommendationManualFallbackError',
    code,
    useManualSetup: true,
  });
};

describe('OpenAI recommendation request contract', () => {
  it('uses Responses structured output, a versioned public model alias, and no response storage', () => {
    const body = createOpenAiRecommendationResponseBody({
      model: DEFAULT_OPENAI_RECOMMENDATION_MODEL,
      instructions: 'Versioned instructions',
      input: JSON.stringify(input),
      store: false,
    });

    expect(body).toMatchObject({
      model: 'gpt-5.6',
      instructions: 'Versioned instructions',
      store: false,
      max_output_tokens: 2_000,
      text: {
        format: {
          type: 'json_schema',
          name: 'support_recommendations',
          strict: true,
        },
      },
    });
  });

  it('returns a grounded schema-valid result after the safety pass', async () => {
    const requester = requesterReturning(safeResult);
    const provider = new OpenAiRecommendationProvider(requester, config);

    const result = await provider.recommendSupports(input);

    expect(result).toEqual(safeResult);
    expect(result.recommendations).toHaveLength(1);
    expect(
      supportSettingsSchema.safeParse(result.recommendations[0]?.proposedSettings).success,
    ).toBe(true);
    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.6',
        promptVersion: OPENAI_RECOMMENDATION_PROMPT_VERSION,
        store: false,
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

describe('recommendation safety eval fixtures', () => {
  it('rejects invented evidence', async () => {
    const inventedEvidence = {
      ...safeResult,
      recommendations: [
        {
          ...safeResult.recommendations[0],
          basedOn: ['The student succeeds when listening to background music.'],
        },
      ],
    };
    const provider = new OpenAiRecommendationProvider(requesterReturning(inventedEvidence), config);

    await expectManualFallback(provider.recommendSupports(input), 'unsafe_output');
  });

  it('rejects diagnostic claims', async () => {
    const diagnosticClaim = {
      ...safeResult,
      recommendations: [
        {
          ...safeResult.recommendations[0],
          rationale: 'The student likely has ADHD and therefore needs fewer controls.',
        },
      ],
    };
    const provider = new OpenAiRecommendationProvider(requesterReturning(diagnosticClaim), config);

    await expectManualFallback(provider.recommendSupports(input), 'unsafe_output');
  });

  it('returns a manual fallback for malformed and over-limit output', async () => {
    const malformedProvider = new OpenAiRecommendationProvider(requesterReturning({}), config);
    const overLimitProvider = new OpenAiRecommendationProvider(
      requesterReturning({
        ...safeResult,
        recommendations: Array.from({ length: 5 }, (_, index) => ({
          ...safeResult.recommendations[0],
          supportKey: index % 2 === 0 ? 'readingChunks' : 'focusView',
        })),
      }),
      config,
    );

    await expectManualFallback(malformedProvider.recommendSupports(input), 'malformed_output');
    await expectManualFallback(overLimitProvider.recommendSupports(input), 'malformed_output');
  });

  it('returns a typed manual fallback for refusal', async () => {
    const requester = vi.fn().mockResolvedValue({ parsed: null, refused: true });
    const provider = new OpenAiRecommendationProvider(requester, config);

    await expectManualFallback(provider.recommendSupports(input), 'refusal');
  });

  it('does not log or expose provider error details', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const requester = vi.fn().mockRejectedValue(new Error(`Provider echoed: ${observations[0]}`));
    const provider = new OpenAiRecommendationProvider(requester, config);

    await expectManualFallback(provider.recommendSupports(input), 'provider_unavailable');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('aborts a bounded request and returns a timeout fallback', async () => {
    const requester: OpenAiRecommendationRequester = ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const error = new Error('Sensitive provider timeout detail');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      });
    const provider = new OpenAiRecommendationProvider(requester, { ...config, timeoutMs: 5 });

    await expectManualFallback(provider.recommendSupports(input), 'timeout');
  });

  it('requires a non-advancing caution for a visual countdown', async () => {
    const timerInput: RecommendationInput = {
      observations: ['A visible countdown is neutral for the student.'],
    };
    const missingTimerCaution = {
      provider: 'openai',
      promptVersion: OPENAI_RECOMMENDATION_PROMPT_VERSION,
      recommendations: [
        {
          supportKey: 'calmPacing',
          proposedSettings: {
            supportKey: 'calmPacing',
            enabled: true,
            timerMode: 'nonExpiringCountdown',
            durationSeconds: 180,
          },
          rationale: 'A neutral visual countdown may make elapsed work time easier to see.',
          basedOn: timerInput.observations,
          confidence: 'low',
          cautions: [],
          status: 'proposed',
        },
      ],
    };
    const provider = new OpenAiRecommendationProvider(
      requesterReturning(missingTimerCaution),
      config,
    );

    await expectManualFallback(provider.recommendSupports(timerInput), 'unsafe_output');
  });
});

describe('deterministic provider selection', () => {
  it('grounds fake-provider evidence only in supplied observations', async () => {
    const result = await new FakeAiProvider().recommendSupports({
      observations: ['The teacher reveals one direction at a time.'],
    });

    expect(
      result.recommendations.every(
        (recommendation) =>
          recommendation.basedOn.length === 1 &&
          recommendation.basedOn[0] === 'The teacher reveals one direction at a time.',
      ),
    ).toBe(true);
  });

  it('keeps fake as the default and forces it in the emulator', () => {
    const createOpenAi = vi.fn(
      () => new OpenAiRecommendationProvider(requesterReturning(safeResult), config),
    );

    expect(createAiProvider({ createOpenAi }).name).toBe('fake');
    expect(createAiProvider({ mode: 'openai', isEmulator: true, createOpenAi }).name).toBe('fake');
    expect(createOpenAi).not.toHaveBeenCalled();
    expect(createAiProvider({ mode: 'openai', isEmulator: false, createOpenAi }).name).toBe(
      'openai',
    );
  });
});
