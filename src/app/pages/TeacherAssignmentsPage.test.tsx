import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeacherAssignmentsPage } from './TeacherAssignmentsPage';

const assignmentHarness = vi.hoisted(() => ({
  assignPublishedAssignment: vi.fn(),
  createAssignmentDraft: vi.fn(),
  generateAssignmentDraft: vi.fn(),
  publishAssignment: vi.fn(),
  useAuth: vi.fn(),
  useClassroomStudents: vi.fn(),
  useOwnedClassrooms: vi.fn(),
}));

vi.mock('@/features/assignments/assignmentService', () => ({
  assignPublishedAssignment: assignmentHarness.assignPublishedAssignment,
  createAssignmentDraft: assignmentHarness.createAssignmentDraft,
  generateAssignmentDraft: assignmentHarness.generateAssignmentDraft,
  publishAssignment: assignmentHarness.publishAssignment,
}));

vi.mock('@/features/auth/authContext', () => ({ useAuth: assignmentHarness.useAuth }));

vi.mock('@/features/classrooms/useClassrooms', () => ({
  useClassroomStudents: assignmentHarness.useClassroomStudents,
  useOwnedClassrooms: assignmentHarness.useOwnedClassrooms,
}));

const activeClassroom = {
  createdAt: 1,
  id: 'classroom_demo_01',
  name: 'Algebra Lab',
  status: 'active' as const,
  teacherId: 'teacher_demo_01',
  updatedAt: 1,
};

const activeStudent = {
  authVersion: 1,
  classroomId: activeClassroom.id,
  createdAt: 1,
  displayName: 'Alex Student',
  id: 'student_demo_01',
  status: 'active' as const,
  updatedAt: 1,
};

const publicAssignment = {
  classroomId: activeClassroom.id,
  createdAt: 10,
  createdBy: activeClassroom.teacherId,
  id: 'assignment_demo_01',
  publishedAt: null,
  questionCount: 1,
  revision: 1,
  source: 'teacherAuthored' as const,
  status: 'draft' as const,
  title: 'Decimal check-in',
};

describe('TeacherAssignmentsPage', () => {
  beforeEach(() => {
    assignmentHarness.useAuth.mockReset().mockReturnValue({
      user: { uid: activeClassroom.teacherId },
    });
    assignmentHarness.useOwnedClassrooms.mockReset().mockReturnValue({
      data: [
        activeClassroom,
        { ...activeClassroom, id: 'classroom_old_01', name: 'Archived class', status: 'archived' },
      ],
      error: null,
      isLoading: false,
    });
    assignmentHarness.useClassroomStudents.mockReset().mockReturnValue({
      data: [
        activeStudent,
        { ...activeStudent, id: 'student_off_01', displayName: 'Sam Disabled', status: 'disabled' },
      ],
      error: null,
      isLoading: false,
    });
    assignmentHarness.createAssignmentDraft.mockReset().mockResolvedValue({
      assignment: publicAssignment,
      revision: {
        assignmentId: publicAssignment.id,
        classroomId: activeClassroom.id,
        createdAt: 10,
        createdBy: activeClassroom.teacherId,
        id: 'revision_demo_01',
        publishedAt: null,
        revision: 1,
        status: 'draft',
      },
    });
    assignmentHarness.publishAssignment.mockReset().mockResolvedValue({
      ...publicAssignment,
      publishedAt: 20,
      status: 'published',
    });
    assignmentHarness.assignPublishedAssignment.mockReset().mockResolvedValue({
      assignment: { ...publicAssignment, publishedAt: 20, status: 'published' },
      targets: [{ studentId: activeStudent.id }],
    });
  });

  it('selects only active recipients, confirms, then creates, publishes, and assigns in order', async () => {
    const user = userEvent.setup();
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(<TeacherAssignmentsPage />);

    expect(screen.getByRole('option', { name: 'Algebra Lab' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Archived class' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Active classroom'), activeClassroom.id);

    const activeStudentInput = screen.getByLabelText(/Alex Student/);
    const disabledStudentInput = screen.getByLabelText(/Sam Disabled/);
    expect(disabledStudentInput).toBeDisabled();
    await user.click(activeStudentInput);

    await user.type(screen.getByLabelText('Assignment title'), 'Decimal check-in');
    await user.type(screen.getByLabelText('Question'), 'What is 1.25 + 2.75?');
    await user.type(screen.getByLabelText('Correct number'), '4');
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    await user.click(screen.getByRole('button', { name: 'Publish assignment' }));
    expect(assignmentHarness.createAssignmentDraft).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Publish assignment' }));
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('cannot be edited in place'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Published “Decimal check-in” and assigned it to 1 student.',
    );

    expect(assignmentHarness.createAssignmentDraft).toHaveBeenCalledWith({
      classroomId: activeClassroom.id,
      draft: expect.objectContaining({
        questions: [expect.objectContaining({ expectedValue: 4 })],
        title: 'Decimal check-in',
      }),
    });
    expect(assignmentHarness.publishAssignment).toHaveBeenCalledWith({
      assignmentId: publicAssignment.id,
      classroomId: activeClassroom.id,
      revisionId: 'revision_demo_01',
    });
    expect(assignmentHarness.assignPublishedAssignment).toHaveBeenCalledWith({
      assignmentId: publicAssignment.id,
      classroomId: activeClassroom.id,
      studentIds: [activeStudent.id],
    });
    expect(assignmentHarness.createAssignmentDraft.mock.invocationCallOrder[0]).toBeLessThan(
      assignmentHarness.publishAssignment.mock.invocationCallOrder[0]!,
    );
    expect(assignmentHarness.publishAssignment.mock.invocationCallOrder[0]).toBeLessThan(
      assignmentHarness.assignPublishedAssignment.mock.invocationCallOrder[0]!,
    );
  });

  it('shows loading and recipient guidance without rendering the authoring form early', async () => {
    assignmentHarness.useOwnedClassrooms.mockReturnValue({
      data: [],
      error: null,
      isLoading: true,
    });
    const { rerender } = render(<TeacherAssignmentsPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading active classrooms…');
    expect(screen.queryByRole('heading', { name: 'Create an assignment' })).not.toBeInTheDocument();

    assignmentHarness.useOwnedClassrooms.mockReturnValue({
      data: [activeClassroom],
      error: null,
      isLoading: false,
    });
    rerender(<TeacherAssignmentsPage />);
    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText('Active classroom'), activeClassroom.id);
    expect(screen.getByRole('status')).toHaveTextContent(/Select at least one active student/);
  });

  it('shows only a generic workflow error', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    assignmentHarness.createAssignmentDraft.mockRejectedValueOnce(
      new Error('internal callable and answer-key details'),
    );
    render(<TeacherAssignmentsPage />);

    await user.selectOptions(screen.getByLabelText('Active classroom'), activeClassroom.id);
    await user.click(screen.getByLabelText(/Alex Student/));
    await user.type(screen.getByLabelText('Assignment title'), 'Decimal check-in');
    await user.type(screen.getByLabelText('Question'), 'What is 2 + 2?');
    await user.type(screen.getByLabelText('Correct number'), '4');
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    await user.click(screen.getByRole('button', { name: 'Publish assignment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to publish and assign this assignment. Please try again.',
    );
    expect(screen.queryByText(/answer-key details/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Active classroom')).not.toBeDisabled());
  });
});
