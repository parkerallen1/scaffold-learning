import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { z } from 'zod';

import type { TeacherId } from '@scaffold-learning/domain';

import {
  buildAiTelemetry,
  consumeAiQuota,
  liveAiFeaturesEnabled,
  type AiOperation,
  type AiProviderMetadata,
  type AiQuotaState,
  type AiTelemetryRecord,
  type AiTelemetryStatus,
} from './operationalControlsCore.js';

const aiQuotaStateSchema = z
  .object({
    minuteWindowStart: z.number().int().nonnegative(),
    minuteCount: z.number().int().nonnegative(),
    dayWindowStart: z.number().int().nonnegative(),
    dayCount: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

export class AiOperationalControlError extends Error {
  constructor(readonly reason: 'feature_disabled' | 'rate_limited' | 'internal_failure') {
    super('Automated assistance is unavailable. Continue with the manual teacher workflow.');
    this.name = 'AiOperationalControlError';
  }
}

export interface AiQuotaStore {
  consume(teacherId: TeacherId, nowMs: number): Promise<boolean>;
}

export const firestoreAiQuotaStore: AiQuotaStore = Object.freeze({
  async consume(teacherId: TeacherId, nowMs: number) {
    const usageRef = firestore.collection('_aiOperationalUsage').doc(teacherId);
    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(usageRef);
      let previous: AiQuotaState | null = null;
      if (snapshot.exists) {
        const parsed = aiQuotaStateSchema.safeParse(snapshot.data());
        if (!parsed.success) throw new AiOperationalControlError('internal_failure');
        previous = parsed.data;
      }
      const decision = consumeAiQuota(previous, nowMs);
      if (decision.allowed) transaction.set(usageRef, decision.nextState);
      return decision.allowed;
    });
  },
});

export type AiTelemetrySink = (record: AiTelemetryRecord) => void;

export const firebaseAiTelemetrySink: AiTelemetrySink = (record) => {
  // The record is constructed from a fixed allowlist. Do not add request content,
  // student identifiers, teacher identifiers, provider errors, or prompt bodies.
  logger.info('AI operation telemetry.', record);
};

const statusForProviderError = (error: unknown): AiTelemetryStatus => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'useManualSetup' in error &&
    error.useManualSetup === true
  ) {
    return 'provider_fallback';
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'useManualReview' in error &&
    error.useManualReview === true
  ) {
    return 'provider_fallback';
  }
  return 'internal_failure';
};

export const runControlledAiOperation = async <Result>({
  teacherId,
  operation,
  provider,
  invoke,
  environment = process.env,
  quotaStore = firestoreAiQuotaStore,
  telemetrySink = firebaseAiTelemetrySink,
  clock = Date.now,
}: Readonly<{
  teacherId: TeacherId;
  operation: AiOperation;
  provider: AiProviderMetadata;
  invoke: () => Promise<Result>;
  environment?: Readonly<Record<string, string | undefined>>;
  quotaStore?: AiQuotaStore;
  telemetrySink?: AiTelemetrySink;
  clock?: () => number;
}>): Promise<Result> => {
  const startedAt = clock();
  const emit = (status: AiTelemetryStatus) =>
    telemetrySink(
      buildAiTelemetry({
        provider: provider.name,
        operation,
        promptVersion: provider.promptVersion,
        model: provider.model,
        status,
        latencyMs: clock() - startedAt,
      }),
    );

  if (!liveAiFeaturesEnabled(provider.name, environment)) {
    emit('feature_disabled');
    throw new AiOperationalControlError('feature_disabled');
  }

  if (provider.name === 'openai') {
    let allowed: boolean;
    try {
      allowed = await quotaStore.consume(teacherId, startedAt);
    } catch (error) {
      emit('internal_failure');
      if (error instanceof AiOperationalControlError) throw error;
      throw new AiOperationalControlError('internal_failure');
    }
    if (!allowed) {
      emit('rate_limited');
      throw new AiOperationalControlError('rate_limited');
    }
  }

  try {
    const result = await invoke();
    emit('completed');
    return result;
  } catch (error) {
    emit(statusForProviderError(error));
    throw error;
  }
};
