import { describe, expect, it } from 'vitest';

import { studentSafeIdentitySchema } from '@quiz-master/domain';

import {
  BUILD_WEEK_STUDENT_PIN,
  createStudentInputSchema,
  disableStudentIdentity,
  generateBuildWeekClassCode,
  generateClassCode,
  generateStudentHandle,
  generateStudentPin,
  requireTeacherPrincipal,
  resetStudentIdentityAuth,
  teacherClaimNeedsRefresh,
  TeacherAuthorizationError,
} from './teacherLifecycleCore.js';

const teacherAuth = (provider: string) => ({
  uid: 'teacher_demo_01',
  token: { firebase: { sign_in_provider: provider } },
});

const activeStudent = studentSafeIdentitySchema.parse({
  id: 'student_demo_01',
  classroomId: 'classroom_demo_01',
  displayName: 'Jordan Demo',
  status: 'active',
  authVersion: 1,
  createdAt: 1_000,
  updatedAt: 1_000,
});

describe('teacher principal authorization', () => {
  it('accepts Google sign-in in production', () => {
    expect(requireTeacherPrincipal(teacherAuth('google.com'), false)).toBe('teacher_demo_01');
  });

  it('accepts anonymous demo sign-in in every environment', () => {
    expect(requireTeacherPrincipal(teacherAuth('anonymous'), true)).toBe('teacher_demo_01');
    expect(requireTeacherPrincipal(teacherAuth('anonymous'), false)).toBe('teacher_demo_01');
  });

  it('rejects missing auth and other providers', () => {
    expect(() => requireTeacherPrincipal(undefined, false)).toThrowError(TeacherAuthorizationError);
    expect(() => requireTeacherPrincipal(teacherAuth('password'), true)).toThrowError(
      TeacherAuthorizationError,
    );
  });

  it('refreshes missing or student-scoped teacher claims', () => {
    expect(teacherClaimNeedsRefresh({ role: 'teacher' })).toBe(false);
    expect(teacherClaimNeedsRefresh({})).toBe(true);
    expect(
      teacherClaimNeedsRefresh({
        role: 'teacher',
        classroomId: 'classroom_demo_01',
        studentId: 'student_demo_01',
        authVersion: 1,
      }),
    ).toBe(true);
  });
});

describe('generated student credentials', () => {
  it('generates an unambiguous grouped class code from an injected source', () => {
    expect(generateClassCode(() => 0)).toBe('2222-2222');
    expect(generateClassCode(() => 31)).toBe('ZZZZ-ZZZZ');
  });

  it('generates a fixed-width six-digit PIN', () => {
    expect(generateStudentPin(() => 0)).toBe('000000');
    expect(generateStudentPin(() => 999_999)).toBe('999999');
  });

  it('uses plain, predictable credentials for the Build Week emulator', () => {
    expect(generateBuildWeekClassCode(1)).toBe('DEMO-01');
    expect(generateBuildWeekClassCode(12)).toBe('DEMO-12');
    expect(BUILD_WEEK_STUDENT_PIN).toBe('1234');
    expect(() => generateBuildWeekClassCode(0)).toThrow();
  });

  it('generates lowercase handles from display names and suffixes collisions', () => {
    expect(generateStudentHandle('Alex Student')).toBe('alex_student');
    expect(generateStudentHandle('Alex Student', 2)).toBe('alex_student_2');
    expect(generateStudentHandle('  José   Niño  ')).toBe('jose_nino');
    expect(generateStudentHandle('A')).toBe('a_student');
    expect(generateStudentHandle('李')).toBe('student_student');
    expect(
      generateStudentHandle('A very long student display name that needs truncation', 12),
    ).toBe('a_very_long_student_display_n_12');
  });

  it('accepts display names and rejects caller-supplied handles or other extra fields', () => {
    expect(
      createStudentInputSchema.parse({
        classroomId: 'classroom_demo_01',
        displayName: ' Jordan ',
      }),
    ).toEqual({
      classroomId: 'classroom_demo_01',
      displayName: 'Jordan',
    });
    expect(() =>
      createStudentInputSchema.parse({
        classroomId: 'classroom_demo_01',
        displayName: 'Jordan',
        studentHandle: 'student_07',
      }),
    ).toThrow();
  });
});

describe('student auth-version lifecycle', () => {
  it('increments authVersion once when disabling a student', () => {
    const disabled = disableStudentIdentity(activeStudent, 2_000);
    expect(disabled).toMatchObject({ status: 'disabled', authVersion: 2, updatedAt: 2_000 });
    expect(disableStudentIdentity(disabled, 3_000)).toEqual(disabled);
  });

  it('increments authVersion on PIN reset and deliberately re-enables a disabled student', () => {
    expect(resetStudentIdentityAuth(activeStudent, 2_000)).toMatchObject({
      status: 'active',
      authVersion: 2,
      updatedAt: 2_000,
    });
    const disabled = disableStudentIdentity(activeStudent, 2_000);
    expect(resetStudentIdentityAuth(disabled, 3_000)).toMatchObject({
      status: 'active',
      authVersion: 3,
      updatedAt: 3_000,
    });
  });
});
