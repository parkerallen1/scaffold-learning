import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { z } from 'zod';

import {
  SUPPORT_KEYS,
  assignmentTargetIdFor,
  assignmentTargetSchema,
  attemptEventSchema,
  classroomIdSchema,
  idempotencyKeySchema,
  publicAssignmentSchema,
  publicQuestionSchema,
  questionIdSchema,
  sessionIdSchema,
  sessionStateSchema,
  studentIdSchema,
  submittedAnswerSchema,
  supportEventSchema,
  supportKeySchema,
  supportPlanVersionSchema,
  type AssignmentTarget,
  type AttemptEvent,
  type PublicAssignment,
  type PublicQuestion,
  type SessionState,
  type SubmittedAnswer,
  type SupportEvent,
  type SupportKey,
  type SupportPlanVersion,
} from '@/lib/domain';
import { db, firebaseRuntime, functions } from '@/lib/firebase';

const startResponseSchema = z
  .object({
    resumed: z.boolean(),
    session: sessionStateSchema,
    supportPlan: supportPlanVersionSchema,
  })
  .strict();

const attemptResponseSchema = z
  .object({
    duplicate: z.boolean(),
    event: attemptEventSchema,
    session: sessionStateSchema,
  })
  .strict();

const supportResponseSchema = z
  .object({
    duplicate: z.boolean(),
    event: supportEventSchema,
    session: sessionStateSchema,
  })
  .strict();

const transitionResponseSchema = z.object({ session: sessionStateSchema }).strict();

const startCallable = httpsCallable<{ targetId: string }, unknown>(
  functions,
  'startOrResumeStudentSession',
  firebaseRuntime.callableOptions,
);
const submitCallable = httpsCallable<SubmitStudentAttemptRequest, unknown>(
  functions,
  'submitStudentAttempt',
  firebaseRuntime.callableOptions,
);
const supportCallable = httpsCallable<RecordStudentSupportEventRequest, unknown>(
  functions,
  'recordStudentSupportEvent',
  firebaseRuntime.callableOptions,
);
const advanceCallable = httpsCallable<{ currentQuestionId: string; sessionId: string }, unknown>(
  functions,
  'advanceStudentSession',
  firebaseRuntime.callableOptions,
);
const transitionCallable = httpsCallable<
  { action: 'complete' | 'pause' | 'resume'; sessionId: string },
  unknown
>(functions, 'transitionStudentSession', firebaseRuntime.callableOptions);

export type StudentAssignment = Readonly<{
  assignment: PublicAssignment;
  target: AssignmentTarget;
}>;

export type StudentSessionBundle = Readonly<{
  resumed: boolean;
  session: SessionState;
  supportPlan: SupportPlanVersion;
}>;

export type SubmitStudentAttemptRequest = Readonly<{
  activeSupports: readonly SupportKey[];
  clientOccurredAt: number;
  elapsedMs: number;
  idempotencyKey: string;
  questionId: string;
  sessionId: string;
  submittedAnswer: SubmittedAnswer;
}>;

export type RecordStudentSupportEventRequest = Readonly<{
  action: 'activated' | 'available' | 'completed' | 'dismissed' | 'shown';
  clientOccurredAt: number;
  idempotencyKey: string;
  questionId: string | null;
  sessionId: string;
  supportKey: SupportKey;
}>;

const LIST_ERROR = 'Unable to load assigned work. Check your connection and try again.';
const ACTION_ERROR = 'Unable to save your work. Check your connection and try again.';

const safely = async <Result>(message: string, action: () => Promise<Result>): Promise<Result> => {
  try {
    return await action();
  } catch {
    throw new Error(message);
  }
};

const parseSnapshot = <Output>(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  schema: z.ZodType<Output>,
): Output => {
  const parsed = schema.parse(snapshot.data());
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('id' in parsed) ||
    parsed.id !== snapshot.id
  ) {
    throw new Error(LIST_ERROR);
  }
  return parsed;
};

