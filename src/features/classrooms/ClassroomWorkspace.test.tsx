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
  id: 'student-1',
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

  it('creates a classroom and clears its display-once code after acknowledgement', async () => {
    const user = userEvent.setup();
    classroomHarness.createClassroom.mockResolvedValue({
      classroom: { ...activeClassroom, id: 'classroom-2', name: 'Geometry Lab' },
      classCode: 'ABCD-EF',
    });
    render(<ClassroomWorkspace teacherId="teacher-1" />);

    await user.type(screen.getByLabelText('New classroom name'), 'Geometry Lab');
    await user.click(screen.getByRole('button', { name: 'Create classroom' }));

    expect(classroomHarness.createClassroom).toHaveBeenCalledWith('Geometry Lab');
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('ABCD-EF');
    expect(screen.getByRole('button', { name: 'Copy class code' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'I saved these details' }));
    expect(screen.queryByText('ABCD-EF')).not.toBeInTheDocument();
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
