import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assignmentTargetSchema,
  publicAssignmentSchema,
  publicQuestionSchema,
  sessionStateSchema,
  supportPlanVersionSchema,
} from '@/lib/domain';

import {
  listStudentAssignmentQuestions,
  listStudentAssignments,
  startOrResumeStudentSession,
  submitStudentAttempt,
} from './studentWorkService';

const harness = vi.hoisted(() => ({
  callables: new Map<string, ReturnType<typeof vi.fn>>(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  firebaseRuntime: { callableOptions: { limitedUseAppCheckTokens: true } },
  functions: { name: 'test-functions' },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => {
    const callable = vi.fn();
    harness.callables.set(name, callable);
    return callable;
  }),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...parts: unknown[]) => ({ kind: 'collection', parts })),
  doc: vi.fn((...parts: unknown[]) => ({ kind: 'doc', parts })),
  getDoc: harness.getDoc,
  getDocs: harness.getDocs,
  orderBy: vi.fn((field: string, direction: string) => ({ direction, field })),
  query: vi.fn((base: unknown, ...constraints: unknown[]) => ({ base, constraints })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({ field, operator, value })),
}));

const classroomId = 'classroom_demo_01';
const studentId = 'student_demo_01';
const teacherId = 'teacher_demo_01';
const assignmentId = 'assignment_demo_01';
const questionId = 'question_demo_01';
const target = assignmentTargetSchema.parse({
  assignedAt: 2_000,
  assignedBy: teacherId,
  assignmentId,
  assignmentRevision: 1,
  classroomId,
  id: `${assignmentId}.${studentId}`,
  studentId,
  supportPlanId: 'support_plan_01',
  supportPlanVersion: 1,
});
const assignment = publicAssignmentSchema.parse({
  classroomId,
  createdAt: 1_000,
  createdBy: teacherId,
  id: assignmentId,
  publishedAt: 1_500,
  questionCount: 1,
  revision: 1,
  source: 'teacherAuthored',
  status: 'published',
  title: 'Number check',
});
const question = publicQuestionSchema.parse({
  approvedHints: ['Think about equal groups.'],
  assignmentId,
  id: questionId,
  order: 0,
  prompt: 'What is 12 divided by 3?',
  questionType: 'numeric',
});
const session = sessionStateSchema.parse({
  assignmentId,
  assignmentRevision: 1,
  classroomId,
  completedAt: null,
  currentQuestionId: questionId,
  id: 'session_demo_01',
  startedAt: 3_000,
  status: 'inProgress',
  studentId,
  supportPlanId: target.supportPlanId,
  supportPlanVersion: 1,
  targetId: target.id,
  updatedAt: 3_000,
});
const supportPlan = supportPlanVersionSchema.parse({
  approvedAt: 1_200,
  approvedBy: teacherId,
  classroomId,
  id: target.supportPlanId,
  source: 'manual',
  studentId,
  supersedesId: null,
  supports: [
    { enabled: true, speed: 1, supportKey: 'readAloud' },
    { allowAnalogousExample: true, enabled: true, maxTier: 2, supportKey: 'hintLadder' },
  ],
  version: 1,
});

const queryDoc = (id: string, data: unknown) => ({ data: () => data, id });

describe('studentWorkService', () => {
  beforeEach(() => {
    harness.getDoc.mockReset();
    harness.getDocs.mockReset();
    for (const callable of harness.callables.values()) callable.mockReset();
  });

  it('lists only a strictly matching published assignment target and ordered questions', async () => {
    harness.getDocs
      .mockResolvedValueOnce({ docs: [queryDoc(target.id, target)] })
      .mockResolvedValueOnce({ docs: [queryDoc(question.id, question)] });
    harness.getDoc.mockResolvedValueOnce({
      data: () => assignment,
      exists: () => true,
      id: assignment.id,
    });

    const assignments = await listStudentAssignments(classroomId, studentId);
    expect(assignments).toEqual([{ assignment, target }]);
    await expect(listStudentAssignmentQuestions(assignments[0]!)).resolves.toEqual([question]);
  });

  it('strictly binds the callable session and returned plan to the selected target', async () => {
    harness.callables.get('startOrResumeStudentSession')?.mockResolvedValue({
      data: { resumed: false, session, supportPlan },
    });

    await expect(startOrResumeStudentSession(target)).resolves.toEqual({
      resumed: false,
      session,
      supportPlan,
    });
    expect(harness.callables.get('startOrResumeStudentSession')).toHaveBeenCalledWith({
      targetId: target.id,
    });

    harness.callables.get('startOrResumeStudentSession')?.mockResolvedValue({
      data: { answerKey: { expectedValue: 4 }, resumed: false, session, supportPlan },
    });
    await expect(startOrResumeStudentSession(target)).rejects.toThrow(
      'Unable to save your work. Check your connection and try again.',
    );
  });

  it('validates a canonical attempt response without exposing an answer key', async () => {
    const request = {
      activeSupports: ['readAloud' as const],
      clientOccurredAt: 4_000,
      elapsedMs: 1_000,
      idempotencyKey: 'attempt_service_key_01',
      questionId,
      sessionId: session.id,
      submittedAnswer: { kind: 'numeric' as const, value: 4 },
    };
    const event = {
      activeSupports: request.activeSupports,
      attemptNumber: 1,
      clientOccurredAt: 4_000,
      createdAt: 4_100,
      elapsedMs: 1_000,
      id: 'event_service_01',
      idempotencyKey: request.idempotencyKey,
      outcome: 'correct',
      questionId,
      sessionId: session.id,
      studentId,
      submittedAnswer: request.submittedAnswer,
    };
    harness.callables.get('submitStudentAttempt')?.mockResolvedValue({
      data: { duplicate: false, event, session },
    });

    const result = await submitStudentAttempt(request);
    expect(result.event.outcome).toBe('correct');
    expect(JSON.stringify(result)).not.toMatch(/answerKey|expectedValue/);
  });
});
