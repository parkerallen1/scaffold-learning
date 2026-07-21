import { useEffect, useRef, type ReactNode } from 'react';

import { useAuth } from './authContext';

const AuthError = ({ message }: { message: string }) => (
  <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
    {message}
  </p>
);

const TeacherSignIn = () => {
  const { demoTeacherEnabled, error, isWorking, signInAsDemoTeacher, signInWithGoogle } = useAuth();
  const startedRequestedDemo = useRef(false);

  useEffect(() => {
    if (
      demoTeacherEnabled &&
      new URLSearchParams(window.location.search).get('demo') === '1' &&
      !startedRequestedDemo.current
    ) {
      startedRequestedDemo.current = true;
      void signInAsDemoTeacher();
    }
  }, [demoTeacherEnabled, signInAsDemoTeacher]);

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto flex min-h-[80vh] max-w-lg items-center">
        <section
          className="w-full rounded-2xl bg-white p-8 shadow-xl"
          aria-labelledby="sign-in-title"
        >
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-blue-600">
            Teacher access
          </p>
          <h1 id="sign-in-title" className="text-3xl font-bold">
            Sign in to Scaffold Learning
          </h1>
          <p className="mt-3 text-slate-600">
            Teacher accounts will own classes, student support plans, and assignment decisions.
          </p>

          <div className="mt-6 space-y-3">
            {error && <AuthError message={error} />}
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={isWorking}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isWorking ? 'Signing in…' : 'Continue with Google'}
            </button>
            {demoTeacherEnabled && (
              <button
                type="button"
                onClick={() => void signInAsDemoTeacher()}
                disabled={isWorking}
                className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Explore the demo
              </button>
            )}
          </div>
          <a
            className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 hover:underline"
            href="/"
          >
            Back to role selection
          </a>
        </section>
      </div>
    </main>
  );
};

export const TeacherAccessBoundary = ({ children }: { children: ReactNode }) => {
  const { error, isLoading, isWorking, signOut, user } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p role="status" className="text-lg font-medium text-slate-700">
          Checking teacher access…
        </p>
      </main>
    );
  }

  if (!user) {
    return <TeacherSignIn />;
  }

  if (user.role !== 'teacher') {
    if (isWorking) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <p role="status" className="text-lg font-medium text-slate-700">
            Verifying teacher access…
          </p>
        </main>
      );
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
        <section className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="text-3xl font-bold">Teacher access unavailable</h1>
          <p className="mt-3 text-slate-600">
            This signed-in account does not have a verified teacher role.
          </p>
          {error && <AuthError message={error} />}
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-100"
          >
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
      {error && (
        <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl">
          <AuthError message={error} />
        </div>
      )}
      {children}
    </>
  );
};
