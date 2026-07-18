import { QuizRunner } from '../../features/quiz/QuizRunner';
import { useAuth } from '../../features/auth/authContext';

export const TeacherPreviewPage = () => {
  const { isWorking, signOut } = useAuth();

  return (
    <main className="bg-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-950 px-4 py-3 text-sm font-semibold text-white">
        <p>Teacher preview — synthetic quiz data only</p>
        <div className="flex items-center gap-4">
          <a className="underline" href="/teacher">
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
      <QuizRunner />
    </main>
  );
};
