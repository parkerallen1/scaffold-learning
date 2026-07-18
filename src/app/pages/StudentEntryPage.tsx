export const StudentEntryPage = () => (
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
          Class-code and student-PIN access is being connected next. No assignment or student data
          is available without a verified classroom credential.
        </p>

        <div className="mt-6 space-y-4" aria-disabled="true">
          <label className="block text-sm font-semibold text-slate-700">
            Class code
            <input
              disabled
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"
              placeholder="Coming next"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Student PIN
            <input
              disabled
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"
              placeholder="Coming next"
              type="password"
            />
          </label>
          <button
            type="button"
            disabled
            className="w-full rounded-lg bg-slate-300 px-4 py-3 font-semibold text-slate-600"
          >
            Student sign-in coming next
          </button>
        </div>

        <a
          className="mt-6 inline-block text-sm font-semibold text-blue-700 hover:underline"
          href="/"
        >
          Back to role selection
        </a>
      </section>
    </div>
  </main>
);
