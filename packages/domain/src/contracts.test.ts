import { describe, expect, it } from 'vitest';

import { publicQuestionSchema } from './assignments.js';
import { syntheticDomainFixtures } from './fixtures.js';
import { studentSafeIdentitySchema } from './identity.js';
import { assignmentTargetIdFor, assignmentTargetIdSchema } from './ids.js';
import {
  CORE_SUPPORT_KEYS,
  SUPPORT_CATALOG,
  SUPPORT_KEYS,
  createNextSupportPlanVersion,
  supportRecommendationSchema,
  supportSettingsSchema,
} from './supports.js';

describe('synthetic domain fixtures', () => {
  it('provides a deterministic, schema-valid vertical slice', () => {
    expect(syntheticDomainFixtures.studentSafeIdentity.displayName).toBe('Jordan Demo');
    expect(syntheticDomainFixtures.assignment.questionCount).toBe(1);
    expect(syntheticDomainFixtures.auditResult.recommendations).toHaveLength(1);
  });

  it('keeps immutable snapshots frozen after parsing', () => {
    expect(Object.isFrozen(syntheticDomainFixtures.supportPlan)).toBe(true);
    expect(Object.isFrozen(syntheticDomainFixtures.supportPlan.supports)).toBe(true);
    expect(Object.isFrozen(syntheticDomainFixtures.supportPlan.supports[0])).toBe(true);
    expect(Object.isFrozen(syntheticDomainFixtures.assignmentTarget)).toBe(true);
    expect(Object.isFrozen(syntheticDomainFixtures.attemptEvent)).toBe(true);
  });
});

describe('support catalog boundaries', () => {
  it('distinguishes the Build Week core from the full fixed catalog', () => {
    expect(CORE_SUPPORT_KEYS).toEqual(['readAloud', 'readingChunks', 'focusView', 'hintLadder']);
    expect(SUPPORT_KEYS).toHaveLength(8);
  });

  it('starts AI recommendations in proposed state', () => {
    const recommendation = supportRecommendationSchema.parse({
      supportKey: 'focusView',
      proposedSettings: {
        supportKey: 'focusView',
        enabled: true,
        hideNonessentialChrome: true,
      },
      rationale: 'The student is distracted by crowded pages.',
      basedOn: ['Crowded pages delay task initiation.'],
      confidence: 'medium',
    });

    expect(recommendation.status).toBe('proposed');
  });

  it('provides valid defaults, cautions, and evidence signals for every support', () => {
    for (const supportKey of SUPPORT_KEYS) {
      const catalogEntry = SUPPORT_CATALOG[supportKey];

      expect(supportSettingsSchema.parse(catalogEntry.defaultSettings).supportKey).toBe(supportKey);
      expect(catalogEntry.caution.length).toBeGreaterThan(0);
      expect(catalogEntry.evidenceSignals.length).toBeGreaterThan(0);
    }
  });

  it('creates an immutable, attributable next version without mutating the prior plan', () => {
    const previous = syntheticDomainFixtures.supportPlan;
    const next = createNextSupportPlanVersion({
      id: 'plan_demo_02' as typeof previous.id,
      previous,
      supports: [SUPPORT_CATALOG.focusView.defaultSettings],
      source: 'revert',
      approvedBy: previous.approvedBy,
      approvedAt: previous.approvedAt,
    });

    expect(next.version).toBe(previous.version + 1);
    expect(next.supersedesId).toBe(previous.id);
    expect(next.supports).toEqual([SUPPORT_CATALOG.focusView.defaultSettings]);
    expect(previous.supports).toHaveLength(2);
    expect(Object.isFrozen(next)).toBe(true);
  });
});

describe('sensitive-field isolation', () => {
  it('rejects teacher notes and rationales from student identity records', () => {
    expect(() =>
      studentSafeIdentitySchema.parse({
        ...syntheticDomainFixtures.studentSafeIdentity,
        teacherSummary: 'This must remain teacher-only.',
      }),
    ).toThrow();
  });

  it('rejects answer keys and teacher rationale from public questions', () => {
    expect(() =>
      publicQuestionSchema.parse({
        ...syntheticDomainFixtures.publicQuestion,
        correctChoiceId: 'choice_demo_a',
        teacherRationale: 'This must remain server-only.',
      }),
    ).toThrow();
  });

  it('rejects recommendation rationale from student-facing support settings', () => {
    expect(() =>
      supportSettingsSchema.parse({
        supportKey: 'focusView',
        enabled: true,
        hideNonessentialChrome: true,
        rationale: 'This belongs in a teacher-only recommendation.',
      }),
    ).toThrow();
  });

  it('serializes student-readable fixtures without sensitive field names', () => {
    const studentReadable = JSON.stringify({
      identity: syntheticDomainFixtures.studentSafeIdentity,
      plan: syntheticDomainFixtures.supportPlan,
      assignment: syntheticDomainFixtures.assignment,
      question: syntheticDomainFixtures.publicQuestion,
      target: syntheticDomainFixtures.assignmentTarget,
      session: syntheticDomainFixtures.session,
    });

    expect(studentReadable).not.toMatch(
      /teacherSummary|teacherNotes|rationale|answerKey|correctChoiceId|rubric/i,
    );
  });
});

describe('deterministic storage identifiers', () => {
  it('uses a separator that cannot appear inside assignment or student IDs', () => {
    const { assignment, studentSafeIdentity } = syntheticDomainFixtures;
    const targetId = assignmentTargetIdFor(assignment.id, studentSafeIdentity.id);

    expect(targetId).toBe(`${assignment.id}.${studentSafeIdentity.id}`);
    expect(assignmentTargetIdSchema.parse(targetId)).toBe(targetId);
    expect(() =>
      assignmentTargetIdSchema.parse(`${assignment.id}_${studentSafeIdentity.id}`),
    ).toThrow();
  });
});
