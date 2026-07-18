import { lazy, Suspense } from 'react';

import { DemoQuizPage } from './pages/DemoQuizPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { StudentEntryPage } from './pages/StudentEntryPage';
import { resolveAppRoute } from './routes';

const TeacherHomeRoute = lazy(async () => {
  const routes = await import('./TeacherRoutes');
  return { default: routes.TeacherHomeRoute };
});

const TeacherPreviewRoute = lazy(async () => {
  const routes = await import('./TeacherRoutes');
  return { default: routes.TeacherPreviewRoute };
});

const TeacherRouteLoading = () => (
  <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <p role="status" className="text-lg font-medium text-slate-700">
      Loading teacher workspace…
    </p>
  </main>
);

const AppContent = ({ pathname }: { pathname: string }) => {
  const route = resolveAppRoute(pathname);

  switch (route) {
    case 'home':
      return <HomePage />;
    case 'demo':
      return <DemoQuizPage />;
    case 'student':
      return <StudentEntryPage />;
    case 'teacher-home':
      return (
        <Suspense fallback={<TeacherRouteLoading />}>
          <TeacherHomeRoute />
        </Suspense>
      );
    case 'teacher-preview':
      return (
        <Suspense fallback={<TeacherRouteLoading />}>
          <TeacherPreviewRoute />
        </Suspense>
      );
    default:
      return <NotFoundPage />;
  }
};

const App = ({ pathname = window.location.pathname }: { pathname?: string }) => (
  <AppContent pathname={pathname} />
);

export default App;
