import { useAuth } from '../../features/auth/authContext';
import { ClassroomWorkspace } from '../../features/classrooms/ClassroomWorkspace';

export const TeacherHomePage = () => {
  const { demoTeacherEnabled, isWorking, signOut, user } = useAuth();
  const teacherName = user?.isAnonymous
    ? 'Emulator demo teacher'
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
              href="/teacher/assignments"
              className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800"
            >
              Create assignment
            </a>
            <a
              href="/teacher/preview"
              className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
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

        {demoTeacherEnabled && (
          <p className="mt-4 rounded-lg bg-amber-100 p-3 text-sm font-medium text-amber-900">
            Emulator workspace: all data must remain synthetic.
          </p>
        )}

        {user?.uid && <ClassroomWorkspace teacherId={user.uid} />}
      </div>
    </main>
  );
};
