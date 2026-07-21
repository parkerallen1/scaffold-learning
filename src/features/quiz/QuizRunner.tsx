import { useCallback, useEffect, useRef, useState } from 'react';

import { QUESTIONS } from '../../constants';
import { speak, stopSpeaking } from '../../services/speech';
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
  const [timerVisible, setTimerVisible] = useState(true);
  const [useOpenDyslexic, setUseOpenDyslexic] = useState(true);
  const [speechRate, setSpeechRate] = useState(1);
  const [responseMode, setResponseMode] = useState<'typing' | 'selection'>('typing');
  const [incorrectAttempts, setIncorrectAttempts] = useState(0);
  const [showBreakOffer, setShowBreakOffer] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakSecondsRemaining, setBreakSecondsRemaining] = useState(0);
  const scratchCanvasRef = useRef<ScratchCanvasHandle>(null);

  const currentQuestion: Question = questions[currentQuestionIndex];
  const support = <Key extends SupportPlanVersion['supports'][number]['supportKey']>(key: Key) =>
    supportPlan?.supports.find((candidate) => candidate.supportKey === key && candidate.enabled);
  const readAloud = support('readAloud');
  const readingChunks = support('readingChunks');
  const focusView = support('focusView');
  const calmPacing = support('calmPacing');
  const dyslexiaFont = support('dyslexiaFont');
  const flexibleResponse = support('flexibleResponse');
  const breakPrompt = support('breakPrompt');
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
      setIncorrectAttempts(0);
      setShowBreakOffer(false);
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

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    if (!isOnBreak || breakSecondsRemaining <= 0) return;
    const timer = window.setInterval(
      () => setBreakSecondsRemaining((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [breakSecondsRemaining, isOnBreak]);

  const handleAnswerChange = (answer: string) => {
    setUserAnswer(answer);
    setAnswerOutcome(null);
  };

  const handleAnswerSubmit = () => {
    const answerIsCorrect = isAnswerCorrect(currentQuestion, userAnswer);
    setAnswerOutcome(answerIsCorrect ? 'correct' : 'incorrect');
    if (!answerIsCorrect && breakPrompt?.supportKey === 'breakPrompt') {
      const nextAttempts = incorrectAttempts + 1;
      setIncorrectAttempts(nextAttempts);
      if (nextAttempts % breakPrompt.afterAttempts === 0) setShowBreakOffer(true);
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setUserAnswer('');
    setAnswerOutcome(null);
    setIsFinished(false);
    setShowChunkedDirections(true);
    setIncorrectAttempts(0);
    setShowBreakOffer(false);
    clearCanvas();
  };

  const handleSpeak = useCallback(async () => {
    if (isLoadingSpeech) return;
    setIsLoadingSpeech(true);
    setSpeechError(null);
    try {
      await (readAloud?.supportKey === 'readAloud'
        ? speak(currentQuestion.question, speechRate)
        : speak(currentQuestion.question));
    } catch (error) {
      console.error('Error with TTS:', error);
      setSpeechError("Sorry, I couldn't read that aloud.");
    } finally {
      setIsLoadingSpeech(false);
    }
  }, [currentQuestion.question, isLoadingSpeech, readAloud, speechRate]);

  const fontIsActive = dyslexiaFont?.supportKey === 'dyslexiaFont' && useOpenDyslexic;

  return (
    <section
      aria-labelledby="quiz-runner-title"
      className={`relative flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4 text-gray-800 dark:bg-gray-900 dark:text-gray-200 sm:p-6 md:p-8 ${
        fontIsActive ? 'font-dyslexia' : 'font-sans'
      }`}
      style={
        fontIsActive && dyslexiaFont.increasedSpacing
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
          !isFinished &&
          timerVisible && (
            <p className="absolute right-5 top-5 z-10 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              {calmPacing.timerMode === 'elapsed' ? 'Time' : 'Pace'} {Math.floor(timerSeconds / 60)}
              :{String(timerSeconds % 60).padStart(2, '0')}
            </p>
          )}
        {isOnBreak && breakPrompt?.supportKey === 'breakPrompt' ? (
          <div className="m-auto max-w-xl p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              Optional pause
            </p>
            <h2 className="mt-2 text-3xl font-bold">
              {breakSecondsRemaining === 0 ? 'Your break is complete' : 'Take a quiet break'}
            </h2>
            <p className="mt-4 text-2xl font-semibold tabular-nums">
              {Math.floor(breakSecondsRemaining / 60)}:
              {String(breakSecondsRemaining % 60).padStart(2, '0')}
            </p>
            <p className="mt-3">Return whenever you feel ready. Your answer is saved.</p>
            <button
              type="button"
              onClick={() => {
                setIsOnBreak(false);
                setShowBreakOffer(false);
              }}
              className="mt-6 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white"
            >
              Return to problem
            </button>
          </div>
        ) : isFinished ? (
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
            <div className="mx-6 mt-4 flex flex-wrap gap-2">
              {readingChunks?.supportKey === 'readingChunks' && (
                <button
                  type="button"
                  onClick={() => setShowChunkedDirections((current) => !current)}
                  className="rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-800 dark:text-blue-200"
                >
                  {showChunkedDirections
                    ? 'Show the rest of the question'
                    : 'Show one part at a time'}
                </button>
              )}
              {readAloud?.supportKey === 'readAloud' && (
                <>
                  {isLoadingSpeech && (
                    <button
                      type="button"
                      onClick={() => {
                        stopSpeaking();
                        setIsLoadingSpeech(false);
                      }}
                      className="rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-800"
                    >
                      Stop reading
                    </button>
                  )}
                  <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
                    Reading speed
                    <select
                      aria-label="Reading speed"
                      value={speechRate}
                      onChange={(event) => setSpeechRate(Number(event.target.value))}
                      className="bg-transparent font-normal"
                    >
                      <option value={0.75}>Slower</option>
                      <option value={0.9}>Calm</option>
                      <option value={1}>Normal</option>
                      <option value={1.15}>Faster</option>
                    </select>
                  </label>
                </>
              )}
              {calmPacing?.supportKey === 'calmPacing' && calmPacing.timerMode !== 'off' && (
                <button
                  type="button"
                  onClick={() => setTimerVisible((current) => !current)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
                >
                  {timerVisible ? 'Hide time' : 'Show time'}
                </button>
              )}
              {dyslexiaFont?.supportKey === 'dyslexiaFont' && (
                <button
                  type="button"
                  onClick={() => setUseOpenDyslexic((current) => !current)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
                >
                  {useOpenDyslexic ? 'Use standard font' : 'Use alternate reading font'}
                </button>
              )}
            </div>
            <ScratchCanvas ref={scratchCanvasRef} questionIndex={currentQuestionIndex}>
              <AnswerPanel
                answer={userAnswer}
                isRewardVisible={false}
                outcome={answerOutcome}
                onAnswerChange={handleAnswerChange}
                onNext={handleNextQuestion}
                onSubmit={handleAnswerSubmit}
                allowResponseChoice={
                  flexibleResponse?.supportKey === 'flexibleResponse' &&
                  flexibleResponse.allowStudentChoice
                }
                responseMode={responseMode}
                onResponseModeChange={setResponseMode}
              />
            </ScratchCanvas>
            {showBreakOffer && breakPrompt?.supportKey === 'breakPrompt' && (
              <aside className="mx-6 mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                <p className="font-semibold">Want a short break?</p>
                <p className="mt-1 text-sm">Your answer and place will stay right here.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBreakSecondsRemaining(breakPrompt.durationSeconds);
                      setIsOnBreak(true);
                    }}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Take a break
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBreakOffer(false)}
                    className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold"
                  >
                    Keep working
                  </button>
                </div>
              </aside>
            )}
            {answerOutcome === 'correct' && interestReward?.supportKey === 'interestReward' && (
              <InterestRewardContent settings={interestReward} className="mx-6 mb-6" />
            )}
          </>
        )}
      </div>
    </section>
  );
};
