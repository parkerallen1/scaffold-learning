import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { ONBOARDING_QUESTIONS, structuredObservationsSchema } from '@/lib/domain';
import type { OnboardingQuestionId, StructuredObservations } from '@/lib/domain';

export interface OnboardingProfileDraft {
  observations: StructuredObservations;
  teacherSummary?: string;
}

interface OnboardingInterviewProps {
  studentName?: string;
  initialObservations?: Partial<StructuredObservations>;
  onComplete: (draft: OnboardingProfileDraft) => void;
}

const EMPTY_OBSERVATIONS = structuredObservationsSchema.parse({});

const compactObservations = (observations: StructuredObservations) =>
  Object.fromEntries(Object.entries(observations).filter(([, value]) => value !== undefined));

const TEXT_FIELDS = new Set<OnboardingQuestionId>([
  'independentWork',
  'stuckLooksLike',
  'interestsAndConsiderations',
]);

const formatValue = (questionId: OnboardingQuestionId, observations: StructuredObservations) => {
  const value = observations[questionId];

  if (Array.isArray(value)) {
    if (value.length === 0) return 'Skipped';
    const question = ONBOARDING_QUESTIONS.find(({ id }) => id === questionId);
    const options = question && 'options' in question ? question.options : undefined;
    return value
      .map((item) => options?.find((option) => option.value === item)?.label ?? item)
      .join(', ');
  }

  if (!value || value === 'unknown') return 'Skipped';
  const question = ONBOARDING_QUESTIONS.find(({ id }) => id === questionId);
  const options = question && 'options' in question ? question.options : undefined;
  return options?.find((option) => option.value === value)?.label ?? value;
};

const clearQuestion = (
  observations: StructuredObservations,
  questionId: OnboardingQuestionId,
): StructuredObservations => {
  if (questionId === 'barriers' || questionId === 'responsePreferences') {
    return { ...observations, [questionId]: [] };
  }
  if (questionId === 'helpfulStrategies' || questionId === 'neverDo') {
    return { ...observations, [questionId]: [] };
  }
  if (questionId === 'timerResponse' || questionId === 'adultPrompting') {
    return { ...observations, [questionId]: 'unknown' };
  }
  return { ...observations, [questionId]: undefined };
};

