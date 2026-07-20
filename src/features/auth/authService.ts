import {
  getIdTokenResult,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInAnonymously,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

import { auth, firebaseRuntime, functions } from '../../lib/firebase';

export type AuthRole = 'student' | 'teacher';

export type AuthUser = Pick<User, 'displayName' | 'email' | 'isAnonymous' | 'uid'> & {
  authVersion: number | null;
  classroomId: string | null;
  role: AuthRole | null;
  studentId: string | null;
};

export interface StudentCredentials {
  classCode: string;
  pin: string;
  studentHandle: string;
}

type StudentCredentialResponse = {
  customToken: string;
};

const STUDENT_SIGN_IN_ERROR = 'Unable to sign in with those credentials.';

const bootstrapTeacher = httpsCallable<Record<string, never>, unknown>(
  functions,
  'bootstrapTeacher',
  firebaseRuntime.callableOptions,
);
const exchangeStudentCredentials = httpsCallable<StudentCredentials, StudentCredentialResponse>(
  functions,
  'exchangeStudentCredentials',
  firebaseRuntime.callableOptions,
);

export const authRuntime = Object.freeze({
  demoTeacherEnabled: true,
});

const optionalClaimString = (claim: unknown): string | null =>
  typeof claim === 'string' && claim.length > 0 ? claim : null;

const optionalAuthVersion = (claim: unknown): number | null =>
  typeof claim === 'number' && Number.isInteger(claim) && claim > 0 ? claim : null;

const resolveAuthUser = async (user: User, forceRefresh = false): Promise<AuthUser> => {
  const token = await getIdTokenResult(user, forceRefresh);
  const claimedRole = token.claims.role;
  const role: AuthRole | null =
    claimedRole === 'teacher' || claimedRole === 'student' ? claimedRole : null;
  const classroomId = optionalClaimString(token.claims.classroomId);
  const studentId = optionalClaimString(token.claims.studentId);
  const authVersion = optionalAuthVersion(token.claims.authVersion);
  const hasValidStudentScope =
    role !== 'student' || (classroomId !== null && studentId !== null && authVersion !== null);

  return {
    authVersion: hasValidStudentScope ? authVersion : null,
    classroomId: hasValidStudentScope ? classroomId : null,
    displayName: user.displayName,
    email: user.email,
    isAnonymous: user.isAnonymous,
    role: hasValidStudentScope ? role : null,
    studentId: hasValidStudentScope ? studentId : null,
    uid: user.uid,
  };
};

export const observeAuthState = (
  onUserChange: (user: AuthUser | null) => void,
  onError: (error: Error) => void,
): (() => void) => {
  let observationVersion = 0;
  let isActive = true;
  const unsubscribe = onIdTokenChanged(
    auth,
    (user) => {
      const currentVersion = ++observationVersion;
      if (!user) {
        onUserChange(null);
        return;
      }
      void resolveAuthUser(user)
        .then((resolvedUser) => {
          if (isActive && currentVersion === observationVersion) {
            onUserChange(resolvedUser);
          }
        })
        .catch((error: unknown) => {
          if (isActive && currentVersion === observationVersion) {
            onError(error instanceof Error ? error : new Error('Authentication failed.'));
          }
        });
    },
    onError,
  );

  return () => {
    isActive = false;
    unsubscribe();
  };
};

const bootstrapSignedInTeacher = async (user: User): Promise<AuthUser> => {
  await bootstrapTeacher({});
  return resolveAuthUser(user, true);
};

export const signInTeacherWithGoogle = async (): Promise<AuthUser> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  return bootstrapSignedInTeacher(credential.user);
};

export const signInDemoTeacher = async (): Promise<AuthUser> => {
  const credential = await signInAnonymously(auth);
  return bootstrapSignedInTeacher(credential.user);
};

export const signInStudent = async (credentials: StudentCredentials): Promise<AuthUser> => {
  try {
    const response = await exchangeStudentCredentials(credentials);
    if (!response.data.customToken) {
      throw new Error(STUDENT_SIGN_IN_ERROR);
    }
    const credential = await signInWithCustomToken(auth, response.data.customToken);
    const user = await resolveAuthUser(credential.user, true);
    if (user.role !== 'student') {
      await signOut(auth);
      throw new Error(STUDENT_SIGN_IN_ERROR);
    }
    return user;
  } catch {
    throw new Error(STUDENT_SIGN_IN_ERROR);
  }
};

export const signOutCurrentUser = async (): Promise<void> => {
  await signOut(auth);
};
