import { AuthProvider } from '@/features/auth/AuthProvider';
import { TeacherAccessBoundary } from '@/features/auth/TeacherAccessBoundary';

import { TeacherEvidencePage } from './pages/TeacherEvidencePage';

export const TeacherEvidenceRoute = () => (
  <AuthProvider>
    <TeacherAccessBoundary>
      <TeacherEvidencePage />
    </TeacherAccessBoundary>
  </AuthProvider>
);
