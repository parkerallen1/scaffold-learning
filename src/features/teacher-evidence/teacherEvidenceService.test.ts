import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  syntheticAssignment,
  syntheticAttemptEvent,
  syntheticClassroom,
  syntheticIds,
  syntheticPublicQuestion,
  syntheticSession,
  syntheticStudentSafeIdentity,
  syntheticSupportEvent,
} from '@/lib/domain';

import { listTeacherStudentSessions, loadTeacherSessionEvidence } from './teacherEvidenceService';

const harness = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: { name: 'test-db' } }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...parts: unknown[]) => ({ kind: 'collection', parts })),
  doc: vi.fn((...parts: unknown[]) => ({ kind: 'doc', parts })),
  getDoc: harness.getDoc,
  getDocs: harness.getDocs,
  limit: vi.fn((count: number) => ({ count, type: 'limit' })),
  orderBy: vi.fn((field: string, direction?: string) => ({ direction, field })),
  query: vi.fn((base: unknown, ...constraints: unknown[]) => ({ base, constraints })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({ field, operator, value })),
}));

const snapshot = (id: string, data: unknown) => ({ data: () => data, exists: () => true, id });
const queryDoc = (id: string, data: unknown) => ({ data: () => data, id });
const identity = {
  classroomId: syntheticIds.classroomId,
  studentId: syntheticIds.studentId,
  teacherId: syntheticIds.teacherId,
};

describe('teacherEvidenceService', () => {
  beforeEach(() => {
    harness.getDoc.mockReset();
    harness.getDocs.mockReset();
  });

  it('lists strictly bound sessions with public assignment titles', async () => {
    harness.getDoc
      .mockResolvedValueOnce(snapshot(syntheticClassroom.id, syntheticClassroom))
      .mockResolvedValueOnce(
        snapshot(syntheticStudentSafeIdentity.id, syntheticStudentSafeIdentity),
      )
      .mockResolvedValueOnce(snapshot(syntheticAssignment.id, syntheticAssignment));
    harness.getDocs.mockResolvedValueOnce({
      docs: [queryDoc(syntheticSession.id, syntheticSession)],
    });

    await expect(listTeacherStudentSessions(identity)).resolves.toEqual([
      { assignmentTitle: syntheticAssignment.title, session: syntheticSession },
    ]);
  });

  it('loads only public questions and bound attempt and support events', async () => {
    harness.getDoc
      .mockResolvedValueOnce(snapshot(syntheticClassroom.id, syntheticClassroom))
      .mockResolvedValueOnce(
        snapshot(syntheticStudentSafeIdentity.id, syntheticStudentSafeIdentity),
      )
      .mockResolvedValueOnce(snapshot(syntheticSession.id, syntheticSession))
      .mockResolvedValueOnce(snapshot(syntheticAssignment.id, syntheticAssignment));
    harness.getDocs
      .mockResolvedValueOnce({
        docs: [queryDoc(syntheticPublicQuestion.id, syntheticPublicQuestion)],
      })
      .mockResolvedValueOnce({ docs: [queryDoc(syntheticAttemptEvent.id, syntheticAttemptEvent)] })
      .mockResolvedValueOnce({ docs: [queryDoc(syntheticSupportEvent.id, syntheticSupportEvent)] });

    const result = await loadTeacherSessionEvidence({
      ...identity,
      sessionId: syntheticSession.id,
    });

    expect(result).toEqual({
      assignment: syntheticAssignment,
      attempts: [syntheticAttemptEvent],
      eventsTruncated: false,
      questions: [syntheticPublicQuestion],
      session: syntheticSession,
      supportEvents: [syntheticSupportEvent],
    });
    expect(JSON.stringify(result)).not.toMatch(/answerKey|correctChoiceId/);
  });

  it('rejects a session event bound to another student', async () => {
    harness.getDoc
      .mockResolvedValueOnce(snapshot(syntheticClassroom.id, syntheticClassroom))
      .mockResolvedValueOnce(
        snapshot(syntheticStudentSafeIdentity.id, syntheticStudentSafeIdentity),
      )
      .mockResolvedValueOnce(snapshot(syntheticSession.id, syntheticSession))
      .mockResolvedValueOnce(snapshot(syntheticAssignment.id, syntheticAssignment));
    harness.getDocs
      .mockResolvedValueOnce({
        docs: [queryDoc(syntheticPublicQuestion.id, syntheticPublicQuestion)],
      })
      .mockResolvedValueOnce({
        docs: [
          queryDoc(syntheticAttemptEvent.id, {
            ...syntheticAttemptEvent,
            studentId: 'student_different_01',
          }),
        ],
      })
      .mockResolvedValueOnce({ docs: [] });

    await expect(
      loadTeacherSessionEvidence({ ...identity, sessionId: syntheticSession.id }),
    ).rejects.toThrow('Unable to load this student’s recorded work. Please try again.');
  });
});
