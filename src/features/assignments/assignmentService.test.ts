import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentDraftSchema } from '@/lib/domain';

import {
  assignPublishedAssignment,
  createAssignmentDraft,
  publishAssignment,
} from './assignmentService';

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

const classroomId = 'classroom_demo_01';
const assignmentId = 'assignment_demo_01';
const revisionId = 'revision_demo_01';
const teacherId = 'teacher_demo_01';
const studentId = 'student_demo_01';

const draft = assignmentDraftSchema.parse({
  questions: [
    {
      acceptedUnits: [],
      approvedHints: ['Think about equal groups.'],
      expectedValue: 4,
      id: 'question_demo_01',
      prompt: 'What is 12 divided by 3?',
      questionType: 'numeric' as const,
      tolerance: 0,
    },
  ],
  title: 'Number sense check',
});

const publicAssignment = {
  classroomId,
  createdAt: 1_000,
  createdBy: teacherId,
  id: assignmentId,
  publishedAt: null,
  questionCount: 1,
  revision: 1,
  source: 'teacherAuthored' as const,
  status: 'draft' as const,
  title: draft.title,
};

const revision = {
  assignmentId,
  classroomId,
  createdAt: 1_000,
  createdBy: teacherId,
  id: revisionId,
  publishedAt: null,
  revision: 1,
  status: 'draft' as const,
};

const envelope = (data: Record<string, unknown>) => ({
  data: { ...data, claimsRefreshRequired: false },
});

describe('assignmentService', () => {
  beforeEach(() => {
    for (const callable of firebaseHarness.callables.values()) callable.mockReset();
  });

  it('strictly creates a server-identified draft without returning its answer key', async () => {
    firebaseHarness.callables
      .get('createAssignmentDraft')
      ?.mockResolvedValue(envelope({ assignment: publicAssignment, revision }));

    const result = await createAssignmentDraft({ classroomId, draft });

    expect(firebaseHarness.callables.get('createAssignmentDraft')).toHaveBeenCalledWith({
      classroomId,
      draft,
    });
    expect(result).toEqual({ assignment: publicAssignment, revision });
    expect(JSON.stringify(result)).not.toContain('expectedValue');
    expect(JSON.stringify(result)).not.toContain('answerKey');
  });

  it('validates the publication transition and every returned student target', async () => {
    const publishedAt = 2_000;
    const publishedAssignment = {
      ...publicAssignment,
      publishedAt,
      status: 'published' as const,
    };
    firebaseHarness.callables.get('publishAssignment')?.mockResolvedValue(
      envelope({
        assignment: publishedAssignment,
        revision: { ...revision, publishedAt, status: 'published' },
      }),
    );
    firebaseHarness.callables.get('assignPublishedAssignment')?.mockResolvedValue(
      envelope({
        assignment: publishedAssignment,
        targets: [
          {
            assignedAt: 3_000,
            assignedBy: teacherId,
            assignmentId,
            assignmentRevision: 1,
            classroomId,
            id: `${assignmentId}.${studentId}`,
            studentId,
            supportPlanId: 'support_plan_01',
            supportPlanVersion: 2,
          },
        ],
      }),
    );

    await expect(publishAssignment({ assignmentId, classroomId, revisionId })).resolves.toEqual(
      publishedAssignment,
    );
    await expect(
      assignPublishedAssignment({ assignmentId, classroomId, studentIds: [studentId] }),
    ).resolves.toMatchObject({
      assignment: publishedAssignment,
      targets: [{ studentId, supportPlanVersion: 2 }],
    });
  });

  it('converts malformed envelopes and mismatched targets to one safe error', async () => {
    firebaseHarness.callables
      .get('createAssignmentDraft')
      ?.mockResolvedValue(
        envelope({ assignment: publicAssignment, answerKey: { expectedValue: 4 }, revision }),
      );
    await expect(createAssignmentDraft({ classroomId, draft })).rejects.toThrow(
      'Unable to publish and assign this assignment. Please try again.',
    );

    firebaseHarness.callables.get('assignPublishedAssignment')?.mockResolvedValue(
      envelope({
        assignment: { ...publicAssignment, publishedAt: 2_000, status: 'published' },
        targets: [
          {
            assignedAt: 3_000,
            assignedBy: teacherId,
            assignmentId,
            assignmentRevision: 1,
            classroomId,
            id: `${assignmentId}.student_other_01`,
            studentId: 'student_other_01',
            supportPlanId: 'support_plan_01',
            supportPlanVersion: 2,
          },
        ],
      }),
    );
    await expect(
      assignPublishedAssignment({ assignmentId, classroomId, studentIds: [studentId] }),
    ).rejects.toThrow('Unable to publish and assign this assignment. Please try again.');
  });
});
