import { describe, expect, it } from 'vitest';

import { ONBOARDING_QUESTIONS, onboardingQuestionIdSchema } from './onboarding.js';

describe('ONBOARDING_QUESTIONS', () => {
  it('covers each structured observation once in a skippable sequence', () => {
    const ids = ONBOARDING_QUESTIONS.map((question) => question.id);

    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => onboardingQuestionIdSchema.safeParse(id).success)).toBe(true);
    expect(ONBOARDING_QUESTIONS.every((question) => question.optional)).toBe(true);
  });

  it('frames questions as observations rather than diagnosis', () => {
    const copy = ONBOARDING_QUESTIONS.map(
      (question) => `${question.prompt} ${question.helper}`,
    ).join(' ');

    expect(copy).toContain('not a diagnosis');
    expect(copy).not.toMatch(/diagnose|disorder|condition|impairment/i);
  });

  it('provides accessible labels for every selectable value', () => {
    for (const question of ONBOARDING_QUESTIONS) {
      expect(question.options.length).toBeGreaterThan(0);
      expect(question.options.every((option) => option.label.trim().length > 0)).toBe(true);
      expect(question.allowOther).toBe(true);
      expect(['singleSelect', 'multiSelect']).toContain(question.responseKind);
    }
  });
});
