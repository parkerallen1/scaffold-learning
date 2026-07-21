import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type {
  AttemptEvent,
  PublicQuestion,
  SessionState,
  SubmittedAnswer,
  SupportKey,
  SupportPlanVersion,
} from '@/lib/domain';
import { choiceIdSchema, idempotencyKeySchema } from '@/lib/domain';
import { speak, stopSpeaking } from '@/services/speech';
import { ScratchCanvas } from '@/features/quiz/components/ScratchCanvas';
import { InterestRewardContent } from '@/features/support-plans/InterestRewardContent';

import {
  clearStudentDraft,
  clearStudentDraftsForStudent,
  readStudentDraft,
  writeStudentDraft,
  type AnswerDraft,
} from './studentDraftStorage';
import {
  advanceStudentSession,
  createIdempotencyKey,
  listStudentAssignmentQuestions,
  listStudentAssignments,
  listStudentAttempts,
  recordStudentSupportEvent,
  startOrResumeStudentSession,
  submitStudentAttempt,
  transitionStudentSession,
  type StudentAssignment,
  type StudentSessionBundle,
} from './studentWorkService';

type StudentWorkspaceProps = Readonly<{
  classroomId: string;
  isSigningOut: boolean;
  onSignOut: () => void;
  studentId: string;
}>;

const ErrorNotice = ({ message }: { message: string }) => (
  <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
    {message}
  </p>
);

const emptyDraftFor = (question: PublicQuestion): AnswerDraft => {
  if (question.questionType === 'numeric') return { kind: 'numeric', unit: '', value: '' };
  if (question.questionType === 'multipleChoice') return { kind: 'choice', choiceId: '' };
  return { kind: 'shortText', value: '' };
};

const draftMatchesQuestion = (draft: AnswerDraft, question: PublicQuestion): boolean =>
  (question.questionType === 'numeric' && draft.kind === 'numeric') ||
  (question.questionType === 'multipleChoice' && draft.kind === 'choice') ||
  (question.questionType === 'shortText' && draft.kind === 'shortText');

const submittedAnswerFor = (draft: AnswerDraft): SubmittedAnswer | null => {
  if (draft.kind === 'numeric') {
    if (draft.value.trim() === '') return null;
    const value = Number(draft.value);
    if (!Number.isFinite(value)) return null;
    const unit = draft.unit.trim();
    return { kind: 'numeric', value, ...(unit === '' ? {} : { unit }) };
  }
  if (draft.kind === 'choice') {
    return draft.choiceId === ''
      ? null
      : { kind: 'choice', choiceId: choiceIdSchema.parse(draft.choiceId) };
  }
  return draft.value.trim() === '' ? null : { kind: 'shortText', value: draft.value };
};

const splitPrompt = (prompt: string, mode: 'sentence' | 'step'): readonly string[] => {
  const lineParts =
    mode === 'step'
      ? prompt
          .split(/\n+/)
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
  if (lineParts.length > 1) return lineParts;
  const sentences = prompt
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return sentences.length > 0 ? sentences : [prompt];
};

const feedbackFor = (
  outcome: AttemptEvent['outcome'] | null,
  hintAvailable: boolean,
): string | null => {
  if (outcome === 'correct') return 'Your answer was recorded as a match.';
  if (outcome === 'incorrect') {
    return hintAvailable
      ? 'Incorrect. Check one step, try a hint, or save this question for review.'
      : 'Incorrect. Check one step, try again, or save this question for review.';
  }
  if (outcome === 'teacherReview') return 'Your answer was saved for your teacher to review.';
  return null;
};

type QuestionWorkProps = Readonly<{
  attempts: readonly AttemptEvent[];
  onAdvance: () => Promise<void>;
  onSessionChange: (session: SessionState) => void;
  question: PublicQuestion;
  session: SessionState;
  studentId: string;
  supportPlan: SupportPlanVersion;
}>;

