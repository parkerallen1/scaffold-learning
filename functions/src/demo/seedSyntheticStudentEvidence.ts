import { getApps, initializeApp } from 'firebase-admin/app';
import { type DocumentReference, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import {
  assignmentTargetIdFor,
  assignmentTargetSchema,
  publicAssignmentSchema,
  publicQuestionSchema,
  studentSafeIdentitySchema,
  supportPlanVersionSchema,
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
  assertSyntheticEvidenceEnvironment,
  assertSyntheticEvidenceWriteAvailable,
  assertSyntheticTargetIdentity,
  buildSyntheticEvidencePacket,
  enabledSyntheticSupportKey,
  seedSyntheticStudentEvidenceInputSchema,
  syntheticEvidenceManifestIdFor,
  syntheticEvidenceManifestSchema,
  SyntheticEvidenceError,
  type SeedSyntheticStudentEvidenceInput,
} from './syntheticEvidenceCore.js';

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

const configuredProjectId = (): string | undefined => {
  if (process.env.GCLOUD_PROJECT !== undefined) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT !== undefined) return process.env.GOOGLE_CLOUD_PROJECT;
  if (process.env.FIREBASE_CONFIG === undefined) return undefined;
  try {
    const config = JSON.parse(process.env.FIREBASE_CONFIG) as { projectId?: unknown };
    return typeof config.projectId === 'string' ? config.projectId : undefined;
  } catch {
    return undefined;
  }
};

const translateSyntheticEvidenceError = (error: unknown): never => {
  if (!(error instanceof SyntheticEvidenceError)) throw error;
  if (error.reason === 'collision') {
    throw new HttpsError(
      'already-exists',
      'Synthetic demo evidence conflicts with an existing record and was not written.',
    );
  }
  throw new LifecycleStateError();
};

const parseActiveStudent = (raw: unknown, classroomId: string, studentId: string) => {
  const student = studentSafeIdentitySchema.safeParse(raw);
  if (!student.success) throw new StoredDataError();
  if (student.data.classroomId !== classroomId || student.data.id !== studentId) {
    throw new StoredDataError();
  }
  if (student.data.status !== 'active') throw new LifecycleStateError();
  return student.data;
};

const recordRef = (path: string): DocumentReference => firestore.doc(path);

