import { useEffect, useMemo, useState } from 'react';

import { AuditReviewPanel } from '@/features/audits/AuditReviewPanel';
import { OnboardingInterview } from '@/features/onboarding/OnboardingInterview';
import type { OnboardingProfileDraft } from '@/features/onboarding/OnboardingInterview';
import {
  createSupportPlanVersion,
  getStudentPlanningData,
  recommendStudentSupports,
  revertSupportPlanVersion,
  saveStudentProfile,
  type StudentPlanningData,
} from '@/features/planning/planningService';
import { SupportPlanReview } from '@/features/support-plans/SupportPlanReview';
import {
  SUPPORT_CATALOG,
  classroomIdSchema,
  studentIdSchema,
  type SupportRecommendation,
  type SupportSettings,
} from '@/lib/domain';

type WorkflowStep = 'overview' | 'interview' | 'review';

const LOAD_ERROR = 'Unable to load this student’s planning workspace. Please try again.';
const RECOMMENDATION_ERROR =
  'Support suggestions could not be loaded. You can still build the plan manually.';

const parsePlanningIdentity = (search: string) => {
  const params = new URLSearchParams(search);
  const classroomId = classroomIdSchema.safeParse(params.get('classroomId'));
  const studentId = studentIdSchema.safeParse(params.get('studentId'));
  if (!classroomId.success || !studentId.success) return null;
  return { classroomId: classroomId.data, studentId: studentId.data };
};

