export const HomePage = () => (
  <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
    <div className="mx-auto flex min-h-[85vh] max-w-4xl items-center">
      <section className="w-full rounded-3xl bg-white p-8 shadow-xl sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Teacher-guided learning support
        </p>
        <h1 className="mt-2 text-4xl font-bold sm:text-5xl">Scaffold Learning</h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Help students start, sustain, and complete teacher-assigned work with supports chosen by
          their teacher.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <a
            href="/teacher"
            aria-label="Teacher"
            className="rounded-2xl bg-blue-600 p-6 text-white shadow-md hover:bg-blue-700"
          >
            <span className="block text-xl font-bold">Teacher</span>
            <span className="mt-2 block text-sm text-blue-100">
              Manage classes, students, and approved supports.
            </span>
          </a>
          <a
            href="/student"
            aria-label="Student"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md hover:bg-slate-50"
          >
            <span className="block text-xl font-bold">Student</span>
            <span className="mt-2 block text-sm text-slate-600">
              Join with a class code and student PIN.
            </span>
          </a>
        </div>
      </section>
    </div>
  </main>
);
