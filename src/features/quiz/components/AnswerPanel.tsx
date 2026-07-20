interface AnswerPanelProps {
  answer: string;
  isRewardVisible: boolean;
  outcome: 'correct' | 'incorrect' | null;
  onAnswerChange: (answer: string) => void;
  onNext: () => void;
  onSubmit: () => void;
}

const getAnswerBorderColor = (outcome: AnswerPanelProps['outcome']): string => {
  if (outcome === 'correct') return 'border-green-700 focus:ring-green-700';
  if (outcome === 'incorrect') return 'border-red-700 focus:ring-red-700';
  return 'border-gray-500 dark:border-gray-400 focus:ring-blue-500';
};

export const AnswerPanel = ({
  answer,
  isRewardVisible,
  outcome,
  onAnswerChange,
  onNext,
  onSubmit,
}: AnswerPanelProps) => (
  <form
    className="absolute bottom-4 right-4 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-4 rounded-lg shadow-lg w-full max-w-xs"
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    <label
      htmlFor="answer"
      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
    >
      Your Final Answer
    </label>
    <input
      id="answer"
      type="text"
      value={answer}
      onChange={(event) => onAnswerChange(event.target.value)}
      placeholder="Type answer here"
      className={`w-full p-3 border-2 rounded-lg bg-gray-50 dark:bg-gray-700 font-semibold focus:outline-none focus:ring-2 transition-all duration-300 ${getAnswerBorderColor(outcome)}`}
      autoComplete="off"
      aria-describedby={outcome !== null ? 'prototype-answer-status' : undefined}
    />
    {outcome !== null && (
      <p
        id="prototype-answer-status"
        role="status"
        className={`mt-2 text-sm font-semibold ${
          outcome === 'correct'
            ? 'text-green-700 dark:text-green-300'
            : 'text-red-700 dark:text-red-300'
        }`}
      >
        {outcome === 'correct' ? 'Correct.' : 'Incorrect. Try again.'}
      </p>
    )}
    {outcome !== 'correct' && (
      <button
        type="submit"
        disabled={answer.trim() === ''}
        className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-400/50"
      >
        Submit answer
      </button>
    )}
    {outcome === 'correct' && !isRewardVisible && (
      <button
        type="button"
        onClick={onNext}
        className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-400/50"
      >
        Next Question
      </button>
    )}
  </form>
);
