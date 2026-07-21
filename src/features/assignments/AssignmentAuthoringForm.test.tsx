import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { assignmentDraftSchema } from '@/lib/domain';

import { AssignmentAuthoringForm } from './AssignmentAuthoringForm';

const generatedDraft = assignmentDraftSchema.parse({
  title: 'Imported fractions',
  questions: [
    {
      id: 'question_ai_001',
      questionType: 'multipleChoice' as const,
      prompt: 'Which fraction equals one half?',
      approvedHints: ['Compare the numerator and denominator.'],
      choices: [
        { id: 'choice_001_01', label: '2/4' },
        { id: 'choice_001_02', label: '3/4' },
      ],
      correctChoiceId: 'choice_001_01',
    },
  ],
});

describe('AssignmentAuthoringForm', () => {
  it('validates and publishes a numeric teacher draft', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(<AssignmentAuthoringForm onPublish={onPublish} />);

    await user.type(screen.getByLabelText('Assignment title'), 'Decimal check-in');
    await user.type(screen.getByLabelText('Question'), 'What is 1.25 + 2.75?');
    await user.type(screen.getByLabelText('Correct number'), '4');
    await user.type(screen.getByLabelText(/Approved hints/), 'Combine the hundredths first.');
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByText('4', { selector: 'p' })).toHaveTextContent('Correct answer: 4');
    await user.click(screen.getByRole('button', { name: 'Publish assignment' }));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Decimal check-in',
        questions: [
          expect.objectContaining({
            questionType: 'numeric',
            expectedValue: 4,
            prompt: 'What is 1.25 + 2.75?',
          }),
        ],
      }),
    );
  });

  it('blocks an incomplete multiple-choice question', async () => {
    const user = userEvent.setup();
    render(<AssignmentAuthoringForm onPublish={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Response type'), 'multipleChoice');
    await user.type(screen.getByLabelText('Question'), 'Choose the equivalent expression.');
    await user.type(screen.getByLabelText(/Choices/), '7 + 5');
    await user.type(screen.getByLabelText('Correct choice number'), '2');
    await user.click(screen.getByRole('button', { name: 'Add question' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/at least 2|too small/i);
    expect(screen.getByText('Review (0)')).toBeInTheDocument();
  });

  it('shows every accepted short-text answer in the review card', async () => {
    const user = userEvent.setup();
    render(<AssignmentAuthoringForm onPublish={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Response type'), 'shortText');
    await user.type(screen.getByLabelText('Question'), 'Name a primary color.');
    await user.type(screen.getByLabelText(/Accepted answers/), 'red{enter}blue{enter}yellow');
    await user.click(screen.getByRole('button', { name: 'Add question' }));

    expect(screen.getByText('red, blue, yellow', { selector: 'p' })).toHaveTextContent(
      'Accepted answers: red, blue, yellow',
    );
  });

  it('allows removing a question before publication', async () => {
    const user = userEvent.setup();
    render(<AssignmentAuthoringForm onPublish={vi.fn()} />);

    await user.type(screen.getByLabelText('Question'), 'What is 6 × 8?');
    await user.type(screen.getByLabelText('Correct number'), '48');
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByText('Review (1)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove question 1' }));
    expect(screen.getByText('Review (0)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish assignment' })).toBeDisabled();
  });

  it('loads an AI draft and lets the teacher edit it before publication', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(<AssignmentAuthoringForm initialDraft={generatedDraft} onPublish={onPublish} />);

    expect(screen.getByLabelText('Assignment title')).toHaveValue('Imported fractions');
    expect(screen.getByText('Review (1)')).toBeInTheDocument();
    expect(screen.getByText('2/4', { selector: 'p' })).toHaveTextContent('Correct answer: 2/4');
    const editButton = screen.getByRole('button', { name: 'Edit question 1' });
    const reviewCard = editButton.closest('li');
    expect(reviewCard).not.toBeNull();
    await user.click(editButton);
    const inlineEditor = within(reviewCard!).getByRole('group', { name: 'Edit question 1' });
    expect(
      within(screen.getByRole('group', { name: 'Add a question' })).getByLabelText('Question'),
    ).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Publish assignment' })).toBeDisabled();
    const question = within(inlineEditor).getByLabelText('Question');
    await user.clear(question);
    await user.type(question, 'Which fraction is equivalent to one half?');
    await user.click(within(inlineEditor).getByRole('button', { name: 'Save question changes' }));
    await user.click(screen.getByRole('button', { name: 'Publish assignment' }));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: [
          expect.objectContaining({ prompt: 'Which fraction is equivalent to one half?' }),
        ],
      }),
    );
  });
});
