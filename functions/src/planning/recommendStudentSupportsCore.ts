import { z } from 'zod';

import {
  classroomIdSchema,
  epochMillisSchema,
  recommendationInputSchema,
  recommendationResultSchema,
  studentIdSchema,
  structuredObservationsSchema,
  teacherIdSchema,
  type RecommendationInput,
  type RecommendationResult,
  type StructuredObservations,
  type TeacherId,
} from '@scaffold-learning/domain';

import {
  RecommendationManualFallbackError,
  type RecommendationFallbackCode,
} from '../ai/contracts.js';

export const RECOMMENDATION_UNAVAILABLE_MESSAGE =
  'Support recommendations are unavailable. Configure supports manually.';
export const INSUFFICIENT_OBSERVATIONS_MESSAGE =
  'Add at least one observed learning preference or work pattern before requesting recommendations.';

export const recommendStudentSupportsInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
  })
  .strict();

export const recommendationProposalSchema = z
  .object({
    id: z.string().trim().min(1).max(150),
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    profileUpdatedAt: epochMillisSchema,
    status: z.literal('proposed'),
    recommendationResult: recommendationResultSchema,
    createdBy: teacherIdSchema,
    createdAt: epochMillisSchema,
  })
  .strict();

export type RecommendationProposal = z.infer<typeof recommendationProposalSchema>;

export class InsufficientRecommendationEvidenceError extends Error {
  constructor() {
    super(INSUFFICIENT_OBSERVATIONS_MESSAGE);
    this.name = 'InsufficientRecommendationEvidenceError';
  }
}

const OBSERVATION_MAX_LENGTH = 300;

const compactObservation = (label: string, value: string): string => {
  const normalized = `${label}: ${value}`.trim().replace(/\s+/g, ' ');
  if (normalized.length <= OBSERVATION_MAX_LENGTH) return normalized;
  return normalized.slice(0, OBSERVATION_MAX_LENGTH - 1).trimEnd() + '…';
};

const joinedObservation = (label: string, values: readonly string[]): string | undefined =>
  values.length === 0 ? undefined : compactObservation(label, values.join('; '));

const BARRIER_LABELS: Readonly<Record<StructuredObservations['barriers'][number], string>> = {
  readingDirections: 'reading directions',
  gettingStarted: 'getting started',
  rememberingSteps: 'remembering steps',
  calculation: 'calculation',
  writtenResponse: 'written response',
  sustainingAttention: 'sustaining attention',
  handlingMistakes: 'handling mistakes',
};

const RESPONSE_LABELS: Readonly<
  Record<StructuredObservations['responsePreferences'][number], string>
> = {
  typing: 'typing',
  selection: 'choosing from options',
  speech: 'speaking',
  handwriting: 'handwriting',
};

const TIMER_LABELS: Readonly<
  Record<Exclude<StructuredObservations['timerResponse'], 'unknown'>, string>
> = {
  calming: 'usually calming',
  neutral: 'usually neutral',
  stressful: 'usually stressful',
};

const PROMPTING_LABELS: Readonly<
  Record<Exclude<StructuredObservations['adultPrompting'], 'unknown'>, string>
> = {
  none: 'rarely or never',
  occasional: 'occasionally',
  frequent: 'frequently',
};

export const recommendationInputFromObservations = (
  rawObservations: StructuredObservations,
): RecommendationInput => {
  const observations = structuredObservationsSchema.parse(rawObservations);
  const evidence = [
    observations.independentWork
      ? compactObservation('Independent work that goes well', observations.independentWork)
      : undefined,
    joinedObservation(
      'Observed work barriers',
      observations.barriers.map((barrier) => BARRIER_LABELS[barrier]),
    ),
    observations.stuckLooksLike
      ? compactObservation('Getting stuck looks like', observations.stuckLooksLike)
      : undefined,
    joinedObservation('Helpful teacher strategies', observations.helpfulStrategies),
    joinedObservation(
      'Comfortable response modes',
      observations.responsePreferences.map((preference) => RESPONSE_LABELS[preference]),
    ),
    observations.timerResponse === 'unknown'
      ? undefined
      : compactObservation('Visible timers are', TIMER_LABELS[observations.timerResponse]),
    observations.adultPrompting === 'unknown'
      ? undefined
      : compactObservation(
          'Adult prompts are needed',
          PROMPTING_LABELS[observations.adultPrompting],
        ),
    observations.interestsAndConsiderations
      ? compactObservation(
          'Useful interests, language preferences, or sensory considerations',
          observations.interestsAndConsiderations,
        )
      : undefined,
    joinedObservation('The app should never', observations.neverDo),
  ].filter((observation): observation is string => observation !== undefined);

  if (evidence.length === 0) {
    throw new InsufficientRecommendationEvidenceError();
  }
  return recommendationInputSchema.parse({ observations: evidence });
};

export const buildRecommendationProposal = ({
  id,
  classroomId,
  studentId,
  profileUpdatedAt,
  recommendationResult,
  createdBy,
  createdAt,
}: Readonly<{
  id: string;
  classroomId: string;
  studentId: string;
  profileUpdatedAt: number;
  recommendationResult: RecommendationResult;
  createdBy: TeacherId;
  createdAt: number;
}>): RecommendationProposal =>
  recommendationProposalSchema.parse({
    id,
    classroomId,
    studentId,
    profileUpdatedAt,
    status: 'proposed',
    recommendationResult,
    createdBy,
    createdAt,
  });

export const recommendationFallbackCode = (error: unknown): RecommendationFallbackCode | null =>
  error instanceof RecommendationManualFallbackError ? error.code : null;
