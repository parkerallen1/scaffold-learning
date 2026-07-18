import { describe, expect, it } from 'vitest';

import {
  assignmentDraftSchema,
  materializeAssignmentDraft,
  type AssignmentDraft,
} from './assignments.js';
import { syntheticDomainFixtures } from './fixtures.js';

const ids = syntheticDomainFixtures;

const draft: AssignmentDraft = assignmentDraftSchema.parse({
  title: 'Decimal check-in',
  questions: [
    {
      id: 'question_draft_01',
      questionType: 'numeric',
      prompt: 'How much is 1.25 + 2.75?',
      approvedHints: ['Combine the hundredths first.'],
      expectedValue: 4,
      tolerance: 0,
      acceptedUnits: [],
    },
    {
      id: 'question_draft_02',
      questionType: 'multipleChoice',
      prompt: 'Which expression equals 12?',
      approvedHints: [],
      choices: [
        { id: 'choice_draft_a', label: '7 + 5' },
        { id: 'choice_draft_b', label: '7 + 4' },
      ],
      correctChoiceId: 'choice_draft_a',
    },
    {
      id: 'question_draft_03',
      questionType: 'shortText',
      prompt: 'Explain whether subtraction is commutative.',
      approvedHints: ['Think about whether order changes the difference.'],
      acceptedAnswers: ['No, subtraction is not commutative.'],
      normalization: 'caseAndWhitespace',
      maxLength: 250,
    },
  ],
});

describe('teacher assignment drafts', () => {
  it('materializes public content and a physically separate protected answer key', () => {
    const result = materializeAssignmentDraft({
      draft,
      assignmentId: ids.assignment.id,
      classroomId: ids.classroom.id,
      revision: 1,
      createdBy: ids.classroom.teacherId,
      createdAt: ids.assignment.createdAt,
      publish: true,
    });

    expect(result.assignment).toMatchObject({ status: 'published', questionCount: 3 });
    expect(result.publicQuestions).toHaveLength(3);
    expect(result.answerKey.questionKeys).toHaveLength(3);
    expect(JSON.stringify(result.publicQuestions)).not.toMatch(
      /expectedValue|correctChoiceId|acceptedAnswers|normalization/,
    );
    expect(result.answerKey.questionKeys[1]).toMatchObject({
      questionType: 'multipleChoice',
      correctChoiceId: 'choice_draft_a',
    });
  });

  it('keeps unpublished work in draft status with no published timestamp', () => {
    const result = materializeAssignmentDraft({
      draft,
      assignmentId: ids.assignment.id,
      classroomId: ids.classroom.id,
      revision: 2,
      createdBy: ids.classroom.teacherId,
      createdAt: ids.assignment.createdAt,
      publish: false,
    });

    expect(result.assignment.status).toBe('draft');
    expect(result.assignment.publishedAt).toBeNull();
  });

  it('rejects a correct choice that is not in the public choices', () => {
    expect(() =>
      assignmentDraftSchema.parse({
        title: 'Invalid draft',
        questions: [
          {
            id: 'question_draft_04',
            questionType: 'multipleChoice',
            prompt: 'Choose one.',
            choices: [
              { id: 'choice_draft_a', label: 'A' },
              { id: 'choice_draft_b', label: 'B' },
            ],
            correctChoiceId: 'choice_missing_01',
          },
        ],
      }),
    ).toThrow(/correct choice/i);
  });

  it('rejects duplicate question IDs before persistence', () => {
    expect(() =>
      assignmentDraftSchema.parse({
        title: 'Duplicate draft',
        questions: [draft.questions[0], draft.questions[0]],
      }),
    ).toThrow(/unique/i);
  });
});
