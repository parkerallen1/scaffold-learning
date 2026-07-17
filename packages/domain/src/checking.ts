import type { QuestionAnswerKey } from './assignments.js';
import type { SubmittedAnswer } from './sessions.js';

export type AnswerCheckResult = Readonly<{
  outcome: 'correct' | 'incorrect' | 'teacherReview';
  reason:
    | 'matched'
    | 'blank'
    | 'answerTypeMismatch'
    | 'valueMismatch'
    | 'unitMismatch'
    | 'teacherReviewRequired';
}>;

const normalizeUnit = (value: string): string => value.trim().toLocaleLowerCase('en-US');

const normalizeText = (value: string, mode: 'caseAndWhitespace' | 'exact'): string => {
  if (mode === 'exact') {
    return value;
  }

  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
};

export const checkSubmittedAnswer = (
  answerKey: QuestionAnswerKey,
  submittedAnswer: SubmittedAnswer,
): AnswerCheckResult => {
  if (answerKey.questionType === 'numeric') {
    if (submittedAnswer.kind !== 'numeric') {
      return { outcome: 'incorrect', reason: 'answerTypeMismatch' };
    }

    const roundingSlack =
      Number.EPSILON *
      Math.max(1, Math.abs(submittedAnswer.value), Math.abs(answerKey.expectedValue));
    const valueMatches =
      Math.abs(submittedAnswer.value - answerKey.expectedValue) <=
      answerKey.tolerance + roundingSlack;
    if (!valueMatches) {
      return { outcome: 'incorrect', reason: 'valueMismatch' };
    }

    if (answerKey.acceptedUnits.length > 0) {
      const unit = submittedAnswer.unit === undefined ? '' : normalizeUnit(submittedAnswer.unit);
      const acceptedUnits = answerKey.acceptedUnits.map(normalizeUnit);
      if (!acceptedUnits.includes(unit)) {
        return { outcome: 'incorrect', reason: 'unitMismatch' };
      }
    }

    return { outcome: 'correct', reason: 'matched' };
  }

  if (answerKey.questionType === 'multipleChoice') {
    if (submittedAnswer.kind !== 'choice') {
      return { outcome: 'incorrect', reason: 'answerTypeMismatch' };
    }

    return submittedAnswer.choiceId === answerKey.correctChoiceId
      ? { outcome: 'correct', reason: 'matched' }
      : { outcome: 'incorrect', reason: 'valueMismatch' };
  }

  if (submittedAnswer.kind !== 'shortText') {
    return { outcome: 'incorrect', reason: 'answerTypeMismatch' };
  }

  if (submittedAnswer.value.trim().length === 0) {
    return { outcome: 'incorrect', reason: 'blank' };
  }

  const submittedText = normalizeText(submittedAnswer.value, answerKey.normalization);
  const matches = answerKey.acceptedAnswers.some(
    (acceptedAnswer) => normalizeText(acceptedAnswer, answerKey.normalization) === submittedText,
  );

  return matches
    ? { outcome: 'correct', reason: 'matched' }
    : { outcome: 'teacherReview', reason: 'teacherReviewRequired' };
};
