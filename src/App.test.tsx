import { act, fireEvent, render, screen } from '@testing-library/react';
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
  it('reads the first question and advances after a correct answer', async () => {
    const user = userEvent.setup();
    render(<App pathname="/demo" />);

    expect(screen.getByText('Question 1 of 12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next Question' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Read question aloud' }));
    expect(speak).toHaveBeenCalledWith(
      'Use mental math to find the sum or difference. 4.25 + 1.36 + 2.75 = ___',
    );

    const answerInput = screen.getByLabelText('Your Final Answer');
    await user.type(answerInput, '8.36');
    await user.click(screen.getByRole('button', { name: 'Next Question' }));

    expect(screen.getByText('Question 2 of 12')).toBeInTheDocument();
    expect(answerInput).toHaveValue('');
  });

  it('stops the visual timer at zero without advancing or clearing work', () => {
    vi.useFakeTimers();

    render(<App pathname="/demo" />);

    fireEvent.click(screen.getByRole('button', { name: 'Prototype Settings' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Visual Timer' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });

    const answerInput = screen.getByLabelText('Your Final Answer');
    fireEvent.change(answerInput, { target: { value: 'work in progress' } });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 12')).toBeInTheDocument();
    expect(answerInput).toHaveValue('work in progress');

    vi.useRealTimers();
  });
});
