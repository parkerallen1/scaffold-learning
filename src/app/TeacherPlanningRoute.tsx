import { AuthProvider } from '../features/auth/AuthProvider';
import { TeacherAccessBoundary } from '../features/auth/TeacherAccessBoundary';
import { TeacherStudentPlanningPage } from './pages/TeacherStudentPlanningPage';

export const TeacherPlanningRoute = () => (
  <AuthProvider>
    <TeacherAccessBoundary>
      <TeacherStudentPlanningPage />
    </TeacherAccessBoundary>
  </AuthProvider>
);
