import OpenAI from 'openai';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { openAiApiKey } from '../ai/openAiRecommendationProvider.js';

const inputSchema = z
  .object({
    text: z.string().trim().min(1).max(4_000),
    speed: z.number().min(0.5).max(2).default(1),
  })
  .strict();

const MODEL = 'gpt-4o-mini-tts';

export const synthesizeSpeech = onCall(
  {
    consumeAppCheckToken: process.env.FUNCTIONS_EMULATOR !== 'true',
    enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
    maxInstances: 8,
    secrets: [openAiApiKey],
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to use read aloud.');
    const parsed = inputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'The speech request is invalid.');

    const key = openAiApiKey.value();
    const emulatorHasLiveKey =
      process.env.FUNCTIONS_EMULATOR === 'true' && key !== '' && !key.startsWith('unused-');
    const productionEnabled =
      process.env.FUNCTIONS_EMULATOR !== 'true' &&
      process.env.AI_PROVIDER === 'openai' &&
      process.env.AI_FEATURES_ENABLED === 'true';
    if (!emulatorHasLiveKey && !productionEnabled) {
      throw new HttpsError('failed-precondition', 'OpenAI speech is not configured.');
    }

    try {
      const client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 25_000 });
      const audio = await client.audio.speech.create({
        model: MODEL,
        voice: 'cedar',
        input: parsed.data.text,
        instructions: 'Speak clearly, warmly, and at a calm classroom pace.',
        response_format: 'mp3',
        speed: parsed.data.speed,
      });
      return {
        audioBase64: Buffer.from(await audio.arrayBuffer()).toString('base64'),
        mimeType: 'audio/mpeg' as const,
        model: MODEL,
      };
    } catch {
      throw new HttpsError('unavailable', 'Read aloud is temporarily unavailable.');
    }
  },
);
