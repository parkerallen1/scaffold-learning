import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IepUploadPanel } from './IepUploadPanel';

const planningHarness = vi.hoisted(() => ({ analyzeIepDocument: vi.fn() }));

vi.mock('./planningService', () => planningHarness);

describe('IepUploadPanel', () => {
  it('lets the teacher review an extracted profile before saving it', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    planningHarness.analyzeIepDocument.mockResolvedValue({
      observations: {
        barriers: ['readingDirections'],
        helpfulStrategies: ['Read directions aloud on request.'],
        responsePreferences: ['typing'],
        timerResponse: 'unknown',
        adultPrompting: 'unknown',
        neverDo: [],
      },
      teacherSummary: 'Use accessible directions and student-controlled support.',
    });

    render(
      <IepUploadPanel
        classroomId="classroom-1"
        studentId="student-1"
        studentName="Sam"
        onBack={vi.fn()}
        onComplete={onComplete}
        onUseQuestions={vi.fn()}
      />,
    );

    const file = new File(['Reading directions should be read aloud.'], 'sam-iep.txt', {
      type: 'text/plain',
    });
    await user.upload(screen.getByLabelText('IEP document'), file);
    await user.click(screen.getByRole('button', { name: 'Analyze document' }));

    expect(
      await screen.findByRole('heading', { name: 'Review the imported profile for Sam' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reading directions')).toBeInTheDocument();
    expect(screen.getByText('Read directions aloud on request.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use this profile and review supports' }));
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ teacherSummary: expect.stringContaining('accessible directions') }),
    );
  });
});
