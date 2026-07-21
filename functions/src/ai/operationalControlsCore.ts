export const AI_MINUTE_LIMIT = 5;
export const AI_DAY_LIMIT = 50;
export const AI_MINUTE_WINDOW_MS = 60_000;
export const AI_DAY_WINDOW_MS = 86_400_000;

export type AiOperation =
  'recommendStudentSupports' | 'auditStudentEvidence' | 'analyzeIepDocument';
export type AiProviderName = 'fake' | 'openai';
export type AiTelemetryStatus =
  'completed' | 'feature_disabled' | 'rate_limited' | 'provider_fallback' | 'internal_failure';

export type AiProviderMetadata = Readonly<{
  name: AiProviderName;
  model: string;
  promptVersion: string;
}>;

export type AiQuotaState = Readonly<{
  minuteWindowStart: number;
  minuteCount: number;
  dayWindowStart: number;
  dayCount: number;
  updatedAt: number;
}>;

export type AiQuotaDecision = Readonly<{
  allowed: boolean;
  exhaustedWindow: 'minute' | 'day' | null;
  nextState: AiQuotaState;
}>;

export type AiTelemetryRecord = Readonly<{
  provider: AiProviderName;
  operation: AiOperation;
  promptVersion: string;
  model: string;
  status: AiTelemetryStatus;
  latencyMs: number;
}>;

const windowStart = (nowMs: number, windowMs: number): number =>
  Math.floor(nowMs / windowMs) * windowMs;

export const liveAiFeaturesEnabled = (
  provider: AiProviderName,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean => provider !== 'openai' || environment.AI_FEATURES_ENABLED === 'true';

export const consumeAiQuota = (
  previous: AiQuotaState | null,
  nowMs: number,
  limits: Readonly<{ minute: number; day: number }> = {
    minute: AI_MINUTE_LIMIT,
    day: AI_DAY_LIMIT,
  },
): AiQuotaDecision => {
  const currentMinuteStart = windowStart(nowMs, AI_MINUTE_WINDOW_MS);
  const currentDayStart = windowStart(nowMs, AI_DAY_WINDOW_MS);
  const minuteCount = previous?.minuteWindowStart === currentMinuteStart ? previous.minuteCount : 0;
  const dayCount = previous?.dayWindowStart === currentDayStart ? previous.dayCount : 0;
  const exhaustedWindow =
    dayCount >= limits.day ? 'day' : minuteCount >= limits.minute ? 'minute' : null;
  const allowed = exhaustedWindow === null;

  return Object.freeze({
    allowed,
    exhaustedWindow,
    nextState: Object.freeze({
      minuteWindowStart: currentMinuteStart,
      minuteCount: minuteCount + (allowed ? 1 : 0),
      dayWindowStart: currentDayStart,
      dayCount: dayCount + (allowed ? 1 : 0),
      updatedAt: nowMs,
    }),
  });
};

const sanitizedIdentifier = (value: string): string => {
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,100}$/.test(trimmed) ? trimmed : 'unknown';
};

export const buildAiTelemetry = ({
  provider,
  operation,
  promptVersion,
  model,
  status,
  latencyMs,
}: Readonly<{
  provider: AiProviderName;
  operation: AiOperation;
  promptVersion: string;
  model: string;
  status: AiTelemetryStatus;
  latencyMs: number;
}>): AiTelemetryRecord =>
  Object.freeze({
    provider,
    operation,
    promptVersion: sanitizedIdentifier(promptVersion),
    model: sanitizedIdentifier(model),
    status,
    latencyMs: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : 0,
  });
