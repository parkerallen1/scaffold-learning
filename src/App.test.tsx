import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import App from './app/App';
import { speak } from './services/speech';

vi.mock('./services/speech', () => ({
  speak: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./features/auth/authService', () => ({
  authRuntime: { demoTeacherEnabled: false },
  observeAuthState: vi.fn((onUserChange: (user: null) => void) => {
    onUserChange(null);
    return vi.fn();
  }),
  signInDemoTeacher: vi.fn(),
  signInStudent: vi.fn(),
  signInTeacherWithGoogle: vi.fn(),
  signOutCurrentUser: vi.fn(),
}));

describe('App', () => {
  it('checks an answer only after submission and advances after a correct answer', async () => {
    const user = userEvent.setup();
    render(<App pathname="/demo" />);

    expect(screen.getByText('Question 1 of 12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next Question' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Read question aloud' }));
    expect(speak).toHaveBeenCalledWith(
      'Use mental math to find the sum or difference. 4.25 + 1.36 + 2.75 = ___',
    );

    const answerInput = screen.getByLabelText('Your Final Answer');
    await user.type(answerInput, '8');
    expect(screen.queryByText(/incorrect/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next Question' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(screen.getByText('Incorrect. Try again.')).toBeInTheDocument();

    await user.clear(answerInput);
    await user.type(answerInput, '8.36');
    expect(screen.queryByText(/incorrect/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(screen.getByText('Correct.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next Question' }));

    expect(screen.getByText('Question 2 of 12')).toBeInTheDocument();
    expect(answerInput).toHaveValue('');
  });

  it('does not expose prototype-only settings in the student quiz', () => {
    render(<App pathname="/demo" />);
    expect(screen.queryByRole('button', { name: 'Prototype Settings' })).not.toBeInTheDocument();
    expect(screen.queryByText('Background Color')).not.toBeInTheDocument();
  });
});
