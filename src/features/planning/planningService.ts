import { httpsCallable } from 'firebase/functions';

import {
  classroomIdSchema,
  analyzeIepDocumentInputSchema,
  IEP_MAX_FILE_BYTES,
  iepProfileDraftSchema,
  recommendationResultSchema,
  studentIdSchema,
  studentSafeIdentitySchema,
  structuredObservationsSchema,
  supportPlanIdSchema,
  supportPlanVersionSchema,
  supportSettingsSchema,
  teacherOnlyStudentProfileSchema,
  type RecommendationResult,
  type IepProfileDraft,
  type StructuredObservations,
  type StudentSafeIdentity,
  type SupportPlanVersion,
  type SupportSettings,
  type TeacherOnlyStudentProfile,
} from '@/lib/domain';
import { firebaseRuntime, functions } from '@/lib/firebase';

export interface StudentPlanningData {
  activePlan: SupportPlanVersion | null;
  historyTruncated: boolean;
  planHistory: SupportPlanVersion[];
  profile: TeacherOnlyStudentProfile | null;
  student: StudentSafeIdentity;
}

type PlanningIdentityInput = { classroomId: string; studentId: string };
type CallableEnvelope = { claimsRefreshRequired: boolean };

const getStudentPlanningDataCallable = httpsCallable<PlanningIdentityInput, unknown>(
  functions,
  'getStudentPlanningData',
  firebaseRuntime.callableOptions,
);
const saveStudentProfileCallable = httpsCallable<
  PlanningIdentityInput & {
    observations: StructuredObservations;
    teacherSummary?: string;
  },
  unknown
>(functions, 'saveStudentProfile', firebaseRuntime.callableOptions);
const recommendStudentSupportsCallable = httpsCallable<PlanningIdentityInput, unknown>(
  functions,
  'recommendStudentSupports',
  firebaseRuntime.callableOptions,
);
const analyzeIepDocumentCallable = httpsCallable<
  PlanningIdentityInput & {
    fileName: string;
    mimeType: string;
    base64Data: string;
  },
  unknown
>(functions, 'analyzeIepDocument', firebaseRuntime.callableOptions);
const createSupportPlanVersionCallable = httpsCallable<
  PlanningIdentityInput & { supports: SupportSettings[] },
  unknown
>(functions, 'createSupportPlanVersion', firebaseRuntime.callableOptions);
const revertSupportPlanVersionCallable = httpsCallable<
  PlanningIdentityInput & { priorPlanId: string },
  unknown
>(functions, 'revertSupportPlanVersion', firebaseRuntime.callableOptions);

const ACTION_ERROR = 'Unable to update this student’s support plan. Please try again.';

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(ACTION_ERROR);
  return value as Record<string, unknown>;
};

const envelope = (value: unknown): Record<string, unknown> & CallableEnvelope => {
  const parsed = record(value);
  if (typeof parsed.claimsRefreshRequired !== 'boolean') throw new Error(ACTION_ERROR);
  return parsed as Record<string, unknown> & CallableEnvelope;
};

const planningIdentity = ({ classroomId, studentId }: PlanningIdentityInput) => ({
  classroomId: classroomIdSchema.parse(classroomId),
  studentId: studentIdSchema.parse(studentId),
});

const parsePlanningData = (
  value: unknown,
  identity: PlanningIdentityInput,
): StudentPlanningData => {
  const data = envelope(value);
  if (!Array.isArray(data.planHistory) || typeof data.historyTruncated !== 'boolean') {
    throw new Error(ACTION_ERROR);
  }

  const student = studentSafeIdentitySchema.parse(data.student);
  const profile =
    data.profile === null ? null : teacherOnlyStudentProfileSchema.parse(data.profile);
  const activePlan =
    data.activePlan === null ? null : supportPlanVersionSchema.parse(data.activePlan);
  const planHistory = data.planHistory.map((plan) => supportPlanVersionSchema.parse(plan));

  if (
    student.id !== identity.studentId ||
    student.classroomId !== identity.classroomId ||
    (profile !== null &&
      (profile.studentId !== identity.studentId || profile.classroomId !== identity.classroomId)) ||
    (activePlan !== null &&
      (activePlan.studentId !== identity.studentId ||
        activePlan.classroomId !== identity.classroomId)) ||
    planHistory.some(
      (plan) => plan.studentId !== identity.studentId || plan.classroomId !== identity.classroomId,
    ) ||
    (activePlan !== null && !planHistory.some((plan) => plan.id === activePlan.id))
  ) {
    throw new Error(ACTION_ERROR);
  }

  return {
    activePlan,
    historyTruncated: data.historyTruncated,
    planHistory,
    profile,
    student,
  };
};

