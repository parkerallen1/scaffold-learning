import { z } from 'zod';

import { classroomIdSchema, studentIdSchema } from './ids.js';
import { structuredObservationsSchema } from './identity.js';

export const IEP_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IEP_ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const iepMimeTypeSchema = z.enum(IEP_ACCEPTED_MIME_TYPES);

export const analyzeIepDocumentInputSchema = z
  .object({
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    fileName: z.string().trim().min(1).max(180),
    mimeType: iepMimeTypeSchema,
    base64Data: z
      .string()
      .min(4)
      .max(Math.ceil((IEP_MAX_FILE_BYTES * 4) / 3) + 4)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export const iepProfileDraftSchema = z
  .object({
    observations: structuredObservationsSchema,
    teacherSummary: z.string().trim().min(1).max(1000),
  })
  .strict();

export type AnalyzeIepDocumentInput = z.infer<typeof analyzeIepDocumentInputSchema>;
export type IepProfileDraft = z.infer<typeof iepProfileDraftSchema>;
