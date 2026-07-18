import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSupportPlanVersion,
  getStudentPlanningData,
  recommendStudentSupports,
} from './planningService';

const firebaseHarness = vi.hoisted(() => ({
  callables: new Map<string, ReturnType<typeof vi.fn>>(),
}));

vi.mock('@/lib/firebase', () => ({
  firebaseRuntime: { callableOptions: { limitedUseAppCheckTokens: true } },
  functions: { name: 'test-functions' },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => {
    const callable = vi.fn();
    firebaseHarness.callables.set(name, callable);
    return callable;
  }),
}));

const identity = { classroomId: 'classroom-1', studentId: 'student-1' };
const student = {
  authVersion: 1,
  classroomId: 'classroom-1',
  createdAt: 1,
  displayName: 'Alex Student',
  id: 'student-1',
  status: 'active',
  updatedAt: 1,
};
const plan = {
  approvedAt: 10,
  approvedBy: 'teacher-1',
  classroomId: 'classroom-1',
  id: 'plan-0001',
  source: 'manual',
  studentId: 'student-1',
  supersedesId: null,
  supports: [{ enabled: true, hideNonessentialChrome: true, supportKey: 'focusView' }],
  version: 1,
};

describe('planningService', () => {
  beforeEach(() => {
    for (const callable of firebaseHarness.callables.values()) callable.mockReset();
  });

  it('parses planning data and verifies that every record belongs to the requested student', async () => {
    firebaseHarness.callables.get('getStudentPlanningData')?.mockResolvedValue({
      data: {
        activePlan: plan,
        claimsRefreshRequired: false,
        historyTruncated: false,
        planHistory: [plan],
        profile: null,
        student,
      },
    });

    await expect(getStudentPlanningData(identity)).resolves.toMatchObject({
      activePlan: plan,
      planHistory: [plan],
      student,
    });

    firebaseHarness.callables.get('getStudentPlanningData')?.mockResolvedValueOnce({
      data: {
        activePlan: null,
        claimsRefreshRequired: false,
        historyTruncated: false,
        planHistory: [],
        profile: null,
        student: { ...student, classroomId: 'another-classroom' },
      },
    });
    await expect(getStudentPlanningData(identity)).rejects.toThrow(
      'Unable to update this student’s support plan. Please try again.',
    );
  });

  it('strictly parses the nested recommendation result', async () => {
    firebaseHarness.callables.get('recommendStudentSupports')?.mockResolvedValue({
      data: {
        claimsRefreshRequired: false,
        proposalId: 'proposal-1',
        recommendationResult: {
          promptVersion: 'support-recommendations-v1',
          provider: 'fake',
          recommendations: [
            {
              basedOn: ['The student asks for one direction at a time.'],
              cautions: [],
              confidence: 'medium',
              proposedSettings: {
                enabled: true,
                hideNonessentialChrome: true,
                supportKey: 'focusView',
              },
              rationale: 'A focused view may make the first step easier to find.',
              status: 'proposed',
              supportKey: 'focusView',
            },
          ],
        },
      },
    });

    await expect(recommendStudentSupports(identity)).resolves.toMatchObject({
      provider: 'fake',
      recommendations: [{ status: 'proposed', supportKey: 'focusView' }],
    });

    firebaseHarness.callables.get('recommendStudentSupports')?.mockResolvedValueOnce({
      data: {
        claimsRefreshRequired: false,
        proposalId: 'proposal-2',
        recommendationResult: { provider: 'unknown' },
      },
    });
    await expect(recommendStudentSupports(identity)).rejects.toThrow(
      'Unable to update this student’s support plan. Please try again.',
    );
  });

  it('rejects malformed plan writes instead of passing them through', async () => {
    firebaseHarness.callables.get('createSupportPlanVersion')?.mockResolvedValue({
      data: { claimsRefreshRequired: false, supportPlan: { ...plan, studentId: 'student-2' } },
    });

    await expect(
      createSupportPlanVersion({
        ...identity,
        supports: [{ enabled: true, hideNonessentialChrome: true, supportKey: 'focusView' }],
      }),
    ).rejects.toThrow('Unable to update this student’s support plan. Please try again.');
  });
});
