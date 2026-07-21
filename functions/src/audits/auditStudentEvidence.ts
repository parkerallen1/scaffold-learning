import { getApps, initializeApp } from 'firebase-admin/app';
import {
  type DocumentReference,
  type DocumentSnapshot,
  getFirestore,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { z } from 'zod';

import {
  attemptEventSchema,
  sessionStateSchema,
  studentSafeIdentitySchema,
  supportEventSchema,
  supportPlanVersionSchema,
  type AttemptEvent,
  type SessionState,
  type StudentSafeIdentity,
  type SupportEvent,
  type SupportPlanVersion,
  type TeacherId,
} from '@scaffold-learning/domain';

import { openAiApiKey } from '../ai/openAiRecommendationProvider.js';
import { AiOperationalControlError, runControlledAiOperation } from '../ai/operationalControls.js';
import {
  AuditManualFallbackError,
  type AuditEvidencePacket,
  type AuditProvider,
} from './auditContracts.js';
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
  AuditEvidenceError,
  auditStudentInputSchema,
  buildAuditEvidence,
  MAX_AUDIT_ATTEMPTS,
  MAX_AUDIT_SESSIONS,
  MAX_AUDIT_SUPPORT_EVENTS,
  runEvidenceAudit,
} from './auditCore.js';
import { createAuditProvider } from './auditProviderFactory.js';

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

type AuditStudentInput = z.infer<typeof auditStudentInputSchema>;

const controlledAuditProvider = (teacherId: TeacherId, provider: AuditProvider): AuditProvider =>
  Object.freeze({
    name: provider.name,
    model: provider.model,
    promptVersion: provider.promptVersion,
    async auditSupports(input: AuditEvidencePacket) {
      try {
        return await runControlledAiOperation({
          teacherId,
          operation: 'auditStudentEvidence',
          provider,
          invoke: () => provider.auditSupports(input),
        });
      } catch (error) {
        if (error instanceof AiOperationalControlError) {
          throw new AuditManualFallbackError('provider_unavailable');
        }
        throw error;
      }
    },
  });

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

const parseSession = (
  snapshot: DocumentSnapshot,
  classroomId: string,
  studentId: string,
): SessionState => {
  const session = sessionStateSchema.safeParse(snapshot.data());
  if (
    !snapshot.exists ||
    !session.success ||
    session.data.id !== snapshot.id ||
    session.data.classroomId !== classroomId ||
    session.data.studentId !== studentId
  ) {
    throw new StoredDataError();
  }
  return session.data;
};

const parseAttempt = (
  snapshot: DocumentSnapshot,
  sessionId: string,
  studentId: string,
): AttemptEvent => {
  const attempt = attemptEventSchema.safeParse(snapshot.data());
  if (
    !snapshot.exists ||
    !attempt.success ||
    attempt.data.id !== snapshot.id ||
    attempt.data.sessionId !== sessionId ||
    attempt.data.studentId !== studentId
  ) {
    throw new StoredDataError();
  }
  return attempt.data;
};

const parseSupportEvent = (
  snapshot: DocumentSnapshot,
  sessionId: string,
  studentId: string,
): SupportEvent => {
  const event = supportEventSchema.safeParse(snapshot.data());
  if (
    !snapshot.exists ||
    !event.success ||
    event.data.id !== snapshot.id ||
    event.data.sessionId !== sessionId ||
    event.data.studentId !== studentId
  ) {
    throw new StoredDataError();
  }
  return event.data;
};

const loadBoundedEvents = async (
  classroomRef: DocumentReference,
  sessions: readonly SessionState[],
  studentId: string,
): Promise<
  Readonly<{ attempts: readonly AttemptEvent[]; supportEvents: readonly SupportEvent[] }>
> => {
  const attempts: AttemptEvent[] = [];
  const supportEvents: SupportEvent[] = [];

  for (const session of sessions) {
    const sessionRef = classroomRef.collection('sessions').doc(session.id);
    const remainingAttempts = MAX_AUDIT_ATTEMPTS - attempts.length;
    const remainingSupportEvents = MAX_AUDIT_SUPPORT_EVENTS - supportEvents.length;
    const [attemptSnapshots, supportEventSnapshots] = await Promise.all([
      remainingAttempts === 0
        ? Promise.resolve(null)
        : sessionRef
            .collection('attemptEvents')
            .orderBy('createdAt', 'desc')
            .limit(remainingAttempts)
            .get(),
      remainingSupportEvents === 0
        ? Promise.resolve(null)
        : sessionRef
            .collection('supportEvents')
            .orderBy('createdAt', 'desc')
            .limit(remainingSupportEvents)
            .get(),
    ]);
    attempts.push(
      ...(attemptSnapshots?.docs.map((snapshot) => parseAttempt(snapshot, session.id, studentId)) ??
        []),
    );
    supportEvents.push(
      ...(supportEventSnapshots?.docs.map((snapshot) =>
        parseSupportEvent(snapshot, session.id, studentId),
      ) ?? []),
    );
    if (
      attempts.length === MAX_AUDIT_ATTEMPTS &&
      supportEvents.length === MAX_AUDIT_SUPPORT_EVENTS
    ) {
      break;
    }
  }

  return Object.freeze({
    attempts: Object.freeze(attempts),
    supportEvents: Object.freeze(supportEvents),
  });
};

