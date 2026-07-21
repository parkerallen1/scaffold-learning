import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InterestRewardContent } from './InterestRewardContent';

vi.mock('./interestRewardMedia', () => ({
  getInterestRewardMediaUrl: vi.fn((path: string) => Promise.resolve(`https://media.test/${path}`)),
}));

describe('InterestRewardContent', () => {
  it('renders teacher text, multiple images, and an audio clip without naming the support', async () => {
    render(
      <InterestRewardContent
        settings={{
          supportKey: 'interestReward',
          enabled: true,
          rewardMessage: 'Your space-station focus paid off!',
          rewardMedia: [
            {
              id: 'media_image_01',
              kind: 'image',
              storagePath:
                'classrooms/classroom_demo_01/students/student_demo_01/interest-rewards/media_image_01-rocket.png',
              fileName: 'rocket.png',
              mimeType: 'image/png',
            },
            {
              id: 'media_image_02',
              kind: 'image',
              storagePath:
                'classrooms/classroom_demo_01/students/student_demo_01/interest-rewards/media_image_02-stars.png',
              fileName: 'stars.png',
              mimeType: 'image/png',
            },
            {
              id: 'media_audio_01',
              kind: 'audio',
              storagePath:
                'classrooms/classroom_demo_01/students/student_demo_01/interest-rewards/media_audio_01-cheer.mp3',
              fileName: 'cheer.mp3',
              mimeType: 'audio/mpeg',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Your space-station focus paid off!')).toBeInTheDocument();
    expect(await screen.findAllByRole('img')).toHaveLength(2);
    expect(screen.getByLabelText('Play encouragement from your teacher')).toBeInTheDocument();
    expect(screen.queryByText(/interest-based encouragement/i)).not.toBeInTheDocument();
  });
});
