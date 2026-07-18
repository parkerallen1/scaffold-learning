import { AuthProvider } from '../features/auth/AuthProvider';
import { TeacherAccessBoundary } from '../features/auth/TeacherAccessBoundary';
import { TeacherHomePage } from './pages/TeacherHomePage';
import { TeacherPreviewPage } from './pages/TeacherPreviewPage';
import type { ReactNode } from 'react';

const ProtectedTeacherRoute = ({ children }: { children: ReactNode }) => (
  <AuthProvider>
    <TeacherAccessBoundary>{children}</TeacherAccessBoundary>
  </AuthProvider>
);

export const TeacherHomeRoute = () => (
  <ProtectedTeacherRoute>
    <TeacherHomePage />
  </ProtectedTeacherRoute>
);

export const TeacherPreviewRoute = () => (
  <ProtectedTeacherRoute>
    <TeacherPreviewPage />
  </ProtectedTeacherRoute>
);
