import { useAuth } from '../../features/auth/authContext';

export const TeacherHomePage = () => {
  const { isWorking, signOut, user } = useAuth();
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
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={isWorking}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-100 disabled:opacity-60"
          >
            {isWorking ? 'Signing out…' : 'Sign out'}
          </button>
        </header>

        {user?.isAnonymous && (
          <p className="mt-4 rounded-lg bg-amber-100 p-3 text-sm font-medium text-amber-900">
            Emulator demo teacher: all data must remain synthetic.
          </p>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-md">
            <h2 className="text-xl font-bold">Classroom setup</h2>
            <p className="mt-2 text-slate-600">
              Classroom and synthetic-student creation arrive in the next identity packet.
            </p>
          </div>
          <a
            href="/teacher/preview"
            className="rounded-2xl bg-blue-600 p-6 text-white shadow-md hover:bg-blue-700"
          >
            <span className="block text-xl font-bold">Preview the student experience</span>
            <span className="mt-2 block text-sm text-blue-100">
              Open the current synthetic quiz as a teacher preview.
            </span>
          </a>
        </section>
      </div>
    </main>
  );
};
