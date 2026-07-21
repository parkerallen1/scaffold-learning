import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { ONBOARDING_QUESTIONS, structuredObservationsSchema } from '@/lib/domain';
import type { OnboardingQuestionId, StructuredObservations } from '@/lib/domain';

export interface OnboardingProfileDraft {
  observations: StructuredObservations;
  teacherSummary?: string;
}

interface OnboardingInterviewProps {
  initialTeacherSummary?: string;
  studentName?: string;
  initialObservations?: Partial<StructuredObservations>;
  onComplete: (draft: OnboardingProfileDraft) => void;
}

type OtherDrafts = Partial<Record<OnboardingQuestionId, string>>;
type OtherSelections = Partial<Record<OnboardingQuestionId, boolean>>;

const EMPTY_OBSERVATIONS = structuredObservationsSchema.parse({});

const compactObservations = (observations: StructuredObservations) =>
  Object.fromEntries(Object.entries(observations).filter(([, value]) => value !== undefined));

const questionFor = (questionId: OnboardingQuestionId) =>
  ONBOARDING_QUESTIONS.find(({ id }) => id === questionId);

const splitStuckBehaviors = (value: string | undefined) =>
  value
    ? value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const selectedValues = (
  questionId: OnboardingQuestionId,
  observations: StructuredObservations,
): readonly string[] => {
  switch (questionId) {
    case 'barriers':
      return observations.barriers;
    case 'stuckLooksLike':
      return splitStuckBehaviors(observations.stuckLooksLike);
    case 'helpfulStrategies':
      return observations.helpfulStrategies;
    case 'responsePreferences':
      return observations.responsePreferences;
    case 'neverDo':
      return observations.neverDo;
    default:
      return [];
  }
};

const initialOtherState = (initialObservations?: Partial<StructuredObservations>) => {
  const drafts: OtherDrafts = {};
  const selected: OtherSelections = {};
  if (!initialObservations) return { drafts, selected };

  for (const question of ONBOARDING_QUESTIONS) {
    if (question.responseKind !== 'multiSelect') continue;
    const known = new Set<string>(question.options.map(({ value }) => value));
    const current = selectedValues(
      question.id,
      structuredObservationsSchema.parse({ ...EMPTY_OBSERVATIONS, ...initialObservations }),
    );
    const custom = current.filter((value) => !known.has(value));
    if (custom.length > 0) {
      drafts[question.id] = custom.join('; ');
      selected[question.id] = true;
    }
  }
  return { drafts, selected };
};

const formatValue = (
  questionId: OnboardingQuestionId,
  observations: StructuredObservations,
  otherDrafts: OtherDrafts,
) => {
  const question = questionFor(questionId);
  if (!question) return 'Skipped';
  const value = observations[questionId];
  const values = Array.isArray(value)
    ? value
    : question.responseKind === 'multiSelect' && typeof value === 'string'
      ? splitStuckBehaviors(value)
      : value && value !== 'unknown'
        ? [value]
        : [];
  const labels = values.map(
    (item) => question.options.find((option) => option.value === item)?.label ?? item,
  );
  const other = otherDrafts[questionId]?.trim();
  if (other) labels.push(`Other: ${other}`);
  return labels.length > 0 ? labels.join(', ') : 'Skipped';
};

const clearQuestion = (
  observations: StructuredObservations,
  questionId: OnboardingQuestionId,
): StructuredObservations => {
  if (
    questionId === 'barriers' ||
    questionId === 'responsePreferences' ||
    questionId === 'helpfulStrategies' ||
    questionId === 'neverDo'
  ) {
    return { ...observations, [questionId]: [] };
  }
  if (questionId === 'timerResponse' || questionId === 'adultPrompting') {
    return { ...observations, [questionId]: 'unknown' };
  }
  return { ...observations, [questionId]: undefined };
};

