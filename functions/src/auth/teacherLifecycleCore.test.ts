import { describe, expect, it } from 'vitest';

import { studentSafeIdentitySchema } from '@quiz-master/domain';

import {
  createStudentInputSchema,
  disableStudentIdentity,
  generateClassCode,
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

  it('accepts anonymous sign-in only in the emulator', () => {
    expect(requireTeacherPrincipal(teacherAuth('anonymous'), true)).toBe('teacher_demo_01');
    expect(() => requireTeacherPrincipal(teacherAuth('anonymous'), false)).toThrowError(
      TeacherAuthorizationError,
    );
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

  it('normalizes handles and rejects extra input fields', () => {
    expect(
      createStudentInputSchema.parse({
        classroomId: 'classroom_demo_01',
        displayName: ' Jordan ',
        studentHandle: ' Student_07 ',
      }),
    ).toEqual({
      classroomId: 'classroom_demo_01',
      displayName: 'Jordan',
      studentHandle: 'student_07',
    });
    expect(() =>
      createStudentInputSchema.parse({
        classroomId: 'classroom_demo_01',
        displayName: 'Jordan',
        studentHandle: 'student_07',
        pin: '123456',
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