const safely = async <Result>(action: () => Promise<Result>): Promise<Result> => {
  try {
    return await action();
  } catch {
    throw new Error(ACTION_ERROR);
  }
};

export const getStudentPlanningData = (input: PlanningIdentityInput) =>
  safely(async () => {
    const identity = planningIdentity(input);
    const response = await getStudentPlanningDataCallable(identity);
    return parsePlanningData(response.data, identity);
  });

export const saveStudentProfile = (
  input: PlanningIdentityInput & {
    observations: StructuredObservations;
    teacherSummary?: string;
  },
) =>
  safely(async () => {
    const identity = planningIdentity(input);
    const observations = structuredObservationsSchema.parse(input.observations);
    const teacherSummary = input.teacherSummary?.trim();
    if (teacherSummary !== undefined && teacherSummary.length > 1000) throw new Error(ACTION_ERROR);

    const response = await saveStudentProfileCallable({
      ...identity,
      observations,
      ...(teacherSummary ? { teacherSummary } : {}),
    });
    const data = envelope(response.data);
    const profile = teacherOnlyStudentProfileSchema.parse(data.profile);
    if (profile.classroomId !== identity.classroomId || profile.studentId !== identity.studentId) {
      throw new Error(ACTION_ERROR);
    }
    return profile;
  });

export const recommendStudentSupports = (input: PlanningIdentityInput) =>
  safely(async (): Promise<RecommendationResult> => {
    const identity = planningIdentity(input);
    const response = await recommendStudentSupportsCallable(identity);
    const data = envelope(response.data);
    if (typeof data.proposalId !== 'string' || data.proposalId.trim().length === 0) {
      throw new Error(ACTION_ERROR);
    }
    return recommendationResultSchema.parse(data.recommendationResult);
  });

const mimeTypeForIep = (file: File) => {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return 'application/pdf' as const;
  }
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.toLowerCase().endsWith('.docx')
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;
  }
  if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
    return 'text/plain' as const;
  }
  throw new Error(ACTION_ERROR);
};

const base64For = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
};

export const analyzeIepDocument = (
  input: PlanningIdentityInput & { file: File },
): Promise<IepProfileDraft> =>
  safely(async () => {
    if (input.file.size === 0 || input.file.size > IEP_MAX_FILE_BYTES) {
      throw new Error(ACTION_ERROR);
    }
    const identity = planningIdentity(input);
    const payload = analyzeIepDocumentInputSchema.parse({
      ...identity,
      fileName: input.file.name,
      mimeType: mimeTypeForIep(input.file),
      base64Data: await base64For(input.file),
    });
    const response = await analyzeIepDocumentCallable(payload);
    const data = envelope(response.data);
    return iepProfileDraftSchema.parse(data.profileDraft);
  });

export const createSupportPlanVersion = (
  input: PlanningIdentityInput & { supports: SupportSettings[] },
) =>
  safely(async () => {
    const identity = planningIdentity(input);
    const supports = input.supports.map((settings) => supportSettingsSchema.parse(settings));
    if (new Set(supports.map(({ supportKey }) => supportKey)).size !== supports.length) {
      throw new Error(ACTION_ERROR);
    }
    const response = await createSupportPlanVersionCallable({ ...identity, supports });
    const data = envelope(response.data);
    const plan = supportPlanVersionSchema.parse(data.supportPlan);
    if (plan.classroomId !== identity.classroomId || plan.studentId !== identity.studentId) {
      throw new Error(ACTION_ERROR);
    }
    return plan;
  });

export const revertSupportPlanVersion = (input: PlanningIdentityInput & { priorPlanId: string }) =>
  safely(async () => {
    const identity = planningIdentity(input);
    const priorPlanId = supportPlanIdSchema.parse(input.priorPlanId);
    const response = await revertSupportPlanVersionCallable({ ...identity, priorPlanId });
    const data = envelope(response.data);
    const plan = supportPlanVersionSchema.parse(data.supportPlan);
    if (plan.classroomId !== identity.classroomId || plan.studentId !== identity.studentId) {
      throw new Error(ACTION_ERROR);
    }
    return plan;
  });