export function OnboardingInterview({
  studentName = 'this student',
  initialObservations,
  onComplete,
}: OnboardingInterviewProps) {
  const [observations, setObservations] = useState<StructuredObservations>(() =>
    structuredObservationsSchema.parse({ ...EMPTY_OBSERVATIONS, ...initialObservations }),
  );
  const [listDrafts, setListDrafts] = useState(() => ({
    helpfulStrategies: initialObservations?.helpfulStrategies?.join('\n') ?? '',
    neverDo: initialObservations?.neverDo?.join('\n') ?? '',
  }));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  const [teacherSummary, setTeacherSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const question = ONBOARDING_QUESTIONS[currentIndex];
  const progressLabel = useMemo(
    () => `Question ${currentIndex + 1} of ${ONBOARDING_QUESTIONS.length}`,
    [currentIndex],
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentIndex, isReviewing]);

  const updateText = (value: string) => {
    if (!TEXT_FIELDS.has(question.id)) return;
    setObservations((current) => ({ ...current, [question.id]: value }));
    setError(null);
  };

  const updateList = (value: string) => {
    if (question.id !== 'helpfulStrategies' && question.id !== 'neverDo') return;
    setListDrafts((current) => ({ ...current, [question.id]: value }));
    const items = value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    setObservations((current) => ({ ...current, [question.id]: items }));
    setError(null);
  };

  const toggleMultiSelect = (value: string, checked: boolean) => {
    if (question.id === 'barriers') {
      const typedValue = value as StructuredObservations['barriers'][number];
      setObservations((current) => ({
        ...current,
        barriers: checked
          ? [...current.barriers, typedValue]
          : current.barriers.filter((item) => item !== typedValue),
      }));
    }
    if (question.id === 'responsePreferences') {
      const typedValue = value as StructuredObservations['responsePreferences'][number];
      setObservations((current) => ({
        ...current,
        responsePreferences: checked
          ? [...current.responsePreferences, typedValue]
          : current.responsePreferences.filter((item) => item !== typedValue),
      }));
    }
    setError(null);
  };

  const selectSingle = (value: string) => {
    if (question.id === 'timerResponse') {
      setObservations((current) => ({
        ...current,
        timerResponse: value as StructuredObservations['timerResponse'],
      }));
    }
    if (question.id === 'adultPrompting') {
      setObservations((current) => ({
        ...current,
        adultPrompting: value as StructuredObservations['adultPrompting'],
      }));
    }
    setError(null);
  };

  const validateCurrentQuestion = () => {
    const result = structuredObservationsSchema.safeParse(compactObservations(observations));
    if (result.success) return true;

    const issue = result.error.issues.find((candidate) => candidate.path[0] === question.id);
    if (!issue) return true;
    setError(issue.message);
    return false;
  };

  const advance = (event: FormEvent) => {
    event.preventDefault();
    if (!validateCurrentQuestion()) return;
    setError(null);

    if (returnToReview || currentIndex === ONBOARDING_QUESTIONS.length - 1) {
      setIsReviewing(true);
      setReturnToReview(false);
      return;
    }
    setCurrentIndex((index) => index + 1);
  };

  const goBack = () => {
    setError(null);
    if (returnToReview) {
      setReturnToReview(false);
      setIsReviewing(true);
      return;
    }
    setCurrentIndex((index) => Math.max(0, index - 1));
  };

  const skip = () => {
    if (question.id === 'helpfulStrategies' || question.id === 'neverDo') {
      setListDrafts((current) => ({ ...current, [question.id]: '' }));
    }
    setObservations((current) => clearQuestion(current, question.id));
    setError(null);
    if (returnToReview || currentIndex === ONBOARDING_QUESTIONS.length - 1) {
      setIsReviewing(true);
      setReturnToReview(false);
      return;
    }
    setCurrentIndex((index) => index + 1);
  };

  const editQuestion = (questionId: OnboardingQuestionId) => {
    setCurrentIndex(ONBOARDING_QUESTIONS.findIndex(({ id }) => id === questionId));
    setReturnToReview(true);
    setIsReviewing(false);
    setError(null);
  };

  const finish = (event: FormEvent) => {
    event.preventDefault();
    const parsed = structuredObservationsSchema.safeParse(compactObservations(observations));
    if (!parsed.success) {
      setError('Review the highlighted responses before creating this draft.');
      return;
    }
    if (teacherSummary.length > 1000) {
      setError('Teacher summary must be 1,000 characters or fewer.');
      return;
    }

    const trimmedSummary = teacherSummary.trim();
    onComplete({
      observations: parsed.data,
      ...(trimmedSummary ? { teacherSummary: trimmedSummary } : {}),
    });
  };

  if (isReviewing) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-lg">
        <p className="text-sm font-medium text-blue-700">Teacher review</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-bold text-slate-900">
          Review observations for {studentName}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          These observations can guide support suggestions, but they are not a diagnosis. Only the
          structured answers and summary below are included—there is no raw chat transcript.
        </p>

        <dl className="mt-6 space-y-4">
          {ONBOARDING_QUESTIONS.map((reviewQuestion) => (
            <div key={reviewQuestion.id} className="rounded-xl border border-slate-200 p-4">
              <dt className="font-semibold text-slate-900">{reviewQuestion.prompt}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                {formatValue(reviewQuestion.id, observations)}
              </dd>
              <button
                type="button"
                onClick={() => editQuestion(reviewQuestion.id)}
                className="mt-3 rounded-md px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                aria-label={`Edit: ${reviewQuestion.prompt}`}
              >
                Edit
              </button>
            </div>
          ))}
        </dl>

        <form onSubmit={finish} className="mt-6">
          <label htmlFor="teacher-summary" className="block font-semibold text-slate-900">
            Teacher summary (optional)
          </label>
          <p id="teacher-summary-help" className="mt-1 text-sm text-slate-600">
            Edit this concise summary before it is used to request support recommendations.
          </p>
          <textarea
            id="teacher-summary"
            value={teacherSummary}
            onChange={(event) => {
              setTeacherSummary(event.target.value);
              setError(null);
            }}
            aria-describedby="teacher-summary-help"
            className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={() => editQuestion(ONBOARDING_QUESTIONS.at(-1)!.id)}
              className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Back
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-5 py-2 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Create profile draft
            </button>
          </div>
        </form>
      </section>
    );
  }

  const currentValue = observations[question.id];

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
      <p className="text-sm font-medium text-blue-700">{progressLabel}</p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-bold text-slate-900">
        {question.prompt}
      </h1>
      <p id="question-helper" className="mt-3 text-sm text-slate-600">
        {question.helper}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-700">
        Focus on classroom observations. This interview is not a diagnosis.
      </p>

      <form onSubmit={advance} className="mt-6">
        {question.responseKind === 'longText' && (
          <label className="block">
            <span className="sr-only">Response</span>
            <textarea
              aria-describedby="question-helper"
              value={typeof currentValue === 'string' ? currentValue : ''}
              onChange={(event) => updateText(event.target.value)}
              className="min-h-40 w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            />
          </label>
        )}

        {question.responseKind === 'shortList' && (
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">One item per line</span>
            <textarea
              aria-describedby="question-helper"
              value={
                question.id === 'helpfulStrategies' || question.id === 'neverDo'
                  ? listDrafts[question.id]
                  : ''
              }
              onChange={(event) => updateList(event.target.value)}
              className="mt-2 min-h-40 w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            />
          </label>
        )}

        {(question.responseKind === 'multiSelect' || question.responseKind === 'singleSelect') && (
          <fieldset aria-describedby="question-helper" className="space-y-3">
            <legend className="sr-only">Choose a response</legend>
            {question.options?.map((option) => {
              const isMulti = question.responseKind === 'multiSelect';
              const checked = Array.isArray(currentValue)
                ? currentValue.includes(option.value as never)
                : currentValue === option.value;
              return (
                <label
                  key={option.value}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-slate-800 has-checked:border-blue-600 has-checked:bg-blue-50"
                >
                  <input
                    type={isMulti ? 'checkbox' : 'radio'}
                    name={question.id}
                    value={option.value}
                    checked={checked}
                    onChange={(event) =>
                      isMulti
                        ? toggleMultiSelect(option.value, event.target.checked)
                        : selectSingle(option.value)
                    }
                    className="h-5 w-5 accent-blue-700"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </fieldset>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            disabled={currentIndex === 0 && !returnToReview}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Back
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={skip}
              className="rounded-lg px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Skip question
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-5 py-2 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {returnToReview || currentIndex === ONBOARDING_QUESTIONS.length - 1
                ? 'Review answers'
                : 'Next'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
