import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  syntheticAssignment,
  syntheticAttemptEvent,
  syntheticPublicQuestion,
  syntheticSession,
  syntheticSupportEvent,
} from '@/lib/domain';

import { SessionEvidenceDetail } from './SessionEvidenceDetail';

describe('SessionEvidenceDetail', () => {
  it('presents response, timing, outcome, and support use without an answer key', () => {
    render(
      <SessionEvidenceDetail
        evidence={{
          assignment: syntheticAssignment,
          attempts: [syntheticAttemptEvent],
          eventsTruncated: false,
          questions: [syntheticPublicQuestion],
          session: syntheticSession,
          supportEvents: [syntheticSupportEvent],
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: syntheticAssignment.title })).toBeInTheDocument();
    expect(screen.getByText('7 + 5')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('42 seconds')).toBeInTheDocument();
    expect(screen.getAllByText(/Reading chunks: activated/)).toHaveLength(1);
    expect(screen.queryByText(/answer key/i)).not.toBeInTheDocument();
  });

  it('uses explicit empty states for questions without recorded evidence', () => {
    render(
      <SessionEvidenceDetail
        evidence={{
          assignment: syntheticAssignment,
          attempts: [],
          eventsTruncated: false,
          questions: [syntheticPublicQuestion],
          session: syntheticSession,
          supportEvents: [],
        }}
      />,
    );

    expect(screen.getByText('No response was recorded.')).toBeInTheDocument();
    expect(screen.getByText('No support-use event was recorded.')).toBeInTheDocument();
  });
});
