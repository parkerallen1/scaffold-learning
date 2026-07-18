import { describe, expect, it, vi } from 'vitest';

import { applyStudentClaims } from './studentAuthPrincipal.js';

const claims = Object.freeze({
  role: 'student',
  classroomId: 'classroom_demo_01',
  studentId: 'student_demo_01',
  authVersion: 1,
});

const authError = (code: string) => Object.assign(new Error(code), { code });

describe('applyStudentClaims', () => {
  it('updates an existing Firebase Auth principal without creating another user', async () => {
    const authService = {
      createUser: vi.fn(),
      setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    };

    await applyStudentClaims(authService, claims);

    expect(authService.createUser).not.toHaveBeenCalled();
    expect(authService.setCustomUserClaims).toHaveBeenCalledWith(claims.studentId, claims);
  });

  it('creates the missing principal before applying scoped claims', async () => {
    const authService = {
      createUser: vi.fn().mockResolvedValue({ uid: claims.studentId }),
      setCustomUserClaims: vi
        .fn()
        .mockRejectedValueOnce(authError('auth/user-not-found'))
        .mockResolvedValueOnce(undefined),
    };

    await applyStudentClaims(authService, claims);

    expect(authService.createUser).toHaveBeenCalledWith({
      uid: claims.studentId,
      disabled: false,
    });
    expect(authService.setCustomUserClaims).toHaveBeenCalledTimes(2);
  });

  it('recovers when another first sign-in creates the same principal concurrently', async () => {
    const authService = {
      createUser: vi.fn().mockRejectedValue(authError('auth/uid-already-exists')),
      setCustomUserClaims: vi
        .fn()
        .mockRejectedValueOnce(authError('auth/user-not-found'))
        .mockResolvedValueOnce(undefined),
    };

    await applyStudentClaims(authService, claims);

    expect(authService.setCustomUserClaims).toHaveBeenCalledTimes(2);
  });

  it('does not hide unexpected Firebase Auth errors', async () => {
    const failure = authError('auth/internal-error');
    const authService = {
      createUser: vi.fn(),
      setCustomUserClaims: vi.fn().mockRejectedValue(failure),
    };

    await expect(applyStudentClaims(authService, claims)).rejects.toBe(failure);
    expect(authService.createUser).not.toHaveBeenCalled();
  });
});
