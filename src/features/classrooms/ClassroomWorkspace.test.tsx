import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClassroomWorkspace } from './ClassroomWorkspace';

const classroomHarness = vi.hoisted(() => ({
  archiveClassroom: vi.fn(),
  createClassroom: vi.fn(),
  createStudent: vi.fn(),
  disableStudent: vi.fn(),
  resetStudentPin: vi.fn(),
  rotateClassCode: vi.fn(),
  useClassroomStudents: vi.fn(),
  useOwnedClassrooms: vi.fn(),
}));

vi.mock('./classroomService', () => ({
  archiveClassroom: classroomHarness.archiveClassroom,
  createClassroom: classroomHarness.createClassroom,
  createStudent: classroomHarness.createStudent,
  disableStudent: classroomHarness.disableStudent,
  resetStudentPin: classroomHarness.resetStudentPin,
  rotateClassCode: classroomHarness.rotateClassCode,
}));

vi.mock('./useClassrooms', () => ({
  useClassroomStudents: classroomHarness.useClassroomStudents,
  useOwnedClassrooms: classroomHarness.useOwnedClassrooms,
}));

const activeClassroom = {
  classCode: 'DEMO-01',
  createdAt: 1,
  id: 'classroom-1',
  name: 'Algebra Lab',
  status: 'active' as const,
  teacherId: 'teacher-1',
  updatedAt: 1,
};

const activeStudent = {
  authVersion: 1,
  classroomId: 'classroom-1',
  createdAt: 1,
  displayName: 'Alex Student',
  demoStory: 'Alex benefits from a focused screen and calm pacing.',
  id: 'student-1',
  studentHandle: 'alex_student',
  status: 'active' as const,
  updatedAt: 1,
};

