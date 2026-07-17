import { z } from 'zod';

export const onboardingQuestionIdSchema = z.enum([
  'independentWork',
  'barriers',
  'stuckLooksLike',
  'helpfulStrategies',
  'responsePreferences',
  'timerResponse',
  'adultPrompting',
  'interestsAndConsiderations',
  'neverDo',
]);

export type OnboardingQuestionId = z.infer<typeof onboardingQuestionIdSchema>;

type OnboardingQuestion = Readonly<{
  id: OnboardingQuestionId;
  prompt: string;
  helper: string;
  responseKind: 'longText' | 'shortList' | 'singleSelect' | 'multiSelect';
  options?: readonly Readonly<{ value: string; label: string }>[];
  optional: true;
}>;

export const ONBOARDING_QUESTIONS = Object.freeze([
  {
    id: 'independentWork',
    prompt: 'When this student works independently, what usually goes well?',
    helper: 'Describe observable strengths or routines. You can skip any question.',
    responseKind: 'longText',
    optional: true,
  },
  {
    id: 'barriers',
    prompt: 'Which parts of independent work tend to create the most friction?',
    helper: 'Choose only what you have observed; this is not a diagnosis.',
    responseKind: 'multiSelect',
    options: [
      { value: 'readingDirections', label: 'Reading directions' },
      { value: 'gettingStarted', label: 'Getting started' },
      { value: 'rememberingSteps', label: 'Remembering steps' },
      { value: 'calculation', label: 'Calculation' },
      { value: 'writtenResponse', label: 'Written response' },
      { value: 'sustainingAttention', label: 'Sustaining attention' },
      { value: 'handlingMistakes', label: 'Handling mistakes' },
    ],
    optional: true,
  },
  {
    id: 'stuckLooksLike',
    prompt: 'What does getting stuck look like for this student?',
    helper: 'For example: rereads, waits, guesses, erases repeatedly, or leaves the task.',
    responseKind: 'longText',
    optional: true,
  },
  {
    id: 'helpfulStrategies',
    prompt: 'What teacher strategies have helped this student re-engage?',
    helper: 'Add brief, concrete strategies one at a time.',
    responseKind: 'shortList',
    optional: true,
  },
  {
    id: 'responsePreferences',
    prompt: 'How does this student most comfortably show an answer?',
    helper: 'Select observed preferences; the assignment still determines valid response types.',
    responseKind: 'multiSelect',
    options: [
      { value: 'typing', label: 'Typing' },
      { value: 'selection', label: 'Choosing from options' },
      { value: 'speech', label: 'Speaking' },
      { value: 'handwriting', label: 'Handwriting' },
    ],
    optional: true,
  },
  {
    id: 'timerResponse',
    prompt: 'How do visible timers usually affect this student?',
    helper: 'Timers in Quiz Master never submit or advance work.',
    responseKind: 'singleSelect',
    options: [
      { value: 'calming', label: 'Usually calming' },
      { value: 'neutral', label: 'Usually neutral' },
      { value: 'stressful', label: 'Usually stressful' },
      { value: 'unknown', label: 'Not sure yet' },
    ],
    optional: true,
  },
  {
    id: 'adultPrompting',
    prompt: 'How often does this student need an adult prompt to continue?',
    helper: 'Use your typical independent-work setting as the reference.',
    responseKind: 'singleSelect',
    options: [
      { value: 'none', label: 'Rarely or never' },
      { value: 'occasional', label: 'Occasionally' },
      { value: 'frequent', label: 'Frequently' },
      { value: 'unknown', label: 'Not sure yet' },
    ],
    optional: true,
  },
  {
    id: 'interestsAndConsiderations',
    prompt: 'What interests, language preferences, or sensory considerations are useful to know?',
    helper: 'Include only information that is useful for choosing how the app presents work.',
    responseKind: 'longText',
    optional: true,
  },
  {
    id: 'neverDo',
    prompt: 'What should the app never do for this student?',
    helper: 'For example: play audio automatically, show a timer, or hide all directions.',
    responseKind: 'shortList',
    optional: true,
  },
] as const satisfies readonly OnboardingQuestion[]);
