import {
  collection,
  onSnapshot,
  query,
  where,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import {
  classroomSchema,
  studentSafeIdentitySchema,
  type Classroom,
  type StudentSafeIdentity,
} from '@/lib/domain';
import { db, firebaseRuntime, functions } from '@/lib/firebase';

type ClassroomActionInput = { classroomId: string };
type StudentActionInput = ClassroomActionInput & { studentId: string };
type CallableEnvelope = { claimsRefreshRequired: boolean };

type CreateClassroomResponse = CallableEnvelope & {
  classroom: Classroom;
  classCode: string;
};

type RotateClassCodeResponse = CallableEnvelope & {
  classroomId: string;
  classCode: string;
};

type CreateStudentResponse = CallableEnvelope & {
  oneTimePin: string;
  student: StudentSafeIdentity;
  studentHandle: string;
};

type StudentResponse = CallableEnvelope & { student: StudentSafeIdentity };
type ResetPinResponse = StudentResponse & { oneTimePin: string };
type ClassroomResponse = CallableEnvelope & { classroom: Classroom };

const createClassroomCallable = httpsCallable<{ name: string }, CreateClassroomResponse>(
  functions,
  'createClassroom',
  firebaseRuntime.callableOptions,
);
const archiveClassroomCallable = httpsCallable<ClassroomActionInput, ClassroomResponse>(
  functions,
  'archiveClassroom',
  firebaseRuntime.callableOptions,
);
const rotateClassCodeCallable = httpsCallable<ClassroomActionInput, RotateClassCodeResponse>(
  functions,
  'rotateClassCode',
  firebaseRuntime.callableOptions,
);
const createStudentCallable = httpsCallable<
  ClassroomActionInput & { displayName: string },
  CreateStudentResponse
>(functions, 'createStudent', firebaseRuntime.callableOptions);
const disableStudentCallable = httpsCallable<StudentActionInput, StudentResponse>(
  functions,
  'disableStudent',
  firebaseRuntime.callableOptions,
);
const resetStudentPinCallable = httpsCallable<StudentActionInput, ResetPinResponse>(
  functions,
  'resetStudentPin',
  firebaseRuntime.callableOptions,
);

const LOAD_CLASSROOMS_ERROR = 'Unable to load classrooms. Please try again.';
const LOAD_STUDENTS_ERROR = 'Unable to load students. Please try again.';
const ACTION_ERROR = 'Unable to complete that action. Please try again.';

const nonEmptySecret = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(ACTION_ERROR);
  return value;
};

const parseClassrooms = (snapshot: QuerySnapshot<DocumentData>, teacherId: string): Classroom[] =>
  snapshot.docs
    .map((document) => classroomSchema.parse(document.data()))
    .map((classroom) => {
      if (classroom.teacherId !== teacherId) throw new Error(LOAD_CLASSROOMS_ERROR);
      return classroom;
    })
    .sort((left, right) => left.createdAt - right.createdAt);

const parseStudents = (
  snapshot: QuerySnapshot<DocumentData>,
  classroomId: string,
): StudentSafeIdentity[] =>
  snapshot.docs
    .map((document) => studentSafeIdentitySchema.parse(document.data()))
    .map((student) => {
      if (student.classroomId !== classroomId) throw new Error(LOAD_STUDENTS_ERROR);
      return student;
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

export const watchOwnedClassrooms = (
  teacherId: string,
  onChange: (classrooms: Classroom[]) => void,
  onError: (error: Error) => void,
): (() => void) => {
  const ownedClassrooms = query(collection(db, 'classrooms'), where('teacherId', '==', teacherId));
  return onSnapshot(
    ownedClassrooms,
    (snapshot) => {
      try {
        onChange(parseClassrooms(snapshot, teacherId));
      } catch {
        onError(new Error(LOAD_CLASSROOMS_ERROR));
      }
    },
    () => onError(new Error(LOAD_CLASSROOMS_ERROR)),
  );
};

export const watchClassroomStudents = (
  classroomId: string,
  onChange: (students: StudentSafeIdentity[]) => void,
  onError: (error: Error) => void,
): (() => void) =>
  onSnapshot(
    collection(db, 'classrooms', classroomId, 'students'),
    (snapshot) => {
      try {
        onChange(parseStudents(snapshot, classroomId));
      } catch {
        onError(new Error(LOAD_STUDENTS_ERROR));
      }
    },
    () => onError(new Error(LOAD_STUDENTS_ERROR)),
  );

const safely = async <Result>(action: () => Promise<Result>): Promise<Result> => {
  try {
    return await action();
  } catch {
    throw new Error(ACTION_ERROR);
  }
};

export const createClassroom = (name: string) =>
  safely(async () => {
    const response = await createClassroomCallable({ name });
    return {
      classroom: classroomSchema.parse(response.data.classroom),
      classCode: nonEmptySecret(response.data.classCode),
    };
  });

export const rotateClassCode = (classroomId: string) =>
  safely(async () => {
    const response = await rotateClassCodeCallable({ classroomId });
    return nonEmptySecret(response.data.classCode);
  });

export const archiveClassroom = (classroomId: string) =>
  safely(async () => {
    const response = await archiveClassroomCallable({ classroomId });
    return classroomSchema.parse(response.data.classroom);
  });

export const createStudent = (input: { classroomId: string; displayName: string }) =>
  safely(async () => {
    const response = await createStudentCallable(input);
    return {
      oneTimePin: nonEmptySecret(response.data.oneTimePin),
      student: studentSafeIdentitySchema.parse(response.data.student),
      studentHandle: nonEmptySecret(response.data.studentHandle),
    };
  });

export const resetStudentPin = (classroomId: string, studentId: string) =>
  safely(async () => {
    const response = await resetStudentPinCallable({ classroomId, studentId });
    return {
      oneTimePin: nonEmptySecret(response.data.oneTimePin),
      student: studentSafeIdentitySchema.parse(response.data.student),
    };
  });

export const disableStudent = (classroomId: string, studentId: string) =>
  safely(async () => {
    const response = await disableStudentCallable({ classroomId, studentId });
    return studentSafeIdentitySchema.parse(response.data.student);
  });
