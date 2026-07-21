import { iepProfileDraftSchema } from '@scaffold-learning/domain';
import type { AnalyzeIepDocumentInput, IepProfileDraft } from '@scaffold-learning/domain';

const decodedText = (input: AnalyzeIepDocumentInput): string => {
  if (input.mimeType !== 'text/plain') return input.fileName.toLowerCase();
  return Buffer.from(input.base64Data, 'base64').toString('utf8').slice(0, 100_000).toLowerCase();
};

export const createDemoIepProfileDraft = (input: AnalyzeIepDocumentInput): IepProfileDraft => {
  const source = decodedText(input);
  const mentionsReading = /reading|dyslex|decode|fluency|text|written/.test(source);
  const mentionsAttention = /attention|focus|start|executive|adhd|multi-step/.test(source);
  const barriers = [
    ...(mentionsReading ? (['readingDirections', 'writtenResponse'] as const) : []),
    ...(mentionsAttention ? (['gettingStarted', 'sustainingAttention'] as const) : []),
  ];

  return iepProfileDraftSchema.parse({
    observations: {
      barriers: barriers.length > 0 ? [...new Set(barriers)] : ['readingDirections'],
      stuckLooksLike: mentionsAttention
        ? 'May need a clear first step and fewer competing items on screen.'
        : 'May need directions presented in a more accessible format.',
      helpfulStrategies: [
        ...(mentionsReading
          ? ['Read directions aloud on request.', 'Present shorter text chunks.']
          : []),
        ...(mentionsAttention ? ['Show one step at a time.', 'Reduce visual distractions.'] : []),
      ],
      responsePreferences: mentionsReading ? ['typing', 'selection'] : ['typing'],
      timerResponse: 'unknown',
      adultPrompting: 'unknown',
      neverDo: ['Do not start audio or advance work automatically.'],
    },
    teacherSummary:
      'Imported document suggests accessible directions, a clear first step, and student-controlled supports. Review these extracted needs before making them live.',
  });
};
