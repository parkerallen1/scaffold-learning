import { httpsCallable } from 'firebase/functions';

import {
  assignmentDraftSchema,
  assignmentIdSchema,
  assignmentTargetSchema,
  classroomIdSchema,
  epochMillisSchema,
  publicAssignmentSchema,
  studentIdSchema,
  teacherIdSchema,
  type AssignmentDraft,
  type AssignmentTarget,
  type PublicAssignment,
} from '@/lib/domain';
import { firebaseRuntime, functions } from '@/lib/firebase';

type AssignmentRevision = Readonly<{
  assignmentId: string;
  classroomId: string;
  createdAt: number;
  createdBy: string;
  id: string;
  publishedAt: number | null;
  revision: number;
  status: 'draft' | 'published';
}>;

type CreateAssignmentDraftInput = {
  classroomId: string;
  draft: AssignmentDraft;
};

type PublishAssignmentInput = {
  assignmentId: string;
  classroomId: string;
  revisionId: string;
};

type AssignPublishedAssignmentInput = {
  assignmentId: string;
  classroomId: string;
  studentIds: string[];
};

const createAssignmentDraftCallable = httpsCallable<CreateAssignmentDraftInput, unknown>(
  functions,
  'createAssignmentDraft',
  firebaseRuntime.callableOptions,
);
const publishAssignmentCallable = httpsCallable<PublishAssignmentInput, unknown>(
  functions,
  'publishAssignment',
  firebaseRuntime.callableOptions,
);
const assignPublishedAssignmentCallable = httpsCallable<AssignPublishedAssignmentInput, unknown>(
  functions,
  'assignPublishedAssignment',
  firebaseRuntime.callableOptions,
);

const ACTION_ERROR = 'Unable to publish and assign this assignment. Please try again.';

const strictRecord = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(ACTION_ERROR);
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record);
  if (actualKeys.length !== keys.length || keys.some((key) => !actualKeys.includes(key))) {
    throw new Error(ACTION_ERROR);
  }
  return record;
};

const parseClaimsRefresh = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new Error(ACTION_ERROR);
  return value;
};

const parseRevisionId = (value: unknown): string => assignmentIdSchema.parse(value);

const parseRevision = (value: unknown): AssignmentRevision => {
  const revision = strictRecord(value, [
    'assignmentId',
    'classroomId',
    'createdAt',
    'createdBy',
    'id',
    'publishedAt',
    'revision',
    'status',
  ]);
  const revisionNumber = revision.revision;
  if (!Number.isInteger(revisionNumber) || (revisionNumber as number) < 1) {
    throw new Error(ACTION_ERROR);
  }
  if (revision.status !== 'draft' && revision.status !== 'published') {
    throw new Error(ACTION_ERROR);
  }

  return Object.freeze({
    assignmentId: assignmentIdSchema.parse(revision.assignmentId),
    classroomId: classroomIdSchema.parse(revision.classroomId),
    createdAt: epochMillisSchema.parse(revision.createdAt),
    createdBy: teacherIdSchema.parse(revision.createdBy),
    id: parseRevisionId(revision.id),
    publishedAt:
      revision.publishedAt === null ? null : epochMillisSchema.parse(revision.publishedAt),
    revision: revisionNumber as number,
    status: revision.status,
  });
};

const parseAssignmentEnvelope = (
  value: unknown,
): Readonly<{ assignment: PublicAssignment; revision: AssignmentRevision }> => {
  const envelope = strictRecord(value, ['assignment', 'claimsRefreshRequired', 'revision']);
  parseClaimsRefresh(envelope.claimsRefreshRequired);
  return Object.freeze({
    assignment: publicAssignmentSchema.parse(envelope.assignment),
    revision: parseRevision(envelope.revision),
  });
};

const assertMatchingRevision = (
  assignment: PublicAssignment,
  revision: AssignmentRevision,
): void => {
  if (
    assignment.id !== revision.assignmentId ||
    assignment.classroomId !== revision.classroomId ||
    assignment.createdBy !== revision.createdBy ||
    assignment.revision !== revision.revision ||
    assignment.status !== revision.status ||
    assignment.publishedAt !== revision.publishedAt
  ) {
    throw new Error(ACTION_ERROR);
  }
};