const seedSyntheticEvidenceRecord = async (
  teacherId: TeacherId,
  input: SeedSyntheticStudentEvidenceInput,
  nowMs: number,
) => {
  const classroomRef = firestore.collection('classrooms').doc(input.classroomId);
  const studentRef = classroomRef.collection('students').doc(input.studentId);
  const targetRef = classroomRef.collection('assignmentTargets').doc(input.targetId);

  return firestore.runTransaction(async (transaction) => {
    const [classroomSnapshot, studentSnapshot, targetSnapshot] = await Promise.all([
      transaction.get(classroomRef),
      transaction.get(studentRef),
      transaction.get(targetRef),
    ]);
    requireOwnedClassroom(classroomSnapshot, teacherId, true);
    if (!studentSnapshot.exists) throw new LifecycleNotFoundError();
    parseActiveStudent(studentSnapshot.data(), input.classroomId, input.studentId);

    const target = assignmentTargetSchema.safeParse(targetSnapshot.data());
    if (!targetSnapshot.exists) throw new LifecycleNotFoundError();
    if (
      !target.success ||
      target.data.id !== targetSnapshot.id ||
      target.data.id !== assignmentTargetIdFor(target.data.assignmentId, target.data.studentId)
    ) {
      throw new StoredDataError();
    }
    try {
      assertSyntheticTargetIdentity(target.data, input);
    } catch (error) {
      return translateSyntheticEvidenceError(error);
    }

    const assignmentRef = classroomRef.collection('assignments').doc(target.data.assignmentId);
    const planRef = firestore
      .collection('supportPlans')
      .doc(target.data.studentId)
      .collection('versions')
      .doc(target.data.supportPlanId);
    const questionsQuery = assignmentRef.collection('questions').orderBy('order').limit(5);
    const manifestRef = classroomRef
      .collection('demoEvidenceSeeds')
      .doc(syntheticEvidenceManifestIdFor(target.data.id));
    const [assignmentSnapshot, planSnapshot, questionSnapshots, manifestSnapshot] =
      await Promise.all([
        transaction.get(assignmentRef),
        transaction.get(planRef),
        transaction.get(questionsQuery),
        transaction.get(manifestRef),
      ]);

    const assignment = publicAssignmentSchema.safeParse(assignmentSnapshot.data());
    const plan = supportPlanVersionSchema.safeParse(planSnapshot.data());
    if (
      !assignmentSnapshot.exists ||
      !assignment.success ||
      assignment.data.id !== assignmentSnapshot.id ||
      assignment.data.id !== target.data.assignmentId ||
      assignment.data.classroomId !== target.data.classroomId ||
      assignment.data.revision !== target.data.assignmentRevision ||
      assignment.data.status !== 'published' ||
      assignment.data.publishedAt === null ||
      !planSnapshot.exists ||
      !plan.success ||
      plan.data.id !== planSnapshot.id ||
      plan.data.id !== target.data.supportPlanId ||
      plan.data.version !== target.data.supportPlanVersion ||
      plan.data.classroomId !== target.data.classroomId ||
      plan.data.studentId !== target.data.studentId
    ) {
      throw new LifecycleStateError();
    }

    const questions = questionSnapshots.docs.map((snapshot) => {
      const question = publicQuestionSchema.safeParse(snapshot.data());
      if (!question.success || question.data.id !== snapshot.id) throw new StoredDataError();
      return question.data;
    });
    const existingManifest = manifestSnapshot.exists
      ? syntheticEvidenceManifestSchema.safeParse(manifestSnapshot.data())
      : undefined;
    if (existingManifest !== undefined && !existingManifest.success) {
      throw new HttpsError(
        'already-exists',
        'Synthetic demo evidence conflicts with an existing record and was not written.',
      );
    }

    let packet;
    try {
      packet = buildSyntheticEvidencePacket({
        target: target.data,
        questions,
        supportKey: enabledSyntheticSupportKey(plan.data.supports),
        seededAt: existingManifest?.data.seededAt ?? nowMs,
      });
    } catch (error) {
      return translateSyntheticEvidenceError(error);
    }

    const recordSnapshots = await Promise.all(
      packet.records.map((record) => transaction.get(recordRef(record.path))),
    );
    const recordsByPath = new Map(
      packet.records.map((record, index) => [
        record.path,
        recordSnapshots[index]?.exists ? recordSnapshots[index]!.data() : undefined,
      ]),
    );
    let writeState;
    try {
      writeState = assertSyntheticEvidenceWriteAvailable(packet, {
        manifest: manifestSnapshot.exists ? manifestSnapshot.data() : undefined,
        recordsByPath,
      });
    } catch (error) {
      return translateSyntheticEvidenceError(error);
    }

    if (!writeState.alreadySeeded) {
      transaction.create(manifestRef, packet.manifest);
      for (const record of packet.records) {
        transaction.create(recordRef(record.path), record.data);
      }
    }

    return {
      seedId: packet.manifest.id,
      alreadySeeded: writeState.alreadySeeded,
      sessionCount: packet.sessions.length,
      scorableResponseCount: packet.attempts.length,
      supportEventCount: packet.supportEvents.length,
    };
  });
};

export const seedSyntheticStudentEvidence = onCall(teacherCallableOptions, (request) => {
  try {
    assertSyntheticEvidenceEnvironment({
      functionsEmulator: process.env.FUNCTIONS_EMULATOR,
      projectId: configuredProjectId(),
    });
  } catch (error) {
    if (error instanceof SyntheticEvidenceError) {
      throw new HttpsError(
        'failed-precondition',
        'Synthetic evidence seeding is available only in the local demo emulator project.',
      );
    }
    throw error;
  }

  return executeTeacherOperation(
    'seedSyntheticStudentEvidence',
    request,
    seedSyntheticStudentEvidenceInputSchema,
    (teacherId, input) => seedSyntheticEvidenceRecord(teacherId, input, Date.now()),
  );
});
