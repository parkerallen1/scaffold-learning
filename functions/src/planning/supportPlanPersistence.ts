import { getApps, initializeApp } from 'firebase-admin/app';
import {
  type CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
  getFirestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { z } from 'zod';

import {
  studentSafeIdentitySchema,
  supportPlanIdSchema,
  supportPlanVersionSchema,
  teacherOnlyStudentProfileSchema,
  type StudentSafeIdentity,
  type SupportPlanVersion,
  type TeacherId,
} from '@quiz-master/domain';

import {
  executeTeacherOperation,
  LifecycleNotFoundError,
  LifecycleOwnershipError,
  LifecycleStateError,
  requireOwnedClassroom,
  StoredDataError,
  teacherCallableOptions,
} from '../auth/teacherLifecycle.js';
import {
  activePointerFor,
  activeSupportPlanPointerSchema,
  assertActivePointerMatches,
  buildRevertedSupportPlanVersion,
  buildSupportPlanVersion,
  createSupportPlanInputSchema,
  profileIdForStudent,
  revertSupportPlanInputSchema,
  saveStudentProfileInputSchema,
  studentPlanningInputSchema,
  SupportPlanTransitionError,
  type ActiveSupportPlanPointer,
} from './supportPlanPersistenceCore.js';

const MAX_PLANNING_HISTORY = 50;
const PLANNING_HISTORY_QUERY_LIMIT = MAX_PLANNING_HISTORY + 1;

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

const parseStudent = (snapshot: DocumentSnapshot): StudentSafeIdentity => {
  if (!snapshot.exists) {
    throw new LifecycleNotFoundError();
  }
  const student = studentSafeIdentitySchema.safeParse(snapshot.data());
  if (!student.success) {
    throw new StoredDataError();
  }
  return student.data;
};

const requireOwnedStudent = async (
  transaction: Transaction,
  teacherId: TeacherId,
  classroomId: string,
  studentId: string,
  requireActive = true,
): Promise<{
  student: StudentSafeIdentity;
  studentRef: DocumentReference;
}> => {
  const classroomRef = firestore.collection('classrooms').doc(classroomId);
  const studentRef = classroomRef.collection('students').doc(studentId);
  const [classroomSnapshot, studentSnapshot] = await Promise.all([
    transaction.get(classroomRef),
    transaction.get(studentRef),
  ]);
  requireOwnedClassroom(classroomSnapshot, teacherId, requireActive);
  const student = parseStudent(studentSnapshot);
  if (student.classroomId !== classroomId) {
    throw new StoredDataError();
  }
  if (requireActive && student.status !== 'active') {
    throw new LifecycleStateError();
  }
  return { student, studentRef };
};

const supportPlanRefs = (studentId: string) => {
  const pointerRef = firestore.collection('supportPlans').doc(studentId);
  return Object.freeze({ pointerRef, versionsRef: pointerRef.collection('versions') });
};

const readCurrentPlan = async (
  transaction: Transaction,
  pointerRef: DocumentReference,
  versionsRef: CollectionReference,
  classroomId: string,
  studentId: string,
): Promise<{
  pointer: ActiveSupportPlanPointer | null;
  current: SupportPlanVersion | null;
}> => {
  const pointerSnapshot = await transaction.get(pointerRef);
  if (!pointerSnapshot.exists) {
    return { pointer: null, current: null };
  }
  const pointer = activeSupportPlanPointerSchema.safeParse(pointerSnapshot.data());
  if (
    !pointer.success ||
    pointer.data.classroomId !== classroomId ||
    pointer.data.studentId !== studentId
  ) {
    throw new StoredDataError();
  }
  const currentSnapshot = await transaction.get(versionsRef.doc(pointer.data.activePlanId));
  const current = supportPlanVersionSchema.safeParse(currentSnapshot.data());
  if (!currentSnapshot.exists || !current.success) {
    throw new StoredDataError();
  }
  try {
    assertActivePointerMatches(pointer.data, current.data);
  } catch (error) {
    if (error instanceof SupportPlanTransitionError) {
      throw new StoredDataError();
    }
    throw error;
  }
  return { pointer: pointer.data, current: current.data };
};

const saveProfile = async (
  teacherId: TeacherId,
  input: z.infer<typeof saveStudentProfileInputSchema>,
  nowMs: number,
) => {
  const profileRef = firestore
    .collection('classrooms')
    .doc(input.classroomId)
    .collection('studentProfiles')
    .doc(input.studentId);

  return firestore.runTransaction(async (transaction) => {
    const [{ student }, profileSnapshot] = await Promise.all([
      requireOwnedStudent(transaction, teacherId, input.classroomId, input.studentId, true),
      transaction.get(profileRef),
    ]);
    if (student.id !== input.studentId) {
      throw new StoredDataError();
    }

    const existing = profileSnapshot.exists
      ? teacherOnlyStudentProfileSchema.safeParse(profileSnapshot.data())
      : null;
    if (existing !== null && !existing.success) {
      throw new StoredDataError();
    }
    if (
      existing?.success &&
      (existing.data.classroomId !== input.classroomId ||
        existing.data.studentId !== input.studentId ||
        existing.data.createdBy !== teacherId)
    ) {
      throw new StoredDataError();
    }

    const profile = teacherOnlyStudentProfileSchema.parse({
      id: profileIdForStudent(input.studentId),
      classroomId: input.classroomId,
      studentId: input.studentId,
      observations: input.observations,
      ...(input.teacherSummary === undefined ? {} : { teacherSummary: input.teacherSummary }),
      createdBy: existing?.success ? existing.data.createdBy : teacherId,
      createdAt: existing?.success ? existing.data.createdAt : nowMs,
      updatedAt: nowMs,
    });
    transaction.set(profileRef, profile);
    return profile;
  });
};

const getPlanningData = async (teacherId: TeacherId, classroomId: string, studentId: string) => {
  const profileRef = firestore
    .collection('classrooms')
    .doc(classroomId)
    .collection('studentProfiles')
    .doc(studentId);
  const { pointerRef, versionsRef } = supportPlanRefs(studentId);

  return firestore.runTransaction(async (transaction) => {
    const [{ student }, profileSnapshot, currentState, historySnapshot] = await Promise.all([
      requireOwnedStudent(transaction, teacherId, classroomId, studentId, false),
      transaction.get(profileRef),
      readCurrentPlan(transaction, pointerRef, versionsRef, classroomId, studentId),
      transaction.get(versionsRef.orderBy('version', 'desc').limit(PLANNING_HISTORY_QUERY_LIMIT)),
    ]);

    const profile = profileSnapshot.exists
      ? teacherOnlyStudentProfileSchema.safeParse(profileSnapshot.data())
      : null;
    if (
      profile !== null &&
      (!profile.success ||
        profile.data.classroomId !== classroomId ||
        profile.data.studentId !== studentId)
    ) {
      throw new StoredDataError();
    }

    const validatedHistory = historySnapshot.docs.map((document) => {
      const plan = supportPlanVersionSchema.safeParse(document.data());
      if (
        !plan.success ||
        plan.data.id !== document.id ||
        plan.data.classroomId !== classroomId ||
        plan.data.studentId !== studentId
      ) {
        throw new StoredDataError();
      }
      return plan.data;
    });
    if (
      (currentState.pointer === null && validatedHistory.length > 0) ||
      (currentState.pointer !== null &&
        !validatedHistory.some((plan) => plan.id === currentState.pointer?.activePlanId))
    ) {
      throw new StoredDataError();
    }

    return {
      student,
      profile: profile?.success ? profile.data : null,
      activePlan: currentState.current,
      planHistory: validatedHistory.slice(0, MAX_PLANNING_HISTORY),
      historyTruncated: validatedHistory.length > MAX_PLANNING_HISTORY,
    };
  });
};

const createPlan = async (
  teacherId: TeacherId,
  input: z.infer<typeof createSupportPlanInputSchema>,
  nowMs: number,
) => {
  const { pointerRef, versionsRef } = supportPlanRefs(input.studentId);
  const versionRef = versionsRef.doc();
  const planId = supportPlanIdSchema.parse(versionRef.id);

  return firestore.runTransaction(async (transaction) => {
    const [{ student }, currentState] = await Promise.all([
      requireOwnedStudent(transaction, teacherId, input.classroomId, input.studentId, true),
      readCurrentPlan(transaction, pointerRef, versionsRef, input.classroomId, input.studentId),
    ]);
    if (student.id !== input.studentId) {
      throw new StoredDataError();
    }
    const supportPlan = buildSupportPlanVersion({
      id: planId,
      classroomId: input.classroomId,
      studentId: input.studentId,
      previous: currentState.current,
      supports: input.supports,
      source: 'manual',
      approvedBy: teacherId,
      approvedAt: nowMs,
    });
    const activePointer = activePointerFor(supportPlan, nowMs);
    transaction.create(versionRef, supportPlan);
    transaction.set(pointerRef, activePointer);
    return { supportPlan, activePointer };
  });
};

const revertPlan = async (
  teacherId: TeacherId,
  input: z.infer<typeof revertSupportPlanInputSchema>,
  nowMs: number,
) => {
  const { pointerRef, versionsRef } = supportPlanRefs(input.studentId);
  const newVersionRef = versionsRef.doc();
  const newPlanId = supportPlanIdSchema.parse(newVersionRef.id);

  return firestore.runTransaction(async (transaction) => {
    const [{ student }, currentState, priorSnapshot] = await Promise.all([
      requireOwnedStudent(transaction, teacherId, input.classroomId, input.studentId, true),
      readCurrentPlan(transaction, pointerRef, versionsRef, input.classroomId, input.studentId),
      transaction.get(versionsRef.doc(input.priorPlanId)),
    ]);
    if (student.id !== input.studentId || currentState.current === null) {
      throw new LifecycleStateError();
    }
    const prior = supportPlanVersionSchema.safeParse(priorSnapshot.data());
    if (!priorSnapshot.exists) {
      throw new LifecycleNotFoundError();
    }
    if (
      !prior.success ||
      prior.data.id !== input.priorPlanId ||
      prior.data.classroomId !== input.classroomId ||
      prior.data.studentId !== input.studentId
    ) {
      throw new LifecycleOwnershipError();
    }

    let supportPlan: SupportPlanVersion;
    try {
      supportPlan = buildRevertedSupportPlanVersion({
        id: newPlanId,
        current: currentState.current,
        prior: prior.data,
        approvedBy: teacherId,
        approvedAt: nowMs,
      });
    } catch (error) {
      if (error instanceof SupportPlanTransitionError) {
        throw new LifecycleStateError();
      }
      throw error;
    }
    const activePointer = activePointerFor(supportPlan, nowMs);
    transaction.create(newVersionRef, supportPlan);
    transaction.set(pointerRef, activePointer);
    return { supportPlan, activePointer, revertedFromPlanId: prior.data.id };
  });
};

export const saveStudentProfile = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'saveStudentProfile',
    request,
    saveStudentProfileInputSchema,
    async (teacherId, input) => ({ profile: await saveProfile(teacherId, input, Date.now()) }),
  ),
);

export const getStudentPlanningData = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'getStudentPlanningData',
    request,
    studentPlanningInputSchema,
    (teacherId, input) => getPlanningData(teacherId, input.classroomId, input.studentId),
  ),
);

export const createSupportPlanVersion = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'createSupportPlanVersion',
    request,
    createSupportPlanInputSchema,
    (teacherId, input) => createPlan(teacherId, input, Date.now()),
  ),
);

export const revertSupportPlanVersion = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'revertSupportPlanVersion',
    request,
    revertSupportPlanInputSchema,
    (teacherId, input) => revertPlan(teacherId, input, Date.now()),
  ),
);
