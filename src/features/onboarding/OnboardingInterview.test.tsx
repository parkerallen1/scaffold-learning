import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OnboardingInterview } from './OnboardingInterview';

const advanceToReview = async (user: ReturnType<typeof userEvent.setup>) => {
  while (screen.queryByRole('button', { name: 'Skip question' })) {
    await user.click(screen.getByRole('button', { name: 'Skip question' }));
  }
};

describe('OnboardingInterview', () => {
  it('supports skip, back, and editing an answer from review', async () => {
    const user = userEvent.setup();
    render(<OnboardingInterview onComplete={vi.fn()} studentName="Sam" />);

    expect(screen.getByRole('heading')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Skip question' }));
    expect(screen.getByText('Question 2 of 7')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('checkbox', { name: 'Getting started' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await advanceToReview(user);

    expect(
      screen.getByRole('heading', { name: 'Review observations for Sam' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Getting started')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Edit: Where does independent work create the most friction?',
      }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Getting started' }));
    await user.click(screen.getByRole('checkbox', { name: 'Reading directions' }));
    await user.click(screen.getByRole('button', { name: 'Review answers' }));

    expect(screen.getByText('Reading directions')).toBeInTheDocument();
  });

  it('offers a concise Other response on every question', async () => {
    const user = userEvent.setup();
    render(<OnboardingInterview onComplete={vi.fn()} />);

    for (let questionNumber = 1; questionNumber <= 7; questionNumber += 1) {
      expect(screen.getByLabelText('Other')).toBeInTheDocument();
      if (questionNumber < 7) {
        await user.click(screen.getByRole('button', { name: 'Skip question' }));
      }
    }

    await user.click(screen.getByLabelText('Other'));
    const other = screen.getByRole('textbox', {
      name: 'Other response for: What should the app avoid for this student?',
    });
    expect(other).toHaveAttribute('maxlength', '180');
  });

  it('produces a schema-shaped profile draft without a raw transcript', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OnboardingInterview onComplete={onComplete} />);

    await user.click(screen.getByRole('checkbox', { name: 'Getting started' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: 'Waits without starting' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Offer a neutral first-step prompt' }),
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: 'Typing' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Usually stressful' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Occasionally' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: 'Playing audio automatically' }));
    await user.click(screen.getByRole('button', { name: 'Review answers' }));

    expect(screen.getByText(/there is no raw chat transcript/i)).toBeInTheDocument();
    await user.type(
      screen.getByRole('textbox', { name: 'Teacher summary (optional)' }),
      'Sam benefits from a clear first step.',
    );
    await user.click(screen.getByRole('button', { name: 'Create profile draft' }));

    expect(onComplete).toHaveBeenCalledWith({
      observations: {
        barriers: ['gettingStarted'],
        stuckLooksLike: 'Waits without starting',
        helpfulStrategies: ['Offer a neutral first-step prompt.'],
        responsePreferences: ['typing'],
        timerResponse: 'stressful',
        adultPrompting: 'occasional',
        neverDo: ['Do not play audio automatically.'],
      },
      teacherSummary: 'Sam benefits from a clear first step.',
    });
  });
});
