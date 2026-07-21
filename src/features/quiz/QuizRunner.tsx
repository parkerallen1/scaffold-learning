import { useCallback, useRef, useState } from 'react';

import { QUESTIONS } from '../../constants';
import { speak } from '../../services/speech';
import type { Question } from '../../types';
import { isAnswerCorrect } from './answerChecking';
import { AnswerPanel } from './components/AnswerPanel';
import { CompletionScreen } from './components/CompletionScreen';
import { QuestionCard } from './components/QuestionCard';
import { ScratchCanvas } from './components/ScratchCanvas';
import type { ScratchCanvasHandle } from './components/ScratchCanvas';

export const QuizRunner = () => {
  const questions = QUESTIONS;
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [answerOutcome, setAnswerOutcome] = useState<'correct' | 'incorrect' | null>(null);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [isLoadingSpeech, setIsLoadingSpeech] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const scratchCanvasRef = useRef<ScratchCanvasHandle>(null);

  const currentQuestion: Question = questions[currentQuestionIndex];
  const clearCanvas = useCallback(() => {
    scratchCanvasRef.current?.clear();
  }, []);

  const handleNextQuestion = useCallback(() => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((previousIndex) => previousIndex + 1);
      setUserAnswer('');
      setAnswerOutcome(null);
      clearCanvas();
    } else {
      setIsFinished(true);
    }
  }, [clearCanvas, currentQuestionIndex, questions.length]);

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
    clearCanvas();
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

  return (
    <section
      aria-labelledby="quiz-runner-title"
      className="relative flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4 font-sans text-gray-800 dark:bg-gray-900 dark:text-gray-200 sm:p-6 md:p-8"
    >
      <h1 id="quiz-runner-title" className="sr-only">
        Synthetic quiz practice
      </h1>
      <div className="relative flex min-h-[85vh] w-full max-w-7xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
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
                isRewardVisible={false}
                outcome={answerOutcome}
                onAnswerChange={handleAnswerChange}
                onNext={handleNextQuestion}
                onSubmit={handleAnswerSubmit}
              />
            </ScratchCanvas>
          </>
        )}
      </div>
    </section>
  );
};
