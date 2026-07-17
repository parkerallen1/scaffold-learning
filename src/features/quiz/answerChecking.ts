import type { Question } from '../../types';

export const normalizeAnswer = (answer: string): string =>
  answer.trim().toLowerCase().replace(/\s/g, '');

export const isAnswerCorrect = (
  question: Pick<Question, 'id' | 'answer'>,
  answer: string,
): boolean => {
  const normalizedAnswer = normalizeAnswer(answer);

  if (question.id === 12) {
    const expectedParts = ['25.14', '76.38'];
    const answerParts = normalizedAnswer.split('+').filter((part) => part);

    return (
      answerParts.length === 2 &&
      expectedParts.includes(answerParts[0]) &&
      expectedParts.includes(answerParts[1]) &&
      answerParts[0] !== answerParts[1]
    );
  }

  return normalizedAnswer === normalizeAnswer(question.answer);
};
