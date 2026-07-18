import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import {
  attemptEventSchema,
  classroomIdSchema,
  classroomSchema,
  publicAssignmentSchema,
  publicQuestionSchema,
  sessionIdSchema,
  sessionStateSchema,
  studentIdSchema,
  studentSafeIdentitySchema,
  supportEventSchema,
  teacherIdSchema,
  type AttemptEvent,
  type PublicAssignment,
  type PublicQuestion,
  type SessionState,
  type SupportEvent,
} from '@/lib/domain';
import { db } from '@/lib/firebase';

const LOAD_ERROR = 'Unable to load this student’s recorded work. Please try again.';
export const MAX_TEACHER_SESSIONS = 20;
export const MAX_SESSION_EVENTS = 200;

export type TeacherSessionSummary = Readonly<{
  assignmentTitle: string;
  session: SessionState;
}>;

export type TeacherSessionEvidence = Readonly<{
  assignment: PublicAssignment;
  attempts: readonly AttemptEvent[];
  eventsTruncated: boolean;
  questions: readonly PublicQuestion[];
  session: SessionState;
  supportEvents: readonly SupportEvent[];
}>;

type TeacherStudentIdentity = Readonly<{
  classroomId: string;
  studentId: string;
  teacherId: string;
}>;

const parseSnapshot = <Output>(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  schema: { parse: (input: unknown) => Output },
): Output => {
  const parsed = schema.parse(snapshot.data());
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('id' in parsed) ||
    parsed.id !== snapshot.id
  ) {
    throw new Error(LOAD_ERROR);
  }
  return parsed;
};

const parseIdentity = (raw: TeacherStudentIdentity) => ({
  classroomId: classroomIdSchema.parse(raw.classroomId),
  studentId: studentIdSchema.parse(raw.studentId),
  teacherId: teacherIdSchema.parse(raw.teacherId),
});

const assertTeacherStudentBinding = async (identity: ReturnType<typeof parseIdentity>) => {
  const [classroomSnapshot, studentSnapshot] = await Promise.all([
    getDoc(doc(db, 'classrooms', identity.classroomId)),
    getDoc(doc(db, 'classrooms', identity.classroomId, 'students', identity.studentId)),
  ]);
  if (!classroomSnapshot.exists() || !studentSnapshot.exists()) throw new Error(LOAD_ERROR);

  const classroom = classroomSchema.parse(classroomSnapshot.data());
  const student = studentSafeIdentitySchema.parse(studentSnapshot.data());
  if (
    classroomSnapshot.id !== classroom.id ||
    classroom.id !== identity.classroomId ||
    classroom.teacherId !== identity.teacherId ||
    studentSnapshot.id !== student.id ||
    student.id !== identity.studentId ||
    student.classroomId !== identity.classroomId
  ) {
    throw new Error(LOAD_ERROR);
  }
};

const safely = async <Result>(action: () => Promise<Result>): Promise<Result> => {
  try {
    return await action();
  } catch {
    throw new Error(LOAD_ERROR);
  }
};

export const listTeacherStudentSessions = (
  rawIdentity: TeacherStudentIdentity,
): Promise<readonly TeacherSessionSummary[]> =>
  safely(async () => {
    const identity = parseIdentity(rawIdentity);
    await assertTeacherStudentBinding(identity);
    const sessionSnapshot = await getDocs(
      query(
        collection(db, 'classrooms', identity.classroomId, 'sessions'),
        where('studentId', '==', identity.studentId),
        orderBy('updatedAt', 'desc'),
        limit(MAX_TEACHER_SESSIONS),
      ),
    );
    const sessions = sessionSnapshot.docs.map((snapshot) =>
      parseSnapshot(snapshot, sessionStateSchema),
    );
    if (
      sessions.some(
        (session) =>
          session.classroomId !== identity.classroomId || session.studentId !== identity.studentId,
      )
    ) {
      throw new Error(LOAD_ERROR);
    }

    const summaries = await Promise.all(
      sessions.map(async (session) => {
        const assignmentSnapshot = await getDoc(
          doc(db, 'classrooms', identity.classroomId, 'assignments', session.assignmentId),
        );
        if (!assignmentSnapshot.exists()) throw new Error(LOAD_ERROR);
        const assignment = publicAssignmentSchema.parse(assignmentSnapshot.data());
        if (
          assignmentSnapshot.id !== assignment.id ||
          assignment.id !== session.assignmentId ||
          assignment.classroomId !== identity.classroomId ||
          assignment.revision !== session.assignmentRevision
        ) {
          throw new Error(LOAD_ERROR);
        }
        return Object.freeze({ assignmentTitle: assignment.title, session });
      }),
    );
    return Object.freeze(summaries);
  });

