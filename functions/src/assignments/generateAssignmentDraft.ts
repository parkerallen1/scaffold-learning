import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  assignmentDraftSchema,
  classroomIdSchema,
  type AssignmentDraft,
  type TeacherId,
} from '@scaffold-learning/domain';

import { openAiApiKey } from '../ai/openAiRecommendationProvider.js';
import { AiOperationalControlError, runControlledAiOperation } from '../ai/operationalControls.js';
import { emulatorUsesLiveOpenAi, liveOpenAiRuntimeEnabled } from '../ai/runtimeConfig.js';
import {
  executeTeacherOperation,
  requireOwnedClassroom,
  teacherCallableOptions,
} from '../auth/teacherLifecycle.js';

const MODEL = process.env.OPENAI_ASSIGNMENT_MODEL?.trim() || 'gpt-5.6-luna';
const PROMPT_VERSION = 'assignment-draft-v1';
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const fileSchema = z
  .object({
    base64Data: z
      .string()
      .min(1)
      .max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 16),
    fileName: z.string().trim().min(1).max(240),
    mimeType: z.enum([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]),
  })
  .strict();

const inputSchema = z
  .object({
    classroomId: classroomIdSchema,
    prompt: z.string().trim().max(8_000).optional(),
    file: fileSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (!input.prompt && !input.file) {
      context.addIssue({ code: 'custom', message: 'Provide a prompt or document.' });
    }
  });

const questionSchema = z.discriminatedUnion('questionType', [
  z
    .object({
      questionType: z.literal('numeric'),
      prompt: z.string().trim().min(1).max(4_000),
      approvedHints: z.array(z.string().trim().min(1).max(1_000)).max(3),
      expectedValue: z.number().finite(),
      tolerance: z.number().nonnegative().finite(),
      acceptedUnits: z.array(z.string().trim().min(1).max(40)).max(8),
      unitLabel: z.string().trim().max(40).nullable(),
    })
    .strict(),
  z
    .object({
      questionType: z.literal('multipleChoice'),
      prompt: z.string().trim().min(1).max(4_000),
      approvedHints: z.array(z.string().trim().min(1).max(1_000)).max(3),
      choices: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
      correctChoiceIndex: z.number().int().min(0).max(7),
    })
    .strict(),
  z
    .object({
      questionType: z.literal('shortText'),
      prompt: z.string().trim().min(1).max(4_000),
      approvedHints: z.array(z.string().trim().min(1).max(1_000)).max(3),
      acceptedAnswers: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20),
    })
    .strict(),
]);

const generatedSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    questions: z.array(questionSchema).min(1).max(50),
  })
  .strict();

const INSTRUCTIONS = `
Create an editable classroom assignment draft from the teacher's prompt and/or attached document.
Return a concise title and 1-20 answerable questions. Preserve the source's learning target.
Choose numeric, multiple choice, or short text for each response. Include the correct answer and
up to three scaffolded hints that help without revealing the answer immediately. Do not include
student personal information. The teacher will review and edit every field before publishing.
`.trim();

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

const materialize = (generated: z.infer<typeof generatedSchema>): AssignmentDraft =>
  assignmentDraftSchema.parse({
    title: generated.title,
    questions: generated.questions.map((question, questionIndex) => {
      const id = `question_ai_${String(questionIndex + 1).padStart(3, '0')}`;
      const common = { id, prompt: question.prompt, approvedHints: question.approvedHints };
      if (question.questionType === 'numeric') {
        return {
          ...common,
          questionType: 'numeric' as const,
          expectedValue: question.expectedValue,
          tolerance: question.tolerance,
          acceptedUnits: question.acceptedUnits,
          ...(question.unitLabel === null ? {} : { unitLabel: question.unitLabel }),
        };
      }
      if (question.questionType === 'multipleChoice') {
        const choices = question.choices.map((label, choiceIndex) => ({
          id: `choice_${String(questionIndex + 1).padStart(3, '0')}_${String(choiceIndex + 1).padStart(2, '0')}`,
          label,
        }));
        return {
          ...common,
          questionType: 'multipleChoice' as const,
          choices,
          correctChoiceId: choices[question.correctChoiceIndex]?.id ?? choices[0]!.id,
        };
      }
      return {
        ...common,
        questionType: 'shortText' as const,
        maxLength: 250,
        acceptedAnswers: question.acceptedAnswers,
        normalization: 'caseAndWhitespace' as const,
      };
    }),
  });