const safely = async <Result>(action: () => Promise<Result>): Promise<Result> => {
  try {
    return await action();
  } catch {
    throw new Error(ACTION_ERROR);
  }
};

export const createAssignmentDraft = (input: CreateAssignmentDraftInput) =>
  safely(async () => {
    const classroomId = classroomIdSchema.parse(input.classroomId);
    const draft = assignmentDraftSchema.parse(input.draft);
    const response = await createAssignmentDraftCallable({ classroomId, draft });
    const parsed = parseAssignmentEnvelope(response.data);
    assertMatchingRevision(parsed.assignment, parsed.revision);
    if (
      parsed.assignment.classroomId !== classroomId ||
      parsed.assignment.status !== 'draft' ||
      parsed.assignment.source !== 'teacherAuthored' ||
      parsed.assignment.title !== draft.title ||
      parsed.assignment.questionCount !== draft.questions.length ||
      parsed.assignment.revision !== 1 ||
      parsed.assignment.publishedAt !== null
    ) {
      throw new Error(ACTION_ERROR);
    }
    return parsed;
  });

export const publishAssignment = (input: PublishAssignmentInput) =>
  safely(async () => {
    const request = {
      assignmentId: assignmentIdSchema.parse(input.assignmentId),
      classroomId: classroomIdSchema.parse(input.classroomId),
      revisionId: parseRevisionId(input.revisionId),
    };
    const response = await publishAssignmentCallable(request);
    const parsed = parseAssignmentEnvelope(response.data);
    assertMatchingRevision(parsed.assignment, parsed.revision);
    if (
      parsed.assignment.id !== request.assignmentId ||
      parsed.assignment.classroomId !== request.classroomId ||
      parsed.assignment.status !== 'published' ||
      parsed.assignment.publishedAt === null ||
      parsed.revision.id !== request.revisionId
    ) {
      throw new Error(ACTION_ERROR);
    }
    return parsed.assignment;
  });

export const assignPublishedAssignment = (input: AssignPublishedAssignmentInput) =>
  safely(
    async (): Promise<Readonly<{ assignment: PublicAssignment; targets: AssignmentTarget[] }>> => {
      const assignmentId = assignmentIdSchema.parse(input.assignmentId);
      const classroomId = classroomIdSchema.parse(input.classroomId);
      const studentIds = input.studentIds.map((studentId) => studentIdSchema.parse(studentId));
      if (
        studentIds.length < 1 ||
        studentIds.length > 50 ||
        new Set(studentIds).size !== studentIds.length
      ) {
        throw new Error(ACTION_ERROR);
      }

      const response = await assignPublishedAssignmentCallable({
        assignmentId,
        classroomId,
        studentIds,
      });
      const envelope = strictRecord(response.data, [
        'assignment',
        'claimsRefreshRequired',
        'targets',
      ]);
      parseClaimsRefresh(envelope.claimsRefreshRequired);
      const assignment = publicAssignmentSchema.parse(envelope.assignment);
      if (!Array.isArray(envelope.targets) || envelope.targets.length !== studentIds.length) {
        throw new Error(ACTION_ERROR);
      }
      const targets = envelope.targets.map((target) => assignmentTargetSchema.parse(target));
      const returnedStudentIds = new Set(targets.map((target) => target.studentId));
      if (
        assignment.id !== assignmentId ||
        assignment.classroomId !== classroomId ||
        assignment.status !== 'published' ||
        returnedStudentIds.size !== studentIds.length ||
        studentIds.some((studentId) => !returnedStudentIds.has(studentId)) ||
        targets.some(
          (target) =>
            target.assignmentId !== assignmentId ||
            target.classroomId !== classroomId ||
            target.assignmentRevision !== assignment.revision,
        )
      ) {
        throw new Error(ACTION_ERROR);
      }
      return Object.freeze({ assignment, targets });
    },
  );
