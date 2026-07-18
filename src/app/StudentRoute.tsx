import { AuthProvider } from '../features/auth/AuthProvider';
import { StudentEntryPage } from './pages/StudentEntryPage';

export const StudentRoute = () => (
  <AuthProvider>
    <StudentEntryPage />
  </AuthProvider>
);
