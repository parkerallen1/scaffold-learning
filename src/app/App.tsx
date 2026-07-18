import { lazy, Suspense } from 'react';

import { DemoQuizPage } from './pages/DemoQuizPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { resolveAppRoute } from './routes';

const StudentRoute = lazy(async () => {
  const route = await import('./StudentRoute');
  return { default: route.StudentRoute };
});

const TeacherHomeRoute = lazy(async () => {
  const routes = await import('./TeacherRoutes');
  return { default: routes.TeacherHomeRoute };
});

const TeacherPreviewRoute = lazy(async () => {
  const routes = await import('./TeacherRoutes');
  return { default: routes.TeacherPreviewRoute };
});

const IdentityRouteLoading = () => (
  <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <p role="status" className="text-lg font-medium text-slate-700">
      Loading secure access…
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
      return (
        <Suspense fallback={<IdentityRouteLoading />}>
          <StudentRoute />
        </Suspense>
      );
    case 'teacher-home':
      return (
        <Suspense fallback={<IdentityRouteLoading />}>
          <TeacherHomeRoute />
        </Suspense>
      );
    case 'teacher-preview':
      return (
        <Suspense fallback={<IdentityRouteLoading />}>
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
