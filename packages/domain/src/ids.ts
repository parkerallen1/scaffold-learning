import { z } from 'zod';

const idSchema = <Brand extends string>() =>
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .brand<Brand>();

export const teacherIdSchema = idSchema<'TeacherId'>();
export const classroomIdSchema = idSchema<'ClassroomId'>();
export const studentIdSchema = idSchema<'StudentId'>();
export const studentProfileIdSchema = idSchema<'StudentProfileId'>();
export const supportPlanIdSchema = idSchema<'SupportPlanId'>();
export const assignmentIdSchema = idSchema<'AssignmentId'>();
export const questionIdSchema = idSchema<'QuestionId'>();
export const choiceIdSchema = idSchema<'ChoiceId'>();
export const assignmentTargetIdSchema = idSchema<'AssignmentTargetId'>();
export const sessionIdSchema = idSchema<'SessionId'>();
export const eventIdSchema = idSchema<'EventId'>();
export const auditTraceIdSchema = idSchema<'AuditTraceId'>();
export const auditResultIdSchema = idSchema<'AuditResultId'>();

export const idempotencyKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{12,128}$/)
  .brand<'IdempotencyKey'>();

export const epochMillisSchema = z.number().int().nonnegative().finite().brand<'EpochMillis'>();

export type TeacherId = z.infer<typeof teacherIdSchema>;
export type ClassroomId = z.infer<typeof classroomIdSchema>;
export type StudentId = z.infer<typeof studentIdSchema>;
export type StudentProfileId = z.infer<typeof studentProfileIdSchema>;
export type SupportPlanId = z.infer<typeof supportPlanIdSchema>;
export type AssignmentId = z.infer<typeof assignmentIdSchema>;
export type QuestionId = z.infer<typeof questionIdSchema>;
export type ChoiceId = z.infer<typeof choiceIdSchema>;
export type AssignmentTargetId = z.infer<typeof assignmentTargetIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;
export type EventId = z.infer<typeof eventIdSchema>;
export type AuditTraceId = z.infer<typeof auditTraceIdSchema>;
export type AuditResultId = z.infer<typeof auditResultIdSchema>;
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
export type EpochMillis = z.infer<typeof epochMillisSchema>;
