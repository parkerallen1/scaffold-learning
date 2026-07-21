import { useCallback, useEffect, useRef, useState } from 'react';

import { QUESTIONS } from '../../constants';
import { speak } from '../../services/speech';
import type { Question } from '../../types';
import type { SupportPlanVersion } from '../../lib/domain';
import { InterestRewardContent } from '../support-plans/InterestRewardContent';
import { isAnswerCorrect } from './answerChecking';
import { AnswerPanel } from './components/AnswerPanel';
import { CompletionScreen } from './components/CompletionScreen';
import { QuestionCard } from './components/QuestionCard';
import { ScratchCanvas } from './components/ScratchCanvas';
import type { ScratchCanvasHandle } from './components/ScratchCanvas';

export const QuizRunner = ({ supportPlan }: { supportPlan?: SupportPlanVersion }) => {
  const questions = QUESTIONS;
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [answerOutcome, setAnswerOutcome] = useState<'correct' | 'incorrect' | null>(null);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [isLoadingSpeech, setIsLoadingSpeech] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [showChunkedDirections, setShowChunkedDirections] = useState(true);
  const scratchCanvasRef = useRef<ScratchCanvasHandle>(null);

  const currentQuestion: Question = questions[currentQuestionIndex];
  const support = <Key extends SupportPlanVersion['supports'][number]['supportKey']>(key: Key) =>
    supportPlan?.supports.find((candidate) => candidate.supportKey === key && candidate.enabled);
  const readAloud = support('readAloud');
  const readingChunks = support('readingChunks');
  const focusView = support('focusView');
  const calmPacing = support('calmPacing');
  const dyslexiaFont = support('dyslexiaFont');
  const interestReward = support('interestReward');
  const initialTimer =
    calmPacing?.supportKey === 'calmPacing' && calmPacing.timerMode === 'nonExpiringCountdown'
      ? (calmPacing.durationSeconds ?? 180)
      : 0;
  const [timerSeconds, setTimerSeconds] = useState(initialTimer);
  const firstDirection =
    currentQuestion.question.split(/(?<=[.!?])\s+/)[0] ?? currentQuestion.question;
  const displayedQuestion =
    readingChunks?.supportKey === 'readingChunks' && showChunkedDirections
      ? { ...currentQuestion, question: `${firstDirection} …` }
      : currentQuestion;
  const clearCanvas = useCallback(() => {
    scratchCanvasRef.current?.clear();
  }, []);

  const handleNextQuestion = useCallback(() => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((previousIndex) => previousIndex + 1);
      setUserAnswer('');
      setAnswerOutcome(null);
      setShowChunkedDirections(true);
      setTimerSeconds(initialTimer);
      clearCanvas();
    } else {
      setIsFinished(true);
    }
  }, [clearCanvas, currentQuestionIndex, initialTimer, questions.length]);

  useEffect(() => {
    if (calmPacing?.supportKey !== 'calmPacing' || calmPacing.timerMode === 'off' || isFinished) {
      return;
    }
    const timer = window.setInterval(() => {
      setTimerSeconds((current) =>
        calmPacing.timerMode === 'elapsed' ? current + 1 : Math.max(0, current - 1),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [calmPacing, currentQuestionIndex, isFinished]);

  const handleAnswerChange = (answer: string) => {
    setUserAnswer(answer);
    setAnswerOutcome(null);
  };

  const handleAnswerSubmit = () => {
    const answerIsCorrect = isAnswerCorrect(currentQuestion, userAnswer);
    setAnswerOutcome(answerIsCorrect ? 'correct' : 'incorrect');
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setUserAnswer('');
    setAnswerOutcome(null);
    setIsFinished(false);
    setShowChunkedDirections(true);
    clearCanvas();
  };

  const handleSpeak = useCallback(async () => {
    if (isLoadingSpeech) return;
    setIsLoadingSpeech(true);
    setSpeechError(null);
    try {
      await (readAloud?.supportKey === 'readAloud'
        ? speak(currentQuestion.question, readAloud.speed)
        : speak(currentQuestion.question));
    } catch (error) {
      console.error('Error with TTS:', error);
      setSpeechError("Sorry, I couldn't read that aloud.");
    } finally {
      setIsLoadingSpeech(false);
    }
  }, [currentQuestion.question, isLoadingSpeech, readAloud]);

  return (
    <section
      aria-labelledby="quiz-runner-title"
      className={`relative flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4 text-gray-800 dark:bg-gray-900 dark:text-gray-200 sm:p-6 md:p-8 ${
        dyslexiaFont?.supportKey === 'dyslexiaFont' ? 'font-dyslexia' : 'font-sans'
      }`}
      style={
        dyslexiaFont?.supportKey === 'dyslexiaFont' && dyslexiaFont.increasedSpacing
          ? { letterSpacing: '0.035em', wordSpacing: '0.12em' }
          : undefined
      }
    >
      <h1 id="quiz-runner-title" className="sr-only">
        Synthetic quiz practice
      </h1>
      <div
        className={`relative flex min-h-[85vh] w-full flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-800 ${
          focusView?.supportKey === 'focusView' ? 'max-w-4xl' : 'max-w-7xl'
        }`}
      >
        {calmPacing?.supportKey === 'calmPacing' &&
          calmPacing.timerMode !== 'off' &&
          !isFinished && (
            <p className="absolute right-5 top-5 z-10 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              {calmPacing.timerMode === 'elapsed' ? 'Time' : 'Pace'} {Math.floor(timerSeconds / 60)}
              :{String(timerSeconds % 60).padStart(2, '0')}
            </p>
          )}
        {isFinished ? (
          <CompletionScreen onRestart={handleRestart} />
        ) : (
          <>
            <QuestionCard
              currentIndex={currentQuestionIndex}
              isLoadingSpeech={isLoadingSpeech}
              onSpeak={handleSpeak}
              question={displayedQuestion}
              speechError={speechError}
              totalQuestions={questions.length}
            />
            {readingChunks?.supportKey === 'readingChunks' && (
              <button
                type="button"
                onClick={() => setShowChunkedDirections((current) => !current)}
                className="mx-6 mt-4 self-start rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-800 dark:text-blue-200"
              >
                {showChunkedDirections
                  ? 'Show the rest of the question'
                  : 'Show one part at a time'}
              </button>
            )}
            <ScratchCanvas ref={scratchCanvasRef} questionIndex={currentQuestionIndex}>
              <AnswerPanel
                answer={userAnswer}
                isRewardVisible={false}
                outcome={answerOutcome}
                onAnswerChange={handleAnswerChange}
                onNext={handleNextQuestion}
                onSubmit={handleAnswerSubmit}
              />
            </ScratchCanvas>
            {answerOutcome === 'correct' && interestReward?.supportKey === 'interestReward' && (
              <InterestRewardContent settings={interestReward} className="mx-6 mb-6" />
            )}
          </>
        )}
      </div>
    </section>
  );
};
