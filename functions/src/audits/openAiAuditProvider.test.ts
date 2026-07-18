import { describe, expect, it, vi } from 'vitest';

import { syntheticDomainFixtures, syntheticIds } from '@quiz-master/domain';

import type { AuditManualFallbackError } from './auditContracts.js';
import { buildAuditEvidence } from './auditCore.js';
import { createAuditProvider } from './auditProviderFactory.js';
import {
  DEFAULT_OPENAI_AUDIT_MODEL,
  OPENAI_AUDIT_PROMPT_VERSION,
  OpenAiAuditProvider,
  createOpenAiAuditResponseBody,
  type OpenAiAuditConfig,
  type OpenAiAuditRequester,
} from './openAiAuditProvider.js';

const packet = buildAuditEvidence({
  studentId: syntheticIds.studentId,
  sessions: [syntheticDomainFixtures.session],
  attempts: [syntheticDomainFixtures.attemptEvent],
  supportEvents: [syntheticDomainFixtures.supportEvent],
  activeSupports: syntheticDomainFixtures.supportPlan.supports,
}).packet;
const fact = packet.eventFacts[0]!;
const safeTransportResult = {
  recommendations: [
    {
      action: 'add' as const,
      supportKey: 'focusView' as const,
      evidence: [
        {
          metric: fact.metric,
          observation: fact.observation,
          sourceEventIds: [fact.eventId],
        },
      ],
      alternativeExplanations: ['The task format may have affected the observed pattern.'],
      confidence: 'medium' as const,
      reviewAfterSessions: 2,
    },
  ],
};
const config: OpenAiAuditConfig = {
  model: DEFAULT_OPENAI_AUDIT_MODEL,
  promptVersion: OPENAI_AUDIT_PROMPT_VERSION,
  timeoutMs: 50,
};

const requesterReturning = (parsed: unknown): OpenAiAuditRequester =>
  vi.fn().mockResolvedValue({ parsed, refused: false });

const expectManualFallback = async (
  promise: Promise<unknown>,
  code: AuditManualFallbackError['code'],
) => {
  await expect(promise).rejects.toMatchObject({
    name: 'AuditManualFallbackError',
    code,
    useManualReview: true,
  });
};

describe('OpenAI audit request contract', () => {
  it('uses Responses structured output with storage disabled', () => {
    const body = createOpenAiAuditResponseBody({
      model: DEFAULT_OPENAI_AUDIT_MODEL,
      instructions: 'Versioned audit instructions',
      input: JSON.stringify(packet),
      store: false,
    });

    expect(body).toMatchObject({
      model: 'gpt-5.6-terra',
      store: false,
      max_output_tokens: 2_000,
      text: {
        format: { type: 'json_schema', name: 'support_audit', strict: true },
      },
    });
  });

  it('normalizes an add suggestion to fixed catalog settings', async () => {
    const requester = requesterReturning(safeTransportResult);
    const provider = new OpenAiAuditProvider(requester, config);

    const draft = await provider.auditSupports(packet);

    expect(draft.recommendations[0]).toMatchObject({
      action: 'add',
      supportKey: 'focusView',
      proposedSettings: {
        supportKey: 'focusView',
        enabled: true,
        hideNonessentialChrome: true,
      },
    });
    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.6-terra',
        promptVersion: OPENAI_AUDIT_PROMPT_VERSION,
        store: false,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('does not introduce undefined settings into non-change suggestions', async () => {
    const observeResult = {
      recommendations: [
        {
          ...safeTransportResult.recommendations[0],
          action: 'observe' as const,
          supportKey: 'readingChunks' as const,
          confidence: 'low' as const,
        },
      ],
    };

    const draft = await new OpenAiAuditProvider(
      requesterReturning(observeResult),
      config,
    ).auditSupports(packet);

    expect(draft.recommendations[0]).not.toHaveProperty('proposedSettings');
  });

  it('returns typed fallbacks for malformed output and refusal', async () => {
    await expectManualFallback(
      new OpenAiAuditProvider(requesterReturning({ recommendations: [{}] }), config).auditSupports(
        packet,
      ),
      'malformed_output',
    );
    const refusal = vi.fn().mockResolvedValue({ parsed: null, refused: true });
    await expectManualFallback(
      new OpenAiAuditProvider(refusal, config).auditSupports(packet),
      'refusal',
    );
  });

  it('aborts a bounded request and returns a timeout fallback', async () => {
    const requester: OpenAiAuditRequester = ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const error = new Error('provider timeout detail');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      });
    const provider = new OpenAiAuditProvider(requester, { ...config, timeoutMs: 5 });

    await expectManualFallback(provider.auditSupports(packet), 'timeout');
  });
});

describe('deterministic audit provider selection', () => {
  it('keeps fake as default and forces fake in the emulator', () => {
    const createOpenAi = vi.fn(
      () => new OpenAiAuditProvider(requesterReturning(safeTransportResult), config),
    );

    expect(createAuditProvider({ createOpenAi }).name).toBe('fake');
    expect(createAuditProvider({ mode: 'openai', isEmulator: true, createOpenAi }).name).toBe(
      'fake',
    );
    expect(createOpenAi).not.toHaveBeenCalled();
    expect(
      createAuditProvider({
        mode: 'openai',
        isEmulator: false,
        featuresEnabled: 'true',
        createOpenAi,
      }).name,
    ).toBe('openai');
  });

  it('does not construct the live client while the production kill switch is off', () => {
    const createOpenAi = vi.fn();

    const provider = createAuditProvider({
      mode: 'openai',
      isEmulator: false,
      featuresEnabled: undefined,
      createOpenAi,
    });

    expect(provider.name).toBe('openai');
    expect(createOpenAi).not.toHaveBeenCalled();
  });
});
