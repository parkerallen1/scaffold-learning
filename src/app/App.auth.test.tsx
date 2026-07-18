import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

type TestUser = {
  authVersion: number | null;
  classroomId: string | null;
  displayName: string | null;
  email: string | null;
  isAnonymous: boolean;
  role: 'student' | 'teacher' | null;
  studentId: string | null;
  uid: string;
};

type StudentCredentials = {
  classCode: string;
  pin: string;
  studentHandle: string;
};

const authHarness = vi.hoisted(() => ({
  demoTeacherEnabled: true,
  onError: null as ((error: Error) => void) | null,
  onUserChange: null as ((user: TestUser | null) => void) | null,
  signInDemoTeacher: vi.fn<() => Promise<TestUser>>(),
  signInStudent: vi.fn<(credentials: StudentCredentials) => Promise<TestUser>>(),
  signInTeacherWithGoogle: vi.fn<() => Promise<TestUser>>(),
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
  signInStudent: authHarness.signInStudent,
  signInTeacherWithGoogle: authHarness.signInTeacherWithGoogle,
  signOutCurrentUser: authHarness.signOutCurrentUser,
}));

vi.mock('../features/classrooms/ClassroomWorkspace', () => ({
  ClassroomWorkspace: () => <section aria-label="Classroom workspace" />,
}));

vi.mock('./pages/TeacherAssignmentsPage', () => ({
  TeacherAssignmentsPage: () => (
    <main>
      <h1>Create and assign student work</h1>
    </main>
  ),
}));

const teacherUser: TestUser = {
  authVersion: null,
  classroomId: null,
  displayName: 'Ada Teacher',
  email: 'ada@example.test',
  isAnonymous: false,
  role: 'teacher',
  studentId: null,
  uid: 'teacher-1',
};

const studentUser: TestUser = {
  authVersion: 4,
  classroomId: 'classroom-1',
  displayName: null,
  email: null,
  isAnonymous: false,
  role: 'student',
  studentId: 'student-1',
  uid: 'student-auth-1',
};

const loadAuthRoute = async (
  pathname: '/student' | '/teacher' | '/teacher/assignments' | '/teacher/preview',
) => {
  render(<App pathname={pathname} />);
  await waitFor(() => expect(authHarness.onUserChange).not.toBeNull());
};

