import type { ChangeEvent, ReactNode } from 'react';

import { useDialogFocus } from '@/shared/hooks/useDialogFocus';

interface PrototypeSettingsDialogProps {
  children: ReactNode;
  interestFile: File | null;
  isInterestEnabled: boolean;
  isOpen: boolean;
  isTimerEnabled: boolean;
  onBackgroundColorChange: (colorClass: string) => void;
  onClose: () => void;
  onInterestEnabledChange: (enabled: boolean) => void;
  onInterestFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpen: () => void;
  onTimerEnabledChange: (enabled: boolean) => void;
  onTimerSecondsChange: (seconds: number) => void;
  timerSeconds: number;
}

export const PrototypeSettingsDialog = ({
  children,
  interestFile,
  isInterestEnabled,
  isOpen,
  isTimerEnabled,
  onBackgroundColorChange,
  onClose,
  onInterestEnabledChange,
  onInterestFileChange,
  onOpen,
  onTimerEnabledChange,
  onTimerSecondsChange,
  timerSeconds,
}: PrototypeSettingsDialogProps) => {
  const dialogRef = useDialogFocus<HTMLDivElement>({ isOpen, onDismiss: onClose });

  return (
    <>
      <div className="absolute top-4 left-4 z-40">
        <button
          type="button"
          onClick={onOpen}
          className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          aria-label="Prototype Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-gray-600 dark:text-gray-300"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0l-.1.41-1.38.65c-1.28.6-1.95 2.12-1.39 3.4l.18.41-1.13 1.03c-1.11 1.01-.52 2.92.8 3.45l1.32.52.4.41c.42 1.76 2.86 1.76 3.28 0l.4-.41 1.32-.52c1.32-.53 1.91-2.44.8-3.45l-1.13-1.03.18-.41c.56-1.28-.11-2.8-1.39-3.4l-1.38-.65-.1-.41zM10 12a2 2 0 100-4 2 2 0 000 4z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div className="relative w-full min-h-[85vh] max-w-7xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col">
        {isOpen && (
          <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center z-30 rounded-2xl">
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="prototype-settings-title"
              className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md m-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h2
                  id="prototype-settings-title"
                  data-dialog-initial-focus
                  tabIndex={-1}
                  className="text-xl font-bold"
                >
                  Prototype Settings
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                  aria-label="Close prototype settings"
                >
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                Classroom permissions arrive with teacher sign-in in a later milestone.
              </p>

              <div className="space-y-6">
                <div>
                  <p className="block mb-3 font-semibold text-gray-700 dark:text-gray-300">
                    Background Color
                  </p>
                  <div role="group" aria-label="Background color" className="flex flex-wrap gap-4">
                    <button
                      type="button"
                      aria-label="Default Background"
                      onClick={() => onBackgroundColorChange('bg-gray-100 dark:bg-gray-900')}
                      className="w-10 h-10 rounded-full bg-gray-100 border-2 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    ></button>
                    <button
                      type="button"
                      aria-label="Light Blue Background"
                      onClick={() => onBackgroundColorChange('bg-blue-50 dark:bg-slate-800')}
                      className="w-10 h-10 rounded-full bg-blue-50 border-2 border-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    ></button>
                    <button
                      type="button"
                      aria-label="Mint Green Background"
                      onClick={() => onBackgroundColorChange('bg-green-50 dark:bg-gray-800')}
                      className="w-10 h-10 rounded-full bg-green-50 border-2 border-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    ></button>
                    <button
                      type="button"
                      aria-label="Soft Pink Background"
                      onClick={() => onBackgroundColorChange('bg-pink-50 dark:bg-gray-800')}
                      className="w-10 h-10 rounded-full bg-pink-50 border-2 border-pink-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    ></button>
                  </div>
                </div>
                <hr className="dark:border-gray-600" />

                <div>
                  <label className="flex items-center gap-3 mb-3 font-semibold text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={isInterestEnabled}
                      onChange={(event) => onInterestEnabledChange(event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Interest Reward
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    Show a rewarding image, video, or audio clip after a correct answer.
                  </p>
                  <label htmlFor="prototype-reward-file" className="sr-only">
                    Reward media file
                  </label>
                  <input
                    id="prototype-reward-file"
                    type="file"
                    onChange={onInterestFileChange}
                    disabled={!isInterestEnabled}
                    accept="image/*,video/*,audio/*"
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 dark:file:bg-blue-900/50 dark:file:text-blue-300 dark:hover:file:bg-blue-900"
                  />
                  {interestFile && isInterestEnabled && (
                    <p className="text-xs text-gray-500 mt-2">Selected: {interestFile.name}</p>
                  )}
                </div>

                <hr className="dark:border-gray-600" />

                <div>
                  <label className="flex items-center gap-3 mb-3 font-semibold text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={isTimerEnabled}
                      onChange={(event) => onTimerEnabledChange(event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Visual Timer
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    Set a countdown timer for each question. Reaching zero does not submit your
                    answer or move to the next question.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="prototype-timer-seconds" className="text-sm font-medium">
                      Timer length
                    </label>
                    <input
                      id="prototype-timer-seconds"
                      type="number"
                      value={timerSeconds}
                      onChange={(event) =>
                        onTimerSecondsChange(Math.max(1, parseInt(event.target.value, 10)) || 1)
                      }
                      disabled={!isTimerEnabled}
                      className="block min-w-0 flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-transparent disabled:opacity-50"
                      min="1"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">seconds</span>
                  </div>
                </div>

                <hr className="dark:border-gray-600" />

                <div>
                  <h4 className="mb-3 font-semibold text-gray-700 dark:text-gray-300">
                    Worksheet Import
                  </h4>
                  <div
                    aria-disabled="true"
                    className="rounded-lg border border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  >
                    Secure AI import is coming through the teacher workflow. File uploads are
                    unavailable for now.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {children}
      </div>
    </>
  );
};