export const listStudentAssignments = (
  rawClassroomId: string,
  rawStudentId: string,
): Promise<readonly StudentAssignment[]> =>
  safely(LIST_ERROR, async () => {
    const classroomId = classroomIdSchema.parse(rawClassroomId);
    const studentId = studentIdSchema.parse(rawStudentId);
    const targetsSnapshot = await getDocs(
      query(
        collection(db, 'classrooms', classroomId, 'assignmentTargets'),
        where('studentId', '==', studentId),
      ),
    );
    const targets = targetsSnapshot.docs.map((snapshot) =>
      parseSnapshot(snapshot, assignmentTargetSchema),
    );
    const assignments = await Promise.all(
      targets.map(async (target) => {
        if (
          target.classroomId !== classroomId ||
          target.studentId !== studentId ||
          target.id !== assignmentTargetIdFor(target.assignmentId, studentId)
        ) {
          throw new Error(LIST_ERROR);
        }
        const assignmentSnapshot = await getDoc(
          doc(db, 'classrooms', classroomId, 'assignments', target.assignmentId),
        );
        if (!assignmentSnapshot.exists()) throw new Error(LIST_ERROR);
        const assignment = publicAssignmentSchema.parse(assignmentSnapshot.data());
        if (
          assignmentSnapshot.id !== assignment.id ||
          assignment.classroomId !== classroomId ||
          assignment.id !== target.assignmentId ||
          assignment.revision !== target.assignmentRevision ||
          assignment.status !== 'published' ||
          assignment.publishedAt === null
        ) {
          throw new Error(LIST_ERROR);
        }
        return Object.freeze({ assignment, target });
      }),
    );
    return Object.freeze(
      assignments.sort(
        (left, right) =>
          right.target.assignedAt - left.target.assignedAt ||
          left.assignment.title.localeCompare(right.assignment.title),
      ),
    );
  });

export const listStudentAssignmentQuestions = (
  studentAssignment: StudentAssignment,
): Promise<readonly PublicQuestion[]> =>
  safely(LIST_ERROR, async () => {
    const assignment = publicAssignmentSchema.parse(studentAssignment.assignment);
    const target = assignmentTargetSchema.parse(studentAssignment.target);
    if (
      target.assignmentId !== assignment.id ||
      target.classroomId !== assignment.classroomId ||
      target.assignmentRevision !== assignment.revision ||
      assignment.status !== 'published'
    ) {
      throw new Error(LIST_ERROR);
    }
    const snapshot = await getDocs(
      query(
        collection(
          db,
          'classrooms',
          assignment.classroomId,
          'assignments',
          assignment.id,
          'questions',
        ),
        orderBy('order', 'asc'),
      ),
    );
    const questions = snapshot.docs.map((question) =>
      parseSnapshot(question, publicQuestionSchema),
    );
    if (
      questions.length !== assignment.questionCount ||
      questions.some(
        (question, index) => question.assignmentId !== assignment.id || question.order !== index,
      )
    ) {
      throw new Error(LIST_ERROR);
    }
    return Object.freeze(questions);
  });

export const listStudentAttempts = (
  rawClassroomId: string,
  rawSessionId: string,
): Promise<readonly AttemptEvent[]> =>
  safely(LIST_ERROR, async () => {
    const classroomId = classroomIdSchema.parse(rawClassroomId);
    const sessionId = sessionIdSchema.parse(rawSessionId);
    const snapshot = await getDocs(
      query(
        collection(db, 'classrooms', classroomId, 'sessions', sessionId, 'attemptEvents'),
        orderBy('createdAt', 'asc'),
      ),
    );
    const attempts = snapshot.docs.map((attempt) => parseSnapshot(attempt, attemptEventSchema));
    if (attempts.some((attempt) => attempt.sessionId !== sessionId)) throw new Error(LIST_ERROR);
    return Object.freeze(attempts);
  });

const assertBundleIdentity = (
  bundle: z.infer<typeof startResponseSchema>,
  target: AssignmentTarget,
): StudentSessionBundle => {
  if (
    bundle.session.targetId !== target.id ||
    bundle.session.assignmentId !== target.assignmentId ||
    bundle.session.assignmentRevision !== target.assignmentRevision ||
    bundle.session.studentId !== target.studentId ||
    bundle.session.classroomId !== target.classroomId ||
    bundle.session.supportPlanId !== target.supportPlanId ||
    bundle.session.supportPlanVersion !== target.supportPlanVersion ||
    bundle.supportPlan.id !== target.supportPlanId ||
    bundle.supportPlan.version !== target.supportPlanVersion ||
    bundle.supportPlan.studentId !== target.studentId ||
    bundle.supportPlan.classroomId !== target.classroomId
  ) {
    throw new Error(ACTION_ERROR);
  }
  return Object.freeze({
    resumed: bundle.resumed,
    session: bundle.session,
    supportPlan: bundle.supportPlan,
  });
};

export const startOrResumeStudentSession = (
  rawTarget: AssignmentTarget,
): Promise<StudentSessionBundle> =>
  safely(ACTION_ERROR, async () => {
    const target = assignmentTargetSchema.parse(rawTarget);
    const response = await startCallable({ targetId: target.id });
    return assertBundleIdentity(startResponseSchema.parse(response.data), target);
  });

