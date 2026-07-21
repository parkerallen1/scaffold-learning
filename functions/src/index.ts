import { onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { z } from 'zod';

import { fakeAiProvider } from './ai/fakeAiProvider.js';

export { exchangeStudentCredentials } from './auth/studentCredentialExchange.js';
export {
  archiveClassroom,
  bootstrapTeacher,
  createClassroom,
  createStudent,
  disableStudent,
  resetStudentPin,
  rotateClassCode,
} from './auth/teacherLifecycle.js';
export {
  createSupportPlanVersion,
  getStudentPlanningData,
  revertSupportPlanVersion,
  saveStudentProfile,
} from './planning/supportPlanPersistence.js';
export { recommendStudentSupports } from './planning/recommendStudentSupports.js';
export { analyzeIepDocument } from './planning/analyzeIepDocument.js';
export {
  assignPublishedAssignment,
  createAssignmentDraft,
  publishAssignment,
} from './assignments/assignmentPersistence.js';
export { generateAssignmentDraft } from './assignments/generateAssignmentDraft.js';
export {
  advanceStudentSession,
  recordStudentSupportEvent,
  startOrResumeStudentSession,
  submitStudentAttempt,
  transitionStudentSession,
} from './sessions/studentSessionLifecycle.js';
export { auditStudentEvidence } from './audits/auditStudentEvidence.js';
export { reviewStudentAudit } from './audits/reviewStudentAudit.js';
export { seedSyntheticStudentEvidence } from './demo/seedSyntheticStudentEvidence.js';
export { synthesizeSpeech } from './speech/synthesizeSpeech.js';

setGlobalOptions({ maxInstances: 10, region: 'us-central1' });

const healthcheckResultSchema = z.object({
  ok: z.literal(true),
  service: z.literal('quiz-master-functions'),
  aiProvider: z.literal('fake'),
});

export const healthcheck = onCall(
  { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' },
  () =>
    healthcheckResultSchema.parse({
      ok: true,
      service: 'quiz-master-functions',
      aiProvider: fakeAiProvider.name,
    }),
);
