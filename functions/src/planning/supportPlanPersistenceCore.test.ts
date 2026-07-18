import { describe, expect, it } from 'vitest';

import {
  classroomIdSchema,
  classroomSchema,
  studentIdSchema,
  studentSafeIdentitySchema,
  supportPlanIdSchema,
  supportPlanVersionSchema,
  teacherIdSchema,
} from '@quiz-master/domain';

import {
  activePointerFor,
  assertActivePointerMatches,
  assertOwnedStudent,
  buildRevertedSupportPlanVersion,
  buildSupportPlanVersion,
  createSupportPlanInputSchema,
  PlanningOwnershipError,
  SupportPlanTransitionError,
} from './supportPlanPersistenceCore.js';

const teacherId = teacherIdSchema.parse('teacher_demo_01');
const otherTeacherId = teacherIdSchema.parse('teacher_other_01');
const classroomId = classroomIdSchema.parse('classroom_demo_01');
const otherClassroomId = classroomIdSchema.parse('classroom_other_01');
const studentId = studentIdSchema.parse('student_demo_01');
const otherStudentId = studentIdSchema.parse('student_other_01');
const planId1 = supportPlanIdSchema.parse('support_plan_01');
const planId2 = supportPlanIdSchema.parse('support_plan_02');
const planId3 = supportPlanIdSchema.parse('support_plan_03');

const classroom = classroomSchema.parse({
  id: classroomId,
  teacherId,
  name: 'Learning Lab',
  status: 'active',
  createdAt: 1_000,
  updatedAt: 1_000,
});

const student = studentSafeIdentitySchema.parse({
  id: studentId,
  classroomId,
  displayName: 'Jordan',
  status: 'active',
  authVersion: 1,
  createdAt: 1_000,
  updatedAt: 1_000,
});

const readAloud = { supportKey: 'readAloud', enabled: true, speed: 1 } as const;
const focusView = {
  supportKey: 'focusView',
  enabled: true,
  hideNonessentialChrome: true,
} as const;

const initialPlan = () =>
  buildSupportPlanVersion({
    id: planId1,
    classroomId,
    studentId,
    previous: null,
    supports: [readAloud],
    source: 'manual',
    approvedBy: teacherId,
    approvedAt: 2_000,
  });

describe('support-plan version construction', () => {
  it('creates monotonic immutable versions and advances the active pointer', () => {
    const first = initialPlan();
    const second = buildSupportPlanVersion({
      id: planId2,
      classroomId,
      studentId,
      previous: first,
      supports: [focusView],
      source: 'manual',
      approvedBy: teacherId,
      approvedAt: 3_000,
    });
    const pointer = activePointerFor(second, 3_000);

    expect(first).toMatchObject({ version: 1, supersedesId: null });
    expect(second).toMatchObject({ version: 2, supersedesId: first.id });
    expect(pointer).toEqual({
      classroomId,
      studentId,
      activePlanId: second.id,
      activeVersion: 2,
      updatedAt: 3_000,
    });
    expect(() => assertActivePointerMatches(pointer, second)).not.toThrow();
  });

  it('rejects duplicate support keys and unknown settings', () => {
    expect(() =>
      createSupportPlanInputSchema.parse({
        classroomId,
        studentId,
        supports: [readAloud, readAloud],
      }),
    ).toThrow('Support keys must be unique.');
    expect(() =>
      createSupportPlanInputSchema.parse({
        classroomId,
        studentId,
        supports: [{ ...readAloud, automaticPlayback: true }],
      }),
    ).toThrow();
  });

  it('rejects a pointer that does not exactly identify its version', () => {
    const first = initialPlan();
    const pointer = activePointerFor(first, 2_000);
    expect(() => assertActivePointerMatches({ ...pointer, activeVersion: 2 }, first)).toThrowError(
      SupportPlanTransitionError,
    );
  });
});

describe('planning ownership', () => {
  it('requires the classroom teacher and matching active student', () => {
    expect(() => assertOwnedStudent(classroom, student, teacherId)).not.toThrow();
    expect(() => assertOwnedStudent(classroom, student, otherTeacherId)).toThrowError(
      PlanningOwnershipError,
    );
    expect(() =>
      assertOwnedStudent(
        classroom,
        studentSafeIdentitySchema.parse({ ...student, classroomId: otherClassroomId }),
        teacherId,
      ),
    ).toThrowError(PlanningOwnershipError);
  });
});

describe('support-plan revert semantics', () => {
  it('copies prior settings into a new version that supersedes the current plan', () => {
    const first = initialPlan();
    const current = buildSupportPlanVersion({
      id: planId2,
      classroomId,
      studentId,
      previous: first,
      supports: [focusView],
      source: 'manual',
      approvedBy: teacherId,
      approvedAt: 3_000,
    });
    const reverted = buildRevertedSupportPlanVersion({
      id: planId3,
      current,
      prior: first,
      approvedBy: teacherId,
      approvedAt: 4_000,
    });

    expect(reverted).toMatchObject({
      version: 3,
      source: 'revert',
      supersedesId: current.id,
      supports: first.supports,
      approvedBy: teacherId,
      approvedAt: 4_000,
    });
    expect(current.supports).toEqual([focusView]);
  });

  it('rejects the current plan and foreign history as revert targets', () => {
    const current = initialPlan();
    expect(() =>
      buildRevertedSupportPlanVersion({
        id: planId2,
        current,
        prior: current,
        approvedBy: teacherId,
        approvedAt: 3_000,
      }),
    ).toThrowError(SupportPlanTransitionError);

    const foreign = supportPlanVersionSchema.parse({
      ...current,
      id: supportPlanIdSchema.parse('support_other_01'),
      studentId: otherStudentId,
    });
    expect(() =>
      buildRevertedSupportPlanVersion({
        id: planId2,
        current,
        prior: foreign,
        approvedBy: teacherId,
        approvedAt: 3_000,
      }),
    ).toThrowError(SupportPlanTransitionError);
  });
});
