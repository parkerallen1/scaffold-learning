interface CompletionScreenProps {
  onRestart: () => void;
}

export const CompletionScreen = ({ onRestart }: CompletionScreenProps) => (
  <div className="text-center w-full flex flex-col items-center justify-center flex-grow">
    <h2 className="text-4xl font-bold text-green-500 mb-4">Congratulations!</h2>
    <p className="text-xl mb-8">You've completed all the questions.</p>
    <button
      onClick={onRestart}
      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition-transform transform hover:scale-105"
    >
      Start Over
    </button>
  </div>
);
