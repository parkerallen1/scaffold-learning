import { z } from 'zod';

import {
  classroomIdSchema,
  classroomSchema,
  createNextSupportPlanVersion,
  epochMillisSchema,
  studentIdSchema,
  studentProfileIdSchema,
  studentSafeIdentitySchema,
  structuredObservationsSchema,
  supportPlanIdSchema,
  supportPlanVersionSchema,
  supportSettingsSchema,
  type Classroom,
  type StudentSafeIdentity,
  type SupportPlanVersion,
  type SupportSettings,
  type TeacherId,
} from '@scaffold-learning/domain';

export class PlanningOwnershipError extends Error {
  constructor() {
    super('Planning resource ownership does not match.');
    this.name = 'PlanningOwnershipError';
  }
}

export class SupportPlanTransitionError extends Error {
  constructor(readonly reason: 'identity-mismatch' | 'not-prior' | 'pointer-mismatch') {
    super('Support-plan transition was rejected.');
    this.name = 'SupportPlanTransitionError';
  }
}

export const supportSettingsListSchema = z
  .array(supportSettingsSchema)
  .max(7)
  .superRefine((supports, context) => {
    const keys = supports.map((support) => support.supportKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: 'Support keys must be unique.',
      });
    }
  })
  .readonly();

export const saveStudentProfileInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    observations: structuredObservationsSchema,
    teacherSummary: z.string().trim().max(1000).optional(),
  })
  .strict();

export const studentPlanningInputSchema = z
  .object({ classroomId: classroomIdSchema, studentId: studentIdSchema })
  .strict();

export const createSupportPlanInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    supports: supportSettingsListSchema,
  })
  .strict();

export const revertSupportPlanInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    priorPlanId: supportPlanIdSchema,
  })
  .strict();

export const activeSupportPlanPointerSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    activePlanId: supportPlanIdSchema,
    activeVersion: z.number().int().positive(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type ActiveSupportPlanPointer = z.infer<typeof activeSupportPlanPointerSchema>;

export const assertOwnedStudent = (
  classroomInput: Classroom,
  studentInput: StudentSafeIdentity,
  teacherId: TeacherId,
  requireActive = true,
): void => {
  const classroom = classroomSchema.parse(classroomInput);
  const student = studentSafeIdentitySchema.parse(studentInput);
  if (
    classroom.teacherId !== teacherId ||
    student.classroomId !== classroom.id ||
    (requireActive && (classroom.status !== 'active' || student.status !== 'active'))
  ) {
    throw new PlanningOwnershipError();
  }
};

export const buildSupportPlanVersion = ({
  id,
  classroomId,
  studentId,
  previous,
  supports,
  source,
  approvedBy,
  approvedAt,
}: Readonly<{
  id: SupportPlanVersion['id'];
  classroomId: SupportPlanVersion['classroomId'];
  studentId: SupportPlanVersion['studentId'];
  previous: SupportPlanVersion | null;
  supports: readonly SupportSettings[];
  source: Exclude<SupportPlanVersion['source'], 'revert'>;
  approvedBy: SupportPlanVersion['approvedBy'];
  approvedAt: number;
}>): SupportPlanVersion => {
  const validatedSupports = supportSettingsListSchema.parse(supports);
  if (previous === null) {
    return supportPlanVersionSchema.parse({
      id,
      classroomId,
      studentId,
      version: 1,
      supports: validatedSupports,
      source,
      approvedBy,
      approvedAt: epochMillisSchema.parse(approvedAt),
      supersedesId: null,
    });
  }

  const validatedPrevious = supportPlanVersionSchema.parse(previous);
  if (validatedPrevious.classroomId !== classroomId || validatedPrevious.studentId !== studentId) {
    throw new SupportPlanTransitionError('identity-mismatch');
  }
  return createNextSupportPlanVersion({
    id,
    previous: validatedPrevious,
    supports: validatedSupports,
    source,
    approvedBy,
    approvedAt: epochMillisSchema.parse(approvedAt),
  });
};

export const buildRevertedSupportPlanVersion = ({
  id,
  current,
  prior,
  approvedBy,
  approvedAt,
}: Readonly<{
  id: SupportPlanVersion['id'];
  current: SupportPlanVersion;
  prior: SupportPlanVersion;
  approvedBy: SupportPlanVersion['approvedBy'];
  approvedAt: number;
}>): SupportPlanVersion => {
  const validatedCurrent = supportPlanVersionSchema.parse(current);
  const validatedPrior = supportPlanVersionSchema.parse(prior);
  if (
    validatedCurrent.classroomId !== validatedPrior.classroomId ||
    validatedCurrent.studentId !== validatedPrior.studentId
  ) {
    throw new SupportPlanTransitionError('identity-mismatch');
  }
  if (validatedPrior.version >= validatedCurrent.version) {
    throw new SupportPlanTransitionError('not-prior');
  }
  return createNextSupportPlanVersion({
    id,
    previous: validatedCurrent,
    supports: validatedPrior.supports,
    source: 'revert',
    approvedBy,
    approvedAt: epochMillisSchema.parse(approvedAt),
  });
};

export const activePointerFor = (
  planInput: SupportPlanVersion,
  updatedAt: number,
): ActiveSupportPlanPointer => {
  const plan = supportPlanVersionSchema.parse(planInput);
  return activeSupportPlanPointerSchema.parse({
    classroomId: plan.classroomId,
    studentId: plan.studentId,
    activePlanId: plan.id,
    activeVersion: plan.version,
    updatedAt,
  });
};

export const assertActivePointerMatches = (
  pointerInput: ActiveSupportPlanPointer,
  planInput: SupportPlanVersion,
): void => {
  const pointer = activeSupportPlanPointerSchema.parse(pointerInput);
  const plan = supportPlanVersionSchema.parse(planInput);
  if (
    pointer.classroomId !== plan.classroomId ||
    pointer.studentId !== plan.studentId ||
    pointer.activePlanId !== plan.id ||
    pointer.activeVersion !== plan.version
  ) {
    throw new SupportPlanTransitionError('pointer-mismatch');
  }
};

export const profileIdForStudent = (studentId: string) => studentProfileIdSchema.parse(studentId);
