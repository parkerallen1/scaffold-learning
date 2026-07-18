import { describe, expect, it } from 'vitest';

import {
  assignmentDraftSchema,
  assignmentIdSchema,
  classroomIdSchema,
  epochMillisSchema,
  studentIdSchema,
  studentSafeIdentitySchema,
  supportPlanIdSchema,
  supportPlanVersionSchema,
  teacherIdSchema,
} from '@quiz-master/domain';

import {
  AssignmentPersistenceError,
  assignmentRevisionIdSchema,
  assignPublishedAssignmentInputSchema,
  buildAssignmentTarget,
  materializeStoredAssignmentDraft,
  publishStoredAssignment,
} from './assignmentPersistenceCore.js';

const teacherId = teacherIdSchema.parse('teacher_demo_01');
const otherTeacherId = teacherIdSchema.parse('teacher_other_01');
const classroomId = classroomIdSchema.parse('classroom_demo_01');
const assignmentId = assignmentIdSchema.parse('assignment_demo_01');
const revisionId = assignmentRevisionIdSchema.parse('revision_demo_01');
const studentId = studentIdSchema.parse('student_demo_01');
const createdAt = epochMillisSchema.parse(1_000);

const draft = assignmentDraftSchema.parse({
  title: 'Number sense check',
  questions: [
    {
      id: 'question_numeric_01',
      questionType: 'numeric',
      prompt: 'What is 12 divided by 3?',
      expectedValue: 4,
      tolerance: 0,
      acceptedUnits: [],
      approvedHints: ['Think about equal groups.'],
    },
    {
      id: 'question_choice_01',
      questionType: 'multipleChoice',
      prompt: 'Which fraction equals one half?',
      choices: [
        { id: 'choice_one_01', label: '2/4' },
        { id: 'choice_two_01', label: '2/3' },
      ],
      correctChoiceId: 'choice_one_01',
      approvedHints: [],
    },
  ],
});

const storedDraft = () =>
  materializeStoredAssignmentDraft({
    draft,
    assignmentId,
    revisionId,
    classroomId,
    createdBy: teacherId,
    createdAt,
  });

describe('assignment draft materialization', () => {
  it('creates bounded public records and keeps answers only in the private key', () => {
    const result = storedDraft();
    const publicPayload = JSON.stringify({
      assignment: result.assignment,
      questions: result.publicQuestions,
      revision: result.revision,
    });

    expect(result.assignment).toMatchObject({
      id: assignmentId,
      status: 'draft',
      revision: 1,
      questionCount: 2,
      publishedAt: null,
    });
    expect(result.revision).toMatchObject({
      id: revisionId,
      assignmentId,
      status: 'draft',
      revision: 1,
    });
    expect(result.answerKey.questionKeys).toHaveLength(2);
    expect(publicPayload).not.toContain('expectedValue');
    expect(publicPayload).not.toContain('correctChoiceId');
    expect(result.answerKey.questionKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionId: 'question_numeric_01', expectedValue: 4 }),
        expect.objectContaining({
          questionId: 'question_choice_01',
          correctChoiceId: 'choice_one_01',
        }),
      ]),
    );
  });

  it('publishes exactly one matching draft transition', () => {
    const initial = storedDraft();
    const publishedAt = epochMillisSchema.parse(2_000);
    const published = publishStoredAssignment({ ...initial, publishedAt });

    expect(published.assignment).toMatchObject({ status: 'published', publishedAt });
    expect(published.revision).toMatchObject({ status: 'published', publishedAt });
    expect(() => publishStoredAssignment({ ...published, publishedAt })).toThrowError(
      AssignmentPersistenceError,
    );
    expect(() =>
      publishStoredAssignment({
        assignment: initial.assignment,
        revision: { ...initial.revision, revision: 2 },
        publishedAt,
      }),
    ).toThrowError(AssignmentPersistenceError);
  });
});

describe('assignment targeting', () => {
  const student = studentSafeIdentitySchema.parse({
    id: studentId,
    classroomId,
    displayName: 'Jordan',
    status: 'active',
    authVersion: 1,
    createdAt,
    updatedAt: createdAt,
  });
  const supportPlan = supportPlanVersionSchema.parse({
    id: supportPlanIdSchema.parse('support_plan_01'),
    classroomId,
    studentId,
    version: 2,
    supports: [],
    source: 'manual',
    approvedBy: teacherId,
    approvedAt: createdAt,
    supersedesId: supportPlanIdSchema.parse('support_plan_00'),
  });

  it('uses the collision-safe target helper and snapshots the active support plan', () => {
    const published = publishStoredAssignment({
      ...storedDraft(),
      publishedAt: epochMillisSchema.parse(2_000),
    });
    const target = buildAssignmentTarget({
      assignment: published.assignment,
      student,
      supportPlan,
      assignedBy: teacherId,
      assignedAt: epochMillisSchema.parse(3_000),
    });

    expect(target).toMatchObject({
      id: 'assignment_demo_01.student_demo_01',
      assignmentRevision: 1,
      supportPlanId: 'support_plan_01',
      supportPlanVersion: 2,
    });
  });

  it('rejects draft assignments and cross-teacher targeting', () => {
    expect(() =>
      buildAssignmentTarget({
        assignment: storedDraft().assignment,
        student,
        supportPlan,
        assignedBy: teacherId,
        assignedAt: createdAt,
      }),
    ).toThrowError(AssignmentPersistenceError);

    const published = publishStoredAssignment({
      ...storedDraft(),
      publishedAt: epochMillisSchema.parse(2_000),
    });
    expect(() =>
      buildAssignmentTarget({
        assignment: published.assignment,
        student,
        supportPlan,
        assignedBy: otherTeacherId,
        assignedAt: createdAt,
      }),
    ).toThrowError(AssignmentPersistenceError);
  });

  it('bounds the target list and rejects duplicate or unknown inputs', () => {
    expect(() =>
      assignPublishedAssignmentInputSchema.parse({
        classroomId,
        assignmentId,
        studentIds: [studentId, studentId],
      }),
    ).toThrow('Student IDs must be unique.');
    expect(() =>
      assignPublishedAssignmentInputSchema.parse({
        classroomId,
        assignmentId,
        studentIds: [studentId],
        overwritePublishedContent: true,
      }),
    ).toThrow();
  });
});
