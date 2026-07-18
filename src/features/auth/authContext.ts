import { createContext, useContext } from 'react';

import type { AuthUser } from './authService';

export interface AuthContextValue {
  clearError: () => void;
  demoTeacherEnabled: boolean;
  error: string | null;
  isLoading: boolean;
  isWorking: boolean;
  signInAsDemoTeacher: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  user: AuthUser | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
};
