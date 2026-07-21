import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { supportSettingsSchema } from '@/lib/domain';
import type { SupportRecommendation } from '@/lib/domain';

import { SupportPlanReview } from './SupportPlanReview';

const focusRecommendation: SupportRecommendation = {
  supportKey: 'focusView',
  proposedSettings: {
    supportKey: 'focusView',
    enabled: true,
    hideNonessentialChrome: true,
  },
  rationale: 'A simplified page may make the first step easier to find.',
  basedOn: ['The student scans unrelated controls before starting.'],
  confidence: 'medium',
  cautions: ['Keep help and exit visible.'],
  status: 'proposed',
};

const readAloudRecommendation: SupportRecommendation = {
  supportKey: 'readAloud',
  proposedSettings: { supportKey: 'readAloud', enabled: true, speed: 1 },
  rationale: 'The student re-engages when directions are read aloud.',
  basedOn: ['Teacher read-aloud reduced repeated direction requests.'],
  confidence: 'high',
  cautions: [],
  status: 'proposed',
};

const interestRecommendation: SupportRecommendation = {
  supportKey: 'interestReward',
  proposedSettings: {
    supportKey: 'interestReward',
    enabled: true,
    rewardMessage: 'Great persistence!',
    rewardMedia: [],
  },
  rationale: 'Personal encouragement helps the student recognize progress.',
  basedOn: ['The student enjoys encouragement connected to drawing.'],
  confidence: 'medium',
  cautions: [],
  status: 'proposed',
};

describe('SupportPlanReview', () => {
  it('keeps proposed recommendations out of the student preview and saved output', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <SupportPlanReview
        recommendations={[{ ...focusRecommendation, status: 'approved' }]}
        onComplete={onComplete}
      />,
    );

    const preview = within(screen.getByRole('region', { name: 'Student preview' }));
    expect(screen.getByLabelText('Focus view review')).toHaveTextContent('proposed');
    expect(preview.getByText(/no supports are active/i)).toBeInTheDocument();
    expect(preview.queryByText(/hide nonessential/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save approved plan' }));
    expect(onComplete).toHaveBeenCalledWith([]);
  });

  it('edits and approves one recommendation before exposing it to the student', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <SupportPlanReview recommendations={[readAloudRecommendation]} onComplete={onComplete} />,
    );

    const speed = screen.getByRole('spinbutton', { name: 'Reading speed' });
    fireEvent.change(speed, { target: { value: '1.5' } });
    await user.click(screen.getByRole('button', { name: 'Approve Read aloud' }));
    expect(screen.getByRole('status')).toHaveTextContent('Read aloud approved.');
    expect(screen.getByRole('button', { name: 'Read aloud approved' })).toBeDisabled();

    const preview = within(screen.getByRole('region', { name: 'Student preview' }));
    expect(
      preview.getByText(
        'Read aloud is available when the student chooses it at 1.5× speed. Audio never starts automatically.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save approved plan' }));
    expect(onComplete).toHaveBeenCalledWith([
      { supportKey: 'readAloud', enabled: true, speed: 1.5 },
    ]);
  });

  it('keeps rejected recommendations out of the preview and saved plan', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SupportPlanReview recommendations={[focusRecommendation]} onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: 'Reject Focus view' }));
    expect(
      within(screen.getByRole('region', { name: 'Student preview' })).getByText(
        /no supports are active/i,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save approved plan' }));
    expect(onComplete).toHaveBeenCalledWith([]);
  });

  it('supports manual configuration when AI recommendations fail', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <SupportPlanReview
        recommendationError="The recommendation service timed out."
        onComplete={onComplete}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/manual support catalog/i);
    await user.click(screen.getByRole('button', { name: 'Add Focus view manually' }));
    expect(screen.getByText(/No AI rationale is used/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve Focus view' }));
    await user.click(screen.getByRole('button', { name: 'Save approved plan' }));

    expect(onComplete).toHaveBeenCalledWith([
      { supportKey: 'focusView', enabled: true, hideNonessentialChrome: true },
    ]);
  });

  it('emits only schema-valid approved support settings', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <SupportPlanReview
        recommendations={[focusRecommendation, readAloudRecommendation]}
        onComplete={onComplete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Approve Focus view' }));
    await user.click(screen.getByRole('button', { name: 'Approve Read aloud' }));
    await user.click(screen.getByRole('button', { name: 'Save approved plan' }));

    const output = onComplete.mock.calls[0]?.[0] as unknown[];
    expect(output).toHaveLength(2);
    for (const settings of output) {
      expect(supportSettingsSchema.safeParse(settings).success).toBe(true);
    }
  });

  it('uploads multiple encouragement media items before approval', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const upload = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'media_image_01',
        kind: 'image',
        storagePath:
          'classrooms/classroom_demo_01/students/student_demo_01/interest-rewards/media_image_01-space.png',
        fileName: 'space.png',
        mimeType: 'image/png',
      })
      .mockResolvedValueOnce({
        id: 'media_audio_01',
        kind: 'audio',
        storagePath:
          'classrooms/classroom_demo_01/students/student_demo_01/interest-rewards/media_audio_01-cheer.mp3',
        fileName: 'cheer.mp3',
        mimeType: 'audio/mpeg',
      });

    render(
      <SupportPlanReview
        recommendations={[interestRecommendation]}
        onComplete={onComplete}
        onUploadInterestMedia={upload}
      />,
    );

    await user.upload(screen.getByLabelText('Upload encouragement images or audio'), [
      new File(['image'], 'space.png', { type: 'image/png' }),
      new File(['audio'], 'cheer.mp3', { type: 'audio/mpeg' }),
    ]);

    expect(await screen.findByText('space.png')).toBeInTheDocument();
    expect(screen.getByText('cheer.mp3')).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Approve Interest-based encouragement' }));
    await user.click(screen.getByRole('button', { name: 'Save approved plan' }));

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        supportKey: 'interestReward',
        rewardMessage: 'Great persistence!',
        rewardMedia: [
          expect.objectContaining({ kind: 'image', fileName: 'space.png' }),
          expect.objectContaining({ kind: 'audio', fileName: 'cheer.mp3' }),
        ],
      }),
    ]);
  });
});
