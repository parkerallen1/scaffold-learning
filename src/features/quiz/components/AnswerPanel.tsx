interface AnswerPanelProps {
  answer: string;
  isCorrect: boolean;
  isRewardVisible: boolean;
  onAnswerChange: (answer: string) => void;
  onNext: () => void;
}

const getAnswerBorderColor = (answer: string, isCorrect: boolean): string => {
  if (isCorrect) return 'border-green-500 focus:ring-green-500';
  if (answer.length > 0) return 'border-red-500 focus:ring-red-500';
  return 'border-gray-300 dark:border-gray-600 focus:ring-blue-500';
};

export const AnswerPanel = ({
  answer,
  isCorrect,
  isRewardVisible,
  onAnswerChange,
  onNext,
}: AnswerPanelProps) => (
  <div className="absolute bottom-4 right-4 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-4 rounded-lg shadow-lg w-full max-w-xs">
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
      className={`w-full p-3 border-2 rounded-lg bg-gray-50 dark:bg-gray-700 font-semibold focus:outline-none focus:ring-2 transition-all duration-300 ${getAnswerBorderColor(answer, isCorrect)}`}
      autoComplete="off"
      aria-describedby={answer.length > 0 ? 'prototype-answer-status' : undefined}
    />
    {answer.length > 0 && (
      <p
        id="prototype-answer-status"
        role="status"
        className={`mt-2 text-sm font-semibold ${
          isCorrect ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
        }`}
      >
        {isCorrect ? 'Answer matches.' : 'Not a match yet.'}
      </p>
    )}
    {isCorrect && !isRewardVisible && (
      <button
        type="button"
        onClick={onNext}
        className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-400/50"
      >
        Next Question
      </button>
    )}
  </div>
);
