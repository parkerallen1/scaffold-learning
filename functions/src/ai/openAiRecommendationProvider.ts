import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { defineSecret } from 'firebase-functions/params';
import { z } from 'zod';

import {
  SUPPORT_CATALOG,
  breakPromptSettingsSchema,
  flexibleResponseSettingsSchema,
  focusViewSettingsSchema,
  hintLadderSettingsSchema,
  readAloudSettingsSchema,
  readingChunksSettingsSchema,
  recommendationInputSchema,
  supportKeySchema,
} from '@quiz-master/domain';
import type { RecommendationInput, RecommendationResult } from '@quiz-master/domain';

import type { AiProvider } from './contracts.js';
import { RecommendationManualFallbackError } from './contracts.js';
import { validateProviderRecommendationResult } from './providerSafety.js';

export const OPENAI_RECOMMENDATION_PROMPT_VERSION = 'recommend-supports-v1';
export const DEFAULT_OPENAI_RECOMMENDATION_MODEL = 'gpt-5.6-terra';
export const DEFAULT_OPENAI_RECOMMENDATION_TIMEOUT_MS = 15_000;
export const openAiApiKey = defineSecret('OPENAI_API_KEY');

// Strict Structured Outputs require every field. The domain contract allows
// durationSeconds to be absent, so the transport uses required + nullable and
// normalizes null away before the domain safety pass.
const openAiCalmPacingSettingsSchema = z
  .object({
    supportKey: z.literal('calmPacing'),
    enabled: z.boolean(),
    timerMode: z.enum(['off', 'elapsed', 'nonExpiringCountdown']),
    durationSeconds: z.number().int().min(30).max(3600).nullable(),
  })
  .strict()
  .superRefine((settings, context) => {
    if (settings.timerMode === 'nonExpiringCountdown' && settings.durationSeconds === null) {
      context.addIssue({
        code: 'custom',
        path: ['durationSeconds'],
        message: 'A non-expiring countdown requires a duration.',
      });
    }
  });

const openAiSupportSettingsSchema = z.discriminatedUnion('supportKey', [
  readAloudSettingsSchema,
  readingChunksSettingsSchema,
  focusViewSettingsSchema,
  hintLadderSettingsSchema,
  flexibleResponseSettingsSchema,
  openAiCalmPacingSettingsSchema,
  breakPromptSettingsSchema,
]);

const openAiSupportRecommendationSchema = z
  .object({
    supportKey: supportKeySchema,
    proposedSettings: openAiSupportSettingsSchema,
    rationale: z.string().trim().min(1).max(600),
    basedOn: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
    confidence: z.enum(['low', 'medium', 'high']),
    cautions: z.array(z.string().trim().min(1).max(300)).max(6),
    status: z.literal('proposed'),
  })
  .strict()
  .refine((value) => value.supportKey === value.proposedSettings.supportKey, {
    message: 'The proposed settings must match the support key.',
    path: ['proposedSettings', 'supportKey'],
  });

export const openAiRecommendationResultSchema = z
  .object({
    provider: z.literal('openai'),
    promptVersion: z.literal(OPENAI_RECOMMENDATION_PROMPT_VERSION),
    recommendations: z.array(openAiSupportRecommendationSchema).max(4),
  })
  .strict();

export interface OpenAiRecommendationConfig {
  model: string;
  promptVersion: string;
  timeoutMs: number;
}

export interface OpenAiRecommendationTransportRequest extends OpenAiRecommendationConfig {
  instructions: string;
  input: string;
  signal: AbortSignal;
  store: false;
}

export interface OpenAiRecommendationTransportResponse {
  parsed: unknown;
  refused: boolean;
}

export type OpenAiRecommendationRequester = (
  request: OpenAiRecommendationTransportRequest,
) => Promise<OpenAiRecommendationTransportResponse>;

export const readOpenAiRecommendationConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): OpenAiRecommendationConfig => ({
  model: environment.OPENAI_RECOMMENDATION_MODEL?.trim() || DEFAULT_OPENAI_RECOMMENDATION_MODEL,
  promptVersion: OPENAI_RECOMMENDATION_PROMPT_VERSION,
  timeoutMs: DEFAULT_OPENAI_RECOMMENDATION_TIMEOUT_MS,
});

const SUPPORT_CATALOG_PROMPT = JSON.stringify(
  Object.entries(SUPPORT_CATALOG).map(([supportKey, support]) => ({
    supportKey,
    label: support.label,
    description: support.description,
    caution: support.caution,
    defaultSettings: support.defaultSettings,
  })),
);

