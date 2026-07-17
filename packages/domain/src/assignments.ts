import { z } from 'zod';

import {
  assignmentIdSchema,
  assignmentTargetIdSchema,
  choiceIdSchema,
  classroomIdSchema,
  epochMillisSchema,
  questionIdSchema,
  studentIdSchema,
  supportPlanIdSchema,
  teacherIdSchema,
} from './ids.js';

export const assignmentStatusSchema = z.enum(['draft', 'published', 'archived']);

export const publicAssignmentSchema = z
  .object({
    id: assignmentIdSchema,
    classroomId: classroomIdSchema,
    title: z.string().trim().min(1).max(160),
    status: assignmentStatusSchema,
    source: z.enum(['seed', 'teacherAuthored', 'extractedDraft']),
    revision: z.number().int().positive(),
    questionCount: z.number().int().nonnegative(),
    createdBy: teacherIdSchema,
    createdAt: epochMillisSchema,
    publishedAt: epochMillisSchema.nullable(),
  })
  .strict();

const publicQuestionBase = {
  id: questionIdSchema,
  assignmentId: assignmentIdSchema,
  order: z.number().int().nonnegative(),
  prompt: z.string().trim().min(1).max(4000),
  approvedHints: z.array(z.string().trim().min(1).max(1000)).max(3).default([]),
};

export const numericPublicQuestionSchema = z
  .object({
    ...publicQuestionBase,
    questionType: z.literal('numeric'),
    unitLabel: z.string().trim().max(40).optional(),
  })
  .strict();

export const multipleChoicePublicQuestionSchema = z
  .object({
    ...publicQuestionBase,
    questionType: z.literal('multipleChoice'),
    choices: z
      .array(
        z
          .object({
            id: choiceIdSchema,
            label: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .min(2)
      .max(8),
  })
  .strict();

export const shortTextPublicQuestionSchema = z
  .object({
    ...publicQuestionBase,
    questionType: z.literal('shortText'),
    maxLength: z.number().int().min(1).max(1000).default(250),
  })
  .strict();

export const publicQuestionSchema = z.discriminatedUnion('questionType', [
  numericPublicQuestionSchema,
  multipleChoicePublicQuestionSchema,
  shortTextPublicQuestionSchema,
]);

export const numericAnswerKeySchema = z
  .object({
    questionId: questionIdSchema,
    questionType: z.literal('numeric'),
    expectedValue: z.number().finite(),
    tolerance: z.number().nonnegative().finite().default(0),
    acceptedUnits: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  })
  .strict();

export const multipleChoiceAnswerKeySchema = z
  .object({
    questionId: questionIdSchema,
    questionType: z.literal('multipleChoice'),
    correctChoiceId: choiceIdSchema,
  })
  .strict();

export const shortTextAnswerKeySchema = z
  .object({
    questionId: questionIdSchema,
    questionType: z.literal('shortText'),
    acceptedAnswers: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
    normalization: z.enum(['caseAndWhitespace', 'exact']),
    teacherReviewAllowed: z.literal(true),
  })
  .strict();

export const questionAnswerKeySchema = z.discriminatedUnion('questionType', [
  numericAnswerKeySchema,
  multipleChoiceAnswerKeySchema,
  shortTextAnswerKeySchema,
]);

export const assignmentAnswerKeySchema = z
  .object({
    assignmentId: assignmentIdSchema,
    assignmentRevision: z.number().int().positive(),
    questionKeys: z.array(questionAnswerKeySchema),
    rubricNotes: z.string().trim().max(2000).optional(),
    createdBy: teacherIdSchema,
    createdAt: epochMillisSchema,
  })
  .strict();

export const assignmentTargetSchema = z
  .object({
    id: assignmentTargetIdSchema,
    classroomId: classroomIdSchema,
    assignmentId: assignmentIdSchema,
    assignmentRevision: z.number().int().positive(),
    studentId: studentIdSchema,
    supportPlanId: supportPlanIdSchema,
    supportPlanVersion: z.number().int().positive(),
    assignedBy: teacherIdSchema,
    assignedAt: epochMillisSchema,
  })
  .strict()
  .readonly();

export type PublicAssignment = z.infer<typeof publicAssignmentSchema>;
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;
export type AssignmentAnswerKey = z.infer<typeof assignmentAnswerKeySchema>;
export type AssignmentTarget = z.infer<typeof assignmentTargetSchema>;
