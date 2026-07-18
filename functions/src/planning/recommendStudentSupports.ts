import { getApps, initializeApp } from 'firebase-admin/app';
import {
  type DocumentReference,
  type DocumentSnapshot,
  getFirestore,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { z } from 'zod';

import {
  studentSafeIdentitySchema,
  teacherOnlyStudentProfileSchema,
  type RecommendationResult,
  type StudentSafeIdentity,
  type TeacherId,
  type TeacherOnlyStudentProfile,
} from '@quiz-master/domain';

import { createAiProvider } from '../ai/providerFactory.js';
import { openAiApiKey } from '../ai/openAiRecommendationProvider.js';
import { AiOperationalControlError, runControlledAiOperation } from '../ai/operationalControls.js';
import {
  executeTeacherOperation,
  LifecycleNotFoundError,
  LifecycleStateError,
  requireOwnedClassroom,
  StoredDataError,
  teacherCallableOptions,
} from '../auth/teacherLifecycle.js';
import {
  buildRecommendationProposal,
  InsufficientRecommendationEvidenceError,
  INSUFFICIENT_OBSERVATIONS_MESSAGE,
  recommendationFallbackCode,
  recommendationInputFromObservations,
  recommendStudentSupportsInputSchema,
  RECOMMENDATION_UNAVAILABLE_MESSAGE,
} from './recommendStudentSupportsCore.js';

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

type RecommendStudentSupportsInput = z.infer<typeof recommendStudentSupportsInputSchema>;

const parseActiveStudent = (
  snapshot: DocumentSnapshot,
  classroomId: string,
  studentId: string,
): StudentSafeIdentity => {
  if (!snapshot.exists) throw new LifecycleNotFoundError();
  const student = studentSafeIdentitySchema.safeParse(snapshot.data());
  if (
    !student.success ||
    student.data.id !== studentId ||
    student.data.classroomId !== classroomId
  ) {
    throw new StoredDataError();
  }
  if (student.data.status !== 'active') throw new LifecycleStateError();
  return student.data;
};

const parseOwnedProfile = (
  snapshot: DocumentSnapshot,
  teacherId: TeacherId,
  classroomId: string,
  studentId: string,
): TeacherOnlyStudentProfile => {
  if (!snapshot.exists) throw new LifecycleNotFoundError();
  const profile = teacherOnlyStudentProfileSchema.safeParse(snapshot.data());
  if (
    !profile.success ||
    profile.data.classroomId !== classroomId ||
    profile.data.studentId !== studentId ||
    profile.data.createdBy !== teacherId
  ) {
    throw new StoredDataError();
  }
  return profile.data;
};

const refsFor = (input: RecommendStudentSupportsInput) => {
  const classroomRef = firestore.collection('classrooms').doc(input.classroomId);
  return Object.freeze({
    classroomRef,
    studentRef: classroomRef.collection('students').doc(input.studentId),
    profileRef: classroomRef.collection('studentProfiles').doc(input.studentId),
    proposalRef: classroomRef.collection('recommendations').doc(),
  });
};

const loadAuthorizedProfile = async (
  teacherId: TeacherId,
  input: RecommendStudentSupportsInput,
  classroomRef: DocumentReference,
  studentRef: DocumentReference,
  profileRef: DocumentReference,
): Promise<TeacherOnlyStudentProfile> => {
  const [classroomSnapshot, studentSnapshot, profileSnapshot] = await Promise.all([
    classroomRef.get(),
    studentRef.get(),
    profileRef.get(),
  ]);
  requireOwnedClassroom(classroomSnapshot, teacherId, true);
  parseActiveStudent(studentSnapshot, input.classroomId, input.studentId);
  return parseOwnedProfile(profileSnapshot, teacherId, input.classroomId, input.studentId);
};

const persistCurrentProposal = async (
  teacherId: TeacherId,
  input: RecommendStudentSupportsInput,
  profileUsed: TeacherOnlyStudentProfile,
  recommendationResult: RecommendationResult,
  createdAt: number,
  refs: ReturnType<typeof refsFor>,
) => {
  const proposal = buildRecommendationProposal({
    id: refs.proposalRef.id,
    classroomId: input.classroomId,
    studentId: input.studentId,
    profileUpdatedAt: profileUsed.updatedAt,
    recommendationResult,
    createdBy: teacherId,
    createdAt,
  });

  await firestore.runTransaction(async (transaction) => {
    const [classroomSnapshot, studentSnapshot, profileSnapshot] = await Promise.all([
      transaction.get(refs.classroomRef),
      transaction.get(refs.studentRef),
      transaction.get(refs.profileRef),
    ]);
    requireOwnedClassroom(classroomSnapshot, teacherId, true);
    parseActiveStudent(studentSnapshot, input.classroomId, input.studentId);
    const currentProfile = parseOwnedProfile(
      profileSnapshot,
      teacherId,
      input.classroomId,
      input.studentId,
    );
    if (
      currentProfile.updatedAt !== profileUsed.updatedAt ||
      JSON.stringify(currentProfile.observations) !== JSON.stringify(profileUsed.observations)
    ) {
      throw new LifecycleStateError();
    }
    transaction.create(refs.proposalRef, proposal);
  });

  return proposal;
};

const generateRecommendation = async (
  teacherId: TeacherId,
  input: RecommendStudentSupportsInput,
) => {
  const refs = refsFor(input);
  const profile = await loadAuthorizedProfile(
    teacherId,
    input,
    refs.classroomRef,
    refs.studentRef,
    refs.profileRef,
  );

  let recommendationInput;
  try {
    recommendationInput = recommendationInputFromObservations(profile.observations);
  } catch (error) {
    if (error instanceof InsufficientRecommendationEvidenceError) {
      throw new HttpsError('failed-precondition', INSUFFICIENT_OBSERVATIONS_MESSAGE);
    }
    throw error;
  }

  const provider = createAiProvider();
  let recommendationResult;
  try {
    recommendationResult = await runControlledAiOperation({
      teacherId,
      operation: 'recommendStudentSupports',
      provider,
      invoke: () => provider.recommendSupports(recommendationInput),
    });
  } catch (error) {
    if (error instanceof AiOperationalControlError) {
      throw new HttpsError(
        error.reason === 'rate_limited' ? 'resource-exhausted' : 'unavailable',
        RECOMMENDATION_UNAVAILABLE_MESSAGE,
      );
    }
    if (recommendationFallbackCode(error) !== null) {
      throw new HttpsError('unavailable', RECOMMENDATION_UNAVAILABLE_MESSAGE);
    }
    throw error;
  }

  const proposal = await persistCurrentProposal(
    teacherId,
    input,
    profile,
    recommendationResult,
    Date.now(),
    refs,
  );
  return {
    proposalId: proposal.id,
    recommendationResult: proposal.recommendationResult,
  };
};

export const recommendStudentSupports = onCall(
  { ...teacherCallableOptions, secrets: [openAiApiKey] },
  (request) =>
    executeTeacherOperation(
      'recommendStudentSupports',
      request,
      recommendStudentSupportsInputSchema,
      generateRecommendation,
    ),
);
