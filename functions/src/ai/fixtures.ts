import { recommendationResultSchema } from '@quiz-master/domain';

export const fakeRecommendationFixture = Object.freeze(
  recommendationResultSchema.parse({
    provider: 'fake',
    promptVersion: 'fake-recommend-supports-v1',
    recommendations: [
      {
        supportKey: 'readingChunks',
        proposedSettings: {
          supportKey: 'readingChunks',
          enabled: true,
          chunkMode: 'step',
          revealAllAllowed: true,
        },
        rationale: 'Shorter visible steps can make multi-step directions easier to begin.',
        basedOn: ['The student benefits when directions are presented one step at a time.'],
        confidence: 'medium',
        cautions: [],
      },
      {
        supportKey: 'focusView',
        proposedSettings: {
          supportKey: 'focusView',
          enabled: true,
          hideNonessentialChrome: true,
        },
        rationale: 'Reducing nonessential controls can make it easier to stay with one problem.',
        basedOn: ['The student returns to work more easily when visual distractions are reduced.'],
        confidence: 'high',
        cautions: [],
      },
    ],
  }),
);
