import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

type TestUser = {
  displayName: string | null;
  email: string | null;
  isAnonymous: boolean;
  uid: string;
};

const authHarness = vi.hoisted(() => ({
  demoTeacherEnabled: true,
  onError: null as ((error: Error) => void) | null,
  onUserChange: null as ((user: TestUser | null) => void) | null,
  signInDemoTeacher: vi.fn<() => Promise<void>>(),
  signInTeacherWithGoogle: vi.fn<() => Promise<void>>(),
  signOutCurrentUser: vi.fn<() => Promise<void>>(),
}));

vi.mock('../features/auth/authService', () => ({
  authRuntime: authHarness,
  observeAuthState: vi.fn(
    (onUserChange: (user: TestUser | null) => void, onError: (error: Error) => void) => {
      authHarness.onUserChange = onUserChange;
      authHarness.onError = onError;
      return vi.fn();
    },
  ),
  signInDemoTeacher: authHarness.signInDemoTeacher,
  signInTeacherWithGoogle: authHarness.signInTeacherWithGoogle,
  signOutCurrentUser: authHarness.signOutCurrentUser,
}));

describe('authentication shell', () => {
  beforeEach(() => {
    authHarness.demoTeacherEnabled = true;
    authHarness.onError = null;
    authHarness.onUserChange = null;
    authHarness.signInDemoTeacher.mockResolvedValue();
    authHarness.signInTeacherWithGoogle.mockResolvedValue();
    authHarness.signOutCurrentUser.mockResolvedValue();
  });

  it('shows loading, then protects the teacher workspace with Google sign-in', async () => {
    const user = userEvent.setup();
    render(<App pathname="/teacher" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading teacher workspace…');
    await waitFor(() => expect(authHarness.onUserChange).not.toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Checking teacher access…');

    act(() => authHarness.onUserChange?.(null));
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(authHarness.signInTeacherWithGoogle).toHaveBeenCalledOnce();
    expect(screen.queryByText('Welcome')).not.toBeInTheDocument();
  });

  it('offers and runs the demo teacher path only when emulator mode is enabled', async () => {
    const user = userEvent.setup();
    render(<App pathname="/teacher" />);
    await waitFor(() => expect(authHarness.onUserChange).not.toBeNull());
    act(() => authHarness.onUserChange?.(null));

    await user.click(screen.getByRole('button', { name: 'Use emulator demo teacher' }));

    expect(authHarness.signInDemoTeacher).toHaveBeenCalledOnce();
    expect(screen.getByText(/local-only/)).toBeInTheDocument();
  });

  it('hides the demo teacher path outside emulator mode', async () => {
    authHarness.demoTeacherEnabled = false;
    render(<App pathname="/teacher" />);
    await waitFor(() => expect(authHarness.onUserChange).not.toBeNull());
    act(() => authHarness.onUserChange?.(null));

    expect(
      screen.queryByRole('button', { name: 'Use emulator demo teacher' }),
    ).not.toBeInTheDocument();
  });

  it('renders the authenticated teacher workspace and signs out', async () => {
    const user = userEvent.setup();
    render(<App pathname="/teacher" />);
    await waitFor(() => expect(authHarness.onUserChange).not.toBeNull());

    act(() =>
      authHarness.onUserChange?.({
        displayName: 'Ada Teacher',
        email: 'ada@example.test',
        isAnonymous: false,
        uid: 'teacher-1',
      }),
    );

    expect(screen.getByRole('heading', { name: 'Welcome, Ada Teacher' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(authHarness.signOutCurrentUser).toHaveBeenCalledOnce();
  });

  it('shows authentication listener errors without exposing teacher content', async () => {
    render(<App pathname="/teacher/preview" />);
    await waitFor(() => expect(authHarness.onError).not.toBeNull());

    act(() => authHarness.onError?.(new Error('Authentication service unavailable.')));

    expect(screen.getByRole('alert')).toHaveTextContent('Authentication service unavailable.');
    expect(screen.queryByText('Question 1 of 12')).not.toBeInTheDocument();
  });

  it('keeps the student route behind a disabled credential entry screen', () => {
    render(<App pathname="/student" />);

    expect(screen.getByRole('heading', { name: 'Join your class' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Student sign-in coming next' })).toBeDisabled();
    expect(screen.queryByText('Question 1 of 12')).not.toBeInTheDocument();
  });
});
