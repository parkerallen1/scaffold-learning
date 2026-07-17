import {
  assignmentAnswerKeySchema,
  assignmentTargetSchema,
  publicAssignmentSchema,
  publicQuestionSchema,
} from './assignments.js';
import { auditResultSchema, auditTraceSchema } from './audits.js';
import {
  assignmentIdSchema,
  assignmentTargetIdSchema,
  auditResultIdSchema,
  auditTraceIdSchema,
  choiceIdSchema,
  classroomIdSchema,
  epochMillisSchema,
  eventIdSchema,
  idempotencyKeySchema,
  questionIdSchema,
  sessionIdSchema,
  studentIdSchema,
  studentProfileIdSchema,
  supportPlanIdSchema,
  teacherIdSchema,
} from './ids.js';
import {
  classroomSchema,
  studentSafeIdentitySchema,
  teacherOnlyStudentProfileSchema,
} from './identity.js';
import { attemptEventSchema, sessionStateSchema, supportEventSchema } from './sessions.js';
import { supportPlanVersionSchema } from './supports.js';

export const syntheticIds = Object.freeze({
  teacherId: teacherIdSchema.parse('teacher_demo_01'),
  classroomId: classroomIdSchema.parse('class_demo_01'),
  studentId: studentIdSchema.parse('student_demo_01'),
  profileId: studentProfileIdSchema.parse('profile_demo_01'),
  supportPlanId: supportPlanIdSchema.parse('plan_demo_01'),
  assignmentId: assignmentIdSchema.parse('assignment_demo_01'),
  questionId: questionIdSchema.parse('question_demo_01'),
  choiceAId: choiceIdSchema.parse('choice_demo_a'),
  choiceBId: choiceIdSchema.parse('choice_demo_b'),
  targetId: assignmentTargetIdSchema.parse('target_demo_01'),
  sessionId: sessionIdSchema.parse('session_demo_01'),
  attemptEventId: eventIdSchema.parse('event_attempt_01'),
  supportEventId: eventIdSchema.parse('event_support_01'),
  auditTraceId: auditTraceIdSchema.parse('audit_trace_01'),
  auditResultId: auditResultIdSchema.parse('audit_result_01'),
  attemptKey: idempotencyKeySchema.parse('attempt_key_demo_01'),
  supportKey: idempotencyKeySchema.parse('support_key_demo_01'),
  now: epochMillisSchema.parse(1_750_000_000_000),
});

export const syntheticClassroom = classroomSchema.parse({
  id: syntheticIds.classroomId,
  teacherId: syntheticIds.teacherId,
  name: 'Build Week Learning Lab',
  status: 'active',
  createdAt: syntheticIds.now,
  updatedAt: syntheticIds.now,
});

export const syntheticStudentSafeIdentity = studentSafeIdentitySchema.parse({
  id: syntheticIds.studentId,
  classroomId: syntheticIds.classroomId,
  displayName: 'Jordan Demo',
  status: 'active',
  authVersion: 1,
  createdAt: syntheticIds.now,
  updatedAt: syntheticIds.now,
});

export const syntheticTeacherOnlyProfile = teacherOnlyStudentProfileSchema.parse({
  id: syntheticIds.profileId,
  classroomId: syntheticIds.classroomId,
  studentId: syntheticIds.studentId,
  observations: {
    barriers: ['gettingStarted', 'readingDirections'],
    stuckLooksLike: 'Jordan rereads the full page and waits before beginning.',
    helpfulStrategies: ['Show one direction at a time.', 'Offer a neutral first-step prompt.'],
    timerResponse: 'stressful',
    responsePreferences: ['typing', 'selection'],
    adultPrompting: 'occasional',
    neverDo: ['Do not auto-advance when a timer ends.'],
  },
  teacherSummary: 'Use calm, brief prompts and preserve student control.',
  createdBy: syntheticIds.teacherId,
  createdAt: syntheticIds.now,
  updatedAt: syntheticIds.now,
});

export const syntheticSupportPlan = supportPlanVersionSchema.parse({
  id: syntheticIds.supportPlanId,
  classroomId: syntheticIds.classroomId,
  studentId: syntheticIds.studentId,
  version: 1,
  supports: [
    { supportKey: 'readingChunks', enabled: true, chunkMode: 'step', revealAllAllowed: true },
    { supportKey: 'calmPacing', enabled: true, timerMode: 'off' },
  ],
  source: 'manual',
  approvedBy: syntheticIds.teacherId,
  approvedAt: syntheticIds.now,
  supersedesId: null,
});

export const syntheticAssignment = publicAssignmentSchema.parse({
  id: syntheticIds.assignmentId,
  classroomId: syntheticIds.classroomId,
  title: 'Demo Math Check-In',
  status: 'published',
  source: 'seed',
  revision: 1,
  questionCount: 1,
  createdBy: syntheticIds.teacherId,
  createdAt: syntheticIds.now,
  publishedAt: syntheticIds.now,
});