export const loadTeacherSessionEvidence = (
  rawIdentity: TeacherStudentIdentity & { sessionId: string },
): Promise<TeacherSessionEvidence> =>
  safely(async () => {
    const identity = parseIdentity(rawIdentity);
    const sessionId = sessionIdSchema.parse(rawIdentity.sessionId);
    await assertTeacherStudentBinding(identity);

    const sessionSnapshot = await getDoc(
      doc(db, 'classrooms', identity.classroomId, 'sessions', sessionId),
    );
    if (!sessionSnapshot.exists()) throw new Error(LOAD_ERROR);
    const session = sessionStateSchema.parse(sessionSnapshot.data());
    if (
      sessionSnapshot.id !== session.id ||
      session.id !== sessionId ||
      session.classroomId !== identity.classroomId ||
      session.studentId !== identity.studentId
    ) {
      throw new Error(LOAD_ERROR);
    }

    const [assignmentSnapshot, questionsSnapshot, attemptsSnapshot, supportsSnapshot] =
      await Promise.all([
        getDoc(doc(db, 'classrooms', identity.classroomId, 'assignments', session.assignmentId)),
        getDocs(
          query(
            collection(
              db,
              'classrooms',
              identity.classroomId,
              'assignments',
              session.assignmentId,
              'questions',
            ),
            orderBy('order', 'asc'),
            limit(50),
          ),
        ),
        getDocs(
          query(
            collection(
              db,
              'classrooms',
              identity.classroomId,
              'sessions',
              session.id,
              'attemptEvents',
            ),
            orderBy('createdAt', 'asc'),
            limit(MAX_SESSION_EVENTS + 1),
          ),
        ),
        getDocs(
          query(
            collection(
              db,
              'classrooms',
              identity.classroomId,
              'sessions',
              session.id,
              'supportEvents',
            ),
            orderBy('createdAt', 'asc'),
            limit(MAX_SESSION_EVENTS + 1),
          ),
        ),
      ]);

    if (!assignmentSnapshot.exists()) throw new Error(LOAD_ERROR);
    const assignment = publicAssignmentSchema.parse(assignmentSnapshot.data());
    const questions = questionsSnapshot.docs.map((snapshot) =>
      parseSnapshot(snapshot, publicQuestionSchema),
    );
    const allAttempts = attemptsSnapshot.docs.map((snapshot) =>
      parseSnapshot(snapshot, attemptEventSchema),
    );
    const allSupportEvents = supportsSnapshot.docs.map((snapshot) =>
      parseSnapshot(snapshot, supportEventSchema),
    );
    const questionIds = new Set(questions.map(({ id }) => id));

    if (
      assignmentSnapshot.id !== assignment.id ||
      assignment.id !== session.assignmentId ||
      assignment.classroomId !== identity.classroomId ||
      assignment.revision !== session.assignmentRevision ||
      questions.length !== assignment.questionCount ||
      questions.some(
        (question, index) => question.assignmentId !== assignment.id || question.order !== index,
      ) ||
      allAttempts.some(
        (attempt) =>
          attempt.sessionId !== session.id ||
          attempt.studentId !== identity.studentId ||
          !questionIds.has(attempt.questionId),
      ) ||
      allSupportEvents.some(
        (event) =>
          event.sessionId !== session.id ||
          event.studentId !== identity.studentId ||
          (event.questionId !== null && !questionIds.has(event.questionId)),
      )
    ) {
      throw new Error(LOAD_ERROR);
    }

    return Object.freeze({
      assignment,
      attempts: Object.freeze(allAttempts.slice(0, MAX_SESSION_EVENTS)),
      eventsTruncated:
        allAttempts.length > MAX_SESSION_EVENTS || allSupportEvents.length > MAX_SESSION_EVENTS,
      questions: Object.freeze(questions),
      session,
      supportEvents: Object.freeze(allSupportEvents.slice(0, MAX_SESSION_EVENTS)),
    });
  });
