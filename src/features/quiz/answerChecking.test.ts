import { describe, expect, it } from 'vitest';

import { isAnswerCorrect, normalizeAnswer } from './answerChecking';

describe('normalizeAnswer', () => {
  it('trims, lowercases, and removes all whitespace', () => {
    expect(normalizeAnswer('  No, Subtraction\n Is\tNot Commutative.  ')).toBe(
      'no,subtractionisnotcommutative.',
    );
  });

  it('preserves punctuation and operators', () => {
    expect(normalizeAnswer('25.14 + 76.38')).toBe('25.14+76.38');
  });
});

describe('isAnswerCorrect', () => {
  const standardQuestion = {
    id: 11,
    answer: 'No, subtraction is not commutative.',
  };

  it('accepts the exact standard answer', () => {
    expect(isAnswerCorrect(standardQuestion, standardQuestion.answer)).toBe(true);
  });

  it('accepts standard answers regardless of case or whitespace', () => {
    expect(isAnswerCorrect(standardQuestion, ' NO, SUBTRACTION isnot commutative. ')).toBe(true);
  });

  it('rejects punctuation changes and incomplete standard answers', () => {
    expect(isAnswerCorrect(standardQuestion, 'No subtraction is not commutative')).toBe(false);
    expect(isAnswerCorrect(standardQuestion, '')).toBe(false);
  });

  describe('question 12 special case', () => {
    const digitQuestion = {
      id: 12,
      answer: '25.14 + 76.38',
    };

    it('accepts the canonical operand order', () => {
      expect(isAnswerCorrect(digitQuestion, '25.14 + 76.38')).toBe(true);
    });

    it('accepts the reversed operand order', () => {
      expect(isAnswerCorrect(digitQuestion, '76.38+25.14')).toBe(true);
    });

    it('preserves the prototype behavior of ignoring empty plus-separated segments', () => {
      expect(isAnswerCorrect(digitQuestion, '+25.14++76.38+')).toBe(true);
    });

    it('rejects duplicate, missing, extra, and unexpected operands', () => {
      expect(isAnswerCorrect(digitQuestion, '25.14+25.14')).toBe(false);
      expect(isAnswerCorrect(digitQuestion, '25.14')).toBe(false);
      expect(isAnswerCorrect(digitQuestion, '25.14+76.38+10')).toBe(false);
      expect(isAnswerCorrect(digitQuestion, '25.14+76.83')).toBe(false);
    });

    it('uses the fixed prototype operands for id 12', () => {
      expect(isAnswerCorrect({ id: 12, answer: 'different' }, '25.14+76.38')).toBe(true);
    });
  });
});