export const syntheticPublicQuestion = publicQuestionSchema.parse({
  id: syntheticIds.questionId,
  assignmentId: syntheticIds.assignmentId,
  order: 0,
  prompt: 'Which expression equals twelve?',
  questionType: 'multipleChoice',
  approvedHints: ['Look for a pair of numbers whose sum is twelve.'],
  choices: [
    { id: syntheticIds.choiceAId, label: '7 + 5' },
    { id: syntheticIds.choiceBId, label: '7 + 4' },
  ],
});

export const syntheticAnswerKey = assignmentAnswerKeySchema.parse({
  assignmentId: syntheticIds.assignmentId,
  assignmentRevision: 1,
  questionKeys: [
    {
      questionId: syntheticIds.questionId,
      questionType: 'multipleChoice',
      correctChoiceId: syntheticIds.choiceAId,
    },
  ],
  rubricNotes: 'Accept the selected choice only; do not infer from scratch work.',
  createdBy: syntheticIds.teacherId,
  createdAt: syntheticIds.now,
});

export const syntheticAssignmentTarget = assignmentTargetSchema.parse({
  id: syntheticIds.targetId,
  classroomId: syntheticIds.classroomId,
  assignmentId: syntheticIds.assignmentId,
  assignmentRevision: 1,
  studentId: syntheticIds.studentId,
  supportPlanId: syntheticIds.supportPlanId,
  supportPlanVersion: 1,
  assignedBy: syntheticIds.teacherId,
  assignedAt: syntheticIds.now,
});

export const syntheticSession = sessionStateSchema.parse({
  id: syntheticIds.sessionId,
  targetId: syntheticIds.targetId,
  classroomId: syntheticIds.classroomId,
  studentId: syntheticIds.studentId,
  assignmentId: syntheticIds.assignmentId,
  assignmentRevision: 1,
  supportPlanId: syntheticIds.supportPlanId,
  supportPlanVersion: 1,
  status: 'inProgress',
  currentQuestionId: syntheticIds.questionId,
  startedAt: syntheticIds.now,
  updatedAt: syntheticIds.now,
  completedAt: null,
});

export const syntheticAttemptEvent = attemptEventSchema.parse({
  id: syntheticIds.attemptEventId,
  idempotencyKey: syntheticIds.attemptKey,
  sessionId: syntheticIds.sessionId,
  studentId: syntheticIds.studentId,
  questionId: syntheticIds.questionId,
  attemptNumber: 1,
  submittedAnswer: { kind: 'choice', choiceId: syntheticIds.choiceAId },
  outcome: 'correct',
  activeSupports: ['readingChunks'],
  clientOccurredAt: syntheticIds.now,
  createdAt: syntheticIds.now,
  elapsedMs: 42_000,
});

export const syntheticSupportEvent = supportEventSchema.parse({
  id: syntheticIds.supportEventId,
  idempotencyKey: syntheticIds.supportKey,
  sessionId: syntheticIds.sessionId,
  studentId: syntheticIds.studentId,
  questionId: syntheticIds.questionId,
  supportKey: 'readingChunks',
  action: 'activated',
  clientOccurredAt: syntheticIds.now,
  createdAt: syntheticIds.now,
});

export const syntheticAuditTrace = auditTraceSchema.parse({
  id: syntheticIds.auditTraceId,
  studentId: syntheticIds.studentId,
  sessionIds: [syntheticIds.sessionId],
  evidenceStartAt: syntheticIds.now,
  evidenceEndAt: syntheticIds.now,
  promptVersion: 'fake-audit-v1',
  model: 'deterministic-fixture',
  provider: 'fake',
  status: 'completed',
  createdAt: syntheticIds.now,
});

export const syntheticAuditResult = auditResultSchema.parse({
  id: syntheticIds.auditResultId,
  traceId: syntheticIds.auditTraceId,
  studentId: syntheticIds.studentId,
  evidenceSufficient: true,
  summary: 'The synthetic evidence supports continuing the current reading chunks.',
  recommendations: [
    {
      action: 'keep',
      supportKey: 'readingChunks',
      evidence: [
        {
          metric: 'recoveryAfterSupport',
          observation: 'The student completed the item after revealing the next direction chunk.',
          sourceEventIds: [syntheticIds.supportEventId, syntheticIds.attemptEventId],
        },
      ],
      alternativeExplanations: ['The item may have been easier than earlier items.'],
      confidence: 'medium',
      reviewAfterSessions: 2,
    },
  ],
  reviewStatus: 'pending',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: syntheticIds.now,
});

export const syntheticDomainFixtures = Object.freeze({
  classroom: syntheticClassroom,
  studentSafeIdentity: syntheticStudentSafeIdentity,
  teacherOnlyProfile: syntheticTeacherOnlyProfile,
  supportPlan: syntheticSupportPlan,
  assignment: syntheticAssignment,
  publicQuestion: syntheticPublicQuestion,
  answerKey: syntheticAnswerKey,
  assignmentTarget: syntheticAssignmentTarget,
  session: syntheticSession,
  attemptEvent: syntheticAttemptEvent,
  supportEvent: syntheticSupportEvent,
  auditTrace: syntheticAuditTrace,
  auditResult: syntheticAuditResult,
});
