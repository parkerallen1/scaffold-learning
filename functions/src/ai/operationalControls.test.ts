import { describe, expect, it, vi } from 'vitest';

import { teacherIdSchema, type TeacherId } from '@scaffold-learning/domain';

import { runControlledAiOperation, type AiQuotaStore } from './operationalControls.js';
import {
  AI_DAY_LIMIT,
  AI_DAY_WINDOW_MS,
  AI_MINUTE_LIMIT,
  AI_MINUTE_WINDOW_MS,
  buildAiTelemetry,
  consumeAiQuota,
  liveAiFeaturesEnabled,
  type AiQuotaState,
} from './operationalControlsCore.js';

const teacherA = teacherIdSchema.parse('teacher_alpha');
const teacherB = teacherIdSchema.parse('teacher_beta');
const provider = Object.freeze({
  name: 'openai' as const,
  model: 'gpt-5.6',
  promptVersion: 'recommend-supports-v1',
});

const memoryQuotaStore = (): AiQuotaStore => {
  const states = new Map<TeacherId, AiQuotaState>();
  return {
    async consume(teacherId, nowMs) {
      const decision = consumeAiQuota(states.get(teacherId) ?? null, nowMs);
      if (decision.allowed) states.set(teacherId, decision.nextState);
      return decision.allowed;
    },
  };
};

describe('AI live-provider kill switch', () => {
  it('defaults live OpenAI to disabled and requires the exact true value', () => {
    expect(liveAiFeaturesEnabled('openai', {})).toBe(false);
    expect(liveAiFeaturesEnabled('openai', { AI_FEATURES_ENABLED: 'TRUE' })).toBe(false);
    expect(liveAiFeaturesEnabled('openai', { AI_FEATURES_ENABLED: 'true' })).toBe(true);
  });

  it('keeps emulator fake-provider behavior available without the production switch', async () => {
    const invoke = vi.fn().mockResolvedValue('fake result');
    const quotaStore = { consume: vi.fn() };

    await expect(
      runControlledAiOperation({
        teacherId: teacherA,
        operation: 'recommendStudentSupports',
        provider: {
          name: 'fake',
          model: 'deterministic-fixture',
          promptVersion: 'fake-v1',
        },
        invoke,
        environment: { FUNCTIONS_EMULATOR: 'true' },
        quotaStore,
        telemetrySink: vi.fn(),
      }),
    ).resolves.toBe('fake result');
    expect(invoke).toHaveBeenCalledOnce();
    expect(quotaStore.consume).not.toHaveBeenCalled();
  });

  it('does not invoke or consume quota when production AI is disabled', async () => {
    const invoke = vi.fn();
    const quotaStore = { consume: vi.fn() };
    const telemetrySink = vi.fn();

    await expect(
      runControlledAiOperation({
        teacherId: teacherA,
        operation: 'recommendStudentSupports',
        provider,
        invoke,
        environment: {},
        quotaStore,
        telemetrySink,
      }),
    ).rejects.toMatchObject({ reason: 'feature_disabled' });
    expect(invoke).not.toHaveBeenCalled();
    expect(quotaStore.consume).not.toHaveBeenCalled();
    expect(telemetrySink).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'feature_disabled' }),
    );
  });
});

describe('bounded per-teacher AI quota', () => {
  it('resets the minute window while retaining the UTC day count', () => {
    const now = Date.UTC(2026, 6, 18, 12, 0, 0);
    let state: AiQuotaState | null = null;
    for (let request = 0; request < AI_MINUTE_LIMIT; request += 1) {
      const decision = consumeAiQuota(state, now + request);
      expect(decision.allowed).toBe(true);
      state = decision.nextState;
    }
    expect(consumeAiQuota(state, now + 5_000)).toMatchObject({
      allowed: false,
      exhaustedWindow: 'minute',
    });
    const nextMinute = consumeAiQuota(state, now + AI_MINUTE_WINDOW_MS);
    expect(nextMinute).toMatchObject({ allowed: true, exhaustedWindow: null });
    expect(nextMinute.nextState.dayCount).toBe(AI_MINUTE_LIMIT + 1);
  });

  it('enforces the daily ceiling across minute windows and resets the next UTC day', () => {
    const start = Date.UTC(2026, 6, 18, 0, 0, 0);
    let state: AiQuotaState | null = null;
    for (let request = 0; request < AI_DAY_LIMIT; request += 1) {
      const decision = consumeAiQuota(state, start + request * AI_MINUTE_WINDOW_MS);
      expect(decision.allowed).toBe(true);
      state = decision.nextState;
    }
    expect(consumeAiQuota(state, start + 23 * 60 * 60_000)).toMatchObject({
      allowed: false,
      exhaustedWindow: 'day',
    });
    expect(consumeAiQuota(state, start + AI_DAY_WINDOW_MS)).toMatchObject({
      allowed: true,
      exhaustedWindow: null,
      nextState: { dayCount: 1 },
    });
  });

  it('isolates quota counters by teacher before live calls', async () => {
    const quotaStore = memoryQuotaStore();
    const clock = () => Date.UTC(2026, 6, 18, 12, 0, 0);
    const invoke = vi.fn().mockResolvedValue('ok');
    const run = (teacherId: TeacherId) =>
      runControlledAiOperation({
        teacherId,
        operation: 'auditStudentEvidence',
        provider,
        invoke,
        environment: { AI_FEATURES_ENABLED: 'true' },
        quotaStore,
        telemetrySink: vi.fn(),
        clock,
      });

    for (let request = 0; request < AI_MINUTE_LIMIT; request += 1) await run(teacherA);
    await expect(run(teacherA)).rejects.toMatchObject({ reason: 'rate_limited' });
    await expect(run(teacherB)).resolves.toBe('ok');
    expect(invoke).toHaveBeenCalledTimes(AI_MINUTE_LIMIT + 1);
  });
});

describe('sanitized AI telemetry', () => {
  it('emits only approved metadata fields and sanitizes free-form identifiers', () => {
    const record = buildAiTelemetry({
      provider: 'openai',
      operation: 'auditStudentEvidence',
      promptVersion: 'prompt body\nstudent answer',
      model: 'model with spaces and a secret',
      status: 'provider_fallback',
      latencyMs: 12.6,
    });

    expect(record).toEqual({
      provider: 'openai',
      operation: 'auditStudentEvidence',
      promptVersion: 'unknown',
      model: 'unknown',
      status: 'provider_fallback',
      latencyMs: 13,
    });
    expect(Object.keys(record).sort()).toEqual(
      ['latencyMs', 'model', 'operation', 'promptVersion', 'provider', 'status'].sort(),
    );
    expect(JSON.stringify(record)).not.toContain('prompt body');
    expect(JSON.stringify(record)).not.toContain('student answer');
    expect(JSON.stringify(record)).not.toContain('a secret');
  });
});