export const submitStudentAttempt = (
  rawInput: SubmitStudentAttemptRequest,
): Promise<Readonly<{ duplicate: boolean; event: AttemptEvent; session: SessionState }>> =>
  safely(ACTION_ERROR, async () => {
    const input = {
      activeSupports: z
        .array(supportKeySchema)
        .max(SUPPORT_KEYS.length)
        .parse(rawInput.activeSupports),
      clientOccurredAt: z.number().int().nonnegative().parse(rawInput.clientOccurredAt),
      elapsedMs: z.number().int().nonnegative().max(86_400_000).parse(rawInput.elapsedMs),
      idempotencyKey: idempotencyKeySchema.parse(rawInput.idempotencyKey),
      questionId: questionIdSchema.parse(rawInput.questionId),
      sessionId: sessionIdSchema.parse(rawInput.sessionId),
      submittedAnswer: submittedAnswerSchema.parse(rawInput.submittedAnswer),
    };
    if (new Set(input.activeSupports).size !== input.activeSupports.length) {
      throw new Error(ACTION_ERROR);
    }
    const response = await submitCallable(input);
    const parsed = attemptResponseSchema.parse(response.data);
    if (
      parsed.session.id !== input.sessionId ||
      parsed.event.sessionId !== input.sessionId ||
      parsed.event.questionId !== input.questionId ||
      parsed.event.idempotencyKey !== input.idempotencyKey ||
      JSON.stringify(parsed.event.submittedAnswer) !== JSON.stringify(input.submittedAnswer)
    ) {
      throw new Error(ACTION_ERROR);
    }
    return Object.freeze(parsed);
  });

export const recordStudentSupportEvent = (
  rawInput: RecordStudentSupportEventRequest,
): Promise<Readonly<{ duplicate: boolean; event: SupportEvent; session: SessionState }>> =>
  safely(ACTION_ERROR, async () => {
    const input = {
      action: z
        .enum(['activated', 'available', 'completed', 'dismissed', 'shown'])
        .parse(rawInput.action),
      clientOccurredAt: z.number().int().nonnegative().parse(rawInput.clientOccurredAt),
      idempotencyKey: idempotencyKeySchema.parse(rawInput.idempotencyKey),
      questionId: rawInput.questionId === null ? null : questionIdSchema.parse(rawInput.questionId),
      sessionId: sessionIdSchema.parse(rawInput.sessionId),
      supportKey: supportKeySchema.parse(rawInput.supportKey),
    };
    const response = await supportCallable(input);
    const parsed = supportResponseSchema.parse(response.data);
    if (
      parsed.session.id !== input.sessionId ||
      parsed.event.sessionId !== input.sessionId ||
      parsed.event.questionId !== input.questionId ||
      parsed.event.supportKey !== input.supportKey ||
      parsed.event.action !== input.action ||
      parsed.event.idempotencyKey !== input.idempotencyKey
    ) {
      throw new Error(ACTION_ERROR);
    }
    return Object.freeze(parsed);
  });

const transition = (
  rawSessionId: string,
  action: 'complete' | 'pause' | 'resume',
): Promise<SessionState> =>
  safely(ACTION_ERROR, async () => {
    const sessionId = sessionIdSchema.parse(rawSessionId);
    const response = await transitionCallable({ action, sessionId });
    const parsed = transitionResponseSchema.parse(response.data).session;
    if (parsed.id !== sessionId) throw new Error(ACTION_ERROR);
    return parsed;
  });

export const transitionStudentSession = transition;

export const advanceStudentSession = (
  rawSessionId: string,
  rawCurrentQuestionId: string,
): Promise<SessionState> =>
  safely(ACTION_ERROR, async () => {
    const sessionId = sessionIdSchema.parse(rawSessionId);
    const currentQuestionId = questionIdSchema.parse(rawCurrentQuestionId);
    const response = await advanceCallable({ currentQuestionId, sessionId });
    const parsed = transitionResponseSchema.parse(response.data).session;
    if (parsed.id !== sessionId || parsed.currentQuestionId === currentQuestionId) {
      throw new Error(ACTION_ERROR);
    }
    return parsed;
  });

export const createIdempotencyKey = (prefix: 'attempt' | 'support'): string => {
  const randomPart = globalThis.crypto.randomUUID().replaceAll('-', '_');
  return idempotencyKeySchema.parse(`${prefix}_${randomPart}`);
};
