import { z } from 'zod';

import {
  classroomIdSchema,
  epochMillisSchema,
  studentIdSchema,
  studentProfileIdSchema,
  teacherIdSchema,
} from './ids.js';

export const roleSchema = z.enum(['teacher', 'student']);
export const classroomStatusSchema = z.enum(['active', 'archived']);
export const studentStatusSchema = z.enum(['active', 'disabled']);

export const classroomSchema = z
  .object({
    id: classroomIdSchema,
    teacherId: teacherIdSchema,
    name: z.string().trim().min(1).max(100),
    status: classroomStatusSchema,
    createdAt: epochMillisSchema,
    updatedAt: epochMillisSchema,
  })
  .strict();

export const studentSafeIdentitySchema = z
  .object({
    id: studentIdSchema,
    classroomId: classroomIdSchema,
    displayName: z.string().trim().min(1).max(80),
    status: studentStatusSchema,
    authVersion: z.number().int().positive(),
    createdAt: epochMillisSchema,
    updatedAt: epochMillisSchema,
  })
  .strict();

export const learningBarrierSchema = z.enum([
  'readingDirections',
  'gettingStarted',
  'rememberingSteps',
  'calculation',
  'writtenResponse',
  'sustainingAttention',
  'handlingMistakes',
]);

export const responseModeSchema = z.enum(['typing', 'selection', 'speech', 'handwriting']);
export const timerResponseSchema = z.enum(['calming', 'neutral', 'stressful', 'unknown']);
export const adultPromptingSchema = z.enum(['none', 'occasional', 'frequent', 'unknown']);

export const structuredObservationsSchema = z
  .object({
    independentWork: z.string().trim().max(500).optional(),
    barriers: z.array(learningBarrierSchema).max(7).default([]),
    stuckLooksLike: z.string().trim().max(500).optional(),
    helpfulStrategies: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
    timerResponse: timerResponseSchema.default('unknown'),
    responsePreferences: z.array(responseModeSchema).max(4).default([]),
    adultPrompting: adultPromptingSchema.default('unknown'),
    interestsAndConsiderations: z.string().trim().max(500).optional(),
    neverDo: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  })
  .strict();

export const teacherOnlyStudentProfileSchema = z
  .object({
    id: studentProfileIdSchema,
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    observations: structuredObservationsSchema,
    teacherSummary: z.string().trim().max(1000).optional(),
    createdBy: teacherIdSchema,
    createdAt: epochMillisSchema,
    updatedAt: epochMillisSchema,
  })
  .strict();

export type Role = z.infer<typeof roleSchema>;
export type Classroom = z.infer<typeof classroomSchema>;
export type StudentSafeIdentity = z.infer<typeof studentSafeIdentitySchema>;
export type StructuredObservations = z.infer<typeof structuredObservationsSchema>;
export type TeacherOnlyStudentProfile = z.infer<typeof teacherOnlyStudentProfileSchema>;
