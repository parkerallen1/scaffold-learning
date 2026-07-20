import { useEffect, useMemo, useState } from 'react';

import { SUPPORT_CATALOG } from '../../lib/domain';
import { useAuth } from '../../features/auth/authContext';
import {
  getStudentPlanningData,
  type StudentPlanningData,
} from '../../features/planning/planningService';
import { QuizRunner } from '../../features/quiz/QuizRunner';

export const TeacherPreviewPage = ({ search = window.location.search }: { search?: string }) => {
  const { isWorking, signOut } = useAuth();
  const identity = useMemo(() => {
    const params = new URLSearchParams(search);
    const classroomId = params.get('classroomId');
    const studentId = params.get('studentId');
    return classroomId && studentId ? { classroomId, studentId } : null;
  }, [search]);
  const [studentData, setStudentData] = useState<StudentPlanningData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!identity) return () => undefined;
    void getStudentPlanningData(identity)
      .then((data) => {
        if (active) setStudentData(data);
      })
      .catch(() => {
        if (active) setLoadError('Unable to load this student’s demo.');
      });
    return () => {
      active = false;
    };
  }, [identity]);

  const firstName = studentData?.student.displayName.split(/\s+/)[0];

  return (
    <main className="bg-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-950 px-4 py-3 text-sm font-semibold text-white">
        <p>Teacher preview — synthetic quiz data only</p>
        <div className="flex items-center gap-4">
          <a className="inline-flex min-h-11 items-center underline" href="/teacher">
            Teacher workspace
          </a>
          <button
            type="button"
            className="underline disabled:opacity-60"
            disabled={isWorking}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
      {identity && !studentData && !loadError && (
        <p role="status" className="mx-auto mt-6 max-w-5xl rounded-xl bg-white p-4 shadow-sm">
          Loading this student’s personalized experience…
        </p>
      )}
      {loadError && (
        <p role="alert" className="mx-auto mt-6 max-w-5xl rounded-xl bg-red-50 p-4 text-red-700">
          {loadError}
        </p>
      )}
      {studentData && (
        <section className="mx-auto mt-6 max-w-5xl rounded-2xl border border-violet-200 bg-white p-6 shadow-md">
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">
            Personalized student view
          </p>
          <h1 className="mt-1 text-3xl font-bold">Hi, {firstName}!</h1>
          <p className="mt-2 text-slate-600">
            Your teacher has made these accommodations available. You stay in control of when to use
            them.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Available accommodations">
            {(studentData.activePlan?.supports ?? []).map((support) => (
              <li
                key={support.supportKey}
                className="rounded-full bg-violet-100 px-3 py-1.5 text-sm font-semibold text-violet-900"
              >
                {SUPPORT_CATALOG[support.supportKey].label}
              </li>
            ))}
          </ul>
        </section>
      )}
      <QuizRunner />
    </main>
  );
};
