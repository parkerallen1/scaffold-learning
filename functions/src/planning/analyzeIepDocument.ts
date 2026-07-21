import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  adultPromptingSchema,
  analyzeIepDocumentInputSchema,
  iepProfileDraftSchema,
  learningBarrierSchema,
  responseModeSchema,
  studentSafeIdentitySchema,
  timerResponseSchema,
  type AnalyzeIepDocumentInput,
  type IepProfileDraft,
  type TeacherId,
} from '@quiz-master/domain';

import { openAiApiKey } from '../ai/openAiRecommendationProvider.js';
import { AiOperationalControlError, runControlledAiOperation } from '../ai/operationalControls.js';
import {
  executeTeacherOperation,
  LifecycleNotFoundError,
  LifecycleStateError,
  requireOwnedClassroom,
  StoredDataError,
  teacherCallableOptions,
} from '../auth/teacherLifecycle.js';
import { createDemoIepProfileDraft } from './iepAnalysisCore.js';

const IEP_ANALYSIS_MODEL = process.env.OPENAI_IEP_MODEL?.trim() || 'gpt-5.6-terra';
const IEP_ANALYSIS_PROMPT_VERSION = 'iep-profile-v1';
const IEP_ANALYSIS_TIMEOUT_MS = 30_000;

const openAiIepDraftSchema = z
  .object({
    observations: z
      .object({
        independentWork: z.string().trim().max(500).nullable(),
        barriers: z.array(learningBarrierSchema).max(7),
        stuckLooksLike: z.string().trim().max(500).nullable(),
        helpfulStrategies: z.array(z.string().trim().min(1).max(200)).max(12),
        timerResponse: timerResponseSchema,
        responsePreferences: z.array(responseModeSchema).max(4),
        adultPrompting: adultPromptingSchema,
        interestsAndConsiderations: z.string().trim().max(500).nullable(),
        neverDo: z.array(z.string().trim().min(1).max(200)).max(12),
      })
      .strict(),
    teacherSummary: z.string().trim().min(1).max(1000),
  })
  .strict();

const INSTRUCTIONS = `
Extract a concise classroom support profile from the attached education document for teacher review.
This is not diagnosis, placement, grading, or an automatic educational decision.

Rules:
- Use only needs, preferences, accommodations, and observable learning patterns stated in the document.
- Do not restate diagnoses, medical details, demographic details, contact details, dates, IDs, or legal history.
- Do not invent evidence. Use "unknown" and empty arrays when the document does not say.
- Convert relevant accommodations into short, plain classroom strategies.
- Never recommend automatic audio, automatic submission, or automatic advancement.
- The teacher summary must be concise and describe learning access needs without diagnostic labels.
`.trim();

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

const authorizeStudent = async (teacherId: TeacherId, input: AnalyzeIepDocumentInput) => {
  const classroomRef = firestore.collection('classrooms').doc(input.classroomId);
  const studentRef = classroomRef.collection('students').doc(input.studentId);
  const [classroomSnapshot, studentSnapshot] = await Promise.all([
    classroomRef.get(),
    studentRef.get(),
  ]);
  requireOwnedClassroom(classroomSnapshot, teacherId, true);
  if (!studentSnapshot.exists) throw new LifecycleNotFoundError();
  const student = studentSafeIdentitySchema.safeParse(studentSnapshot.data());
  if (
    !student.success ||
    student.data.id !== input.studentId ||
    student.data.classroomId !== input.classroomId
  ) {
    throw new StoredDataError();
  }
  if (student.data.status !== 'active') throw new LifecycleStateError();
};

const normalizeDraft = (draft: z.infer<typeof openAiIepDraftSchema>): IepProfileDraft =>
  iepProfileDraftSchema.parse({
    teacherSummary: draft.teacherSummary,
    observations: {
      ...draft.observations,
      ...(draft.observations.independentWork === null
        ? { independentWork: undefined }
        : { independentWork: draft.observations.independentWork }),
      ...(draft.observations.stuckLooksLike === null
        ? { stuckLooksLike: undefined }
        : { stuckLooksLike: draft.observations.stuckLooksLike }),
      ...(draft.observations.interestsAndConsiderations === null
        ? { interestsAndConsiderations: undefined }
        : { interestsAndConsiderations: draft.observations.interestsAndConsiderations }),
    },
  });

const analyzeWithOpenAi = async (input: AnalyzeIepDocumentInput): Promise<IepProfileDraft> => {
  const client = new OpenAI({
    apiKey: openAiApiKey.value(),
    maxRetries: 0,
    timeout: IEP_ANALYSIS_TIMEOUT_MS,
  });
  const response = await client.responses.parse(
    {
      model: IEP_ANALYSIS_MODEL,
      instructions: INSTRUCTIONS,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Create a proposed classroom support profile from this document.',
            },
            {
              type: 'input_file',
              filename: input.fileName,
              file_data: `data:${input.mimeType};base64,${input.base64Data}`,
              detail: 'low',
            },
          ],
        },
      ],
      max_output_tokens: 2_500,
      store: false,
      text: { format: zodTextFormat(openAiIepDraftSchema, 'iep_profile_draft') },
    },
    { maxRetries: 0, timeout: IEP_ANALYSIS_TIMEOUT_MS },
  );
  if (response.output_parsed === null) throw new Error('No structured IEP profile returned.');
  return normalizeDraft(response.output_parsed);
};

const analyze = async (teacherId: TeacherId, input: AnalyzeIepDocumentInput) => {
  await authorizeStudent(teacherId, input);

  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return { profileDraft: createDemoIepProfileDraft(input) };
  }
  if (process.env.AI_PROVIDER !== 'openai' || process.env.AI_FEATURES_ENABLED !== 'true') {
    throw new HttpsError(
      'failed-precondition',
      'Document analysis is not configured. Use the quick observation questions instead.',
    );
  }

  try {
    const profileDraft = await runControlledAiOperation({
      teacherId,
      operation: 'analyzeIepDocument',
      provider: {
        name: 'openai',
        model: IEP_ANALYSIS_MODEL,
        promptVersion: IEP_ANALYSIS_PROMPT_VERSION,
      },
      invoke: () => analyzeWithOpenAi(input),
    });
    return { profileDraft };
  } catch (error) {
    if (error instanceof AiOperationalControlError) {
      throw new HttpsError(
        error.reason === 'rate_limited' ? 'resource-exhausted' : 'unavailable',
        'Document analysis is temporarily unavailable. Use the quick questions instead.',
      );
    }
    throw new HttpsError(
      'unavailable',
      'This document could not be analyzed. Try a PDF, DOCX, or text file, or use the quick questions.',
    );
  }
};

export const analyzeIepDocument = onCall(
  {
    ...teacherCallableOptions,
    maxInstances: 5,
    memory: '1GiB',
    secrets: [openAiApiKey],
    timeoutSeconds: 60,
  },
  (request) =>
    executeTeacherOperation('analyzeIepDocument', request, analyzeIepDocumentInputSchema, analyze),
);