const QuestionWork = ({
  attempts,
  onAdvance,
  onSessionChange,
  question,
  session,
  studentId,
  supportPlan,
}: QuestionWorkProps) => {
  const recovered = useMemo(
    () => readStudentDraft(studentId, session.id, question.id),
    [question.id, session.id, studentId],
  );
  const [draft, setDraft] = useState<AnswerDraft>(() =>
    recovered && draftMatchesQuestion(recovered.answer, question)
      ? recovered.answer
      : emptyDraftFor(question),
  );
  const [pendingSubmissionKey, setPendingSubmissionKey] = useState<string | null>(
    recovered?.pendingSubmissionKey ?? null,
  );
  const questionAttempts = attempts.filter((attempt) => attempt.questionId === question.id);
  const [hasAttempt, setHasAttempt] = useState(questionAttempts.length > 0);
  const [outcome, setOutcome] = useState<AttemptEvent['outcome'] | null>(
    questionAttempts.at(-1)?.outcome ?? null,
  );
  const [isBusy, setIsBusy] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [supportNotice, setSupportNotice] = useState<string | null>(null);
  const [activeSupports, setActiveSupports] = useState<ReadonlySet<SupportKey>>(
    () =>
      new Set(
        supportPlan.supports
          .filter(
            (support) =>
              support.enabled &&
              ['calmPacing', 'dyslexiaFont', 'flexibleResponse', 'readingChunks'].includes(
                support.supportKey,
              ),
          )
          .map(({ supportKey }) => supportKey),
      ),
  );
  const [chunkCount, setChunkCount] = useState<number | null>(null);
  const [focusView, setFocusView] = useState(false);
  const [shownHints, setShownHints] = useState(0);
  const [attemptCount, setAttemptCount] = useState(questionAttempts.length);
  const [timerVisible, setTimerVisible] = useState(true);
  const [useOpenDyslexic, setUseOpenDyslexic] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showBreakOffer, setShowBreakOffer] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  const readAloud = supportPlan.supports.find(
    (support) => support.supportKey === 'readAloud' && support.enabled,
  );
  const chunking = supportPlan.supports.find(
    (support) => support.supportKey === 'readingChunks' && support.enabled,
  );
  const focus = supportPlan.supports.find(
    (support) => support.supportKey === 'focusView' && support.enabled,
  );
  const hints = supportPlan.supports.find(
    (support) => support.supportKey === 'hintLadder' && support.enabled,
  );
  const dyslexiaFont = supportPlan.supports.find(
    (support) => support.supportKey === 'dyslexiaFont' && support.enabled,
  );
  const calmPacing = supportPlan.supports.find(
    (support) => support.supportKey === 'calmPacing' && support.enabled,
  );
  const flexibleResponse = supportPlan.supports.find(
    (support) => support.supportKey === 'flexibleResponse' && support.enabled,
  );
  const breakPrompt = supportPlan.supports.find(
    (support) => support.supportKey === 'breakPrompt' && support.enabled,
  );
  const interestReward = supportPlan.supports.find(
    (support) => support.supportKey === 'interestReward' && support.enabled,
  );
  const configuredTimerSeconds =
    calmPacing?.supportKey === 'calmPacing' && calmPacing.timerMode === 'nonExpiringCountdown'
      ? calmPacing.durationSeconds
      : null;
  const [timerSeconds, setTimerSeconds] = useState(configuredTimerSeconds ?? 0);
  const [speechRate, setSpeechRate] = useState(
    readAloud?.supportKey === 'readAloud' ? readAloud.speed : 1,
  );
  const [responseMode, setResponseMode] = useState<'typing' | 'selection'>(
    flexibleResponse?.supportKey === 'flexibleResponse' ? flexibleResponse.preferredMode : 'typing',
  );
  const [breakSecondsRemaining, setBreakSecondsRemaining] = useState(
    breakPrompt?.supportKey === 'breakPrompt' ? breakPrompt.durationSeconds : 0,
  );
  const chunks = splitPrompt(
    question.prompt,
    chunking?.supportKey === 'readingChunks' ? chunking.chunkMode : 'sentence',
  );
  const hintLimit =
    hints?.supportKey === 'hintLadder' ? Math.min(hints.maxTier, question.approvedHints.length) : 0;

  useEffect(() => {
    startedAtRef.current = Date.now();
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    if (calmPacing?.supportKey !== 'calmPacing' || calmPacing.timerMode === 'off') return;
    const timer = window.setInterval(() => {
      setTimerSeconds((current) =>
        calmPacing.timerMode === 'elapsed' ? current + 1 : Math.max(0, current - 1),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [calmPacing]);

  useEffect(() => {
    if (!isOnBreak || breakSecondsRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setBreakSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [breakSecondsRemaining, isOnBreak]);

  useEffect(() => {
    writeStudentDraft(studentId, session.id, question.id, {
      answer: draft,
      pendingSubmissionKey:
        pendingSubmissionKey === null ? null : idempotencyKeySchema.parse(pendingSubmissionKey),
      updatedAt: Date.now(),
      version: 1,
    });
  }, [draft, pendingSubmissionKey, question.id, session.id, studentId]);

  const logSupport = useCallback(
    async (supportKey: SupportKey, action: 'activated' | 'completed' | 'dismissed' | 'shown') => {
      setActiveSupports((current) => new Set([...current, supportKey]));
      try {
        await recordStudentSupportEvent({
          action,
          clientOccurredAt: Date.now(),
          idempotencyKey: createIdempotencyKey('support'),
          questionId: question.id,
          sessionId: session.id,
          supportKey,
        });
        setSupportNotice(null);
      } catch {
        setSupportNotice(
          'The support is available, but its activity log is waiting for a connection.',
        );
      }
    },
    [question.id, session.id],
  );

  const updateDraft = (next: AnswerDraft) => {
    setDraft(next);
    setPendingSubmissionKey(null);
    setOutcome(null);
    setAnswerError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submittedAnswer = submittedAnswerFor(draft);
    if (submittedAnswer === null) {
      setAnswerError('Enter an answer before submitting.');
      return;
    }
    const idempotencyKey = pendingSubmissionKey ?? createIdempotencyKey('attempt');
    setPendingSubmissionKey(idempotencyKey);
    setIsBusy(true);
    setAnswerError(null);
    try {
      const response = await submitStudentAttempt({
        activeSupports: [...activeSupports],
        clientOccurredAt: Date.now(),
        elapsedMs: Math.min(
          86_400_000,
          Math.max(0, Date.now() - (startedAtRef.current ?? Date.now())),
        ),
        idempotencyKey,
        questionId: question.id,
        sessionId: session.id,
        submittedAnswer,
      });
      setHasAttempt(true);
      setOutcome(response.event.outcome);
      const nextAttemptCount = attemptCount + 1;
      setAttemptCount(nextAttemptCount);
      setPendingSubmissionKey(null);
      onSessionChange(response.session);
      if (
        response.event.outcome === 'incorrect' &&
        breakPrompt?.supportKey === 'breakPrompt' &&
        nextAttemptCount % breakPrompt.afterAttempts === 0
      ) {
        setShowBreakOffer(true);
        void logSupport('breakPrompt', 'shown');
      }
      if (response.event.outcome === 'correct' && interestReward?.supportKey === 'interestReward') {
        void logSupport('interestReward', 'shown');
      }
    } catch {
      setAnswerError('Your answer is still on this device. Reconnect and submit again.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdvance = async () => {
    setIsBusy(true);
    setAnswerError(null);
    try {
      await onAdvance();
      clearStudentDraft(studentId, session.id, question.id);
    } catch {
      setAnswerError('Unable to continue right now. Your answer is still saved on this device.');
    } finally {
      setIsBusy(false);
    }
  };

  const visibleChunkCount =
    chunking?.supportKey === 'readingChunks' ? (chunkCount ?? 1) : chunks.length;
  const isPromptChunked = visibleChunkCount < chunks.length;
  const visiblePrompt = isPromptChunked
    ? `${chunks.slice(0, visibleChunkCount).join(' ')} …`
    : question.prompt;

  const enterKeypadValue = (key: string) => {
    if (draft.kind !== 'numeric') return;
    let value = draft.value;
    if (key === 'clear') value = '';
    else if (key === 'backspace') value = value.slice(0, -1);
    else if (key === '-') value = value.startsWith('-') ? value.slice(1) : `-${value}`;
    else if (key === '.' && !value.includes('.')) value = `${value || '0'}.`;
    else if (/^\d$/.test(key)) value += key;
    updateDraft({ ...draft, value });
  };

  const handleReadAloud = async () => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    setSupportNotice(null);
    void logSupport('readAloud', 'activated');
    try {
      await speak(question.prompt, speechRate);
    } catch {
      setSupportNotice('Read aloud is unavailable right now.');
    } finally {
      setIsSpeaking(false);
    }
  };

  if (isOnBreak && breakPrompt?.supportKey === 'breakPrompt') {
    const breakComplete = breakSecondsRemaining === 0;
    return (
      <section
        aria-labelledby="break-heading"
        className="mx-auto max-w-2xl rounded-2xl bg-emerald-50 p-8 text-center shadow-md"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Optional pause
        </p>
        <h2 id="break-heading" className="mt-2 text-3xl font-bold text-slate-900">
          {breakComplete ? 'Your break is complete' : 'Take a quiet break'}
        </h2>
        <p className="mt-4 text-2xl font-semibold tabular-nums text-emerald-900">
          {Math.floor(breakSecondsRemaining / 60)}:
          {String(breakSecondsRemaining % 60).padStart(2, '0')}
        </p>
        <p className="mt-3 text-slate-700">
          Return whenever you feel ready. Your answer and place are saved.
        </p>
        <button
          type="button"
          onClick={() => {
            setIsOnBreak(false);
            setShowBreakOffer(false);
            void logSupport('breakPrompt', breakComplete ? 'completed' : 'dismissed');
          }}
          className="mt-6 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
        >
          Return to problem
        </button>
      </section>
    );
  }

  return (
    <section
      className={`${focusView ? 'mx-auto max-w-2xl' : ''} ${
        dyslexiaFont?.supportKey === 'dyslexiaFont' && useOpenDyslexic ? 'font-dyslexia' : ''
      }`}
      style={
        dyslexiaFont?.supportKey === 'dyslexiaFont' &&
        useOpenDyslexic &&
        dyslexiaFont.increasedSpacing
          ? { letterSpacing: '0.035em', wordSpacing: '0.12em' }
          : undefined
      }
      aria-labelledby="current-question"
    >
      <div className="rounded-2xl bg-white p-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-emerald-700">Problem {question.order + 1}</p>
          {calmPacing?.supportKey === 'calmPacing' &&
            calmPacing.timerMode !== 'off' &&
            timerVisible && (
              <p className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                {calmPacing.timerMode === 'elapsed' ? 'Time' : 'Pace'}{' '}
                {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
              </p>
            )}
        </div>
        <h2 id="current-question" className="mt-2 text-2xl font-bold leading-relaxed">
          {visiblePrompt}
        </h2>

        <div aria-label="Question tools" className="mt-5 flex flex-wrap gap-2">
          {readAloud?.supportKey === 'readAloud' && (
            <>
              <button
                type="button"
                aria-label="Read aloud"
                disabled={isSpeaking}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                onClick={() => void handleReadAloud()}
              >
                {isSpeaking ? 'Reading…' : 'Read aloud'}
              </button>
              {isSpeaking && (
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  onClick={() => {
                    stopSpeaking();
                    setIsSpeaking(false);
                    void logSupport('readAloud', 'dismissed');
                  }}
                >
                  Stop reading
                </button>
              )}
              <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
                Reading speed
                <select
                  aria-label="Reading speed"
                  value={speechRate}
                  onChange={(event) => {
                    stopSpeaking();
                    setIsSpeaking(false);
                    setSpeechRate(Number(event.target.value));
                    void logSupport('readAloud', 'shown');
                  }}
                  className="bg-transparent font-normal"
                >
                  <option value={0.75}>Slower</option>
                  <option value={0.9}>Calm</option>
                  <option value={1}>Normal</option>
                  <option value={1.15}>Faster</option>
                  <option value={1.25}>Fast</option>
                </select>
              </label>
            </>
          )}
          {chunking?.supportKey === 'readingChunks' && (
            <>
              <p
                className="flex items-center px-1 text-sm font-medium text-slate-600"
                role="status"
              >
                Part {visibleChunkCount} of {chunks.length}
              </p>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                onClick={() => {
                  setChunkCount((current) =>
                    (current ?? 1) >= chunks.length
                      ? 1
                      : Math.min(chunks.length, (current ?? 1) + 1),
                  );
                  void logSupport('readingChunks', 'shown');
                }}
              >
                {visibleChunkCount < chunks.length ? 'Show next part' : 'Start with one part'}
              </button>
              {visibleChunkCount < chunks.length && chunking.revealAllAllowed && (
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  onClick={() => {
                    setChunkCount(chunks.length);
                    void logSupport('readingChunks', 'completed');
                  }}
                >
                  Reveal all directions
                </button>
              )}
            </>
          )}
          {focus?.supportKey === 'focusView' && (
            <button
              type="button"
              aria-pressed={focusView}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              onClick={() => {
                setFocusView((current) => !current);
                void logSupport('focusView', focusView ? 'dismissed' : 'activated');
              }}
            >
              {focusView ? 'Exit focus view' : 'Use focus view'}
            </button>
          )}
          {calmPacing?.supportKey === 'calmPacing' && calmPacing.timerMode !== 'off' && (
            <button
              type="button"
              aria-pressed={!timerVisible}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              onClick={() => {
                setTimerVisible((current) => !current);
                void logSupport('calmPacing', timerVisible ? 'dismissed' : 'shown');
              }}
            >
              {timerVisible ? 'Hide time' : 'Show time'}
            </button>
          )}
          {dyslexiaFont?.supportKey === 'dyslexiaFont' && (
            <button
              type="button"
              aria-pressed={!useOpenDyslexic}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              onClick={() => {
                setUseOpenDyslexic((current) => !current);
                void logSupport('dyslexiaFont', 'shown');
              }}
            >
              {useOpenDyslexic ? 'Use standard font' : 'Use alternate reading font'}
            </button>
          )}
          {hints?.supportKey === 'hintLadder' && shownHints < hintLimit && (
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              onClick={() => {
                setShownHints((current) => Math.min(hintLimit, current + 1));
                void logSupport('hintLadder', 'shown');
              }}
            >
              Show hint {shownHints + 1}
            </button>
          )}
        </div>

        {focusView && (
          <p role="status" className="mt-3 text-sm font-medium text-emerald-800">
            Focus view is on. Progress, help, and exit controls remain available.
          </p>
        )}

        {shownHints > 0 && (
          <ol
            aria-label="Teacher-approved hints"
            className="mt-4 space-y-2 rounded-xl bg-amber-50 p-4"
          >
            {question.approvedHints.slice(0, shownHints).map((hint, index) => (
              <li key={`${index}-${hint}`}>
                Hint {index + 1}: {hint}
              </li>
            ))}
          </ol>
        )}
        {supportNotice && (
          <p role="status" className="mt-3 text-sm text-amber-800">
            {supportNotice}
          </p>
        )}

        {!focusView && (
          <div className="mt-6">
            <p className="mb-2 text-sm text-slate-600">
              Scratch work stays on this screen and is not uploaded.
            </p>
            <div className="flex min-h-[32rem] flex-col rounded-xl border border-slate-200">
              <ScratchCanvas questionIndex={question.order}>{null}</ScratchCanvas>
            </div>
          </div>
        )}

        <form className="mt-6" onSubmit={(event) => void handleSubmit(event)}>
          {question.questionType === 'numeric' && draft.kind === 'numeric' && (
            <>
              {flexibleResponse?.supportKey === 'flexibleResponse' &&
                flexibleResponse.allowStudentChoice && (
                  <fieldset className="mb-4">
                    <legend className="text-sm font-semibold text-slate-700">How to answer</legend>
                    <div className="mt-2 flex gap-2">
                      {(['typing', 'selection'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={responseMode === mode}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                            responseMode === mode
                              ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                              : 'border-slate-300 hover:bg-slate-50'
                          }`}
                          onClick={() => {
                            setResponseMode(mode);
                            void logSupport('flexibleResponse', 'activated');
                          }}
                        >
                          {mode === 'typing' ? 'Keyboard' : 'Number pad'}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
              <div
                className="grid gap-3 sm:grid-cols-2"
                aria-describedby={answerError ? 'student-answer-error' : undefined}
              >
                <label className="font-semibold">
                  Your answer
                  <input
                    autoComplete="off"
                    inputMode={responseMode === 'selection' ? 'none' : 'decimal'}
                    readOnly={responseMode === 'selection'}
                    value={draft.value}
                    aria-invalid={answerError ? true : undefined}
                    aria-describedby={answerError ? 'student-answer-error' : undefined}
                    onChange={(event) => updateDraft({ ...draft, value: event.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-3"
                  />
                </label>
                {question.unitLabel !== undefined && (
                  <label className="font-semibold">
                    Unit ({question.unitLabel})
                    <input
                      autoComplete="off"
                      value={draft.unit}
                      onChange={(event) => updateDraft({ ...draft, unit: event.target.value })}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-3"
                    />
                  </label>
                )}
              </div>
              {flexibleResponse?.supportKey === 'flexibleResponse' &&
                responseMode === 'selection' && (
                  <div
                    aria-label="On-screen number pad"
                    className="mt-3 grid max-w-sm grid-cols-3 gap-2"
                  >
                    {['7', '8', '9', '4', '5', '6', '1', '2', '3', '-', '0', '.'].map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => enterKeypadValue(key)}
                        className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 font-semibold hover:bg-slate-100"
                      >
                        {key}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => enterKeypadValue('backspace')}
                      className="col-span-2 rounded-lg border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50"
                    >
                      Delete last
                    </button>
                    <button
                      type="button"
                      onClick={() => enterKeypadValue('clear')}
                      className="rounded-lg border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  </div>
                )}
            </>
          )}
          {question.questionType === 'multipleChoice' && draft.kind === 'choice' && (
            <fieldset aria-describedby={answerError ? 'student-answer-error' : undefined}>
              <legend className="font-semibold">Choose one answer</legend>
              <div className="mt-2 space-y-2">
                {question.choices.map((choice) => (
                  <label
                    key={choice.id}
                    className="flex cursor-pointer gap-3 rounded-lg border border-slate-300 p-3"
                  >
                    <input
                      type="radio"
                      name={`answer-${question.id}`}
                      checked={draft.choiceId === choice.id}
                      onChange={() => updateDraft({ kind: 'choice', choiceId: choice.id })}
                    />
                    <span>{choice.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {question.questionType === 'shortText' && draft.kind === 'shortText' && (
            <label className="font-semibold">
              Your answer
              <textarea
                value={draft.value}
                aria-invalid={answerError ? true : undefined}
                aria-describedby={answerError ? 'student-answer-error' : undefined}
                maxLength={question.maxLength}
                rows={5}
                onChange={(event) => updateDraft({ kind: 'shortText', value: event.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-3"
              />
            </label>
          )}

          {answerError && (
            <div id="student-answer-error" className="mt-4">
              <ErrorNotice message={answerError} />
            </div>
          )}
          {feedbackFor(outcome, shownHints < hintLimit) && (
            <p role="status" className="mt-4 rounded-xl bg-blue-50 p-4 text-blue-900">
              {feedbackFor(outcome, shownHints < hintLimit)}
            </p>
          )}
          {showBreakOffer && breakPrompt?.supportKey === 'breakPrompt' && (
            <aside className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-950">Want a short break?</p>
              <p className="mt-1 text-sm text-emerald-900">
                Your answer and place will stay right here.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBreakSecondsRemaining(breakPrompt.durationSeconds);
                    setIsOnBreak(true);
                    void logSupport('breakPrompt', 'activated');
                  }}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                >
                  Take a break
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowBreakOffer(false);
                    void logSupport('breakPrompt', 'dismissed');
                  }}
                  className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-900"
                >
                  Keep working
                </button>
              </div>
            </aside>
          )}
          {outcome === 'correct' && interestReward?.supportKey === 'interestReward' && (
            <InterestRewardContent settings={interestReward} className="mt-4" />
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isBusy || session.status !== 'inProgress'}
              className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {isBusy ? 'Saving…' : hasAttempt ? 'Submit another try' : 'Submit answer'}
            </button>
            {hasAttempt && (
              <button
                type="button"
                disabled={isBusy || session.status !== 'inProgress'}
                onClick={() => void handleAdvance()}
                className="rounded-lg border border-emerald-700 px-5 py-3 font-semibold text-emerald-800 disabled:opacity-60"
              >
                {outcome === 'incorrect' || outcome === null ? 'Show and review later' : 'Continue'}
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
};

type SessionRunnerProps = Readonly<{
  onBack: () => void;
  studentAssignment: StudentAssignment;
  studentId: string;
}>;

const SessionRunner = ({ onBack, studentAssignment, studentId }: SessionRunnerProps) => {
  const [bundle, setBundle] = useState<StudentSessionBundle | null>(null);
  const [questions, setQuestions] = useState<readonly PublicQuestion[]>([]);
  const [attempts, setAttempts] = useState<readonly AttemptEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      startOrResumeStudentSession(studentAssignment.target),
      listStudentAssignmentQuestions(studentAssignment),
    ])
      .then(async ([nextBundle, nextQuestions]) => {
        const nextAttempts = await listStudentAttempts(
          studentAssignment.target.classroomId,
          nextBundle.session.id,
        );
        if (active) {
          setBundle(nextBundle);
          setQuestions(nextQuestions);
          setAttempts(nextAttempts);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to open this assignment. Check your connection and try again.');
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [studentAssignment]);

  if (isLoading) return <p role="status">Opening your assignment…</p>;
  if (error || bundle === null)
    return <ErrorNotice message={error ?? 'Unable to open this assignment.'} />;

  const session = bundle.session;
  if (session.status === 'completed') {
    return (
      <section className="rounded-2xl bg-white p-8 text-center shadow-md">
        <h2 className="text-3xl font-bold">Assignment complete</h2>
        <p className="mt-3 text-slate-600">Your work has been saved for your teacher.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white"
        >
          Back to assignments
        </button>
      </section>
    );
  }

  const question = questions.find((candidate) => candidate.id === session.currentQuestionId);
  if (!question) return <ErrorNotice message="This assignment question is unavailable." />;

  const updateSession = (nextSession: SessionState) => {
    setBundle((current) => current && { ...current, session: nextSession });
  };
  const runTransition = async (action: 'complete' | 'pause' | 'resume') => {
    if (
      action === 'complete' &&
      !window.confirm(
        'Finish and turn in this assignment now? Your saved attempts will be available to your teacher.',
      )
    ) {
      return;
    }
    setIsTransitioning(true);
    setError(null);
    try {
      const nextSession = await transitionStudentSession(session.id, action);
      if (action === 'complete') {
        clearStudentDraft(studentId, session.id, question.id);
      }
      updateSession(nextSession);
    } catch {
      setError('Unable to change the session right now. Your answer remains on this device.');
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-semibold text-emerald-800 underline"
          >
            Assignments
          </button>
          <h1 className="mt-1 text-xl font-bold">{studentAssignment.assignment.title}</h1>
          <p className="text-sm text-slate-600">
            Problem {question.order + 1} of {questions.length}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isTransitioning}
            onClick={() => void runTransition(session.status === 'paused' ? 'resume' : 'pause')}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-60"
          >
            {session.status === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            disabled={isTransitioning}
            onClick={() => void runTransition('complete')}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-60"
          >
            Finish assignment
          </button>
        </div>
      </header>
      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} />
        </div>
      )}
      {session.status === 'paused' ? (
        <section className="rounded-2xl bg-white p-8 text-center shadow-md">
          <h2 className="text-2xl font-bold">Session paused</h2>
          <p className="mt-2 text-slate-600">Your typed answer is saved on this device.</p>
          <button
            type="button"
            onClick={() => void runTransition('resume')}
            className="mt-5 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white"
          >
            Resume work
          </button>
        </section>
      ) : (
        <QuestionWork
          key={`${session.id}:${question.id}`}
          attempts={attempts}
          onAdvance={async () =>
            updateSession(await advanceStudentSession(session.id, question.id))
          }
          onSessionChange={updateSession}
          question={question}
          session={session}
          studentId={studentId}
          supportPlan={bundle.supportPlan}
        />
      )}
    </div>
  );
};

export const StudentWorkspace = ({
  classroomId,
  isSigningOut,
  onSignOut,
  studentId,
}: StudentWorkspaceProps) => {
  const [assignments, setAssignments] = useState<readonly StudentAssignment[]>([]);
  const [selected, setSelected] = useState<StudentAssignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listStudentAssignments(classroomId, studentId)
      .then((nextAssignments) => {
        if (active) {
          setAssignments(nextAssignments);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load assigned work. Check your connection and try again.');
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [classroomId, studentId]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6">
      <div className="mx-auto max-w-4xl">
        {selected ? (
          <SessionRunner
            onBack={() => setSelected(null)}
            studentAssignment={selected}
            studentId={studentId}
          />
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 shadow-md">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                  Student session
                </p>
                <h1 className="mt-1 text-3xl font-bold">You are signed in</h1>
                <p className="mt-2 text-slate-600">Choose an assignment when you are ready.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearStudentDraftsForStudent(studentId);
                  onSignOut();
                }}
                disabled={isSigningOut}
                className="rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-60"
              >
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </button>
            </header>
            <section className="mt-6" aria-labelledby="assigned-work-title">
              <h2 id="assigned-work-title" className="text-2xl font-bold">
                Assigned work
              </h2>
              {isLoading && (
                <p role="status" className="mt-4">
                  Loading assigned work…
                </p>
              )}
              {error && (
                <div className="mt-4">
                  <ErrorNotice message={error} />
                </div>
              )}
              {!isLoading && !error && assignments.length === 0 && (
                <p className="mt-4 rounded-2xl bg-white p-6 text-slate-600 shadow-sm">
                  There is no assigned work yet. Ask your teacher when to check again.
                </p>
              )}
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {assignments.map((studentAssignment) => (
                  <li
                    key={studentAssignment.target.id}
                    className="rounded-2xl bg-white p-5 shadow-sm"
                  >
                    <h3 className="text-xl font-bold">{studentAssignment.assignment.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      {studentAssignment.assignment.questionCount}{' '}
                      {studentAssignment.assignment.questionCount === 1 ? 'problem' : 'problems'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelected(studentAssignment)}
                      className="mt-5 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white"
                    >
                      Open assignment
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
};
