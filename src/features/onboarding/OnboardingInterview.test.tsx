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
    expect(screen.getByText('Question 2 of 9')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    const response = screen.getByRole('textbox');
    await user.type(response, 'Starts familiar math independently.');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await advanceToReview(user);

    expect(
      screen.getByRole('heading', { name: 'Review observations for Sam' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Starts familiar math independently.')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Edit: When this student works independently, what usually goes well?',
      }),
    );
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'Begins short math routines without prompting.');
    await user.click(screen.getByRole('button', { name: 'Review answers' }));

    expect(screen.getByText('Begins short math routines without prompting.')).toBeInTheDocument();
  });

  it('keeps the teacher on the current question when a response violates the schema', async () => {
    const user = userEvent.setup();
    render(<OnboardingInterview onComplete={vi.fn()} />);

    await user.type(screen.getByRole('textbox'), 'a'.repeat(501));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/500 character/i);
    expect(screen.getByText('Question 1 of 9')).toBeInTheDocument();
  });

  it('produces a schema-shaped profile draft without a raw transcript', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OnboardingInterview onComplete={onComplete} />);

    await user.type(screen.getByRole('textbox'), 'Works independently on familiar examples.');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: 'Getting started' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Skip question' }));
    await user.type(
      screen.getByRole('textbox'),
      'Offer the first step\nCheck in after two minutes',
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: 'Typing' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: 'Usually stressful' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Skip question' }));
    await user.click(screen.getByRole('button', { name: 'Skip question' }));
    await user.type(screen.getByRole('textbox'), 'Play audio automatically');
    await user.click(screen.getByRole('button', { name: 'Review answers' }));

    expect(screen.getByText(/there is no raw chat transcript/i)).toBeInTheDocument();
    await user.type(
      screen.getByRole('textbox', { name: 'Teacher summary (optional)' }),
      'Sam benefits from a clear first step.',
    );
    await user.click(screen.getByRole('button', { name: 'Create profile draft' }));

    expect(onComplete).toHaveBeenCalledWith({
      observations: {
        independentWork: 'Works independently on familiar examples.',
        barriers: ['gettingStarted'],
        helpfulStrategies: ['Offer the first step', 'Check in after two minutes'],
        responsePreferences: ['typing'],
        timerResponse: 'stressful',
        adultPrompting: 'unknown',
        neverDo: ['Play audio automatically'],
      },
      teacherSummary: 'Sam benefits from a clear first step.',
    });
  });
});
