import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'demo-quiz-master';

const classroomPath = (classroomId: string) => `classrooms/${classroomId}`;
const studentPath = (classroomId: string, studentId: string) =>
  `${classroomPath(classroomId)}/students/${studentId}`;
const assignmentPath = (classroomId: string, assignmentId: string) =>
  `${classroomPath(classroomId)}/assignments/${assignmentId}`;

let testEnvironment: RulesTestEnvironment | undefined;

function emulatorAddress() {
  const [host = '127.0.0.1', port = '8080'] = (
    process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
  ).split(':');
  return { host, port: Number(port) };
}

function teacherDb(teacherId: string) {
  if (!testEnvironment) throw new Error('Rules test environment is not initialized');
  return testEnvironment.authenticatedContext(teacherId, { role: 'teacher' }).firestore();
}

function studentDb(
  studentId: string,
  claims: { classroomId?: string; studentId?: string; authVersion?: number } = {},
) {
  if (!testEnvironment) throw new Error('Rules test environment is not initialized');
  return testEnvironment
    .authenticatedContext(studentId, {
      role: 'student',
      classroomId: claims.classroomId ?? 'class-a',
      studentId: claims.studentId ?? studentId,
      authVersion: claims.authVersion ?? 1,
    })
    .firestore();
}

async function seedFirestore() {
  if (!testEnvironment) throw new Error('Rules test environment is not initialized');
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const documents: Array<[string, Record<string, unknown>]> = [
      ['teachers/teacher-a', { id: 'teacher-a', displayName: 'Teacher A' }],
      ['teachers/teacher-b', { id: 'teacher-b', displayName: 'Teacher B' }],
      [classroomPath('class-a'), { id: 'class-a', teacherId: 'teacher-a', status: 'active' }],
      [classroomPath('class-b'), { id: 'class-b', teacherId: 'teacher-b', status: 'active' }],
      [
        studentPath('class-a', 'student-a'),
        {
          id: 'student-a',
          classroomId: 'class-a',
          displayName: 'Student A',
          status: 'active',
          authVersion: 1,
        },
      ],
      [
        studentPath('class-a', 'student-b'),
        {
          id: 'student-b',
          classroomId: 'class-a',
          displayName: 'Student B',
          status: 'active',
          authVersion: 1,
        },
      ],
      [
        studentPath('class-b', 'student-c'),
        {
          id: 'student-c',
          classroomId: 'class-b',
          displayName: 'Student C',
          status: 'active',
          authVersion: 1,
        },
      ],
      [
        assignmentPath('class-a', 'assignment-a'),
        { id: 'assignment-a', classroomId: 'class-a', status: 'published', title: 'Targeted' },
      ],
      [
        assignmentPath('class-a', 'assignment-b'),
        { id: 'assignment-b', classroomId: 'class-a', status: 'published', title: 'Untargeted' },
      ],
      [
        assignmentPath('class-a', 'assignment-draft'),
        { id: 'assignment-draft', classroomId: 'class-a', status: 'draft', title: 'Draft' },
      ],
      [
        `${assignmentPath('class-a', 'assignment-a')}/questions/question-a`,
        { id: 'question-a', assignmentId: 'assignment-a', prompt: '2 + 2' },
      ],
      [
        `${assignmentPath('class-a', 'assignment-a')}/answerKeys/key-a`,
        { assignmentId: 'assignment-a', expectedValue: 4 },
      ],
      [
        `${classroomPath('class-a')}/assignmentTargets/assignment-a.student-a`,
        {
          id: 'assignment-a.student-a',
          classroomId: 'class-a',
          assignmentId: 'assignment-a',
          studentId: 'student-a',
        },
      ],
      [
        `${classroomPath('class-a')}/assignmentTargets/assignment-draft.student-a`,
        {
          id: 'assignment-draft.student-a',
          classroomId: 'class-a',
          assignmentId: 'assignment-draft',
          studentId: 'student-a',
        },
      ],
      [
        `${classroomPath('class-a')}/studentProfiles/profile-a`,
        {
          id: 'profile-a',
          classroomId: 'class-a',
          studentId: 'student-a',
          teacherSummary: 'Private',
        },
      ],
      [
        `${classroomPath('class-a')}/supportPlans/student-a`,
        {
          studentId: 'student-a',
          classroomId: 'class-a',
          activePlanId: 'plan-demo-01',
          activeVersion: 1,
        },
      ],
      [
        `${classroomPath('class-a')}/supportPlans/student-a/versions/plan-demo-01`,
        {
          id: 'plan-demo-01',
          studentId: 'student-a',
          classroomId: 'class-a',
          version: 1,
          supports: [],
        },
      ],
      [
        `${classroomPath('class-a')}/recommendations/recommendation-a`,
        { id: 'recommendation-a', studentId: 'student-a', rationale: 'Private' },
      ],
      [
        `${classroomPath('class-a')}/audits/audit-a`,
        { id: 'audit-a', studentId: 'student-a', result: 'Private' },
      ],
      [
        `${classroomPath('class-a')}/sessions/session-a`,
        { id: 'session-a', classroomId: 'class-a', studentId: 'student-a' },
      ],
      [
        `${classroomPath('class-a')}/sessions/session-b`,
        { id: 'session-b', classroomId: 'class-a', studentId: 'student-b' },
      ],
      [
        `${classroomPath('class-a')}/sessions/session-a/attemptEvents/event-a`,
        { id: 'event-a', sessionId: 'session-a', studentId: 'student-a', outcome: 'correct' },
      ],
    ];

    await Promise.all(documents.map(([path, data]) => setDoc(doc(db, path), data)));
  });
}

