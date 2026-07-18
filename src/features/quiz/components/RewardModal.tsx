/* eslint-disable jsx-a11y/media-has-caption -- Prototype local reward files have no caption-track upload path. */
import { useDialogFocus } from '@/shared/hooks/useDialogFocus';

interface RewardModalProps {
  file: File;
  fileUrl: string;
  onNext: () => void;
}

export const RewardModal = ({ file, fileUrl, onNext }: RewardModalProps) => {
  const dialogRef = useDialogFocus<HTMLElement>({ isOpen: true, onDismiss: onNext });

  return (
    <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-2xl p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reward-title"
        className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col items-center"
      >
        <h2
          id="reward-title"
          data-dialog-initial-focus
          tabIndex={-1}
          className="text-2xl font-bold text-green-700 dark:text-green-300 mb-4"
        >
          Great Job!
        </h2>
        <div className="w-full h-auto max-h-[60vh] flex items-center justify-center mb-6">
          {file.type.startsWith('image/') && (
            <img
              src={fileUrl}
              alt="Reward"
              className="max-w-full max-h-full object-contain rounded-md"
            />
          )}
          {file.type.startsWith('video/') && (
            <video
              src={fileUrl}
              controls
              preload="metadata"
              className="max-w-full max-h-full object-contain rounded-md"
            />
          )}
          {file.type.startsWith('audio/') && (
            <audio src={fileUrl} controls preload="metadata" className="w-full" />
          )}
        </div>
        <button
          type="button"
          onClick={onNext}
          className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-8 rounded-lg shadow-md transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-400/50"
        >
          Next Question
        </button>
      </section>
    </div>
  );
};
