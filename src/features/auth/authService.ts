import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';

import { auth, firebaseRuntime } from '../../lib/firebase';

export type AuthUser = Pick<User, 'displayName' | 'email' | 'isAnonymous' | 'uid'>;

export const authRuntime = Object.freeze({
  demoTeacherEnabled: firebaseRuntime.useEmulators,
});

export const observeAuthState = (
  onUserChange: (user: AuthUser | null) => void,
  onError: (error: Error) => void,
): (() => void) =>
  onAuthStateChanged(
    auth,
    (user) => onUserChange(user),
    (error) => onError(error),
  );

export const signInTeacherWithGoogle = async (): Promise<void> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
};

export const signInDemoTeacher = async (): Promise<void> => {
  if (!authRuntime.demoTeacherEnabled) {
    throw new Error('Demo teacher sign-in is only available with local Firebase emulators.');
  }
  await signInAnonymously(auth);
};

export const signOutCurrentUser = async (): Promise<void> => {
  await signOut(auth);
};