const demoDraft = (prompt?: string, fileName?: string): AssignmentDraft =>
  materialize({
    title: fileName ? `Practice from ${fileName.replace(/\.[^.]+$/, '')}` : 'Generated practice',
    questions: [
      {
        questionType: 'multipleChoice',
        prompt:
          prompt?.trim() || 'Which answer best matches the main idea of the uploaded material?',
        choices: ['The first key idea', 'An unrelated detail', 'None of the above'],
        correctChoiceIndex: 0,
        approvedHints: [
          'Look for the idea repeated or emphasized most.',
          'Rule out unrelated details.',
        ],
      },
      {
        questionType: 'shortText',
        prompt: 'Explain the key idea in one or two sentences.',
        acceptedAnswers: ['Teacher review'],
        approvedHints: ['State the idea first.', 'Add one supporting detail.'],
      },
    ],
  });

const generateWithOpenAi = async (input: z.infer<typeof inputSchema>) => {
  const client = new OpenAI({ apiKey: openAiApiKey.value(), maxRetries: 0, timeout: 45_000 });
  const content: Array<Record<string, unknown>> = [
    {
      type: 'input_text',
      text: input.prompt || 'Extract a complete classroom assignment from the attached document.',
    },
  ];
  if (input.file) {
    content.push({
      type: 'input_file',
      filename: input.file.fileName,
      file_data: `data:${input.file.mimeType};base64,${input.file.base64Data}`,
      detail: 'low',
    });
  }
  const response = await client.responses.parse(
    {
      model: MODEL,
      instructions: INSTRUCTIONS,
      input: [{ role: 'user', content }] as never,
      max_output_tokens: 8_000,
      store: false,
      text: { format: zodTextFormat(generatedSchema, 'assignment_draft') },
    },
    { maxRetries: 0, timeout: 45_000 },
  );
  if (!response.output_parsed) throw new Error('No assignment draft returned.');
  return materialize(response.output_parsed);
};

const generate = async (teacherId: TeacherId, input: z.infer<typeof inputSchema>) => {
  const classroomSnapshot = await firestore.collection('classrooms').doc(input.classroomId).get();
  requireOwnedClassroom(classroomSnapshot, teacherId, true);
  if (process.env.FUNCTIONS_EMULATOR === 'true' && !emulatorUsesLiveOpenAi()) {
    return { draft: demoDraft(input.prompt, input.file?.fileName) };
  }
  if (!liveOpenAiRuntimeEnabled()) {
    throw new HttpsError('failed-precondition', 'Assignment generation is not configured.');
  }
  try {
    const draft = await runControlledAiOperation({
      teacherId,
      operation: 'generateAssignmentDraft',
      provider: { name: 'openai', model: MODEL, promptVersion: PROMPT_VERSION },
      invoke: () => generateWithOpenAi(input),
    });
    return { draft };
  } catch (error) {
    if (error instanceof AiOperationalControlError && error.reason === 'rate_limited') {
      throw new HttpsError('resource-exhausted', 'Please wait before generating another draft.');
    }
    throw new HttpsError('unavailable', 'The document could not be converted into an assignment.');
  }
};

export const generateAssignmentDraft = onCall(
  {
    ...teacherCallableOptions,
    maxInstances: 5,
    memory: '1GiB',
    secrets: [openAiApiKey],
    timeoutSeconds: 60,
  },
  (request) => executeTeacherOperation('generateAssignmentDraft', request, inputSchema, generate),
);