beforeAll(async () => {
  const rules = await readFile(resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const { host, port } = emulatorAddress();
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host, port, rules },
  });
});

beforeEach(async () => {
  if (!testEnvironment) throw new Error('Rules test environment is not initialized');
  await testEnvironment.clearFirestore();
  await seedFirestore();
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe('Firestore authorization boundary', () => {
  it('allows owning-teacher reads, denies cross-class access, and reserves lifecycle writes for callables', async () => {
    const owner = teacherDb('teacher-a');
    const otherTeacher = teacherDb('teacher-b');

    await assertSucceeds(getDoc(doc(owner, classroomPath('class-a'))));
    await assertFails(
      updateDoc(doc(owner, studentPath('class-a', 'student-a')), { displayName: 'Updated' }),
    );
    await assertFails(getDoc(doc(otherTeacher, classroomPath('class-a'))));
    await assertFails(
      updateDoc(doc(otherTeacher, studentPath('class-a', 'student-a')), {
        displayName: 'Forged update',
      }),
    );
  });

  it('limits a student to their safe identity and targeted published content', async () => {
    const student = studentDb('student-a');

    await assertSucceeds(getDoc(doc(student, classroomPath('class-a'))));
    await assertSucceeds(getDoc(doc(student, studentPath('class-a', 'student-a'))));
    await assertFails(getDoc(doc(student, studentPath('class-a', 'student-b'))));
    await assertSucceeds(getDoc(doc(student, assignmentPath('class-a', 'assignment-a'))));
    await assertSucceeds(
      getDocs(collection(student, `${assignmentPath('class-a', 'assignment-a')}/questions`)),
    );
    await assertFails(getDoc(doc(student, assignmentPath('class-a', 'assignment-b'))));
    await assertFails(getDoc(doc(student, assignmentPath('class-a', 'assignment-draft'))));
  });

  it('hides teacher-only records and all answer-key documents from students', async () => {
    const student = studentDb('student-a');
    const teacher = teacherDb('teacher-a');

    await assertFails(
      getDoc(doc(student, `${classroomPath('class-a')}/studentProfiles/profile-a`)),
    );
    await assertFails(
      getDoc(doc(student, `${classroomPath('class-a')}/recommendations/recommendation-a`)),
    );
    await assertFails(getDoc(doc(student, `${classroomPath('class-a')}/audits/audit-a`)));
    await assertFails(getDoc(doc(student, `${classroomPath('class-a')}/supportPlans/student-a`)));
    await assertFails(
      getDoc(doc(student, `${assignmentPath('class-a', 'assignment-a')}/answerKeys/key-a`)),
    );

    await assertSucceeds(
      getDoc(doc(teacher, `${classroomPath('class-a')}/studentProfiles/profile-a`)),
    );
    await assertSucceeds(
      getDoc(doc(teacher, `${classroomPath('class-a')}/recommendations/recommendation-a`)),
    );
    await assertSucceeds(getDoc(doc(teacher, `${classroomPath('class-a')}/audits/audit-a`)));
    await assertSucceeds(
      getDoc(doc(teacher, `${classroomPath('class-a')}/supportPlans/student-a`)),
    );
    await assertSucceeds(
      getDoc(
        doc(teacher, `${classroomPath('class-a')}/supportPlans/student-a/versions/plan-demo-01`),
      ),
    );
    await assertFails(
      getDoc(doc(teacher, `${assignmentPath('class-a', 'assignment-a')}/answerKeys/key-a`)),
    );
  });

  it('reserves profiles and support-plan history writes for server callables', async () => {
    const teacher = teacherDb('teacher-a');

    await assertFails(
      updateDoc(doc(teacher, `${classroomPath('class-a')}/studentProfiles/profile-a`), {
        teacherSummary: 'Direct client edit',
      }),
    );
    await assertFails(
      setDoc(
        doc(teacher, `${classroomPath('class-a')}/supportPlans/student-a/versions/plan-demo-02`),
        {
          id: 'plan-demo-02',
          classroomId: 'class-a',
          studentId: 'student-a',
          version: 2,
          supports: [],
        },
      ),
    );
  });

  it('rejects forged classroom and student claims', async () => {
    const forgedStudentId = studentDb('student-a', { studentId: 'student-b' });
    const forgedClassroom = studentDb('student-a', { classroomId: 'class-b' });

    await assertFails(getDoc(doc(forgedStudentId, classroomPath('class-a'))));
    await assertFails(getDoc(doc(forgedClassroom, classroomPath('class-a'))));
  });

  it('rejects stale student tokens after authVersion changes', async () => {
    if (!testEnvironment) throw new Error('Rules test environment is not initialized');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), studentPath('class-a', 'student-a')), {
        authVersion: 2,
      });
    });

    await assertFails(getDoc(doc(studentDb('student-a'), classroomPath('class-a'))));
    await assertSucceeds(
      getDoc(doc(studentDb('student-a', { authVersion: 2 }), studentPath('class-a', 'student-a'))),
    );
  });

  it('rejects existing student tokens after the classroom is archived', async () => {
    if (!testEnvironment) throw new Error('Rules test environment is not initialized');
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), classroomPath('class-a')), {
        status: 'archived',
      });
    });

    await assertFails(getDoc(doc(studentDb('student-a'), classroomPath('class-a'))));
    await assertFails(
      getDoc(doc(studentDb('student-a'), assignmentPath('class-a', 'assignment-a'))),
    );
  });

  it('requires student list queries to prove their resource scope', async () => {
    const student = studentDb('student-a');
    const targets = collection(student, `${classroomPath('class-a')}/assignmentTargets`);
    const sessions = collection(student, `${classroomPath('class-a')}/sessions`);

    await assertFails(getDocs(targets));
    await assertSucceeds(getDocs(query(targets, where('studentId', '==', 'student-a'))));
    await assertFails(getDocs(sessions));
    await assertSucceeds(getDocs(query(sessions, where('studentId', '==', 'student-a'))));
    await assertFails(getDocs(collection(student, `${classroomPath('class-a')}/assignments`)));
  });

  it('requires teacher classroom list queries to constrain ownership', async () => {
    const teacher = teacherDb('teacher-a');
    const classrooms = collection(teacher, 'classrooms');

    await assertFails(getDocs(classrooms));
    await assertSucceeds(getDocs(query(classrooms, where('teacherId', '==', 'teacher-a'))));
  });

  it('allows scoped canonical reads but denies all direct session and event writes', async () => {
    const student = studentDb('student-a');
    const teacher = teacherDb('teacher-a');
    const sessionA = `${classroomPath('class-a')}/sessions/session-a`;
    const sessionB = `${classroomPath('class-a')}/sessions/session-b`;
    const eventA = `${sessionA}/attemptEvents/event-a`;

    await assertSucceeds(getDoc(doc(student, sessionA)));
    await assertFails(getDoc(doc(student, sessionB)));
    await assertSucceeds(getDoc(doc(student, eventA)));
    await assertSucceeds(getDoc(doc(teacher, eventA)));

    await assertFails(
      setDoc(doc(student, `${classroomPath('class-a')}/sessions/session-new`), {
        id: 'session-new',
        classroomId: 'class-a',
        studentId: 'student-a',
      }),
    );
    await assertFails(
      setDoc(doc(teacher, `${sessionA}/attemptEvents/event-forged`), {
        id: 'event-forged',
        sessionId: 'session-a',
        studentId: 'student-a',
      }),
    );
  });
});
