import { describe, expect, it } from 'vitest';

import { idempotencyKeySchema } from '@/lib/domain';

import {
  clearStudentDraft,
  clearStudentDraftsForStudent,
  readStudentDraft,
  writeStudentDraft,
} from './studentDraftStorage';

const studentId = 'student_demo_01';
const sessionId = 'session_demo_01';
const questionId = 'question_demo_01';

describe('studentDraftStorage', () => {
  it('round-trips a bounded answer and retry key without credential fields', () => {
    writeStudentDraft(studentId, sessionId, questionId, {
      answer: { kind: 'numeric', unit: 'cm', value: '12.5' },
      pendingSubmissionKey: idempotencyKeySchema.parse('attempt_storage_key_01'),
      updatedAt: 1_000,
      version: 1,
    });

    expect(readStudentDraft(studentId, sessionId, questionId)).toEqual({
      answer: { kind: 'numeric', unit: 'cm', value: '12.5' },
      pendingSubmissionKey: 'attempt_storage_key_01',
      updatedAt: 1_000,
      version: 1,
    });
    const stored = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.getItem(localStorage.key(index) ?? ''),
    ).join('');
    expect(stored).not.toMatch(/pin|classCode|studentHandle/i);
  });

  it('ignores malformed drafts and clears only the scoped question key', () => {
    localStorage.setItem(
      `scaffold-learning:student-draft:v1:${studentId}:${sessionId}:${questionId}`,
      JSON.stringify({ answer: { kind: 'numeric', value: '2' }, pin: '1234', version: 1 }),
    );
    expect(readStudentDraft(studentId, sessionId, questionId)).toBeNull();

    clearStudentDraft(studentId, sessionId, questionId);
    expect(localStorage.length).toBe(0);
  });

  it('removes only the signed-out student draft namespace', () => {
    localStorage.setItem(
      `scaffold-learning:student-draft:v1:${studentId}:${sessionId}:${questionId}`,
      'student draft',
    );
    localStorage.setItem(
      `scaffold-learning:student-draft:v1:student_other_01:${sessionId}:${questionId}`,
      'other draft',
    );

    clearStudentDraftsForStudent(studentId);

    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toContain('student_other_01');
  });
});
