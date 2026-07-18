import { SUPPORT_CATALOG, type AttemptEvent, type PublicQuestion } from '@/lib/domain';

import type { TeacherSessionEvidence } from './teacherEvidenceService';

const formatDateTime = (value: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);

const formatElapsed = (elapsedMs: number) => {
  const seconds = elapsedMs / 1000;
  return seconds < 60
    ? `${seconds.toFixed(seconds < 10 ? 1 : 0)} seconds`
    : `${(seconds / 60).toFixed(1)} minutes`;
};

const formatOutcome = (outcome: AttemptEvent['outcome']) => {
  switch (outcome) {
    case 'correct':
      return 'Correct';
    case 'incorrect':
      return 'Incorrect';
    case 'teacherReview':
      return 'Needs teacher review';
    case 'pending':
      return 'Pending';
  }
};

const formatAnswer = (attempt: AttemptEvent, question: PublicQuestion) => {
  const answer = attempt.submittedAnswer;
  if (answer.kind === 'numeric') return `${answer.value}${answer.unit ? ` ${answer.unit}` : ''}`;
  if (answer.kind === 'shortText') return answer.value || '(Blank response)';
  if (question.questionType !== 'multipleChoice') return 'Recorded selection';
  return question.choices.find(({ id }) => id === answer.choiceId)?.label ?? 'Unknown selection';
};

export const SessionEvidenceDetail = ({ evidence }: { evidence: TeacherSessionEvidence }) => {
  const { assignment, attempts, questions, session, supportEvents } = evidence;
  const sessionLevelSupports = supportEvents.filter(({ questionId }) => questionId === null);

  return (
    <section
      className="rounded-2xl bg-white p-6 shadow-md"
      aria-labelledby="session-detail-heading"
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
        Recorded session
      </p>
      <h2 id="session-detail-heading" className="mt-1 text-2xl font-bold">
        {assignment.title}
      </h2>
      <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-slate-600">Status</dt>
          <dd className="font-semibold capitalize">{session.status.replace(/([A-Z])/g, ' $1')}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">Started</dt>
          <dd className="font-semibold">{formatDateTime(session.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">Last activity</dt>
          <dd className="font-semibold">{formatDateTime(session.updatedAt)}</dd>
        </div>
      </dl>

      {evidence.eventsTruncated && (
        <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          This unusually long session has more than 200 events. The earliest 200 attempts and
          support events are shown.
        </p>
      )}

      {sessionLevelSupports.length > 0 && (
        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <h3 className="font-bold">Session-level support activity</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {sessionLevelSupports.map((event) => (
              <li key={event.id}>
                {SUPPORT_CATALOG[event.supportKey].label}: {event.action} at{' '}
                {formatDateTime(event.createdAt)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 space-y-5">
        {questions.map((question, questionIndex) => {
          const questionAttempts = attempts.filter(({ questionId }) => questionId === question.id);
          const questionSupports = supportEvents.filter(
            ({ questionId }) => questionId === question.id,
          );
          return (
            <article key={question.id} className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-indigo-700">Question {questionIndex + 1}</p>
              <h3 className="mt-1 font-bold text-slate-950">{question.prompt}</h3>

              <h4 className="mt-4 font-semibold">Submitted responses</h4>
              {questionAttempts.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No response was recorded.</p>
              ) : (
                <ol className="mt-2 space-y-3">
                  {questionAttempts.map((attempt) => (
                    <li key={attempt.id} className="rounded-lg bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">Attempt {attempt.attemptNumber}</span>
                        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold">
                          {formatOutcome(attempt.outcome)}
                        </span>
                      </div>
                      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-slate-600">Submitted response</dt>
                          <dd className="whitespace-pre-wrap break-words font-medium">
                            {formatAnswer(attempt, question)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-600">Time on this attempt</dt>
                          <dd className="font-medium">{formatElapsed(attempt.elapsedMs)}</dd>
                        </div>
                      </dl>
                      {attempt.activeSupports.length > 0 && (
                        <p className="mt-2 text-sm text-slate-700">
                          Active supports:{' '}
                          {attempt.activeSupports
                            .map((supportKey) => SUPPORT_CATALOG[supportKey].label)
                            .join(', ')}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              <h4 className="mt-4 font-semibold">Support-use events</h4>
              {questionSupports.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No support-use event was recorded.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {questionSupports.map((event) => (
                    <li key={event.id}>
                      {SUPPORT_CATALOG[event.supportKey].label}: {event.action} at{' '}
                      {formatDateTime(event.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
