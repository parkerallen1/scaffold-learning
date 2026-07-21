import { describe, expect, it } from 'vitest';

import {
  recommendationResultSchema,
  structuredObservationsSchema,
  syntheticIds,
} from '@scaffold-learning/domain';

import { RecommendationManualFallbackError } from '../ai/contracts.js';
import { fakeRecommendationFixture } from '../ai/fixtures.js';
import {
  buildRecommendationProposal,
  InsufficientRecommendationEvidenceError,
  recommendationFallbackCode,
  recommendationInputFromObservations,
} from './recommendStudentSupportsCore.js';

describe('recommendation evidence mapping', () => {
  it('creates bounded, deterministic evidence only from structured observations', () => {
    const observations = structuredObservationsSchema.parse({
      independentWork: ' Completes familiar routines independently. ',
      barriers: ['readingDirections', 'gettingStarted'],
      stuckLooksLike: 'Waits after rereading the page.',
      helpfulStrategies: ['Show one direction at a time.', 'Offer a first-step prompt.'],
      timerResponse: 'stressful',
      responsePreferences: ['typing', 'selection'],
      adultPrompting: 'occasional',
      interestsAndConsiderations: 'Prefers examples about music.',
      neverDo: ['Do not play audio automatically.'],
    });

    expect(recommendationInputFromObservations(observations)).toEqual({
      observations: [
        'Independent work that goes well: Completes familiar routines independently.',
        'Observed work barriers: reading directions; getting started',
        'Getting stuck looks like: Waits after rereading the page.',
        'Helpful teacher strategies: Show one direction at a time.; Offer a first-step prompt.',
        'Comfortable response modes: typing; choosing from options',
        'Visible timers are: usually stressful',
        'Adult prompts are needed: occasionally',
        'Useful interests, language preferences, or sensory considerations: Prefers examples about music.',
        'The app should never: Do not play audio automatically.',
      ],
    });
  });

  it('rejects an empty optional interview instead of manufacturing evidence', () => {
    const observations = structuredObservationsSchema.parse({});
    expect(() => recommendationInputFromObservations(observations)).toThrowError(
      InsufficientRecommendationEvidenceError,
    );
  });

  it('caps long list evidence at the provider contract limit', () => {
    const observations = structuredObservationsSchema.parse({
      helpfulStrategies: Array.from(
        { length: 12 },
        (_, index) => `Strategy ${index + 1} ${'x'.repeat(175)}`,
      ),
    });
    const input = recommendationInputFromObservations(observations);
    expect(input.observations).toHaveLength(1);
    expect(input.observations[0]).toHaveLength(300);
  });
});

describe('recommendation proposal construction', () => {
  it('persists a proposed result tied to the profile version used', () => {
    const recommendationResult = recommendationResultSchema.parse(fakeRecommendationFixture);
    expect(
      buildRecommendationProposal({
        id: 'recommendation_demo_01',
        classroomId: syntheticIds.classroomId,
        studentId: syntheticIds.studentId,
        profileUpdatedAt: syntheticIds.now,
        recommendationResult,
        createdBy: syntheticIds.teacherId,
        createdAt: syntheticIds.now + 1,
      }),
    ).toMatchObject({
      status: 'proposed',
      profileUpdatedAt: syntheticIds.now,
      recommendationResult,
    });
  });

  it('rejects malformed provider results and only maps known manual fallbacks', () => {
    expect(() =>
      buildRecommendationProposal({
        id: 'recommendation_demo_01',
        classroomId: syntheticIds.classroomId,
        studentId: syntheticIds.studentId,
        profileUpdatedAt: syntheticIds.now,
        recommendationResult: { ...fakeRecommendationFixture, provider: 'other' } as never,
        createdBy: syntheticIds.teacherId,
        createdAt: syntheticIds.now + 1,
      }),
    ).toThrow();
    expect(recommendationFallbackCode(new RecommendationManualFallbackError('unsafe_output'))).toBe(
      'unsafe_output',
    );
    expect(recommendationFallbackCode(new Error('database unavailable'))).toBeNull();
  });
});
