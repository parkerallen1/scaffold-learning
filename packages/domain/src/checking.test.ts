import { describe, expect, it } from 'vitest';

import type { ChoiceId, QuestionId } from './ids.js';
import { checkSubmittedAnswer } from './checking.js';

const questionId = 'question_demo_01' as QuestionId;
const correctChoiceId = 'choice_demo_a' as ChoiceId;

describe('checkSubmittedAnswer', () => {
  it('checks numeric tolerance inclusively', () => {
    const key = {
      questionId,
      questionType: 'numeric' as const,
      expectedValue: 10,
      tolerance: 0.05,
      acceptedUnits: [],
    };

    expect(checkSubmittedAnswer(key, { kind: 'numeric', value: 10.05 })).toEqual({
      outcome: 'correct',
      reason: 'matched',
    });
    expect(checkSubmittedAnswer(key, { kind: 'numeric', value: 10.051 }).outcome).toBe('incorrect');
  });

  it('normalizes configured units but requires one when units are configured', () => {
    const key = {
      questionId,
      questionType: 'numeric' as const,
      expectedValue: 2.5,
      tolerance: 0,
      acceptedUnits: ['m', 'meters'],
    };

    expect(checkSubmittedAnswer(key, { kind: 'numeric', value: 2.5, unit: ' M ' }).outcome).toBe(
      'correct',
    );
    expect(checkSubmittedAnswer(key, { kind: 'numeric', value: 2.5 }).reason).toBe('unitMismatch');
  });

  it('checks a multiple-choice ID without exposing labels or an answer rationale', () => {
    const key = {
      questionId,
      questionType: 'multipleChoice' as const,
      correctChoiceId,
    };

    expect(checkSubmittedAnswer(key, { kind: 'choice', choiceId: correctChoiceId }).outcome).toBe(
      'correct',
    );
  });

  it('normalizes case and runs of whitespace without removing punctuation', () => {
    const key = {
      questionId,
      questionType: 'shortText' as const,
      acceptedAnswers: ['No, subtraction is not commutative.'],
      normalization: 'caseAndWhitespace' as const,
      teacherReviewAllowed: true as const,
    };

    expect(
      checkSubmittedAnswer(key, {
        kind: 'shortText',
        value: '  NO, subtraction   is not commutative. ',
      }).outcome,
    ).toBe('correct');
    expect(
      checkSubmittedAnswer(key, {
        kind: 'shortText',
        value: 'No subtraction is not commutative',
      }).outcome,
    ).toBe('teacherReview');
  });

  it('treats a blank short response as incorrect instead of sending empty work to review', () => {
    const key = {
      questionId,
      questionType: 'shortText' as const,
      acceptedAnswers: ['A complete response'],
      normalization: 'exact' as const,
      teacherReviewAllowed: true as const,
    };

    expect(checkSubmittedAnswer(key, { kind: 'shortText', value: '  ' })).toEqual({
      outcome: 'incorrect',
      reason: 'blank',
    });
  });

  it('rejects answer-type mismatches deterministically', () => {
    const key = {
      questionId,
      questionType: 'multipleChoice' as const,
      correctChoiceId,
    };

    expect(checkSubmittedAnswer(key, { kind: 'shortText', value: 'A' }).reason).toBe(
      'answerTypeMismatch',
    );
  });
});
