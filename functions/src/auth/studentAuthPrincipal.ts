import type { Auth } from 'firebase-admin/auth';

type StudentClaims = Readonly<Record<string, unknown>> & { studentId: string };
type StudentAuthService = Pick<Auth, 'createUser' | 'setCustomUserClaims'>;

const authErrorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;

export const applyStudentClaims = async (
  authService: StudentAuthService,
  claims: StudentClaims,
): Promise<void> => {
  try {
    await authService.setCustomUserClaims(claims.studentId, claims);
    return;
  } catch (error) {
    if (authErrorCode(error) !== 'auth/user-not-found') throw error;
  }

  try {
    await authService.createUser({ uid: claims.studentId, disabled: false });
  } catch (error) {
    // Two valid credential exchanges can race on first sign-in. The winner creates
    // the principal; the loser can safely continue and apply the same scoped claims.
    if (authErrorCode(error) !== 'auth/uid-already-exists') throw error;
  }

  await authService.setCustomUserClaims(claims.studentId, claims);
};
