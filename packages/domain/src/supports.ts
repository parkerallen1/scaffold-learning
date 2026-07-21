import { z } from 'zod';

import {
  classroomIdSchema,
  epochMillisSchema,
  studentIdSchema,
  supportPlanIdSchema,
  teacherIdSchema,
} from './ids.js';

export const CORE_SUPPORT_KEYS = ['readAloud', 'readingChunks', 'focusView', 'hintLadder'] as const;

export const SUPPORT_KEYS = [
  ...CORE_SUPPORT_KEYS,
  'flexibleResponse',
  'calmPacing',
  'breakPrompt',
  'dyslexiaFont',
] as const;

export const supportKeySchema = z.enum(SUPPORT_KEYS);
export type SupportKey = z.infer<typeof supportKeySchema>;

export const SUPPORT_CATALOG = Object.freeze({
  readAloud: {
    label: 'Read aloud',
    description: 'Replayable browser speech with speed control.',
    caution: 'Audio starts only after the student asks for it and never plays automatically.',
    evidenceSignals: ['activated', 'replayed', 'speedChanged'],
    defaultSettings: { supportKey: 'readAloud', enabled: true, speed: 1 },
  },
  readingChunks: {
    label: 'Reading chunks',
    description: 'Reveal directions by sentence or teacher-approved step.',
    caution: 'Always preserve the original wording and let the student reveal all directions.',
    evidenceSignals: ['shown', 'chunkAdvanced', 'revealAll'],
    defaultSettings: {
      supportKey: 'readingChunks',
      enabled: true,
      chunkMode: 'step',
      revealAllAllowed: true,
    },
  },
  focusView: {
    label: 'Focus view',
    description: 'Hide nonessential controls for one problem.',
    caution: 'Progress, help, and exit controls must remain available.',
    evidenceSignals: ['activated', 'dismissed'],
    defaultSettings: {
      supportKey: 'focusView',
      enabled: true,
      hideNonessentialChrome: true,
    },
  },
  hintLadder: {
    label: 'Hint ladder',
    description: 'Offer increasingly specific teacher-approved help.',
    caution: 'Early hints must not reveal the answer or replace the learning target.',
    evidenceSignals: ['tierShown', 'attemptAfterHint', 'completed'],
    defaultSettings: {
      supportKey: 'hintLadder',
      enabled: true,
      maxTier: 3,
      allowAnalogousExample: true,
    },
  },
  flexibleResponse: {
    label: 'Flexible response',
    description: 'Use an approved response presentation.',
    caution: 'Do not change the response format when doing so changes the learning target.',
    evidenceSignals: ['modeSelected', 'modeChanged'],
    defaultSettings: {
      supportKey: 'flexibleResponse',
      enabled: true,
      preferredMode: 'typing',
      allowStudentChoice: true,
    },
  },
  calmPacing: {
    label: 'Calm pacing',
    description: 'Use no timer or a non-expiring visual cue.',
    caution: 'A timer reaching zero must never submit, advance, or block the student.',
    evidenceSignals: ['timerShown', 'timerHidden'],
    defaultSettings: { supportKey: 'calmPacing', enabled: true, timerMode: 'off' },
  },
  breakPrompt: {
    label: 'Break prompt',
    description: 'Offer an optional short pause after effort.',
    caution: 'Breaks are optional, skippable, and never framed as a consequence.',
    evidenceSignals: ['shown', 'activated', 'dismissed', 'completed'],
    defaultSettings: {
      supportKey: 'breakPrompt',
      enabled: true,
      afterAttempts: 3,
      durationSeconds: 120,
      skippable: true,
    },
  },
  dyslexiaFont: {
    label: 'Dyslexia-friendly font',
    description: 'Use a clear sans-serif typeface with extra letter and word spacing.',
    caution: 'Keep the original wording and let the student use normal browser zoom controls.',
    evidenceSignals: ['applied'],
    defaultSettings: {
      supportKey: 'dyslexiaFont',
      enabled: true,
      increasedSpacing: true,
    },
  },
} as const satisfies Readonly<
  Record<
    SupportKey,
    Readonly<{
      label: string;
      description: string;
      caution: string;
      evidenceSignals: readonly string[];
      defaultSettings: Readonly<Record<string, boolean | number | string>>;
    }>
  >
>);

const enabledSchema = z.boolean().default(true);

export const readAloudSettingsSchema = z
  .object({
    supportKey: z.literal('readAloud'),
    enabled: enabledSchema,
    speed: z.number().min(0.5).max(2).default(1),
  })
  .strict();

export const readingChunksSettingsSchema = z
  .object({
    supportKey: z.literal('readingChunks'),
    enabled: enabledSchema,
    chunkMode: z.enum(['sentence', 'step']),
    revealAllAllowed: z.literal(true),
  })
  .strict();

