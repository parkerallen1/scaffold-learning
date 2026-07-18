import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assignmentTargetSchema,
  publicAssignmentSchema,
  publicQuestionSchema,
  sessionStateSchema,
  supportPlanVersionSchema,
} from '@/lib/domain';

import { StudentWorkspace } from './StudentWorkspace';

const harness = vi.hoisted(() => ({
  advance: vi.fn(),
  attempts: vi.fn(),
  list: vi.fn(),
  questions: vi.fn(),
  recordSupport: vi.fn(),
  speak: vi.fn(),
  start: vi.fn(),
  submit: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('./studentWorkService', () => ({
  advanceStudentSession: harness.advance,
  createIdempotencyKey: vi.fn((prefix: string) => `${prefix}_component_key_01`),
  listStudentAssignmentQuestions: harness.questions,
  listStudentAssignments: harness.list,
  listStudentAttempts: harness.attempts,
  recordStudentSupportEvent: harness.recordSupport,
  startOrResumeStudentSession: harness.start,
  submitStudentAttempt: harness.submit,
  transitionStudentSession: harness.transition,
}));

vi.mock('@/services/speech', () => ({ speak: harness.speak }));
vi.mock('@/features/quiz/components/ScratchCanvas', () => ({
  ScratchCanvas: () => <div aria-label="Scratch work area" />,
}));

const classroomId = 'classroom_demo_01';
const studentId = 'student_demo_01';
const teacherId = 'teacher_demo_01';
const assignmentId = 'assignment_demo_01';
const firstQuestionId = 'question_demo_01';
const secondQuestionId = 'question_demo_02';
const target = assignmentTargetSchema.parse({
  assignedAt: 2_000,
  assignedBy: teacherId,
  assignmentId,
  assignmentRevision: 1,
  classroomId,
  id: `${assignmentId}.${studentId}`,
  studentId,
  supportPlanId: 'support_plan_01',
  supportPlanVersion: 1,
});
const assignment = publicAssignmentSchema.parse({
  classroomId,
  createdAt: 1_000,
  createdBy: teacherId,
  id: assignmentId,
  publishedAt: 1_500,
  questionCount: 2,
  revision: 1,
  source: 'teacherAuthored',
  status: 'published',
  title: 'Two calm problems',
});
const firstQuestion = publicQuestionSchema.parse({
  approvedHints: ['Use equal groups.'],
  assignmentId,
  id: firstQuestionId,
  order: 0,
  prompt: 'First read the problem. Then divide twelve by three.',
  questionType: 'numeric',
});
const secondQuestion = publicQuestionSchema.parse({
  approvedHints: [],
  assignmentId,
  choices: [
    { id: 'choice_demo_01', label: 'Four' },
    { id: 'choice_demo_02', label: 'Five' },
  ],
  id: secondQuestionId,
  order: 1,
  prompt: 'Choose four.',
  questionType: 'multipleChoice',
});
const session = sessionStateSchema.parse({
  assignmentId,
  assignmentRevision: 1,
  classroomId,
  completedAt: null,
  currentQuestionId: firstQuestionId,
  id: 'session_demo_01',
  startedAt: 3_000,
  status: 'inProgress',
  studentId,
  supportPlanId: target.supportPlanId,
  supportPlanVersion: 1,
  targetId: target.id,
  updatedAt: 3_000,
});
const supportPlan = supportPlanVersionSchema.parse({
  approvedAt: 1_200,
  approvedBy: teacherId,
  classroomId,
  id: target.supportPlanId,
  source: 'manual',
  studentId,
  supersedesId: null,
  supports: [
    { enabled: true, speed: 1, supportKey: 'readAloud' },
    { chunkMode: 'sentence', enabled: true, revealAllAllowed: true, supportKey: 'readingChunks' },
    { enabled: true, hideNonessentialChrome: true, supportKey: 'focusView' },
    { allowAnalogousExample: true, enabled: true, maxTier: 2, supportKey: 'hintLadder' },
  ],
  version: 1,
});

describe('StudentWorkspace', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const mock of Object.values(harness)) mock.mockReset();
    harness.list.mockResolvedValue([{ assignment, target }]);
    harness.questions.mockResolvedValue([firstQuestion, secondQuestion]);
    harness.start.mockResolvedValue({ resumed: false, session, supportPlan });
    harness.attempts.mockResolvedValue([]);
    harness.recordSupport.mockResolvedValue({});
    harness.speak.mockResolvedValue(undefined);
    harness.transition.mockImplementation(async (_sessionId: string, action: string) => ({
      ...session,
      status: action === 'complete' ? 'completed' : action === 'pause' ? 'paused' : 'inProgress',
    }));
  });

  it('renders approved supports, records an attempt, and permits review-later progression', async () => {
    const user = userEvent.setup();
    harness.submit.mockResolvedValue({
      duplicate: false,
      event: { outcome: 'incorrect' },
      session,
    });
    harness.advance.mockResolvedValue({ ...session, currentQuestionId: secondQuestionId });

    render(
      <StudentWorkspace
        classroomId={classroomId}
        isSigningOut={false}
        onSignOut={vi.fn()}
        studentId={studentId}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Open assignment' }));
    expect(await screen.findByText(firstQuestion.prompt)).toBeInTheDocument();
    expect(screen.getByLabelText('Scratch work area')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Read aloud' }));
    expect(harness.speak).toHaveBeenCalledWith(firstQuestion.prompt, 1);
    await user.click(screen.getByRole('button', { name: 'Show hint 1' }));
    expect(screen.getByText(/Hint 1: Use equal groups/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show one part at a time' }));
    expect(screen.getByRole('heading', { name: 'First read the problem.' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use focus view' }));
    expect(screen.queryByLabelText('Scratch work area')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Your answer'), '5');
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText(/not a match yet/)).toBeInTheDocument();
    expect(harness.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        activeSupports: expect.arrayContaining([
          'readAloud',
          'hintLadder',
          'readingChunks',
          'focusView',
        ]),
        submittedAnswer: { kind: 'numeric', value: 5 },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Show and review later' }));
    expect(await screen.findByText(secondQuestion.prompt)).toBeInTheDocument();
    expect(screen.getByLabelText('Four')).toBeInTheDocument();
  });

  it('keeps a typed answer and retry key locally when submission loses the network', async () => {
    const user = userEvent.setup();
    harness.submit.mockRejectedValue(new Error('offline'));
    render(
      <StudentWorkspace
        classroomId={classroomId}
        isSigningOut={false}
        onSignOut={vi.fn()}
        studentId={studentId}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Open assignment' }));
    await user.type(await screen.findByLabelText('Your answer'), '7');
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('still on this device');
    await waitFor(() => {
      const stored = Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.getItem(localStorage.key(index) ?? ''),
      ).join('');
      expect(stored).toContain('"value":"7"');
      expect(stored).toContain('attempt_component_key_01');
      expect(stored).not.toMatch(/pin|classCode|studentHandle/i);
    });
  });

  it('identifies an empty answer error on the critical student response control', async () => {
    const user = userEvent.setup();
    render(
      <StudentWorkspace
        classroomId={classroomId}
        isSigningOut={false}
        onSignOut={vi.fn()}
        studentId={studentId}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Open assignment' }));
    const answer = await screen.findByRole('textbox', { name: 'Your answer' });
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an answer');
    expect(answer).toHaveAttribute('aria-invalid', 'true');
    expect(answer).toHaveAccessibleDescription('Enter an answer before submitting.');
  });

  it('requires confirmation before turning in unfinished work', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <StudentWorkspace
        classroomId={classroomId}
        isSigningOut={false}
        onSignOut={vi.fn()}
        studentId={studentId}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Open assignment' }));
    await user.click(await screen.findByRole('button', { name: 'Finish assignment' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(harness.transition).not.toHaveBeenCalled();
  });
});