const withOtherResponses = (
  observations: StructuredObservations,
  otherDrafts: OtherDrafts,
): StructuredObservations => {
  const next = { ...observations };
  const context: string[] = [];

  for (const question of ONBOARDING_QUESTIONS) {
    const other = otherDrafts[question.id]?.trim();
    if (!other) continue;
    if (question.id === 'stuckLooksLike') {
      const values = splitStuckBehaviors(next.stuckLooksLike);
      next.stuckLooksLike = (values.includes(other) ? values : [...values, other]).join('\n');
    } else if (question.id === 'helpfulStrategies') {
      if (!next.helpfulStrategies.includes(other)) {
        next.helpfulStrategies = [...next.helpfulStrategies, other];
      }
    } else if (question.id === 'neverDo') {
      if (!next.neverDo.includes(other)) next.neverDo = [...next.neverDo, other];
    } else {
      context.push(`${question.prompt} Other response: ${other}`);
    }
  }

  if (context.length > 0) {
    next.interestsAndConsiderations = [next.interestsAndConsiderations, ...context]
      .filter(Boolean)
      .join('\n');
  }
  return next;
};

export function OnboardingInterview({
  initialTeacherSummary = '',
  studentName = 'this student',
  initialObservations,
  onComplete,
}: OnboardingInterviewProps) {
  const initialOther = useMemo(() => initialOtherState(initialObservations), [initialObservations]);
  const [observations, setObservations] = useState<StructuredObservations>(() =>
    structuredObservationsSchema.parse({ ...EMPTY_OBSERVATIONS, ...initialObservations }),
  );
  const [otherDrafts, setOtherDrafts] = useState<OtherDrafts>(initialOther.drafts);
  const [otherSelections, setOtherSelections] = useState<OtherSelections>(initialOther.selected);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  const [teacherSummary, setTeacherSummary] = useState(initialTeacherSummary);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const question = ONBOARDING_QUESTIONS[currentIndex];
  const progressLabel = `Question ${currentIndex + 1} of ${ONBOARDING_QUESTIONS.length}`;

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentIndex, isReviewing]);

  const toggleMultiSelect = (value: string, checked: boolean) => {
    if (question.id === 'barriers') {
      const typedValue = value as StructuredObservations['barriers'][number];
      setObservations((current) => ({
        ...current,
        barriers: checked
          ? [...current.barriers, typedValue]
          : current.barriers.filter((item) => item !== typedValue),
      }));
    } else if (question.id === 'responsePreferences') {
      const typedValue = value as StructuredObservations['responsePreferences'][number];
      setObservations((current) => ({
        ...current,
        responsePreferences: checked
          ? [...current.responsePreferences, typedValue]
          : current.responsePreferences.filter((item) => item !== typedValue),
      }));
    } else if (question.id === 'stuckLooksLike') {
      setObservations((current) => {
        const values = splitStuckBehaviors(current.stuckLooksLike);
        return {
          ...current,
          stuckLooksLike: (checked
            ? [...values, value]
            : values.filter((item) => item !== value)
          ).join('\n'),
        };
      });
    } else if (question.id === 'helpfulStrategies' || question.id === 'neverDo') {
      setObservations((current) => ({
        ...current,
        [question.id]: checked
          ? [...current[question.id], value]
          : current[question.id].filter((item) => item !== value),
      }));
    }
    setError(null);
  };

  const selectSingle = (value: string) => {
    setOtherSelections((current) => ({ ...current, [question.id]: false }));
    setOtherDrafts((current) => ({ ...current, [question.id]: '' }));
    if (question.id === 'timerResponse') {
      setObservations((current) => ({
        ...current,
        timerResponse: value as StructuredObservations['timerResponse'],
      }));
    } else if (question.id === 'adultPrompting') {
      setObservations((current) => ({
        ...current,
        adultPrompting: value as StructuredObservations['adultPrompting'],
      }));
    }
    setError(null);
  };

  const toggleOther = (checked: boolean) => {
    setOtherSelections((current) => ({ ...current, [question.id]: checked }));
    if (!checked) setOtherDrafts((current) => ({ ...current, [question.id]: '' }));
    if (question.responseKind === 'singleSelect') {
      if (question.id === 'timerResponse') {
        setObservations((current) => ({ ...current, timerResponse: 'unknown' }));
      } else if (question.id === 'adultPrompting') {
        setObservations((current) => ({ ...current, adultPrompting: 'unknown' }));
      }
    }
    setError(null);
  };

  const advance = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (returnToReview || currentIndex === ONBOARDING_QUESTIONS.length - 1) {
      setIsReviewing(true);
      setReturnToReview(false);
    } else {
      setCurrentIndex((index) => index + 1);
    }
  };

  const goBack = () => {
    setError(null);
    if (returnToReview) {
      setReturnToReview(false);
      setIsReviewing(true);
    } else {
      setCurrentIndex((index) => Math.max(0, index - 1));
    }
  };

  const skip = () => {
    setObservations((current) => clearQuestion(current, question.id));
    setOtherSelections((current) => ({ ...current, [question.id]: false }));
    setOtherDrafts((current) => ({ ...current, [question.id]: '' }));
    setError(null);
    if (returnToReview || currentIndex === ONBOARDING_QUESTIONS.length - 1) {
      setIsReviewing(true);
      setReturnToReview(false);
    } else {
      setCurrentIndex((index) => index + 1);
    }
  };

  const editQuestion = (questionId: OnboardingQuestionId) => {
    setCurrentIndex(ONBOARDING_QUESTIONS.findIndex(({ id }) => id === questionId));
    setReturnToReview(true);
    setIsReviewing(false);
    setError(null);
  };

  const finish = (event: FormEvent) => {
    event.preventDefault();
    const parsed = structuredObservationsSchema.safeParse(
      compactObservations(withOtherResponses(observations, otherDrafts)),
    );
    if (!parsed.success) {
      setError('One or more Other responses are too long. Shorten them before continuing.');
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
          These selections can guide support suggestions, but they are not a diagnosis. Only the
          structured answers and summary below are included—there is no raw chat transcript.
        </p>

        <dl className="mt-6 space-y-4">
          {ONBOARDING_QUESTIONS.map((reviewQuestion) => (
            <div key={reviewQuestion.id} className="rounded-xl border border-slate-200 p-4">
              <dt className="font-semibold text-slate-900">{reviewQuestion.prompt}</dt>
              <dd className="mt-1 text-sm text-slate-600">
                {formatValue(reviewQuestion.id, observations, otherDrafts)}
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
            Add a concise note before requesting support recommendations.
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
  const currentSelectedValues = selectedValues(question.id, observations);
  const otherSelected = otherSelections[question.id] === true;

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
      <p className="text-sm font-medium text-blue-700">{progressLabel}</p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-bold text-slate-900">
        {question.prompt}
      </h1>
      <p id="question-helper" className="mt-3 text-sm text-slate-600">
        {question.helper}
      </p>

      <form onSubmit={advance} className="mt-6">
        <fieldset aria-describedby="question-helper" className="space-y-3">
          <legend className="sr-only">Choose a response</legend>
          {question.options.map((option) => {
            const isMulti = question.responseKind === 'multiSelect';
            const checked = isMulti
              ? currentSelectedValues.includes(option.value)
              : currentValue === option.value && !otherSelected;
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
          <div className="rounded-lg border border-slate-200 px-4 py-3 has-checked:border-blue-600 has-checked:bg-blue-50">
            <label className="flex min-h-8 cursor-pointer items-center gap-3 text-slate-800">
              <input
                type={question.responseKind === 'multiSelect' ? 'checkbox' : 'radio'}
                name={question.id}
                checked={otherSelected}
                onChange={(event) => toggleOther(event.target.checked)}
                className="h-5 w-5 accent-blue-700"
              />
              <span>Other</span>
            </label>
            {otherSelected && (
              <input
                autoFocus
                aria-label={`Other response for: ${question.prompt}`}
                value={otherDrafts[question.id] ?? ''}
                onChange={(event) => {
                  setOtherDrafts((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }));
                  setError(null);
                }}
                maxLength={180}
                placeholder="Add a brief classroom observation"
                className="mt-3 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              />
            )}
          </div>
        </fieldset>

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
