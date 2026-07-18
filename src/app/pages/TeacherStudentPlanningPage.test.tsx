import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeacherStudentPlanningPage } from './TeacherStudentPlanningPage';

const planningHarness = vi.hoisted(() => ({
  createSupportPlanVersion: vi.fn(),
  getStudentPlanningData: vi.fn(),
  recommendStudentSupports: vi.fn(),
  revertSupportPlanVersion: vi.fn(),
  saveStudentProfile: vi.fn(),
}));

vi.mock('@/features/planning/planningService', () => planningHarness);

vi.mock('@/features/onboarding/OnboardingInterview', () => ({
  OnboardingInterview: ({
    onComplete,
    studentName,
  }: {
    onComplete: (draft: unknown) => void;
    studentName: string;
  }) => (
    <section aria-label="Observation interview">
      <h1>Interview for {studentName}</h1>
      <button
        type="button"
        onClick={() =>
          onComplete({
            observations: {
              adultPrompting: 'unknown',
              barriers: [],
              helpfulStrategies: [],
              neverDo: [],
              responsePreferences: [],
              timerResponse: 'unknown',
            },
          })
        }
      >
        Complete observations
      </button>
    </section>
  ),
}));

vi.mock('@/features/support-plans/SupportPlanReview', () => ({
  SupportPlanReview: ({
    onComplete,
    recommendationError,
    recommendations,
  }: {
    onComplete: (supports: unknown[]) => void;
    recommendationError?: string;
    recommendations: unknown[];
  }) => (
    <main>
      <h1>Plan review</h1>
      <p>{recommendationError ?? `${recommendations.length} suggestions ready`}</p>
      <button
        type="button"
        onClick={() =>
          onComplete([{ enabled: true, hideNonessentialChrome: true, supportKey: 'focusView' }])
        }
      >
        Save reviewed supports
      </button>
    </main>
  ),
}));

const student = {
  authVersion: 1,
  classroomId: 'classroom-1',
  createdAt: 1,
  displayName: 'Alex Student',
  id: 'student-1',
  status: 'active' as const,
  updatedAt: 1,
};
const emptyPlanningData = {
  activePlan: null,
  historyTruncated: false,
  planHistory: [],
  profile: null,
  student,
};
const search = '?classroomId=classroom-1&studentId=student-1';

describe('TeacherStudentPlanningPage', () => {
  beforeEach(() => {
    planningHarness.getStudentPlanningData.mockReset().mockResolvedValue(emptyPlanningData);
    planningHarness.saveStudentProfile.mockReset().mockResolvedValue({
      classroomId: 'classroom-1',
      createdAt: 1,
      createdBy: 'teacher-1',
      id: 'student-1',
      observations: {
        adultPrompting: 'unknown',
        barriers: [],
        helpfulStrategies: [],
        neverDo: [],
        responsePreferences: [],
        timerResponse: 'unknown',
      },
      studentId: 'student-1',
      updatedAt: 2,
    });
    planningHarness.recommendStudentSupports.mockReset().mockResolvedValue({
      promptVersion: 'v1',
      provider: 'fake',
      recommendations: [],
    });
    planningHarness.createSupportPlanVersion.mockReset().mockResolvedValue({ version: 1 });
    planningHarness.revertSupportPlanVersion.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('runs the interview, saves observations, requests suggestions, and confirms plan creation', async () => {
    const user = userEvent.setup();
    render(<TeacherStudentPlanningPage search={search} />);

    expect(
      await screen.findByRole('heading', { name: 'Support plan for Alex Student' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start observation interview' }));
    await user.click(screen.getByRole('button', { name: 'Complete observations' }));

    expect(await screen.findByRole('heading', { name: 'Plan review' })).toBeInTheDocument();
    expect(planningHarness.saveStudentProfile).toHaveBeenCalledWith(
      expect.objectContaining({ classroomId: 'classroom-1', studentId: 'student-1' }),
    );
    expect(planningHarness.recommendStudentSupports).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      studentId: 'student-1',
    });

    await user.click(screen.getByRole('button', { name: 'Save reviewed supports' }));
    await waitFor(() => expect(planningHarness.createSupportPlanVersion).toHaveBeenCalledOnce());
    expect(window.confirm).toHaveBeenCalledWith(
      'Create a new plan version with 1 approved support?',
    );
    expect(await screen.findByRole('status')).toHaveTextContent('version 1 is now active');
  });

  it('falls back to the manual catalog when recommendations are unavailable', async () => {
    const user = userEvent.setup();
    planningHarness.recommendStudentSupports.mockRejectedValueOnce(new Error('provider details'));
    render(<TeacherStudentPlanningPage search={search} />);

    await screen.findByRole('heading', { name: 'Support plan for Alex Student' });
    await user.click(screen.getByRole('button', { name: 'Start observation interview' }));
    await user.click(screen.getByRole('button', { name: 'Complete observations' }));

    expect(await screen.findByText(/build the plan manually/i)).toBeInTheDocument();
    expect(screen.queryByText('provider details')).not.toBeInTheDocument();
  });

  it('requires confirmation before creating a revert version', async () => {
    const user = userEvent.setup();
    const versionOne = {
      approvedAt: 10,
      approvedBy: 'teacher-1',
      classroomId: 'classroom-1',
      id: 'plan-0001',
      source: 'manual',
      studentId: 'student-1',
      supersedesId: null,
      supports: [],
      version: 1,
    };
    const versionTwo = {
      ...versionOne,
      id: 'plan-0002',
      supersedesId: 'plan-0001',
      version: 2,
    };
    planningHarness.getStudentPlanningData.mockResolvedValue({
      ...emptyPlanningData,
      activePlan: versionTwo,
      planHistory: [versionTwo, versionOne],
    });
    planningHarness.revertSupportPlanVersion.mockResolvedValue({ version: 3 });
    render(<TeacherStudentPlanningPage search={search} />);

    await user.click(await screen.findByRole('button', { name: 'Use version 1 settings' }));
    await waitFor(() =>
      expect(planningHarness.revertSupportPlanVersion).toHaveBeenCalledWith({
        classroomId: 'classroom-1',
        priorPlanId: 'plan-0001',
        studentId: 'student-1',
      }),
    );
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('creates a new version'));
  });

  it('rejects an invalid planning link with a safe recovery path', () => {
    render(<TeacherStudentPlanningPage search="?classroomId=classroom-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/return to the roster/i);
    expect(screen.getByRole('link', { name: 'Return to teacher workspace' })).toHaveAttribute(
      'href',
      '/teacher',
    );
    expect(planningHarness.getStudentPlanningData).not.toHaveBeenCalled();
  });
});
