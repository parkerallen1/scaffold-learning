import { useState } from 'react';

import {
  auditStudentEvidence,
  parseEditedAuditSettings,
  reviewStudentAudit,
  type AuditDecisionInput,
  type AuditReviewOutcome,
  type StudentAudit,
} from '@/features/audits/auditService';
import { SettingsEditor } from '@/features/support-plans/SupportPlanReview';
import { SUPPORT_CATALOG, supportSettingsSchema, type SupportSettings } from '@/lib/domain';

type DecisionChoice = AuditDecisionInput['decision'];

interface AuditReviewPanelProps {
  classroomId: string;
  studentId: string;
  studentName: string;
  disabled: boolean;
  unavailableReason?: string;
  onReviewed: (outcome: AuditReviewOutcome) => Promise<void> | void;
}

const RUN_ERROR = 'Unable to run the evidence audit. Please try again.';
const REVIEW_ERROR = 'Unable to save this evidence review. Please try again.';

const actionLabel = (action: StudentAudit['result']['recommendations'][number]['action']) => {
  switch (action) {
    case 'keep':
      return 'Keep';
    case 'add':
      return 'Add';
    case 'adjust':
      return 'Adjust';
    case 'remove':
      return 'Remove';
    case 'observe':
      return 'Observe';
  }
};

const resultMessage = (audit: StudentAudit) => {
  if (audit.status === 'insufficientEvidence') {
    return 'The minimum evidence threshold has not been met. No support change is available.';
  }
  if (audit.status === 'failed') {
    return 'The evidence was counted, but automated suggestions were unavailable. Review the counts manually; no support change was made.';
  }
  if (audit.result.recommendations.length === 0) {
    return 'The evidence threshold was met, but no support change is suggested. Continue observing.';
  }
  return audit.result.summary;
};

