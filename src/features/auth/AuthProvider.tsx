import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  authRuntime,
  observeAuthState,
  signInDemoTeacher,
  signInTeacherWithGoogle,
  signOutCurrentUser,
} from './authService';
import { AuthContext, type AuthContextValue } from './authContext';
import type { AuthUser } from './authService';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Authentication failed. Please try again.';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      observeAuthState(
        (nextUser) => {
          setUser(nextUser);
          setIsLoading(false);
        },
        (authError) => {
          setError(getErrorMessage(authError));
          setIsLoading(false);
        },
      ),
    [],
  );

  const runAuthAction = useCallback(async (action: () => Promise<void>) => {
    setError(null);
    setIsWorking(true);
    try {
      await action();
    } catch (authError) {
      setError(getErrorMessage(authError));
    } finally {
      setIsWorking(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      clearError: () => setError(null),
      demoTeacherEnabled: authRuntime.demoTeacherEnabled,
      error,
      isLoading,
      isWorking,
      signInAsDemoTeacher: () => runAuthAction(signInDemoTeacher),
      signInWithGoogle: () => runAuthAction(signInTeacherWithGoogle),
      signOut: () => runAuthAction(signOutCurrentUser),
      user,
    }),
    [error, isLoading, isWorking, runAuthAction, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
