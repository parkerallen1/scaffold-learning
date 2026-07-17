import { z } from 'zod';

import {
  assignmentIdSchema,
  assignmentTargetIdSchema,
  classroomIdSchema,
  epochMillisSchema,
  eventIdSchema,
  idempotencyKeySchema,
  questionIdSchema,
  sessionIdSchema,
  studentIdSchema,
  supportPlanIdSchema,
} from './ids.js';
import { choiceIdSchema } from './ids.js';
import { SUPPORT_KEYS, supportKeySchema } from './supports.js';

export const sessionStatusSchema = z.enum(['inProgress', 'paused', 'completed', 'abandoned']);

export const sessionStateSchema = z
  .object({
    id: sessionIdSchema,
    targetId: assignmentTargetIdSchema,
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    assignmentId: assignmentIdSchema,
    assignmentRevision: z.number().int().positive(),
    supportPlanId: supportPlanIdSchema,
    supportPlanVersion: z.number().int().positive(),
    status: sessionStatusSchema,
    currentQuestionId: questionIdSchema.nullable(),
    startedAt: epochMillisSchema,
    updatedAt: epochMillisSchema,
    completedAt: epochMillisSchema.nullable(),
  })
  .strict();

export const submittedAnswerSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('numeric'),
      value: z.number().finite(),
      unit: z.string().max(40).optional(),
    })
    .strict(),
  z.object({ kind: z.literal('choice'), choiceId: choiceIdSchema }).strict(),
  z.object({ kind: z.literal('shortText'), value: z.string().max(1000) }).strict(),
]);

export const attemptEventSchema = z
  .object({
    id: eventIdSchema,
    idempotencyKey: idempotencyKeySchema,
    sessionId: sessionIdSchema,
    studentId: studentIdSchema,
    questionId: questionIdSchema,
    attemptNumber: z.number().int().positive(),
    submittedAnswer: submittedAnswerSchema,
    outcome: z.enum(['pending', 'correct', 'incorrect', 'teacherReview']),
    activeSupports: z.array(supportKeySchema).max(SUPPORT_KEYS.length),
    clientOccurredAt: epochMillisSchema,
    createdAt: epochMillisSchema,
    elapsedMs: z.number().int().nonnegative().max(86_400_000),
  })
  .strict()
  .readonly();

export const supportEventSchema = z
  .object({
    id: eventIdSchema,
    idempotencyKey: idempotencyKeySchema,
    sessionId: sessionIdSchema,
    studentId: studentIdSchema,
    questionId: questionIdSchema.nullable(),
    supportKey: supportKeySchema,
    action: z.enum(['available', 'shown', 'activated', 'completed', 'dismissed']),
    clientOccurredAt: epochMillisSchema,
    createdAt: epochMillisSchema,
  })
  .strict()
  .readonly();

export type SessionState = z.infer<typeof sessionStateSchema>;
export type SubmittedAnswer = z.infer<typeof submittedAnswerSchema>;
export type AttemptEvent = z.infer<typeof attemptEventSchema>;
export type SupportEvent = z.infer<typeof supportEventSchema>;