export const RECOMMENDATION_INSTRUCTIONS = `
You draft conservative classroom support recommendations for a teacher to review.
This is not diagnosis, grading, placement, or an automatic educational decision.

Return at most 4 recommendations and only use support keys and settings from this fixed catalog:
${SUPPORT_CATALOG_PROMPT}

Rules:
- Set provider to "openai" and promptVersion to "${OPENAI_RECOMMENDATION_PROMPT_VERSION}".
- Every status must be "proposed". The teacher makes the final decision.
- Copy each basedOn item exactly from the supplied observations. Do not paraphrase or invent evidence.
- Prefer no recommendation over weak speculation. Never infer a diagnosis, disability, condition, or fact.
- Keep the plan small and explain the observable connection in plain language.
- If recommending a non-expiring countdown, caution that zero never submits or advances work.
- If an observation says timers or countdowns are stressful, calmPacing must use timerMode "off".
`.trim();

export const createOpenAiRecommendationResponseBody = (
  request: Pick<OpenAiRecommendationTransportRequest, 'model' | 'instructions' | 'input' | 'store'>,
) => ({
  model: request.model,
  instructions: request.instructions,
  input: [{ role: 'user' as const, content: request.input }],
  max_output_tokens: 2_000,
  store: request.store,
  text: {
    format: zodTextFormat(openAiRecommendationResultSchema, 'support_recommendations'),
  },
});

const normalizeOpenAiStructuredResult = (
  rawResult: z.infer<typeof openAiRecommendationResultSchema> | null,
): unknown => {
  if (!rawResult) return null;
  return {
    ...rawResult,
    recommendations: rawResult.recommendations.map((recommendation) => {
      if (recommendation.proposedSettings.supportKey !== 'calmPacing') return recommendation;
      const { durationSeconds, ...settings } = recommendation.proposedSettings;
      return {
        ...recommendation,
        proposedSettings: durationSeconds === null ? settings : { ...settings, durationSeconds },
      };
    }),
  };
};

export const createOpenAiRecommendationRequester =
  (client: OpenAI): OpenAiRecommendationRequester =>
  async (request) => {
    const response = await client.responses.parse(createOpenAiRecommendationResponseBody(request), {
      maxRetries: 0,
      signal: request.signal,
      timeout: request.timeoutMs,
    });
    const refused = response.output.some(
      (output) =>
        output.type === 'message' && output.content.some((content) => content.type === 'refusal'),
    );
    return { parsed: normalizeOpenAiStructuredResult(response.output_parsed), refused };
  };

const isTimeoutError = (error: unknown) =>
  error instanceof OpenAI.APIConnectionTimeoutError ||
  (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'));

export class OpenAiRecommendationProvider implements AiProvider {
  readonly name = 'openai';
  readonly model: string;
  readonly promptVersion: string;

  constructor(
    private readonly requester: OpenAiRecommendationRequester,
    private readonly config: OpenAiRecommendationConfig = readOpenAiRecommendationConfig(),
  ) {
    this.model = config.model;
    this.promptVersion = config.promptVersion;
  }

  async recommendSupports(input: RecommendationInput): Promise<RecommendationResult> {
    const parsedInput = recommendationInputSchema.parse(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.requester({
        ...this.config,
        instructions: RECOMMENDATION_INSTRUCTIONS,
        input: JSON.stringify({ observations: parsedInput.observations }),
        signal: controller.signal,
        store: false,
      });

      if (response.refused) {
        throw new RecommendationManualFallbackError('refusal');
      }

      return validateProviderRecommendationResult(
        parsedInput,
        response.parsed,
        'openai',
        this.config.promptVersion,
      );
    } catch (error) {
      if (error instanceof RecommendationManualFallbackError) throw error;
      if (isTimeoutError(error) || controller.signal.aborted) {
        throw new RecommendationManualFallbackError('timeout');
      }
      throw new RecommendationManualFallbackError('provider_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const createConfiguredOpenAiRecommendationProvider = (
  config = readOpenAiRecommendationConfig(),
) => {
  const client = new OpenAI({
    apiKey: openAiApiKey.value(),
    maxRetries: 0,
    timeout: config.timeoutMs,
  });
  return new OpenAiRecommendationProvider(createOpenAiRecommendationRequester(client), config);
};
