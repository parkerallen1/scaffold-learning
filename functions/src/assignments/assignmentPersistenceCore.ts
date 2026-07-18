import { z } from 'zod';

import {
  assignmentDraftSchema,
  assignmentIdSchema,
  assignmentTargetIdFor,
  assignmentTargetSchema,
  classroomIdSchema,
  epochMillisSchema,
  materializeAssignmentDraft,
  publicAssignmentSchema,
  studentIdSchema,
  studentSafeIdentitySchema,
  supportPlanVersionSchema,
  teacherIdSchema,
  type AssignmentAnswerKey,
  type AssignmentDraft,
  type AssignmentId,
  type AssignmentTarget,
  type ClassroomId,
  type EpochMillis,
  type PublicAssignment,
  type PublicQuestion,
  type StudentSafeIdentity,
  type SupportPlanVersion,
  type TeacherId,
} from '@quiz-master/domain';

export const assignmentRevisionIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .brand<'AssignmentRevisionId'>();

export type AssignmentRevisionId = z.infer<typeof assignmentRevisionIdSchema>;

export const assignmentRevisionSchema = z
  .object({
    id: assignmentRevisionIdSchema,
    assignmentId: assignmentIdSchema,
    classroomId: classroomIdSchema,
    revision: z.number().int().positive(),
    status: z.enum(['draft', 'published']),
    createdBy: teacherIdSchema,
    createdAt: epochMillisSchema,
    publishedAt: epochMillisSchema.nullable(),
  })
  .strict()
  .readonly();

export type AssignmentRevision = z.infer<typeof assignmentRevisionSchema>;

export class AssignmentPersistenceError extends Error {
  constructor(
    readonly reason:
      'assignment-not-published' | 'identity-mismatch' | 'revision-mismatch' | 'revision-not-draft',
  ) {
    super('Assignment persistence transition was rejected.');
    this.name = 'AssignmentPersistenceError';
  }
}

export const createAssignmentDraftInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    draft: assignmentDraftSchema,
  })
  .strict();

export const publishAssignmentInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    assignmentId: assignmentIdSchema,
    revisionId: assignmentRevisionIdSchema,
  })
  .strict();

export const assignPublishedAssignmentInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    assignmentId: assignmentIdSchema,
    studentIds: z
      .array(studentIdSchema)
      .min(1)
      .max(50)
      .superRefine((studentIds, context) => {
        if (new Set(studentIds).size !== studentIds.length) {
          context.addIssue({
            code: 'custom',
            path: [],
            message: 'Student IDs must be unique.',
          });
        }
      })
      .readonly(),
  })
  .strict();

export const materializeStoredAssignmentDraft = ({
  draft,
  assignmentId,
  revisionId,
  classroomId,
  createdBy,
  createdAt,
}: Readonly<{
  draft: AssignmentDraft;
  assignmentId: AssignmentId;
  revisionId: AssignmentRevisionId;
  classroomId: ClassroomId;
  createdBy: TeacherId;
  createdAt: EpochMillis;
}>): Readonly<{
  assignment: PublicAssignment;
  revision: AssignmentRevision;
  publicQuestions: readonly PublicQuestion[];
  answerKey: AssignmentAnswerKey;
}> => {
  const materialized = materializeAssignmentDraft({
    draft,
    assignmentId,
    classroomId,
    revision: 1,
    createdBy,
    createdAt,
    publish: false,
  });

  return Object.freeze({
    ...materialized,
    revision: assignmentRevisionSchema.parse({
      id: revisionId,
      assignmentId,
      classroomId,
      revision: materialized.assignment.revision,
      status: 'draft',
      createdBy,
      createdAt,
      publishedAt: null,
    }),
  });
};

export const publishStoredAssignment = ({
  assignment: assignmentInput,
  revision: revisionInput,
  publishedAt,
}: Readonly<{
  assignment: PublicAssignment;
  revision: AssignmentRevision;
  publishedAt: EpochMillis;
}>): Readonly<{ assignment: PublicAssignment; revision: AssignmentRevision }> => {
  const assignment = publicAssignmentSchema.parse(assignmentInput);
  const revision = assignmentRevisionSchema.parse(revisionInput);
  if (
    assignment.id !== revision.assignmentId ||
    assignment.classroomId !== revision.classroomId ||
    assignment.revision !== revision.revision ||
    assignment.createdBy !== revision.createdBy
  ) {
    throw new AssignmentPersistenceError('revision-mismatch');
  }
  if (assignment.status !== 'draft' || revision.status !== 'draft') {
    throw new AssignmentPersistenceError('revision-not-draft');
  }

  return Object.freeze({
    assignment: publicAssignmentSchema.parse({
      ...assignment,
      status: 'published',
      publishedAt,
    }),
    revision: assignmentRevisionSchema.parse({
      ...revision,
      status: 'published',
      publishedAt,
    }),
  });
};

export const buildAssignmentTarget = ({
  assignment: assignmentInput,
  student: studentInput,
  supportPlan: supportPlanInput,
  assignedBy,
  assignedAt,
}: Readonly<{
  assignment: PublicAssignment;
  student: StudentSafeIdentity;
  supportPlan: SupportPlanVersion;
  assignedBy: TeacherId;
  assignedAt: EpochMillis;
}>): AssignmentTarget => {
  const assignment = publicAssignmentSchema.parse(assignmentInput);
  const student = studentSafeIdentitySchema.parse(studentInput);
  const supportPlan = supportPlanVersionSchema.parse(supportPlanInput);
  if (assignment.status !== 'published') {
    throw new AssignmentPersistenceError('assignment-not-published');
  }
  if (
    student.classroomId !== assignment.classroomId ||
    supportPlan.classroomId !== assignment.classroomId ||
    supportPlan.studentId !== student.id ||
    assignment.createdBy !== assignedBy
  ) {
    throw new AssignmentPersistenceError('identity-mismatch');
  }

  return assignmentTargetSchema.parse({
    id: assignmentTargetIdFor(assignment.id, student.id),
    classroomId: assignment.classroomId,
    assignmentId: assignment.id,
    assignmentRevision: assignment.revision,
    studentId: student.id,
    supportPlanId: supportPlan.id,
    supportPlanVersion: supportPlan.version,
    assignedBy,
    assignedAt,
  });
};
