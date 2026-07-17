import { onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { z } from 'zod';

import { fakeAiProvider } from './ai/fakeAiProvider.js';

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