export function AuditReviewPanel({
  classroomId,
  studentId,
  studentName,
  disabled,
  unavailableReason,
  onReviewed,
}: AuditReviewPanelProps) {
  const [audit, setAudit] = useState<StudentAudit | null>(null);
  const [decisions, setDecisions] = useState<Record<number, DecisionChoice>>({});
  const [editedSettings, setEditedSettings] = useState<Record<number, SupportSettings>>({});
  const [teacherNote, setTeacherNote] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [isReviewed, setIsReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runAudit = async () => {
    if (disabled || isWorking) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const nextAudit = await auditStudentEvidence({ classroomId, studentId });
      setAudit(nextAudit);
      setIsReviewed(false);
      setDecisions({});
      setEditedSettings(
        Object.fromEntries(
          nextAudit.result.recommendations.flatMap((recommendation, index) => {
            if (recommendation.action !== 'add' && recommendation.action !== 'adjust') return [];
            const settings = supportSettingsSchema.safeParse(recommendation.proposedSettings);
            return settings.success ? [[index, settings.data] as const] : [];
          }),
        ),
      );
      setTeacherNote('');
    } catch {
      setAudit(null);
      setError(RUN_ERROR);
    } finally {
      setIsWorking(false);
    }
  };

  const setDecision = (index: number, decision: DecisionChoice) => {
    setDecisions((current) => ({ ...current, [index]: decision }));
  };

  const recommendations = audit?.result.recommendations ?? [];
  const decisionsComplete = recommendations.every((_, index) => decisions[index] !== undefined);
  const approvedSettingsValid = recommendations.every((recommendation, index) => {
    if (decisions[index] !== 'approve') return true;
    if (recommendation.action !== 'add' && recommendation.action !== 'adjust') return true;
    const settings = supportSettingsSchema.safeParse(editedSettings[index]);
    return settings.success && settings.data.supportKey === recommendation.supportKey;
  });
  const canSubmit =
    audit !== null &&
    decisionsComplete &&
    approvedSettingsValid &&
    teacherNote.trim().length <= 1000 &&
    !isReviewed &&
    !isWorking;

  const submitReview = async () => {
    if (!canSubmit || audit === null) return;
    const approvedCount = recommendations.filter(
      (_, index) => decisions[index] === 'approve',
    ).length;
    const confirmation =
      approvedCount === 0
        ? 'Record this evidence review with no support-plan change?'
        : `Submit this review with ${approvedCount} approved ${approvedCount === 1 ? 'suggestion' : 'suggestions'}? A new plan version is created only if approved settings change.`;
    if (!window.confirm(confirmation)) return;

    const payloadDecisions = recommendations.map((recommendation, recommendationIndex) => {
      const decision = decisions[recommendationIndex]!;
      if (
        decision === 'approve' &&
        (recommendation.action === 'add' || recommendation.action === 'adjust')
      ) {
        return {
          recommendationIndex,
          decision,
          editedSettings: parseEditedAuditSettings(editedSettings[recommendationIndex]),
        } satisfies AuditDecisionInput;
      }
      return { recommendationIndex, decision } satisfies AuditDecisionInput;
    });

    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const outcome = await reviewStudentAudit({
        classroomId,
        studentId,
        auditId: audit.auditId,
        decisions: payloadDecisions,
        ...(teacherNote.trim() ? { teacherNote: teacherNote.trim() } : {}),
      });
      await onReviewed(outcome);
      setIsReviewed(true);
      setSuccess(
        outcome.supportPlan === null
          ? 'Evidence review saved. The active support plan did not change.'
          : `Evidence review saved. Support plan version ${outcome.supportPlan.version} is now active.`,
      );
    } catch {
      setError(REVIEW_ERROR);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-6 shadow-md" aria-labelledby="audit-heading">
      <h2 id="audit-heading" className="text-xl font-bold">
        Evidence &amp; audit
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Review this student’s own recent work patterns. Counts are calculated by the server, and
        suggestions never change a plan until you explicitly approve them.
      </p>
      {unavailableReason && <p className="mt-3 text-sm text-amber-900">{unavailableReason}</p>}
      <button
        type="button"
        disabled={disabled || isWorking}
        onClick={() => void runAudit()}
        className="mt-4 rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
      >
        {isWorking && audit === null ? 'Reviewing evidence…' : `Review ${studentName}’s evidence`}
      </button>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-emerald-800">
          {success}
        </p>
      )}

      {audit && (
        <div className="mt-6 space-y-5">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-bold text-slate-900">Deterministic evidence counts</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-slate-600">Sessions</dt>
                <dd className="text-lg font-bold">
                  {audit.evidenceSummary.sessionCount} /{' '}
                  {audit.evidenceSummary.threshold.minimumSessions}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-600">Scorable responses</dt>
                <dd className="text-lg font-bold">
                  {audit.evidenceSummary.scorableResponseCount} /{' '}
                  {audit.evidenceSummary.threshold.minimumScorableResponses}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-600">First-attempt correct</dt>
                <dd className="text-lg font-bold">
                  {audit.evidenceSummary.firstAttemptCorrectCount}
                </dd>
              </div>
            </dl>
            <p
              className={`mt-4 rounded-lg p-3 text-sm ${
                audit.status === 'completed'
                  ? 'bg-slate-50 text-slate-700'
                  : 'bg-amber-50 text-amber-900'
              }`}
            >
              {resultMessage(audit)}
            </p>
          </div>

          {recommendations.map((recommendation, index) => {
            const requiresSettings =
              recommendation.action === 'add' || recommendation.action === 'adjust';
            const settings = editedSettings[index];
            return (
              <article
                key={`${recommendation.supportKey}-${index}`}
                className="rounded-xl border border-slate-200 p-4"
              >
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
                  Suggestion {index + 1} · {actionLabel(recommendation.action)}
                </p>
                <h3 className="mt-1 text-lg font-bold">
                  {SUPPORT_CATALOG[recommendation.supportKey].label}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Confidence: {recommendation.confidence} · Review after{' '}
                  {recommendation.reviewAfterSessions} sessions
                </p>

                <h4 className="mt-4 font-semibold">Exact evidence supplied</h4>
                <ul className="mt-2 space-y-2">
                  {recommendation.evidence.map((item, evidenceIndex) => (
                    <li
                      key={`${item.sourceEventIds.join('-')}-${evidenceIndex}`}
                      className="rounded-lg bg-slate-50 p-3 text-sm"
                    >
                      <p>{item.observation}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.metric} · Event {item.sourceEventIds.join(', ')}
                      </p>
                    </li>
                  ))}
                </ul>

                <h4 className="mt-4 font-semibold">Other possible explanations</h4>
                {recommendation.alternativeExplanations.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600">None were supplied.</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {recommendation.alternativeExplanations.map((alternative) => (
                      <li key={alternative}>{alternative}</li>
                    ))}
                  </ul>
                )}

                <fieldset className="mt-5">
                  <legend className="font-semibold">Teacher decision (required)</legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {(['approve', 'reject', 'observe'] as const).map((choice) => (
                      <label
                        key={choice}
                        className="flex min-h-11 items-center gap-2 text-sm font-medium"
                      >
                        <input
                          type="radio"
                          name={`audit-decision-${index}`}
                          value={choice}
                          checked={decisions[index] === choice}
                          onChange={() => setDecision(index, choice)}
                          disabled={
                            isWorking ||
                            isReviewed ||
                            (choice === 'approve' && requiresSettings && settings === undefined)
                          }
                          className="h-5 w-5 accent-indigo-700"
                        />
                        {choice === 'approve'
                          ? 'Approve'
                          : choice === 'reject'
                            ? 'Reject'
                            : 'Observe longer'}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {requiresSettings && settings && decisions[index] === 'approve' && (
                  <SettingsEditor
                    settings={settings}
                    onChange={(nextSettings) =>
                      setEditedSettings((current) => ({
                        ...current,
                        [index]: parseEditedAuditSettings(nextSettings),
                      }))
                    }
                  />
                )}
                {requiresSettings && settings === undefined && (
                  <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    Valid catalog settings were not supplied. Approve is unavailable; reject or
                    observe instead.
                  </p>
                )}
              </article>
            );
          })}

          <div>
            <label
              htmlFor="audit-teacher-note"
              className="block text-sm font-semibold text-slate-800"
            >
              Teacher note (optional)
            </label>
            <textarea
              id="audit-teacher-note"
              aria-describedby="audit-teacher-note-count"
              value={teacherNote}
              onChange={(event) => setTeacherNote(event.target.value.slice(0, 1000))}
              maxLength={1000}
              rows={3}
              disabled={isWorking || isReviewed}
              className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal"
            />
            <span
              id="audit-teacher-note-count"
              className="mt-1 block text-xs font-normal text-slate-500"
            >
              {teacherNote.length}/1000
            </span>
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submitReview()}
            className="rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            {isWorking
              ? 'Saving review…'
              : recommendations.length === 0
                ? 'Record review'
                : 'Submit evidence review'}
          </button>
        </div>
      )}
    </section>
  );
}
