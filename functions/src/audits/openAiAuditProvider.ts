import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { SUPPORT_CATALOG, supportKeySchema } from '@quiz-master/domain';

import { openAiApiKey } from '../ai/openAiRecommendationProvider.js';
import {
  AuditManualFallbackError,
  type AuditEvidencePacket,
  type AuditProvider,
  type AuditProviderDraft,
} from './auditContracts.js';
import { auditProviderDraftSchema } from './auditCore.js';

export const OPENAI_AUDIT_PROMPT_VERSION = 'audit-supports-v1';
export const DEFAULT_OPENAI_AUDIT_MODEL = 'gpt-5.6-terra';
export const DEFAULT_OPENAI_AUDIT_TIMEOUT_MS = 15_000;

const auditEvidenceTransportSchema = z
  .object({
    metric: z.enum(['attemptOutcome', 'supportUse']),
    observation: z.string().trim().min(1).max(600),
    sourceEventIds: z.array(z.string().trim().min(8).max(64)).length(1),
  })
  .strict();

const auditRecommendationTransportSchema = z
  .object({
    action: z.enum(['keep', 'add', 'remove', 'observe']),
    supportKey: supportKeySchema,
    evidence: z.array(auditEvidenceTransportSchema).min(1).max(4),
    alternativeExplanations: z.array(z.string().trim().min(1).max(500)).min(1).max(3),
    confidence: z.enum(['low', 'medium', 'high']),
    reviewAfterSessions: z.number().int().min(1).max(20),
  })
  .strict();

export const openAiAuditTransportResultSchema = z
  .object({
    recommendations: z.array(auditRecommendationTransportSchema).max(2),
  })
  .strict();

export interface OpenAiAuditConfig {
  model: string;
  promptVersion: string;
  timeoutMs: number;
}

export interface OpenAiAuditTransportRequest extends OpenAiAuditConfig {
  instructions: string;
  input: string;
  signal: AbortSignal;
  store: false;
}

export interface OpenAiAuditTransportResponse {
  parsed: unknown;
  refused: boolean;
}

export type OpenAiAuditRequester = (
  request: OpenAiAuditTransportRequest,
) => Promise<OpenAiAuditTransportResponse>;

export const readOpenAiAuditConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): OpenAiAuditConfig => ({
  model:
    environment.OPENAI_AUDIT_MODEL?.trim() ||
    environment.OPENAI_RECOMMENDATION_MODEL?.trim() ||
    DEFAULT_OPENAI_AUDIT_MODEL,
  promptVersion: OPENAI_AUDIT_PROMPT_VERSION,
  timeoutMs: DEFAULT_OPENAI_AUDIT_TIMEOUT_MS,
});

const SUPPORT_CATALOG_PROMPT = JSON.stringify(
  Object.entries(SUPPORT_CATALOG).map(([supportKey, support]) => ({
    supportKey,
    label: support.label,
    caution: support.caution,
    defaultSettings: support.defaultSettings,
  })),
);

export const AUDIT_INSTRUCTIONS = `
You draft conservative support-audit suggestions for a teacher to review.
This is not diagnosis, grading, placement, causation analysis, or an automatic educational decision.

Allowed support catalog:
${SUPPORT_CATALOG_PROMPT}

Rules:
- Return at most 2 recommendations. Prefer "observe" over a weak change.
- Never compare the student with peers or classmates. Never name or infer a diagnosis, condition, disability, impairment, or cause.
- The server has already calculated every canonical metric. Do not calculate or invent metrics.
- Every evidence item must copy metric, observation, and its one sourceEventId exactly from one supplied eventFact. Never combine, paraphrase, or invent evidence.
- Use "add" only for a support absent from activeSupports. Use "keep" or "remove" only for a support present in activeSupports.
- Low confidence may only use "observe". Include at least one plausible alternative explanation.
- Do not propose settings. The server attaches fixed catalog defaults to an "add" suggestion.
- A suggestion never activates, edits, or removes a support plan; a teacher must decide separately.
`.trim();

export const createOpenAiAuditResponseBody = (
  request: Pick<OpenAiAuditTransportRequest, 'model' | 'instructions' | 'input' | 'store'>,
) => ({
  model: request.model,
  instructions: request.instructions,
  input: [{ role: 'user' as const, content: request.input }],
  max_output_tokens: 2_000,
  store: request.store,
  text: {
    format: zodTextFormat(openAiAuditTransportResultSchema, 'support_audit'),
  },
});

export const createOpenAiAuditRequester =
  (client: OpenAI): OpenAiAuditRequester =>
  async (request) => {
    const response = await client.responses.parse(createOpenAiAuditResponseBody(request), {
      maxRetries: 0,
      signal: request.signal,
      timeout: request.timeoutMs,
    });
    const refused = response.output.some(
      (output) =>
        output.type === 'message' && output.content.some((content) => content.type === 'refusal'),
    );
    return { parsed: response.output_parsed, refused };
  };

const normalizeTransportResult = (rawResult: unknown): AuditProviderDraft => {
  const result = openAiAuditTransportResultSchema.safeParse(rawResult);
  if (!result.success) throw new AuditManualFallbackError('malformed_output');

  return auditProviderDraftSchema.parse({
    recommendations: result.data.recommendations.map((recommendation) =>
      recommendation.action === 'add'
        ? {
            ...recommendation,
            proposedSettings: structuredClone(
              SUPPORT_CATALOG[recommendation.supportKey].defaultSettings,
            ),
          }
        : recommendation,
    ),
  });
};

const isTimeoutError = (error: unknown) =>
  error instanceof OpenAI.APIConnectionTimeoutError ||
  (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'));

export class OpenAiAuditProvider implements AuditProvider {
  readonly name = 'openai';
  readonly model: string;
  readonly promptVersion: string;

  constructor(
    private readonly requester: OpenAiAuditRequester,
    private readonly config: OpenAiAuditConfig = readOpenAiAuditConfig(),
  ) {
    this.model = config.model;
    this.promptVersion = config.promptVersion;
  }

  async auditSupports(input: AuditEvidencePacket): Promise<AuditProviderDraft> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.requester({
        ...this.config,
        instructions: AUDIT_INSTRUCTIONS,
        input: JSON.stringify({
          canonicalSummary: input.summary,
          activeSupports: input.activeSupports,
          eventFacts: input.eventFacts,
        }),
        signal: controller.signal,
        store: false,
      });
      if (response.refused) throw new AuditManualFallbackError('refusal');
      return normalizeTransportResult(response.parsed);
    } catch (error) {
      if (error instanceof AuditManualFallbackError) throw error;
      if (isTimeoutError(error) || controller.signal.aborted) {
        throw new AuditManualFallbackError('timeout');
      }
      throw new AuditManualFallbackError('provider_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const createConfiguredOpenAiAuditProvider = (
  config = readOpenAiAuditConfig(),
): AuditProvider => {
  const client = new OpenAI({
    apiKey: openAiApiKey.value(),
    maxRetries: 0,
    timeout: config.timeoutMs,
  });
  return new OpenAiAuditProvider(createOpenAiAuditRequester(client), config);
};
