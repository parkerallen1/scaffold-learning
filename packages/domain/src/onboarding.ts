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
  responseKind: 'singleSelect' | 'multiSelect';
  options: readonly Readonly<{ value: string; label: string }>[];
  allowOther: true;
  optional: true;
}>;

export const ONBOARDING_QUESTIONS = Object.freeze([
  {
    id: 'barriers',
    prompt: 'Where does independent work create the most friction?',
    helper: 'Choose everything you have observed. This describes classroom needs, not a diagnosis.',
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
    allowOther: true,
    optional: true,
  },
  {
    id: 'stuckLooksLike',
    prompt: 'What does getting stuck usually look like?',
    helper: 'Choose the observable behaviors you see most often.',
    responseKind: 'multiSelect',
    options: [
      { value: 'Rereads the same directions', label: 'Rereads the same directions' },
      { value: 'Waits without starting', label: 'Waits without starting' },
      { value: 'Guesses quickly', label: 'Guesses quickly' },
      { value: 'Erases or restarts repeatedly', label: 'Erases or restarts repeatedly' },
      {
        value: 'Leaves the task or changes activities',
        label: 'Leaves the task or changes activities',
      },
    ],
    allowOther: true,
    optional: true,
  },
  {
    id: 'helpfulStrategies',
    prompt: 'What helps this student re-engage?',
    helper: 'Select strategies that have worked in class.',
    responseKind: 'multiSelect',
    options: [
      { value: 'Show one step at a time.', label: 'Show one step at a time' },
      { value: 'Offer a neutral first-step prompt.', label: 'Offer a neutral first-step prompt' },
      { value: 'Read directions aloud on request.', label: 'Read directions aloud on request' },
      { value: 'Provide a comparable example.', label: 'Provide a comparable example' },
      { value: 'Offer an optional short break.', label: 'Offer an optional short break' },
      { value: 'Reduce visual distractions.', label: 'Reduce visual distractions' },
    ],
    allowOther: true,
    optional: true,
  },
  {
    id: 'responsePreferences',
    prompt: 'How does this student most comfortably show an answer?',
    helper: 'Select observed preferences; assignments still determine valid response types.',
    responseKind: 'multiSelect',
    options: [
      { value: 'typing', label: 'Typing' },
      { value: 'selection', label: 'Choosing from options' },
      { value: 'speech', label: 'Speaking' },
      { value: 'handwriting', label: 'Handwriting' },
    ],
    allowOther: true,
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
    allowOther: true,
    optional: true,
  },
  {
    id: 'adultPrompting',
    prompt: 'How often does this student need an adult prompt to continue?',
    helper: 'Use a typical independent-work setting as the reference.',
    responseKind: 'singleSelect',
    options: [
      { value: 'none', label: 'Rarely or never' },
      { value: 'occasional', label: 'Occasionally' },
      { value: 'frequent', label: 'Frequently' },
      { value: 'unknown', label: 'Not sure yet' },
    ],
    allowOther: true,
    optional: true,
  },
  {
    id: 'neverDo',
    prompt: 'What should the app avoid for this student?',
    helper: 'Select any experience that would be unhelpful or stressful.',
    responseKind: 'multiSelect',
    options: [
      { value: 'Do not play audio automatically.', label: 'Playing audio automatically' },
      { value: 'Do not show a countdown timer.', label: 'Showing a countdown timer' },
      { value: 'Do not hide all directions.', label: 'Hiding all directions' },
      { value: 'Do not auto-advance after an attempt.', label: 'Advancing automatically' },
      { value: 'Do not reveal an answer in a hint.', label: 'Revealing answers in hints' },
    ],
    allowOther: true,
    optional: true,
  },
] as const satisfies readonly OnboardingQuestion[]);
