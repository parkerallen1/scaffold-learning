import { useAuth } from '../../features/auth/authContext';
import { ClassroomWorkspace } from '../../features/classrooms/ClassroomWorkspace';

export const TeacherHomePage = () => {
  const { demoTeacherEnabled, isWorking, signOut, user } = useAuth();
  const teacherName = user?.isAnonymous
    ? 'Demo teacher'
    : (user?.displayName ?? user?.email ?? 'Teacher');

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 shadow-md">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              Teacher workspace
            </p>
            <h1 className="text-3xl font-bold">Welcome, {teacherName}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/teacher/evidence"
              className="inline-flex min-h-11 items-center rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800"
            >
              Review student work
            </a>
            <a
              href="/teacher/assignments"
              className="inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800"
            >
              Create assignment
            </a>
            <a
              href="/teacher/preview"
              className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
            >
              Preview student experience
            </a>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={isWorking}
              className="rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-100 disabled:opacity-60"
            >
              {isWorking ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </header>

        {user?.isAnonymous && (
          <section className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">
              Start here · guided demo
            </p>
            <h2 className="mt-1 text-2xl font-bold">See personalization from both sides</h2>
            <ol className="mt-4 grid gap-3 text-sm leading-6 text-slate-700 md:grid-cols-3">
              <li className="rounded-xl bg-white p-4">
                <span className="block font-bold text-violet-700">1 · Classrooms</span>
                Two example classrooms are ready below, each with a copyable class code.
              </li>
              <li className="rounded-xl bg-white p-4">
                <span className="block font-bold text-violet-700">2 · Student needs</span>
                Each synthetic student has a different learning profile and approved supports.
              </li>
              <li className="rounded-xl bg-white p-4">
                <span className="block font-bold text-violet-700">3 · Try their view</span>
                Choose “Demo student’s experience” to see the greeting and accommodations they get.
              </li>
            </ol>
          </section>
        )}

        {user?.uid && <ClassroomWorkspace demoMode={demoTeacherEnabled} teacherId={user.uid} />}
      </div>
    </main>
  );
};
