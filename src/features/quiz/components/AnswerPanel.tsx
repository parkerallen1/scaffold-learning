interface AnswerPanelProps {
  answer: string;
  isRewardVisible: boolean;
  outcome: 'correct' | 'incorrect' | null;
  onAnswerChange: (answer: string) => void;
  onNext: () => void;
  onSubmit: () => void;
  allowResponseChoice?: boolean;
  responseMode?: 'typing' | 'selection';
  onResponseModeChange?: (mode: 'typing' | 'selection') => void;
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
  allowResponseChoice = false,
  responseMode = 'typing',
  onResponseModeChange,
}: AnswerPanelProps) => (
  <form
    className="absolute bottom-4 right-4 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-4 rounded-lg shadow-lg w-full max-w-xs"
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    {allowResponseChoice && (
      <div className="mb-3 flex gap-2" aria-label="Answer input method">
        {(['typing', 'selection'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={responseMode === mode}
            onClick={() => onResponseModeChange?.(mode)}
            className={`rounded-md border px-2 py-1 text-xs font-semibold ${
              responseMode === mode ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300'
            }`}
          >
            {mode === 'typing' ? 'Keyboard' : 'Number pad'}
          </button>
        ))}
      </div>
    )}
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
      readOnly={responseMode === 'selection'}
      inputMode={responseMode === 'selection' ? 'none' : 'decimal'}
      onChange={(event) => onAnswerChange(event.target.value)}
      placeholder="Type answer here"
      className={`w-full p-3 border-2 rounded-lg bg-gray-50 dark:bg-gray-700 font-semibold focus:outline-none focus:ring-2 transition-all duration-300 ${getAnswerBorderColor(outcome)}`}
      autoComplete="off"
      aria-describedby={outcome !== null ? 'prototype-answer-status' : undefined}
    />
    {responseMode === 'selection' && (
      <div aria-label="On-screen number pad" className="mt-2 grid grid-cols-3 gap-1">
        {['7', '8', '9', '4', '5', '6', '1', '2', '3', '-', '0', '.'].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key === '-' && answer.startsWith('-')) onAnswerChange(answer.slice(1));
              else if (key === '-') onAnswerChange(`-${answer}`);
              else if (key === '.' && !answer.includes('.')) onAnswerChange(`${answer || '0'}.`);
              else if (/^\d$/.test(key)) onAnswerChange(answer + key);
            }}
            className="rounded border border-gray-300 bg-gray-50 py-1.5 font-semibold text-gray-900"
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onAnswerChange(answer.slice(0, -1))}
          className="col-span-2 rounded border border-gray-300 py-1.5 text-sm font-semibold"
        >
          Delete last
        </button>
        <button
          type="button"
          onClick={() => onAnswerChange('')}
          className="rounded border border-gray-300 py-1.5 text-sm font-semibold"
        >
          Clear
        </button>
      </div>
    )}
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