const PlanSummary = ({ plan }: { plan: StudentPlanningData['activePlan'] }) => {
  if (plan === null) {
    return <p className="mt-3 text-slate-600">No support plan has been approved yet.</p>;
  }

  return (
    <div className="mt-3">
      <p className="font-semibold text-slate-900">Active version {plan.version}</p>
      {plan.supports.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">No supports are enabled in this version.</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {plan.supports.map((support) => (
            <li key={support.supportKey}>{SUPPORT_CATALOG[support.supportKey].label}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const TeacherStudentPlanningPage = ({
  search = window.location.search,
}: {
  search?: string;
}) => {
  const identity = useMemo(() => parsePlanningIdentity(search), [search]);
  const [data, setData] = useState<StudentPlanningData | null>(null);
  const [step, setStep] = useState<WorkflowStep>('overview');
  const [recommendations, setRecommendations] = useState<readonly SupportRecommendation[]>([]);
  const [recommendationError, setRecommendationError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const load = async () => {
    if (identity === null) return;
    setError(null);
    try {
      setData(await getStudentPlanningData(identity));
    } catch {
      setError(LOAD_ERROR);
    }
  };

  useEffect(() => {
    let active = true;
    if (identity === null) return () => undefined;
    void getStudentPlanningData(identity)
      .then((planningData) => {
        if (active) setData(planningData);
      })
      .catch(() => {
        if (active) setError(LOAD_ERROR);
      });
    return () => {
      active = false;
    };
  }, [identity]);

  if (identity === null) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-md">
          <h1 className="text-2xl font-bold">Student planning link unavailable</h1>
          <p role="alert" className="mt-3 text-slate-700">
            Return to the roster and choose a student to open a valid planning workspace.
          </p>
          <a className="mt-5 inline-block font-semibold text-blue-700" href="/teacher">
            Return to teacher workspace
          </a>
        </div>
      </main>
    );
  }

  const completeInterview = async (draft: OnboardingProfileDraft) => {
    if (isWorking) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const profile = await saveStudentProfile({ ...identity, ...draft });
      setData((current) => (current === null ? current : { ...current, profile }));
      try {
        const result = await recommendStudentSupports(identity);
        setRecommendations(result.recommendations);
        setRecommendationError(undefined);
      } catch {
        setRecommendations([]);
        setRecommendationError(RECOMMENDATION_ERROR);
      }
      setStep('review');
    } catch {
      setError('Unable to save these observations. Please try again.');
    } finally {
      setIsWorking(false);
    }
  };

  const completePlanReview = async (supports: SupportSettings[]) => {
    if (isWorking) return;
    const supportLabel =
      supports.length === 1 ? '1 approved support' : `${supports.length} approved supports`;
    if (!window.confirm(`Create a new plan version with ${supportLabel}?`)) return;

    setIsWorking(true);
    setError(null);
    try {
      const plan = await createSupportPlanVersion({ ...identity, supports });
      await load();
      setStep('overview');
      setSuccess(`Support plan version ${plan.version} is now active.`);
    } catch {
      setError('Unable to save the approved support plan. Please try again.');
    } finally {
      setIsWorking(false);
    }
  };

  const revertTo = async (planId: string, version: number) => {
    if (isWorking || data === null) return;
    if (
      !window.confirm(
        `Use the settings from version ${version}? This creates a new version and preserves the full history.`,
      )
    )
      return;

    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const plan = await revertSupportPlanVersion({ ...identity, priorPlanId: planId });
      await load();
      setSuccess(`Version ${plan.version} is now active using the earlier settings.`);
    } catch {
      setError('Unable to restore that earlier plan. Please try again.');
    } finally {
      setIsWorking(false);
    }
  };

  if (data === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="text-center">
          <p role="status" className="font-semibold text-slate-700">
            {error ?? 'Loading student planning workspace…'}
          </p>
          {error && (
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white"
            >
              Try again
            </button>
          )}
          <a className="mt-4 block font-semibold text-blue-700" href="/teacher">
            Return to roster
          </a>
        </div>
      </main>
    );
  }

  if (step === 'interview') {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="mx-auto mb-5 max-w-3xl">
          <button
            type="button"
            onClick={() => setStep('overview')}
            className="font-semibold text-blue-700"
          >
            ← Back to plan history
          </button>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-700">
              {error}
            </p>
          )}
          {isWorking && (
            <p role="status" className="mt-3 font-semibold text-slate-700">
              Saving observations and preparing suggestions…
            </p>
          )}
        </div>
        <OnboardingInterview
          key={data.profile?.updatedAt ?? 'new-profile'}
          studentName={data.student.displayName}
          initialObservations={data.profile?.observations}
          initialTeacherSummary={data.profile?.teacherSummary}
          onComplete={(draft) => void completeInterview(draft)}
        />
      </main>
    );
  }

  if (step === 'review') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-5xl px-6 pt-6">
          <button
            type="button"
            onClick={() => setStep('interview')}
            disabled={isWorking}
            className="font-semibold text-blue-700 disabled:opacity-50"
          >
            ← Edit observations
          </button>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-700">
              {error}
            </p>
          )}
          {isWorking && (
            <p role="status" className="mt-3 font-semibold text-slate-700">
              Saving approved plan…
            </p>
          )}
        </div>
        <SupportPlanReview
          key={`${data.profile?.updatedAt ?? 'profile'}-${recommendations.length}`}
          recommendations={recommendations}
          recommendationError={recommendationError}
          onComplete={(supports) => void completePlanReview(supports)}
        />
      </div>
    );
  }

  const canEdit = data.student.status === 'active';
  const earlierPlans =
    data.activePlan === null
      ? []
      : data.planHistory.filter((plan) => plan.version < data.activePlan!.version);

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow-md">
          <a className="font-semibold text-blue-700" href="/teacher">
            ← Return to roster
          </a>
          <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-blue-700">
            Teacher planning workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold">Support plan for {data.student.displayName}</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Record classroom observations, review optional suggestions, and explicitly approve each
            support before it can become active. This process does not diagnose the student.
          </p>
          {!canEdit && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              This student is disabled. Plan history remains available, but changes require active
              student access.
            </p>
          )}
        </header>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-4 font-medium text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="rounded-lg bg-emerald-50 p-4 font-medium text-emerald-800">
            {success}
          </p>
        )}

        <section className="rounded-2xl bg-white p-6 shadow-md" aria-labelledby="profile-heading">
          <h2 id="profile-heading" className="text-xl font-bold">
            Teacher observations
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {data.profile === null
              ? 'No structured observation profile has been saved.'
              : 'A structured observation profile is ready. Review it before requesting new suggestions.'}
          </p>
          <button
            type="button"
            disabled={!canEdit || isWorking}
            onClick={() => {
              setError(null);
              setSuccess(null);
              setStep('interview');
            }}
            className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {data.profile === null ? 'Start observation interview' : 'Review observation interview'}
          </button>
        </section>

        <section
          className="rounded-2xl bg-white p-6 shadow-md"
          aria-labelledby="active-plan-heading"
        >
          <h2 id="active-plan-heading" className="text-xl font-bold">
            Active support plan
          </h2>
          <PlanSummary plan={data.activePlan} />
        </section>

        <AuditReviewPanel
          classroomId={identity.classroomId}
          studentId={identity.studentId}
          studentName={data.student.displayName}
          disabled={!canEdit || data.activePlan === null}
          unavailableReason={
            data.activePlan === null
              ? 'Approve an initial support plan before reviewing evidence.'
              : !canEdit
                ? 'Evidence review requires an active student.'
                : undefined
          }
          onReviewed={async () => {
            await load();
          }}
        />

        <section className="rounded-2xl bg-white p-6 shadow-md" aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-xl font-bold">
            Plan history
          </h2>
          {data.planHistory.length === 0 ? (
            <p className="mt-3 text-slate-600">No plan versions have been saved.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {data.planHistory.map((plan) => {
                const isActive = plan.id === data.activePlan?.id;
                const canRevert = earlierPlans.some((candidate) => candidate.id === plan.id);
                return (
                  <li key={plan.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          Version {plan.version} {isActive ? '(active)' : ''}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {plan.supports.length} approved{' '}
                          {plan.supports.length === 1 ? 'support' : 'supports'} ·{' '}
                          {new Date(plan.approvedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {canRevert && (
                        <button
                          type="button"
                          disabled={!canEdit || isWorking}
                          onClick={() => void revertTo(plan.id, plan.version)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                        >
                          Use version {plan.version} settings
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {data.historyTruncated && (
            <p className="mt-3 text-sm text-slate-600">
              Only the 50 most recent versions are shown.
            </p>
          )}
        </section>
      </div>
    </main>
  );
};