const loadActiveSupportPlan = async (input: AuditStudentInput): Promise<SupportPlanVersion> => {
  const pointerRef = firestore.collection('supportPlans').doc(input.studentId);
  const pointerSnapshot = await pointerRef.get();
  const pointer = activeSupportPlanPointerSchema.safeParse(pointerSnapshot.data());
  if (
    !pointerSnapshot.exists ||
    !pointer.success ||
    pointer.data.classroomId !== input.classroomId ||
    pointer.data.studentId !== input.studentId
  ) {
    throw new LifecycleStateError();
  }
  const planSnapshot = await pointerRef.collection('versions').doc(pointer.data.activePlanId).get();
  const plan = supportPlanVersionSchema.safeParse(planSnapshot.data());
  if (!planSnapshot.exists || !plan.success || plan.data.id !== planSnapshot.id) {
    throw new StoredDataError();
  }
  try {
    assertActivePointerMatches(pointer.data, plan.data);
  } catch (error) {
    if (error instanceof SupportPlanTransitionError) throw new StoredDataError();
    throw error;
  }
  return plan.data;
};

const auditStudentRecord = async (teacherId: TeacherId, input: AuditStudentInput) => {
  const classroomRef = firestore.collection('classrooms').doc(input.classroomId);
  const studentRef = classroomRef.collection('students').doc(input.studentId);
  const [classroomSnapshot, studentSnapshot] = await Promise.all([
    classroomRef.get(),
    studentRef.get(),
  ]);
  requireOwnedClassroom(classroomSnapshot, teacherId, true);
  parseActiveStudent(studentSnapshot, input.classroomId, input.studentId);
  const [sessionSnapshots, activeSupportPlan] = await Promise.all([
    classroomRef
      .collection('sessions')
      .where('studentId', '==', input.studentId)
      .orderBy('updatedAt', 'desc')
      .limit(MAX_AUDIT_SESSIONS)
      .get(),
    loadActiveSupportPlan(input),
  ]);
  const sessions = sessionSnapshots.docs.map((snapshot) =>
    parseSession(snapshot, input.classroomId, input.studentId),
  );
  if (sessions.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'No session evidence is available for this student.',
    );
  }
  const events = await loadBoundedEvents(classroomRef, sessions, input.studentId);

  let evidence;
  try {
    evidence = buildAuditEvidence({
      studentId: input.studentId,
      sessions,
      attempts: events.attempts,
      supportEvents: events.supportEvents,
      activeSupports: activeSupportPlan.supports,
    });
  } catch (error) {
    if (error instanceof AuditEvidenceError) throw new StoredDataError();
    throw error;
  }

  const auditRef = classroomRef.collection('audits').doc();
  const record = await runEvidenceAudit({
    auditId: auditRef.id,
    resultId: `${auditRef.id}_result`,
    classroomId: input.classroomId,
    studentId: input.studentId,
    teacherId,
    activeSupportPlanId: activeSupportPlan.id,
    activeSupportPlanVersion: activeSupportPlan.version,
    evidence,
    provider: controlledAuditProvider(teacherId, createAuditProvider()),
    createdAt: Date.now(),
  });

  await firestore.runTransaction(async (transaction) => {
    const [currentClassroom, currentStudent] = await Promise.all([
      transaction.get(classroomRef),
      transaction.get(studentRef),
    ]);
    requireOwnedClassroom(currentClassroom, teacherId, true);
    parseActiveStudent(currentStudent, input.classroomId, input.studentId);
    transaction.create(auditRef, record);
  });

  return {
    auditId: record.id,
    status: record.trace.status,
    evidenceSummary: record.evidenceSummary,
    result: record.result,
  };
};

export const auditStudentEvidence = onCall(
  { ...teacherCallableOptions, secrets: [openAiApiKey] },
  (request) =>
    executeTeacherOperation(
      'auditStudentEvidence',
      request,
      auditStudentInputSchema,
      auditStudentRecord,
    ),
);
