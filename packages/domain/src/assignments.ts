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
  type AssignmentId,
  type ClassroomId,
  type EpochMillis,
  type TeacherId,
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

const questionDraftBase = {
  id: questionIdSchema,
  prompt: z.string().trim().min(1).max(4000),
  approvedHints: z.array(z.string().trim().min(1).max(1000)).max(3).default([]),
};

export const numericQuestionDraftSchema = z
  .object({
    ...questionDraftBase,
    questionType: z.literal('numeric'),
    unitLabel: z.string().trim().max(40).optional(),
    expectedValue: z.number().finite(),
    tolerance: z.number().nonnegative().finite().default(0),
    acceptedUnits: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  })
  .strict();

export const multipleChoiceQuestionDraftSchema = z
  .object({
    ...questionDraftBase,
    questionType: z.literal('multipleChoice'),
    choices: z
      .array(z.object({ id: choiceIdSchema, label: z.string().trim().min(1).max(500) }).strict())
      .min(2)
      .max(8),
    correctChoiceId: choiceIdSchema,
  })
  .strict()
  .superRefine((question, context) => {
    const choiceIds = question.choices.map((choice) => choice.id);
    if (new Set(choiceIds).size !== choiceIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['choices'],
        message: 'Choice IDs must be unique.',
      });
    }
    if (!choiceIds.includes(question.correctChoiceId)) {
      context.addIssue({
        code: 'custom',
        path: ['correctChoiceId'],
        message: 'The correct choice must reference a listed choice.',
      });
    }
  });

export const shortTextQuestionDraftSchema = z
  .object({
    ...questionDraftBase,
    questionType: z.literal('shortText'),
    maxLength: z.number().int().min(1).max(1000).default(250),
    acceptedAnswers: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
    normalization: z.enum(['caseAndWhitespace', 'exact']).default('caseAndWhitespace'),
  })
  .strict();

export const questionDraftSchema = z.discriminatedUnion('questionType', [
  numericQuestionDraftSchema,
  multipleChoiceQuestionDraftSchema,
  shortTextQuestionDraftSchema,
]);

export const assignmentDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    questions: z.array(questionDraftSchema).min(1).max(50),
  })
  .strict()
  .superRefine((draft, context) => {
    const questionIds = draft.questions.map((question) => question.id);
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'Question IDs must be unique within an assignment.',
      });
    }
  });

export const materializeAssignmentDraft = ({
  draft: rawDraft,
  assignmentId,
  classroomId,
  revision,
  createdBy,
  createdAt,
  publish,
}: Readonly<{
  draft: AssignmentDraft;
  assignmentId: AssignmentId;
  classroomId: ClassroomId;
  revision: number;
  createdBy: TeacherId;
  createdAt: EpochMillis;
  publish: boolean;
}>): Readonly<{
  assignment: PublicAssignment;
  publicQuestions: readonly PublicQuestion[];
  answerKey: AssignmentAnswerKey;
}> => {
  const draft = assignmentDraftSchema.parse(rawDraft);
  const publicQuestions = draft.questions.map((question, order) => {
    const common = {
      id: question.id,
      assignmentId,
      order,
      prompt: question.prompt,
      approvedHints: question.approvedHints,
    };

    if (question.questionType === 'numeric') {
      return publicQuestionSchema.parse({
        ...common,
        questionType: question.questionType,
        ...(question.unitLabel === undefined ? {} : { unitLabel: question.unitLabel }),
      });
    }
    if (question.questionType === 'multipleChoice') {
      return publicQuestionSchema.parse({
        ...common,
        questionType: question.questionType,
        choices: question.choices,
      });
    }
    return publicQuestionSchema.parse({
      ...common,
      questionType: question.questionType,
      maxLength: question.maxLength,
    });
  });

  const questionKeys = draft.questions.map((question) => {
    if (question.questionType === 'numeric') {
      return questionAnswerKeySchema.parse({
        questionId: question.id,
        questionType: question.questionType,
        expectedValue: question.expectedValue,
        tolerance: question.tolerance,
        acceptedUnits: question.acceptedUnits,
      });
    }
    if (question.questionType === 'multipleChoice') {
      return questionAnswerKeySchema.parse({
        questionId: question.id,
        questionType: question.questionType,
        correctChoiceId: question.correctChoiceId,
      });
    }
    return questionAnswerKeySchema.parse({
      questionId: question.id,
      questionType: question.questionType,
      acceptedAnswers: question.acceptedAnswers,
      normalization: question.normalization,
      teacherReviewAllowed: true,
    });
  });

  return Object.freeze({
    assignment: publicAssignmentSchema.parse({
      id: assignmentId,
      classroomId,
      title: draft.title,
      status: publish ? 'published' : 'draft',
      source: 'teacherAuthored',
      revision,
      questionCount: publicQuestions.length,
      createdBy,
      createdAt,
      publishedAt: publish ? createdAt : null,
    }),
    publicQuestions: Object.freeze(publicQuestions),
    answerKey: assignmentAnswerKeySchema.parse({
      assignmentId,
      assignmentRevision: revision,
      questionKeys,
      createdBy,
      createdAt,
    }),
  });
};

export type PublicAssignment = z.infer<typeof publicAssignmentSchema>;
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;
export type AssignmentAnswerKey = z.infer<typeof assignmentAnswerKeySchema>;
export type QuestionAnswerKey = z.infer<typeof questionAnswerKeySchema>;
export type AssignmentTarget = z.infer<typeof assignmentTargetSchema>;
export type AssignmentDraft = z.infer<typeof assignmentDraftSchema>;
