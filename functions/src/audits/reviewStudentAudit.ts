import { getApps, initializeApp } from 'firebase-admin/app';
import { type DocumentSnapshot, getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { z } from 'zod';

import {
  studentSafeIdentitySchema,
  supportPlanIdSchema,
  supportPlanVersionSchema,
  type StudentSafeIdentity,
  type TeacherId,
} from '@quiz-master/domain';

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
  AuditDecisionError,
  FINAL_AUDIT_DECISION_ID,
  resolveAuditDecision,
  reviewStudentAuditInputSchema,
} from './auditDecisionCore.js';
import { auditRecordSchema } from './auditCore.js';

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

type ReviewStudentAuditInput = z.infer<typeof reviewStudentAuditInputSchema>;

const parseActiveStudent = (
  snapshot: DocumentSnapshot,
  classroomId: string,
  studentId: string,
): StudentSafeIdentity => {
  if (!snapshot.exists) throw new LifecycleNotFoundError();
  const student = studentSafeIdentitySchema.safeParse(snapshot.data());
  if (
    !student.success ||
    student.data.id !== snapshot.id ||
    student.data.id !== studentId ||
    student.data.classroomId !== classroomId
  ) {
    throw new StoredDataError();
  }
  if (student.data.status !== 'active') throw new LifecycleStateError();
  return student.data;
};

const reviewAuditRecord = async (teacherId: TeacherId, input: ReviewStudentAuditInput) => {
  const classroomRef = firestore.collection('classrooms').doc(input.classroomId);
  const studentRef = classroomRef.collection('students').doc(input.studentId);
  const auditRef = classroomRef.collection('audits').doc(input.auditId);
  const decisionRef = auditRef.collection('decisions').doc(FINAL_AUDIT_DECISION_ID);
  const pointerRef = firestore.collection('supportPlans').doc(input.studentId);
  const versionsRef = pointerRef.collection('versions');
  const newVersionRef = versionsRef.doc();
  const newPlanId = supportPlanIdSchema.parse(newVersionRef.id);
  const reviewedAt = Date.now();

  return firestore.runTransaction(async (transaction) => {
    const [classroomSnapshot, studentSnapshot, auditSnapshot, decisionSnapshot, pointerSnapshot] =
      await Promise.all([
        transaction.get(classroomRef),
        transaction.get(studentRef),
        transaction.get(auditRef),
        transaction.get(decisionRef),
        transaction.get(pointerRef),
      ]);
    requireOwnedClassroom(classroomSnapshot, teacherId, true);
    parseActiveStudent(studentSnapshot, input.classroomId, input.studentId);

    if (!auditSnapshot.exists) throw new LifecycleNotFoundError();
    const audit = auditRecordSchema.safeParse(auditSnapshot.data());
    if (
      !audit.success ||
      audit.data.id !== auditSnapshot.id ||
      audit.data.classroomId !== input.classroomId ||
      audit.data.studentId !== input.studentId
    ) {
      throw new StoredDataError();
    }
    const pointer = activeSupportPlanPointerSchema.safeParse(pointerSnapshot.data());
    if (
      !pointerSnapshot.exists ||
      !pointer.success ||
      pointer.data.classroomId !== input.classroomId ||
      pointer.data.studentId !== input.studentId
    ) {
      throw new LifecycleStateError();
    }
    const currentPlanSnapshot = await transaction.get(versionsRef.doc(pointer.data.activePlanId));
    const currentPlan = supportPlanVersionSchema.safeParse(currentPlanSnapshot.data());
    if (
      !currentPlanSnapshot.exists ||
      !currentPlan.success ||
      currentPlan.data.id !== currentPlanSnapshot.id
    ) {
      throw new StoredDataError();
    }
    try {
      assertActivePointerMatches(pointer.data, currentPlan.data);
    } catch (error) {
      if (error instanceof SupportPlanTransitionError) throw new StoredDataError();
      throw error;
    }

    let resolved;
    try {
      resolved = resolveAuditDecision({
        rawAudit: audit.data,
        currentPlan: currentPlan.data,
        decisions: input.decisions,
        decisionAlreadyExists: decisionSnapshot.exists,
        teacherId,
        ...(input.teacherNote === undefined ? {} : { teacherNote: input.teacherNote }),
        newPlanId,
        reviewedAt,
      });
    } catch (error) {
      if (error instanceof AuditDecisionError) throw new LifecycleStateError();
      throw error;
    }

    if (resolved.supportPlan !== null && resolved.activePointer !== null) {
      transaction.create(newVersionRef, resolved.supportPlan);
      transaction.set(pointerRef, resolved.activePointer);
    }
    transaction.create(decisionRef, resolved.decisionRecord);

    return {
      decision: resolved.decisionRecord,
      supportPlan: resolved.supportPlan,
      activePointer: resolved.activePointer,
    };
  });
};

export const reviewStudentAudit = onCall(teacherCallableOptions, (request) =>
  executeTeacherOperation(
    'reviewStudentAudit',
    request,
    reviewStudentAuditInputSchema,
    (teacherId, input) => reviewAuditRecord(teacherId, input),
  ),
);
