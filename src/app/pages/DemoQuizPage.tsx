import { QuizRunner } from '../../features/quiz/QuizRunner';

export const DemoQuizPage = () => (
  <main className="bg-slate-100">
    <div className="bg-amber-100 px-4 py-3 text-center text-sm font-semibold text-amber-950">
      Synthetic demo only — do not enter real student information.{' '}
      <a className="underline" href="/">
        Return to role selection
      </a>
    </div>
    <QuizRunner />
  </main>
);
