import { useState } from 'react';
import type { FormEvent } from 'react';

import { useAuth } from '../../features/auth/authContext';
import { StudentWorkspace } from '../../features/student-work/StudentWorkspace';

const StudentAuthError = ({ message }: { message: string }) => (
  <p
    id="student-sign-in-error"
    role="alert"
    className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
  >
    {message}
  </p>
);

const StudentSession = () => {
  const { isWorking, signOut, user } = useAuth();

  if (!user || user.role !== 'student' || !user.classroomId || !user.studentId) {
    return null;
  }

  return (
    <StudentWorkspace
      classroomId={user.classroomId}
      isSigningOut={isWorking}
      onSignOut={() => void signOut()}
      studentId={user.studentId}
    />
  );
};

export const StudentEntryPage = () => {
  const { error, isLoading, isWorking, signInAsStudent, signOut, user } = useAuth();
  const [classCode, setClassCode] = useState('');
  const [studentHandle, setStudentHandle] = useState('');
  const [pin, setPin] = useState('');

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p role="status" className="text-lg font-medium text-slate-700">
          Checking student access…
        </p>
      </main>
    );
  }

  if (user?.role === 'student') {
    return <StudentSession />;
  }

  if (user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
        <section className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="text-3xl font-bold">Student access unavailable</h1>
          <p className="mt-3 text-slate-600">
            This signed-in account does not have a verified student role.
          </p>
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submittedPin = pin;
    setPin('');
    await signInAsStudent({ classCode, pin: submittedPin, studentHandle });
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto flex min-h-[80vh] max-w-lg items-center">
        <section
          className="w-full rounded-2xl bg-white p-8 shadow-xl"
          aria-labelledby="student-title"
        >
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Student access
          </p>
          <h1 id="student-title" className="text-3xl font-bold">
            Join your class
          </h1>
          <p className="mt-3 text-slate-600">
            Enter the class code, student handle, and PIN provided by your teacher.
          </p>

          <form
            className="mt-6 space-y-4"
            aria-busy={isWorking}
            aria-describedby={error ? 'student-sign-in-error' : undefined}
            onSubmit={(event) => void handleSubmit(event)}
          >
            {error && <StudentAuthError message={error} />}
            <label className="block text-sm font-semibold text-slate-700">
              Class code
              <input
                required
                autoComplete="off"
                value={classCode}
                onChange={(event) => setClassCode(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 uppercase"
                maxLength={12}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Student handle
              <input
                required
                autoComplete="username"
                value={studentHandle}
                onChange={(event) => setStudentHandle(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                maxLength={32}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Student PIN
              <input
                required
                autoComplete="off"
                inputMode="numeric"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                maxLength={12}
                minLength={4}
                pattern="[0-9]*"
                type="password"
                aria-describedby="student-pin-help"
              />
            </label>
            <p id="student-pin-help" className="text-xs text-slate-600">
              Enter numbers only. Your PIN is cleared after each sign-in attempt.
            </p>
            <button
              type="submit"
              disabled={isWorking}
              className="w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isWorking ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-600">
            Quiz Master does not save your PIN in this browser.
          </p>
        </section>
      </div>
    </main>
  );
};
