import type { Question } from '../../../types';
import { SpeakerIcon } from '../../../shared/components/SpeakerIcon';

interface QuestionCardProps {
  currentIndex: number;
  isLoadingSpeech: boolean;
  onSpeak: () => void;
  question: Question;
  speechError: string | null;
  totalQuestions: number;
}

export const QuestionCard = ({
  currentIndex,
  isLoadingSpeech,
  onSpeak,
  question,
  speechError,
  totalQuestions,
}: QuestionCardProps) => (
  <div className="p-6 border-b border-gray-200 dark:border-gray-700">
    <div className="flex justify-between items-center">
      <span className="text-sm font-medium text-blue-500 dark:text-blue-400">
        Question {currentIndex + 1} of {totalQuestions}
      </span>
    </div>
    <h2 className="mt-2 text-2xl font-semibold">
      <button
        type="button"
        aria-label={`Read question aloud: ${question.question}`}
        className="group flex w-full cursor-pointer items-start gap-3 text-left"
        onClick={onSpeak}
      >
        <SpeakerIcon
          isLoading={isLoadingSpeech}
          className="w-7 h-7 mt-1 text-gray-500 dark:text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0"
        />
        <span>{question.question}</span>
      </button>
    </h2>
    {speechError && (
      <p role="alert" className="text-red-700 dark:text-red-300 text-sm mt-2">
        {speechError}
      </p>
    )}
    {question.data?.type === 'table' && (
      <div className="mt-4 overflow-x-auto relative shadow-md sm:rounded-lg">
        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              {question.data.headers.map((header) => (
                <th key={header} scope="col" className="px-6 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {question.data.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`px-6 py-4 ${cellIndex === 0 ? 'font-medium text-gray-900 whitespace-nowrap dark:text-white' : ''}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
