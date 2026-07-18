import { AuthProvider } from '../features/auth/AuthProvider';
import { TeacherAccessBoundary } from '../features/auth/TeacherAccessBoundary';
import { TeacherAssignmentsPage } from './pages/TeacherAssignmentsPage';

export const TeacherAssignmentRoute = () => (
  <AuthProvider>
    <TeacherAccessBoundary>
      <TeacherAssignmentsPage />
    </TeacherAccessBoundary>
  </AuthProvider>
);
