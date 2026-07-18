import { z } from 'zod';

import {
  idempotencyKeySchema,
  questionIdSchema,
  sessionIdSchema,
  studentIdSchema,
} from '@/lib/domain';

const answerDraftSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('numeric'), unit: z.string().max(40), value: z.string().max(100) })
    .strict(),
  z.object({ choiceId: z.string().max(64), kind: z.literal('choice') }).strict(),
  z.object({ kind: z.literal('shortText'), value: z.string().max(1000) }).strict(),
]);

const storedDraftSchema = z
  .object({
    answer: answerDraftSchema,
    pendingSubmissionKey: idempotencyKeySchema.nullable(),
    updatedAt: z.number().int().nonnegative(),
    version: z.literal(1),
  })
  .strict();

export type AnswerDraft = z.infer<typeof answerDraftSchema>;
export type StoredStudentDraft = z.infer<typeof storedDraftSchema>;

const storageKey = (studentId: string, sessionId: string, questionId: string): string =>
  `quiz-master:student-draft:v1:${studentIdSchema.parse(studentId)}:${sessionIdSchema.parse(sessionId)}:${questionIdSchema.parse(questionId)}`;

export const readStudentDraft = (
  studentId: string,
  sessionId: string,
  questionId: string,
): StoredStudentDraft | null => {
  try {
    const stored = localStorage.getItem(storageKey(studentId, sessionId, questionId));
    if (stored === null) return null;
    const parsed = storedDraftSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const writeStudentDraft = (
  studentId: string,
  sessionId: string,
  questionId: string,
  draft: StoredStudentDraft,
): void => {
  try {
    localStorage.setItem(
      storageKey(studentId, sessionId, questionId),
      JSON.stringify(storedDraftSchema.parse(draft)),
    );
  } catch {
    // Draft persistence is best effort; the in-memory answer remains available.
  }
};

export const clearStudentDraft = (
  studentId: string,
  sessionId: string,
  questionId: string,
): void => {
  try {
    localStorage.removeItem(storageKey(studentId, sessionId, questionId));
  } catch {
    // A blocked storage API must not prevent server-backed progress.
  }
};

export const clearStudentDraftsForStudent = (studentId: string): void => {
  try {
    const prefix = `quiz-master:student-draft:v1:${studentIdSchema.parse(studentId)}:`;
    const matchingKeys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ).filter((key): key is string => key !== null && key.startsWith(prefix));
    for (const key of matchingKeys) localStorage.removeItem(key);
  } catch {
    // Sign-out continues even when browser storage is unavailable.
  }
};
