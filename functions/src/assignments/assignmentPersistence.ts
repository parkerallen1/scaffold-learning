import { getApps, initializeApp } from 'firebase-admin/app';
import {
  type DocumentReference,
  type DocumentSnapshot,
  getFirestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { z } from 'zod';

import {
  assignmentAnswerKeySchema,
  assignmentIdSchema,
  assignmentTargetIdFor,
  epochMillisSchema,
  publicAssignmentSchema,
  publicQuestionSchema,
  studentSafeIdentitySchema,
  supportPlanVersionSchema,
  type AssignmentTarget,
  type PublicAssignment,
  type StudentSafeIdentity,
  type SupportPlanVersion,
  type TeacherId,
} from '@scaffold-learning/domain';

import {
  executeTeacherOperation,
  LifecycleNotFoundError,
  LifecycleStateError,
  requireOwnedClassroom,
  StoredDataError,
  teacherCallableOptions,
} from '../auth/teacherLifecycle.js';
import {
  activeSupportPlanPointerSchema,
  assertActivePointerMatches,
  SupportPlanTransitionError,
} from '../planning/supportPlanPersistenceCore.js';
import {
  AssignmentPersistenceError,
  assignmentRevisionIdSchema,
  assignmentRevisionSchema,
  assignPublishedAssignmentInputSchema,
  buildAssignmentTarget,
  createAssignmentDraftInputSchema,
  materializeStoredAssignmentDraft,
  publishAssignmentInputSchema,
  publishStoredAssignment,
  type AssignmentRevision,
} from './assignmentPersistenceCore.js';

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

const parseAssignment = (snapshot: DocumentSnapshot): PublicAssignment => {
  if (!snapshot.exists) {
    throw new LifecycleNotFoundError();
  }
  const assignment = publicAssignmentSchema.safeParse(snapshot.data());
  if (!assignment.success || assignment.data.id !== snapshot.id) {
    throw new StoredDataError();
  }
  return assignment.data;
};

const parseRevision = (snapshot: DocumentSnapshot): AssignmentRevision => {
  if (!snapshot.exists) {
    throw new LifecycleNotFoundError();
  }
  const revision = assignmentRevisionSchema.safeParse(snapshot.data());
  if (!revision.success || revision.data.id !== snapshot.id) {
    throw new StoredDataError();
  }
  return revision.data;
};

const parseStudent = (snapshot: DocumentSnapshot, classroomId: string): StudentSafeIdentity => {
  if (!snapshot.exists) {
    throw new LifecycleNotFoundError();
  }
  const student = studentSafeIdentitySchema.safeParse(snapshot.data());
  if (
    !student.success ||
    student.data.id !== snapshot.id ||
    student.data.classroomId !== classroomId
  ) {
    throw new StoredDataError();
  }
  if (student.data.status !== 'active') {
    throw new LifecycleStateError();
  }
  return student.data;
};

const createAssignmentDraftRecord = async (
  teacherId: TeacherId,
  input: z.infer<typeof createAssignmentDraftInputSchema>,
  nowMs: number,
) => {
  const classroomRef = firestore.collection('classrooms').doc(input.classroomId);
  const assignmentRef = classroomRef.collection('assignments').doc();
  const assignmentId = assignmentIdSchema.parse(assignmentRef.id);
  const revisionRef = assignmentRef.collection('revisions').doc();
  const revisionId = assignmentRevisionIdSchema.parse(revisionRef.id);
  const answerKeyRef = assignmentRef.collection('answerKeys').doc(revisionId);
  const records = materializeStoredAssignmentDraft({
    draft: input.draft,
    assignmentId,
    revisionId,
    classroomId: input.classroomId,
    createdBy: teacherId,
    createdAt: epochMillisSchema.parse(nowMs),
  });

  await firestore.runTransaction(async (transaction) => {
    const classroomSnapshot = await transaction.get(classroomRef);
    requireOwnedClassroom(classroomSnapshot, teacherId, true);

    transaction.create(assignmentRef, records.assignment);
    transaction.create(revisionRef, records.revision);
    transaction.create(answerKeyRef, records.answerKey);
    for (const question of records.publicQuestions) {
      transaction.create(assignmentRef.collection('questions').doc(question.id), question);
    }
  });

  return { assignment: records.assignment, revision: records.revision };
};

const assertCompleteRevision = async (
  transaction: Transaction,
  assignmentRef: DocumentReference,
  assignment: PublicAssignment,
  revision: AssignmentRevision,
): Promise<void> => {
  const answerKeySnapshot = await transaction.get(
    assignmentRef.collection('answerKeys').doc(revision.id),
  );
  const answerKey = assignmentAnswerKeySchema.safeParse(answerKeySnapshot.data());
  if (
    !answerKeySnapshot.exists ||
    !answerKey.success ||
    answerKey.data.assignmentId !== assignment.id ||
    answerKey.data.assignmentRevision !== assignment.revision ||
    answerKey.data.createdBy !== assignment.createdBy ||
    answerKey.data.questionKeys.length !== assignment.questionCount ||
    new Set(answerKey.data.questionKeys.map((key) => key.questionId)).size !==
      answerKey.data.questionKeys.length
  ) {
    throw new StoredDataError();
  }

  const questionSnapshots = await Promise.all(
    answerKey.data.questionKeys.map((key) =>
      transaction.get(assignmentRef.collection('questions').doc(key.questionId)),
    ),
  );
  const questions = questionSnapshots.map((snapshot) =>
    publicQuestionSchema.safeParse(snapshot.data()),
  );
  if (
    questions.some(
      (question, index) =>
        !question.success ||
        question.data.id !== questionSnapshots[index]?.id ||
        question.data.assignmentId !== assignment.id ||
        question.data.questionType !== answerKey.data.questionKeys[index]?.questionType,
    ) ||
    new Set(questions.flatMap((question) => (question.success ? [question.data.order] : [])))
      .size !== assignment.questionCount
  ) {
    throw new StoredDataError();
  }
};

const publishAssignmentRecord = async (
  teacherId: TeacherId,
  input: z.infer<typeof publishAssignmentInputSchema>,
  nowMs: number,
) => {
  const classroomRef = firestore.collection('classrooms').doc(input.classroomId);
  const assignmentRef = classroomRef.collection('assignments').doc(input.assignmentId);
  const revisionRef = assignmentRef.collection('revisions').doc(input.revisionId);

  return firestore.runTransaction(async (transaction) => {
    const [classroomSnapshot, assignmentSnapshot, revisionSnapshot] = await Promise.all([
      transaction.get(classroomRef),
      transaction.get(assignmentRef),
      transaction.get(revisionRef),
    ]);
    requireOwnedClassroom(classroomSnapshot, teacherId, true);
    const assignment = parseAssignment(assignmentSnapshot);
    const revision = parseRevision(revisionSnapshot);
    if (
      assignment.classroomId !== input.classroomId ||
      assignment.createdBy !== teacherId ||
      revision.assignmentId !== input.assignmentId ||
      revision.classroomId !== input.classroomId ||
      revision.createdBy !== teacherId
    ) {
      throw new StoredDataError();
    }
    await assertCompleteRevision(transaction, assignmentRef, assignment, revision);

    let published: ReturnType<typeof publishStoredAssignment>;
    try {
      published = publishStoredAssignment({
        assignment,
        revision,
        publishedAt: epochMillisSchema.parse(nowMs),
      });
    } catch (error) {
      if (error instanceof AssignmentPersistenceError) {
        throw new LifecycleStateError();
      }
      throw error;
    }
    transaction.set(assignmentRef, published.assignment);
    transaction.set(revisionRef, published.revision);
    return published;
  });
};

type TargetContext = Readonly<{
  student: StudentSafeIdentity;
  supportPlan: SupportPlanVersion;
  targetRef: DocumentReference;
}>;

const readTargetContexts = async (
  transaction: Transaction,
  classroomRef: DocumentReference,
  assignment: PublicAssignment,
  studentIds: z.infer<typeof assignPublishedAssignmentInputSchema>['studentIds'],
): Promise<readonly TargetContext[]> => {
  const studentRefs = studentIds.map((studentId) =>
    classroomRef.collection('students').doc(studentId),
  );
  const pointerRefs = studentIds.map((studentId) =>
    firestore.collection('supportPlans').doc(studentId),
  );
  const targetRefs = studentIds.map((studentId) =>
    classroomRef
      .collection('assignmentTargets')
      .doc(assignmentTargetIdFor(assignment.id, studentId)),
  );
  const [studentSnapshots, pointerSnapshots, targetSnapshots] = await Promise.all([
    Promise.all(studentRefs.map((reference) => transaction.get(reference))),
    Promise.all(pointerRefs.map((reference) => transaction.get(reference))),
    Promise.all(targetRefs.map((reference) => transaction.get(reference))),
  ]);
  if (targetSnapshots.some((snapshot) => snapshot.exists)) {
    throw new LifecycleStateError();
  }

  const students = studentSnapshots.map((snapshot) =>
    parseStudent(snapshot, assignment.classroomId),
  );
  const pointers = pointerSnapshots.map((snapshot, index) => {
    const pointer = activeSupportPlanPointerSchema.safeParse(snapshot.data());
    if (
      !snapshot.exists ||
      !pointer.success ||
      pointer.data.classroomId !== assignment.classroomId ||
      pointer.data.studentId !== students[index]?.id
    ) {
      throw new LifecycleStateError();
    }
    return pointer.data;
  });
  const planSnapshots = await Promise.all(
    pointers.map((pointer, index) =>
      transaction.get(pointerRefs[index]!.collection('versions').doc(pointer.activePlanId)),
    ),
  );

  return planSnapshots.map((snapshot, index) => {
    const supportPlan = supportPlanVersionSchema.safeParse(snapshot.data());
    if (!snapshot.exists || !supportPlan.success || supportPlan.data.id !== snapshot.id) {
      throw new StoredDataError();
    }
    try {
      assertActivePointerMatches(pointers[index]!, supportPlan.data);
    } catch (error) {
      if (error instanceof SupportPlanTransitionError) {
        throw new StoredDataError();
      }
      throw error;
    }
    return Object.freeze({
      student: students[index]!,
      supportPlan: supportPlan.data,
      targetRef: targetRefs[index]!,
    });
  });
};

const assignPublishedAssignmentRecord = async (
  teacherId: TeacherId,
  input: z.infer<typeof assignPublishedAssignmentInputSchema>,
  nowMs: number,
): Promise<{ assignment: PublicAssignment; targets: readonly AssignmentTarget[] }> => {
  const classroomRef = firestore.collection('classrooms').doc(input.classroomId);
  const assignmentRef = classroomRef.collection('assignments').doc(input.assignmentId);

  return firestore.runTransaction(async (transaction) => {
    const [classroomSnapshot, assignmentSnapshot] = await Promise.all([
      transaction.get(classroomRef),
      transaction.get(assignmentRef),
    ]);
    requireOwnedClassroom(classroomSnapshot, teacherId, true);
    const assignment = parseAssignment(assignmentSnapshot);
    if (
      assignment.classroomId !== input.classroomId ||
      assignment.createdBy !== teacherId ||
      assignment.status !== 'published'
    ) {
      throw new LifecycleStateError();
    }

    const contexts = await readTargetContexts(
      transaction,
      classroomRef,
      assignment,
      input.studentIds,
    );
    const assignedAt = epochMillisSchema.parse(nowMs);
    const targets = contexts.map((context) => {
      let target: AssignmentTarget;
      try {
        target = buildAssignmentTarget({
          assignment,
          student: context.student,
          supportPlan: context.supportPlan,
          assignedBy: teacherId,
          assignedAt,
        });
      } catch (error) {
        if (error instanceof AssignmentPersistenceError) {
          throw new LifecycleStateError();
        }
        throw error;
      }
      transaction.create(context.targetRef, target);
      return target;
    });
    return { assignment, targets };
  });
};

export const createAssignmentDraft = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'createAssignmentDraft',
    request,
    createAssignmentDraftInputSchema,
    (teacherId, input) => createAssignmentDraftRecord(teacherId, input, Date.now()),
  ),
);

export const publishAssignment = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'publishAssignment',
    request,
    publishAssignmentInputSchema,
    (teacherId, input) => publishAssignmentRecord(teacherId, input, Date.now()),
  ),
);

export const assignPublishedAssignment = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'assignPublishedAssignment',
    request,
    assignPublishedAssignmentInputSchema,
    (teacherId, input) => assignPublishedAssignmentRecord(teacherId, input, Date.now()),
  ),
);