describe('authentication shell', () => {
  beforeEach(() => {
    authHarness.demoTeacherEnabled = true;
    authHarness.onError = null;
    authHarness.onUserChange = null;
    authHarness.signInDemoTeacher.mockReset().mockResolvedValue({
      ...teacherUser,
      displayName: null,
      email: null,
      isAnonymous: true,
      uid: 'demo-teacher-1',
    });
    authHarness.signInStudent.mockReset().mockResolvedValue(studentUser);
    authHarness.signInTeacherWithGoogle.mockReset().mockResolvedValue(teacherUser);
    authHarness.signOutCurrentUser.mockReset().mockResolvedValue();
  });

  it('protects the teacher workspace and accepts a bootstrapped Google teacher', async () => {
    const user = userEvent.setup();
    render(<App pathname="/teacher" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading secure access…');
    await waitFor(() => expect(authHarness.onUserChange).not.toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Checking teacher access…');

    act(() => authHarness.onUserChange?.(null));
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(authHarness.signInTeacherWithGoogle).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Welcome, Ada Teacher' })).toBeInTheDocument();
  });

  it('offers and runs the demo teacher path only when emulator mode is enabled', async () => {
    const user = userEvent.setup();
    await loadAuthRoute('/teacher');
    act(() => authHarness.onUserChange?.(null));

    await user.click(screen.getByRole('button', { name: 'Use emulator demo teacher' }));

    expect(authHarness.signInDemoTeacher).toHaveBeenCalledOnce();
    expect(screen.getByText(/all data must remain synthetic/)).toBeInTheDocument();
  });

  it('hides the demo teacher path outside emulator mode', async () => {
    authHarness.demoTeacherEnabled = false;
    await loadAuthRoute('/teacher');
    act(() => authHarness.onUserChange?.(null));

    expect(
      screen.queryByRole('button', { name: 'Use emulator demo teacher' }),
    ).not.toBeInTheDocument();
  });

  it('renders the authenticated teacher workspace and signs out', async () => {
    const user = userEvent.setup();
    await loadAuthRoute('/teacher');

    act(() => authHarness.onUserChange?.(teacherUser));

    expect(screen.getByRole('heading', { name: 'Welcome, Ada Teacher' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create assignment' })).toHaveAttribute(
      'href',
      '/teacher/assignments',
    );
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(authHarness.signOutCurrentUser).toHaveBeenCalledOnce();
  });

  it('denies teacher routes to a signed-in student, including preview content', async () => {
    await loadAuthRoute('/teacher/preview');

    act(() => authHarness.onUserChange?.(studentUser));

    expect(screen.getByRole('heading', { name: 'Teacher access unavailable' })).toBeInTheDocument();
    expect(screen.queryByText('Question 1 of 12')).not.toBeInTheDocument();
  });

  it('protects assignment authoring from signed-in students', async () => {
    await loadAuthRoute('/teacher/assignments');

    act(() => authHarness.onUserChange?.(studentUser));

    expect(screen.getByRole('heading', { name: 'Teacher access unavailable' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Create and assign student work' }),
    ).not.toBeInTheDocument();
  });

  it('shows authentication listener errors without exposing teacher content', async () => {
    await loadAuthRoute('/teacher/preview');

    act(() => authHarness.onError?.(new Error('Authentication service unavailable.')));

    expect(screen.getByRole('alert')).toHaveTextContent('Authentication service unavailable.');
    expect(screen.queryByText('Question 1 of 12')).not.toBeInTheDocument();
  });

  it('exchanges student credentials, clears the PIN immediately, and renders a student-only shell', async () => {
    const user = userEvent.setup();
    let completeSignIn: ((value: TestUser) => void) | undefined;
    authHarness.signInStudent.mockReturnValueOnce(
      new Promise((resolve) => {
        completeSignIn = resolve;
      }),
    );
    await loadAuthRoute('/student');
    act(() => authHarness.onUserChange?.(null));

    await user.type(screen.getByLabelText('Class code'), 'ABC123');
    await user.type(screen.getByLabelText('Student handle'), 'alex');
    const pinInput = screen.getByLabelText('Student PIN');
    await user.type(pinInput, '4829');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(authHarness.signInStudent).toHaveBeenCalledWith({
      classCode: 'ABC123',
      pin: '4829',
      studentHandle: 'alex',
    });
    expect(pinInput).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();

    await act(async () => completeSignIn?.(studentUser));

    expect(screen.getByRole('heading', { name: 'You are signed in' })).toBeInTheDocument();
    expect(screen.getByText('classroom-1')).toBeInTheDocument();
    expect(screen.getByText('student-1')).toBeInTheDocument();
    expect(screen.queryByText('Teacher workspace')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows only a generic student credential error', async () => {
    const user = userEvent.setup();
    authHarness.signInStudent.mockRejectedValueOnce(
      new Error('Unable to sign in with those credentials.'),
    );
    await loadAuthRoute('/student');
    act(() => authHarness.onUserChange?.(null));

    await user.type(screen.getByLabelText('Class code'), 'ABC123');
    await user.type(screen.getByLabelText('Student handle'), 'alex');
    await user.type(screen.getByLabelText('Student PIN'), '0000');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to sign in with those credentials.',
    );
  });

  it('does not expose the student shell to a signed-in teacher', async () => {
    await loadAuthRoute('/student');

    act(() => authHarness.onUserChange?.(teacherUser));

    expect(screen.getByRole('heading', { name: 'Student access unavailable' })).toBeInTheDocument();
    expect(screen.queryByText('You are signed in')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
