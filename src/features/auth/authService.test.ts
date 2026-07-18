import { beforeEach, describe, expect, it, vi } from 'vitest';

import { observeAuthState, signInStudent, signInTeacherWithGoogle } from './authService';

const firebaseHarness = vi.hoisted(() => ({
  bootstrapTeacher: vi.fn(),
  exchangeStudentCredentials: vi.fn(),
  getIdTokenResult: vi.fn(),
  onIdTokenChanged: vi.fn(),
  setCustomParameters: vi.fn(),
  signInAnonymously: vi.fn(),
  signInWithCustomToken: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('../../lib/firebase', () => ({
  auth: { name: 'test-auth' },
  firebaseRuntime: { useEmulators: true },
  functions: { name: 'test-functions' },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => {
    if (name === 'bootstrapTeacher') {
      return firebaseHarness.bootstrapTeacher;
    }
    if (name === 'exchangeStudentCredentials') {
      return firebaseHarness.exchangeStudentCredentials;
    }
    throw new Error(`Unexpected callable: ${name}`);
  }),
}));

vi.mock('firebase/auth', () => ({
  getIdTokenResult: firebaseHarness.getIdTokenResult,
  GoogleAuthProvider: class {
    setCustomParameters = firebaseHarness.setCustomParameters;
  },
  onIdTokenChanged: firebaseHarness.onIdTokenChanged,
  signInAnonymously: firebaseHarness.signInAnonymously,
  signInWithCustomToken: firebaseHarness.signInWithCustomToken,
  signInWithPopup: firebaseHarness.signInWithPopup,
  signOut: firebaseHarness.signOut,
}));

const firebaseTeacher = {
  displayName: 'Ada Teacher',
  email: 'ada@example.test',
  isAnonymous: false,
  uid: 'teacher-1',
};

const firebaseStudent = {
  displayName: null,
  email: null,
  isAnonymous: false,
  uid: 'student-auth-1',
};

describe('authService', () => {
  beforeEach(() => {
    for (const mock of Object.values(firebaseHarness)) {
      mock.mockReset();
    }
    firebaseHarness.bootstrapTeacher.mockResolvedValue({ data: {} });
    firebaseHarness.onIdTokenChanged.mockReturnValue(firebaseHarness.unsubscribe);
  });

  it('bootstraps a Google teacher before force-refreshing verified role claims', async () => {
    firebaseHarness.signInWithPopup.mockResolvedValue({ user: firebaseTeacher });
    firebaseHarness.getIdTokenResult.mockResolvedValue({ claims: { role: 'teacher' } });

    const user = await signInTeacherWithGoogle();

    expect(firebaseHarness.setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' });
    expect(firebaseHarness.bootstrapTeacher).toHaveBeenCalledWith({});
    expect(firebaseHarness.getIdTokenResult).toHaveBeenCalledWith(firebaseTeacher, true);
    expect(firebaseHarness.bootstrapTeacher.mock.invocationCallOrder[0]).toBeLessThan(
      firebaseHarness.getIdTokenResult.mock.invocationCallOrder[0],
    );
    expect(user).toMatchObject({
      authVersion: null,
      classroomId: null,
      role: 'teacher',
      studentId: null,
      uid: 'teacher-1',
    });
  });

  it('exchanges student credentials for a custom token and reads scoped claims', async () => {
    firebaseHarness.exchangeStudentCredentials.mockResolvedValue({
      data: { customToken: 'student-custom-token' },
    });
    firebaseHarness.signInWithCustomToken.mockResolvedValue({ user: firebaseStudent });
    firebaseHarness.getIdTokenResult.mockResolvedValue({
      claims: {
        authVersion: 7,
        classroomId: 'classroom-1',
        role: 'student',
        studentId: 'student-1',
      },
    });

    const credentials = { classCode: 'ABC123', pin: '4829', studentHandle: 'alex' };
    const user = await signInStudent(credentials);

    expect(firebaseHarness.exchangeStudentCredentials).toHaveBeenCalledWith(credentials);
    expect(firebaseHarness.signInWithCustomToken).toHaveBeenCalledWith(
      { name: 'test-auth' },
      'student-custom-token',
    );
    expect(firebaseHarness.getIdTokenResult).toHaveBeenCalledWith(firebaseStudent, true);
    expect(user).toMatchObject({
      authVersion: 7,
      classroomId: 'classroom-1',
      role: 'student',
      studentId: 'student-1',
    });
  });

  it('replaces credential exchange details with one generic student error', async () => {
    firebaseHarness.exchangeStudentCredentials.mockRejectedValue(
      new Error('functions/permission-denied: PIN mismatch for student-1'),
    );

    await expect(
      signInStudent({ classCode: 'ABC123', pin: '0000', studentHandle: 'alex' }),
    ).rejects.toThrow('Unable to sign in with those credentials.');
  });

  it('signs out and rejects a custom token without complete student scope', async () => {
    firebaseHarness.exchangeStudentCredentials.mockResolvedValue({
      data: { customToken: 'incomplete-custom-token' },
    });
    firebaseHarness.signInWithCustomToken.mockResolvedValue({ user: firebaseStudent });
    firebaseHarness.getIdTokenResult.mockResolvedValue({
      claims: { classroomId: 'classroom-1', role: 'student' },
    });
    firebaseHarness.signOut.mockResolvedValue(undefined);

    await expect(
      signInStudent({ classCode: 'ABC123', pin: '4829', studentHandle: 'alex' }),
    ).rejects.toThrow('Unable to sign in with those credentials.');
    expect(firebaseHarness.signOut).toHaveBeenCalledWith({ name: 'test-auth' });
  });

  it('ignores a stale claim lookup after Firebase reports sign-out', async () => {
    let authListener: ((user: typeof firebaseTeacher | null) => void) | undefined;
    let resolveClaims: ((result: { claims: { role: string } }) => void) | undefined;
    firebaseHarness.onIdTokenChanged.mockImplementation(
      (_auth: unknown, listener: (user: typeof firebaseTeacher | null) => void) => {
        authListener = listener;
        return firebaseHarness.unsubscribe;
      },
    );
    firebaseHarness.getIdTokenResult.mockReturnValue(
      new Promise((resolve) => {
        resolveClaims = resolve;
      }),
    );
    const onUserChange = vi.fn();
    const onError = vi.fn();
    observeAuthState(onUserChange, onError);

    authListener?.(firebaseTeacher);
    authListener?.(null);
    resolveClaims?.({ claims: { role: 'teacher' } });
    await Promise.resolve();

    expect(onUserChange).toHaveBeenCalledOnce();
    expect(onUserChange).toHaveBeenCalledWith(null);
    expect(onError).not.toHaveBeenCalled();
  });
});
