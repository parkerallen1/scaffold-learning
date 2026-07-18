import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditReviewPanel } from './AuditReviewPanel';

const auditHarness = vi.hoisted(() => ({
  auditStudentEvidence: vi.fn(),
  reviewStudentAudit: vi.fn(),
}));

vi.mock('@/features/audits/auditService', () => ({
  auditStudentEvidence: auditHarness.auditStudentEvidence,
  reviewStudentAudit: auditHarness.reviewStudentAudit,
  parseEditedAuditSettings: (settings: unknown) => settings,
}));

const supportCounts = {
  readAloud: 0,
  readingChunks: 1,
  focusView: 0,
  hintLadder: 0,
  flexibleResponse: 0,
  calmPacing: 0,
  breakPrompt: 0,
};
const evidenceSummary = {
  sessionCount: 2,
  completedSessionCount: 2,
  scorableResponseCount: 10,
  correctResponseCount: 8,
  firstAttemptCorrectCount: 6,
  totalScorableAttempts: 12,
  averageAttemptsToSuccess: 1.25,
  averageElapsedMs: 15_000,
  activatedSupportCounts: supportCounts,
  recoveriesAfterSupport: supportCounts,
  evidenceSufficient: true,
  threshold: { minimumSessions: 2, minimumScorableResponses: 10 },
};
const exactObservation =
  'Attempt event_attempt_01 was recorded as correct on attempt 1, with 15000 ms elapsed.';
const recommendation = {
  action: 'add' as const,
  supportKey: 'focusView' as const,
  proposedSettings: {
    supportKey: 'focusView' as const,
    enabled: true,
    hideNonessentialChrome: true,
  },
  evidence: [
    {
      metric: 'attemptOutcome',
      observation: exactObservation,
      sourceEventIds: ['event_attempt_01'],
    },
  ],
  alternativeExplanations: ['The item format may have affected the observed pattern.'],
  confidence: 'medium' as const,
  reviewAfterSessions: 2,
};
const completedAudit = {
  auditId: 'audit_trace_01',
  status: 'completed' as const,
  evidenceSummary,
  result: {
    id: 'audit_result_01',
    traceId: 'audit_trace_01',
    studentId: 'student-1',
    evidenceSufficient: true,
    summary: 'One teacher-review suggestion is available.',
    recommendations: [recommendation],
    reviewStatus: 'pending' as const,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: 100,
  },
};

const renderPanel = (onReviewed = vi.fn()) => {
  render(
    <AuditReviewPanel
      classroomId="classroom-1"
      studentId="student-1"
      studentName="Alex"
      disabled={false}
      onReviewed={onReviewed}
    />,
  );
  return onReviewed;
};

describe('AuditReviewPanel', () => {
  beforeEach(() => {
    auditHarness.auditStudentEvidence.mockReset().mockResolvedValue(completedAudit);
    auditHarness.reviewStudentAudit.mockReset().mockResolvedValue({
      decision: { planChanged: true },
      supportPlan: { version: 2 },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows deterministic evidence, requires a decision, and confirms an edited approval', async () => {
    const user = userEvent.setup();
    const onReviewed = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Review Alex’s evidence' }));

    expect(await screen.findByText(exactObservation)).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByText('10 / 10')).toBeInTheDocument();
    expect(screen.getByText(/item format may have affected/i)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Submit evidence review' });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Approve' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hide nonessential controls' }));
    await user.type(screen.getByLabelText(/Teacher note \(optional\)/), 'Try for two sessions.');
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('new plan version'));
    await waitFor(() =>
      expect(auditHarness.reviewStudentAudit).toHaveBeenCalledWith({
        classroomId: 'classroom-1',
        studentId: 'student-1',
        auditId: 'audit_trace_01',
        decisions: [
          {
            recommendationIndex: 0,
            decision: 'approve',
            editedSettings: {
              supportKey: 'focusView',
              enabled: true,
              hideNonessentialChrome: false,
            },
          },
        ],
        teacherNote: 'Try for two sessions.',
      }),
    );
    expect(onReviewed).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('version 2 is now active');
  });

  it('records an insufficient-evidence review with no decisions or plan change', async () => {
    const user = userEvent.setup();
    auditHarness.auditStudentEvidence.mockResolvedValue({
      ...completedAudit,
      status: 'insufficientEvidence',
      evidenceSummary: {
        ...evidenceSummary,
        sessionCount: 1,
        scorableResponseCount: 4,
        evidenceSufficient: false,
      },
      result: {
        ...completedAudit.result,
        evidenceSufficient: false,
        summary: 'More evidence is needed.',
        recommendations: [],
      },
    });
    auditHarness.reviewStudentAudit.mockResolvedValue({
      decision: { planChanged: false },
      supportPlan: null,
    });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Review Alex’s evidence' }));
    expect(
      await screen.findByText(/minimum evidence threshold has not been met/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Record review' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Record this evidence review with no support-plan change?',
    );
    await waitFor(() =>
      expect(auditHarness.reviewStudentAudit).toHaveBeenCalledWith(
        expect.objectContaining({ decisions: [] }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('did not change');
  });

  it('shows only a generic error when the audit request fails', async () => {
    const user = userEvent.setup();
    auditHarness.auditStudentEvidence.mockRejectedValue(new Error('private provider detail'));
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Review Alex’s evidence' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to run the evidence audit. Please try again.',
    );
    expect(screen.queryByText(/private provider detail/i)).not.toBeInTheDocument();
  });
});