describe('ClassroomWorkspace', () => {
  beforeEach(() => {
    classroomHarness.useOwnedClassrooms.mockReset().mockReturnValue({
      data: [activeClassroom],
      error: null,
      isLoading: false,
    });
    classroomHarness.useClassroomStudents.mockReset().mockReturnValue({
      data: [activeStudent],
      error: null,
      isLoading: false,
    });
    classroomHarness.createClassroom.mockReset();
    classroomHarness.createStudent.mockReset();
    classroomHarness.rotateClassCode.mockReset();
    classroomHarness.resetStudentPin.mockReset();
    classroomHarness.disableStudent.mockReset();
    classroomHarness.archiveClassroom.mockReset();
  });

  it('shows loading and empty classroom states', () => {
    classroomHarness.useOwnedClassrooms.mockReturnValue({
      data: [],
      error: null,
      isLoading: true,
    });
    const { rerender } = render(<ClassroomWorkspace teacherId="teacher-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading classrooms…');

    classroomHarness.useOwnedClassrooms.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
    });
    rerender(<ClassroomWorkspace teacherId="teacher-1" />);
    expect(screen.getByText(/No classrooms yet/)).toBeInTheDocument();
  });

  it('creates a classroom without a display-once popup', async () => {
    const user = userEvent.setup();
    classroomHarness.createClassroom.mockResolvedValue({
      classroom: {
        ...activeClassroom,
        classCode: 'DEMO-02',
        id: 'classroom-2',
        name: 'Geometry Lab',
      },
      classCode: 'ABCD-EF',
    });
    render(<ClassroomWorkspace teacherId="teacher-1" />);

    await user.type(screen.getByLabelText('New classroom name'), 'Geometry Lab');
    await user.click(screen.getByRole('button', { name: 'Create classroom' }));

    expect(classroomHarness.createClassroom).toHaveBeenCalledWith('Geometry Lab');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByText(/class code is available to copy/i)).toHaveTextContent(
      'class code is available to copy from the classroom header',
    );
  });

  it('creates a student without storing or logging the returned one-time PIN', async () => {
    const user = userEvent.setup();
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    classroomHarness.createStudent.mockResolvedValue({
      oneTimePin: '482901',
      student: activeStudent,
      studentHandle: 'alex_01',
    });
    render(<ClassroomWorkspace teacherId="teacher-1" />);
    await screen.findByRole('heading', { name: 'Algebra Lab' });

    await user.type(screen.getByLabelText('Display name'), 'Alex Student');
    expect(screen.queryByLabelText('Student handle')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create student' }));

    expect(classroomHarness.createStudent).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      displayName: 'Alex Student',
    });
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('alex_01');
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('482901');
    expect(storageSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'I saved these details' }));
    expect(screen.queryByText('482901')).not.toBeInTheDocument();
  });

  it('shows persistent copy controls instead of a popup or reset button in the demo', async () => {
    const user = userEvent.setup();
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    classroomHarness.createStudent.mockResolvedValue({
      oneTimePin: '1234',
      student: activeStudent,
      studentHandle: 'alex_student',
    });
    render(<ClassroomWorkspace demoMode teacherId="teacher-1" />);

    const handleCopy = await screen.findByRole('button', {
      name: 'Copy student handle alex_student',
    });
    expect(handleCopy).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy student pin 1234' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy class code DEMO-01' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rotate class code' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reset PIN/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Demo Alex Student's experience" })).toHaveAttribute(
      'href',
      '/teacher/preview?classroomId=classroom-1&studentId=student-1',
    );
    expect(screen.getByText(/Alex benefits from a focused screen/)).toBeInTheDocument();
    await user.click(handleCopy);
    expect(clipboardSpy).toHaveBeenCalledWith('alex_student');
    expect(handleCopy).toHaveTextContent('Copied');

    await user.type(screen.getByLabelText('Display name'), 'Jamie Learner');
    await user.click(screen.getByRole('button', { name: 'Create student' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Click the handle or PIN in the roster to copy it',
    );
  });

  it('links every roster student to the protected planning workspace', async () => {
    render(<ClassroomWorkspace teacherId="teacher-1" />);

    expect(
      await screen.findByRole('link', { name: 'Plan supports for Alex Student' }),
    ).toHaveAttribute('href', '/teacher/planning?classroomId=classroom-1&studentId=student-1');
  });

  it('confirms rotation, PIN reset, disable, and archive actions', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    classroomHarness.rotateClassCode.mockResolvedValue('WXYZ-12');
    classroomHarness.resetStudentPin.mockResolvedValue({
      oneTimePin: '654321',
      student: { ...activeStudent, authVersion: 2 },
    });
    classroomHarness.disableStudent.mockResolvedValue({
      ...activeStudent,
      authVersion: 2,
      status: 'disabled',
    });
    classroomHarness.archiveClassroom.mockResolvedValue({
      ...activeClassroom,
      status: 'archived',
    });
    render(<ClassroomWorkspace teacherId="teacher-1" />);
    await screen.findByRole('heading', { name: 'Algebra Lab' });

    await user.click(screen.getByRole('button', { name: 'Rotate class code' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('WXYZ-12');
    await user.click(screen.getByRole('button', { name: 'I saved these details' }));

    await user.click(screen.getByRole('button', { name: 'Reset PIN' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('654321');
    await user.click(screen.getByRole('button', { name: 'I saved these details' }));

    await user.click(screen.getByRole('button', { name: 'Disable access' }));
    await waitFor(() =>
      expect(classroomHarness.disableStudent).toHaveBeenCalledWith('classroom-1', 'student-1'),
    );

    await user.click(screen.getByRole('button', { name: 'Archive classroom' }));
    await waitFor(() =>
      expect(classroomHarness.archiveClassroom).toHaveBeenCalledWith('classroom-1'),
    );

    expect(classroomHarness.rotateClassCode).toHaveBeenCalledWith('classroom-1');
    expect(classroomHarness.resetStudentPin).toHaveBeenCalledWith('classroom-1', 'student-1');
    expect(confirmSpy).toHaveBeenCalledTimes(4);
  });

  it('does not run a destructive action when confirmation is declined', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ClassroomWorkspace teacherId="teacher-1" />);
    await screen.findByRole('heading', { name: 'Algebra Lab' });

    await user.click(screen.getByRole('button', { name: 'Archive classroom' }));

    expect(classroomHarness.archiveClassroom).not.toHaveBeenCalled();
  });
});