export const focusViewSettingsSchema = z
  .object({
    supportKey: z.literal('focusView'),
    enabled: enabledSchema,
    hideNonessentialChrome: z.boolean().default(true),
  })
  .strict();

export const hintLadderSettingsSchema = z
  .object({
    supportKey: z.literal('hintLadder'),
    enabled: enabledSchema,
    maxTier: z.number().int().min(1).max(3).default(3),
    allowAnalogousExample: z.boolean().default(true),
  })
  .strict();

export const flexibleResponseSettingsSchema = z
  .object({
    supportKey: z.literal('flexibleResponse'),
    enabled: enabledSchema,
    preferredMode: z.enum(['typing', 'selection']),
    allowStudentChoice: z.boolean().default(true),
  })
  .strict();

export const calmPacingSettingsSchema = z
  .object({
    supportKey: z.literal('calmPacing'),
    enabled: enabledSchema,
    timerMode: z.enum(['off', 'elapsed', 'nonExpiringCountdown']),
    durationSeconds: z.number().int().min(30).max(3600).optional(),
  })
  .strict()
  .superRefine((settings, context) => {
    if (settings.timerMode === 'nonExpiringCountdown' && settings.durationSeconds === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['durationSeconds'],
        message: 'A non-expiring countdown requires a duration.',
      });
    }
  });

export const breakPromptSettingsSchema = z
  .object({
    supportKey: z.literal('breakPrompt'),
    enabled: enabledSchema,
    afterAttempts: z.number().int().min(1).max(10),
    durationSeconds: z.number().int().min(30).max(600),
    skippable: z.literal(true),
  })
  .strict();

export const dyslexiaFontSettingsSchema = z
  .object({
    supportKey: z.literal('dyslexiaFont'),
    enabled: enabledSchema,
    increasedSpacing: z.boolean().default(true),
  })
  .strict();

export const supportSettingsSchema = z.discriminatedUnion('supportKey', [
  readAloudSettingsSchema,
  readingChunksSettingsSchema,
  focusViewSettingsSchema,
  hintLadderSettingsSchema,
  flexibleResponseSettingsSchema,
  calmPacingSettingsSchema,
  breakPromptSettingsSchema,
  dyslexiaFontSettingsSchema,
]);

export const supportSettingsSnapshotSchema = supportSettingsSchema.readonly();

export const supportPlanVersionSchema = z
  .object({
    id: supportPlanIdSchema,
    classroomId: classroomIdSchema,
    studentId: studentIdSchema,
    version: z.number().int().positive(),
    supports: z.array(supportSettingsSnapshotSchema).max(SUPPORT_KEYS.length).readonly(),
    source: z.enum(['manual', 'onboardingRecommendation', 'audit', 'revert']),
    approvedBy: teacherIdSchema,
    approvedAt: epochMillisSchema,
    supersedesId: supportPlanIdSchema.nullable(),
  })
  .strict()
  .superRefine((plan, context) => {
    const keys = plan.supports.map((support) => support.supportKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['supports'],
        message: 'Support keys must be unique.',
      });
    }
  })
  .readonly();

export const supportRecommendationSchema = z
  .object({
    supportKey: supportKeySchema,
    proposedSettings: supportSettingsSchema,
    rationale: z.string().trim().min(1).max(600),
    basedOn: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
    confidence: z.enum(['low', 'medium', 'high']),
    cautions: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
    status: z.enum(['proposed', 'approved', 'rejected']).default('proposed'),
  })
  .strict()
  .refine((value) => value.supportKey === value.proposedSettings.supportKey, {
    message: 'The proposed settings must match the support key.',
    path: ['proposedSettings', 'supportKey'],
  });

export type SupportSettings = z.infer<typeof supportSettingsSchema>;
export type SupportPlanVersion = z.infer<typeof supportPlanVersionSchema>;
export type SupportRecommendation = z.infer<typeof supportRecommendationSchema>;

export const createNextSupportPlanVersion = ({
  id,
  previous,
  supports,
  source,
  approvedBy,
  approvedAt,
}: Readonly<{
  id: SupportPlanVersion['id'];
  previous: SupportPlanVersion;
  supports: readonly SupportSettings[];
  source: SupportPlanVersion['source'];
  approvedBy: SupportPlanVersion['approvedBy'];
  approvedAt: SupportPlanVersion['approvedAt'];
}>): SupportPlanVersion =>
  supportPlanVersionSchema.parse({
    id,
    classroomId: previous.classroomId,
    studentId: previous.studentId,
    version: previous.version + 1,
    supports,
    source,
    approvedBy,
    approvedAt,
    supersedesId: previous.id,
  });
