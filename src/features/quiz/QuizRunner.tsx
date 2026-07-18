import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { QUESTIONS } from '../../constants';
import { speak } from '../../services/speech';
import type { Question } from '../../types';
import { isAnswerCorrect } from './answerChecking';
import { AnswerPanel } from './components/AnswerPanel';
import { CompletionScreen } from './components/CompletionScreen';
import { PrototypeSettingsDialog } from './components/PrototypeSettingsDialog';
import { QuestionCard } from './components/QuestionCard';
import { RewardModal } from './components/RewardModal';
import { ScratchCanvas } from './components/ScratchCanvas';
import type { ScratchCanvasHandle } from './components/ScratchCanvas';
import { TimerDisplay } from './components/TimerDisplay';

export const QuizRunner = () => {
  const questions = QUESTIONS;
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [isLoadingSpeech, setIsLoadingSpeech] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const scratchCanvasRef = useRef<ScratchCanvasHandle>(null);

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [appBackgroundColor, setAppBackgroundColor] = useState<string>(
    'bg-gray-100 dark:bg-gray-900',
  );

  const [isInterestEnabled, setIsInterestEnabled] = useState<boolean>(false);
  const [interestFile, setInterestFile] = useState<File | null>(null);
  const [interestFileUrl, setInterestFileUrl] = useState<string | null>(null);
  const [showInterestReward, setShowInterestReward] = useState<boolean>(false);

  const [isTimerEnabled, setIsTimerEnabled] = useState<boolean>(false);
  const [timerSeconds, setTimerSeconds] = useState<number>(180);
  const [timerValue, setTimerValue] = useState<number>(180);

  const currentQuestion: Question = questions[currentQuestionIndex];

  const clearCanvas = useCallback(() => {
    scratchCanvasRef.current?.clear();
  }, []);

  const handleNextQuestion = useCallback(() => {
    setShowInterestReward(false);
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((previousIndex) => previousIndex + 1);
      setUserAnswer('');
      setIsCorrect(false);
      setTimerValue(timerSeconds);
      clearCanvas();
    } else {
      setIsFinished(true);
    }
  }, [clearCanvas, currentQuestionIndex, questions.length, timerSeconds]);

  useEffect(() => {
    if (isTimerEnabled && !isFinished && !isCorrect) {
      const timer = setInterval(() => {
        setTimerValue((previousValue) => {
          if (previousValue > 1) {
            return previousValue - 1;
          }
          clearInterval(timer);
          return 0;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [currentQuestionIndex, isCorrect, isFinished, isTimerEnabled]);

  const handleAnswerChange = (answer: string) => {
    setUserAnswer(answer);

    const answerIsCorrect = isAnswerCorrect(currentQuestion, answer);
    setIsCorrect(answerIsCorrect);

    if (answerIsCorrect && isInterestEnabled && interestFileUrl) {
      setShowInterestReward(true);
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setUserAnswer('');
    setIsCorrect(false);
    setIsFinished(false);
    setTimerValue(timerSeconds);
    clearCanvas();
  };

  const handleTimerEnabledChange = (enabled: boolean) => {
    setIsTimerEnabled(enabled);
    setTimerValue(timerSeconds);
  };

  const handleTimerSecondsChange = (seconds: number) => {
    setTimerSeconds(seconds);
    setTimerValue(seconds);
  };

  const handleSpeak = useCallback(async () => {
    if (isLoadingSpeech) return;
    setIsLoadingSpeech(true);
    setSpeechError(null);
    try {
      await speak(currentQuestion.question);
    } catch (error) {
      console.error('Error with TTS:', error);
      setSpeechError("Sorry, I couldn't read that aloud.");
    } finally {
      setIsLoadingSpeech(false);
    }
  }, [currentQuestion.question, isLoadingSpeech]);

  const handleInterestFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setInterestFile(file);
      if (interestFileUrl) {
        URL.revokeObjectURL(interestFileUrl);
      }
      setInterestFileUrl(URL.createObjectURL(file));
    }
  };

  return (
    <section
      aria-labelledby="quiz-runner-title"
      className={`relative min-h-screen ${appBackgroundColor} text-gray-800 dark:text-gray-200 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 font-sans transition-colors duration-300`}
    >
      <h1 id="quiz-runner-title" className="sr-only">
        Synthetic quiz practice
      </h1>
      <PrototypeSettingsDialog
        interestFile={interestFile}
        isInterestEnabled={isInterestEnabled}
        isOpen={showSettings}
        isTimerEnabled={isTimerEnabled}
        onBackgroundColorChange={setAppBackgroundColor}
        onClose={() => setShowSettings(false)}
        onInterestEnabledChange={setIsInterestEnabled}
        onInterestFileChange={handleInterestFileChange}
        onOpen={() => setShowSettings(true)}
        onTimerEnabledChange={handleTimerEnabledChange}
        onTimerSecondsChange={handleTimerSecondsChange}
        timerSeconds={timerSeconds}
      >
        {showInterestReward && interestFileUrl && interestFile && (
          <RewardModal file={interestFile} fileUrl={interestFileUrl} onNext={handleNextQuestion} />
        )}

        {isFinished ? (
          <CompletionScreen onRestart={handleRestart} />
        ) : (
          <>
            <QuestionCard
              currentIndex={currentQuestionIndex}
              isLoadingSpeech={isLoadingSpeech}
              onSpeak={handleSpeak}
              question={currentQuestion}
              speechError={speechError}
              totalQuestions={questions.length}
            />
            <ScratchCanvas ref={scratchCanvasRef} questionIndex={currentQuestionIndex}>
              <AnswerPanel
                answer={userAnswer}
                isCorrect={isCorrect}
                isRewardVisible={showInterestReward}
                onAnswerChange={handleAnswerChange}
                onNext={handleNextQuestion}
              />
            </ScratchCanvas>
          </>
        )}
      </PrototypeSettingsDialog>

      {isTimerEnabled && !isFinished && (
        <TimerDisplay configuredSeconds={timerSeconds} remainingSeconds={timerValue} />
      )}
    </section>
  );
};
