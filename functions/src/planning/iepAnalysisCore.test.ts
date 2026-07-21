import { describe, expect, it } from 'vitest';

import { analyzeIepDocumentInputSchema } from '@quiz-master/domain';

import { createDemoIepProfileDraft } from './iepAnalysisCore.js';

describe('createDemoIepProfileDraft', () => {
  it('creates a structured, non-diagnostic draft for the local demo', () => {
    const input = analyzeIepDocumentInputSchema.parse({
      classroomId: 'classroom-1',
      studentId: 'student-1',
      fileName: 'reading-plan.txt',
      mimeType: 'text/plain',
      base64Data: Buffer.from(
        'Reading fluency, written response, and sustained attention.',
      ).toString('base64'),
    });

    const result = createDemoIepProfileDraft(input);

    expect(result.observations.barriers).toEqual(
      expect.arrayContaining(['readingDirections', 'writtenResponse', 'sustainingAttention']),
    );
    expect(result.teacherSummary).not.toMatch(/diagnos/i);
  });
});
