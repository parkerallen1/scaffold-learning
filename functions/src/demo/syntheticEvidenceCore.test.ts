import { describe, expect, it } from 'vitest';

import {
  assignmentTargetSchema,
  epochMillisSchema,
  publicQuestionSchema,
  syntheticDomainFixtures,
} from '@quiz-master/domain';

import {
  assertSyntheticEvidenceEnvironment,
  assertSyntheticEvidenceWriteAvailable,
  buildSyntheticEvidencePacket,
  syntheticEvidenceSummary,
  SyntheticEvidenceError,
} from './syntheticEvidenceCore.js';

const target = assignmentTargetSchema.parse(syntheticDomainFixtures.assignmentTarget);
const questions = Array.from({ length: 3 }, (_, index) =>
  publicQuestionSchema.parse({
    ...syntheticDomainFixtures.publicQuestion,
    id: `question_seed_${String(index).padStart(2, '0')}`,
    order: index,
  }),
);
const seededAt = epochMillisSchema.parse(1_760_000_000_000);

const buildPacket = () =>
  buildSyntheticEvidencePacket({
    target,
    questions,
    supportKey: 'readingChunks',
    seededAt,
  });

describe('synthetic evidence environment guard', () => {
  it('requires both the Functions emulator and a demo project', () => {
    expect(() =>
      assertSyntheticEvidenceEnvironment({
        functionsEmulator: 'true',
        projectId: 'demo-quiz-master',
      }),
    ).not.toThrow();
    expect(() =>
      assertSyntheticEvidenceEnvironment({ projectId: 'demo-quiz-master' }),
    ).toThrowError(
      expect.objectContaining<Partial<SyntheticEvidenceError>>({ reason: 'emulator-required' }),
    );
    expect(() =>
      assertSyntheticEvidenceEnvironment({
        functionsEmulator: 'true',
        projectId: 'production-school',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SyntheticEvidenceError>>({
        reason: 'demo-project-required',
      }),
    );
  });
});

describe('deterministic synthetic evidence', () => {
  it('creates stable IDs and exactly the default audit response threshold', () => {
    const first = buildPacket();
    const second = buildPacket();
    const summary = syntheticEvidenceSummary(first);

    expect(first).toEqual(second);
    expect(first.manifest.id).toMatch(/^synthetic_demo_seed_/);
    expect(
      first.sessions.every((session) => session.id.startsWith('synthetic_demo_session_')),
    ).toBe(true);
    expect(
      first.attempts.every((attempt) => attempt.idempotencyKey.startsWith('synthetic_demo_')),
    ).toBe(true);
    expect(summary).toMatchObject({
      sessionCount: 4,
      scorableResponseCount: 10,
      evidenceSufficient: true,
    });
    expect(first.attempts).toHaveLength(10);
    expect(first.supportEvents).toHaveLength(2);
  });

  it('adapts the number of sessions when an assignment has fewer questions', () => {
    const packet = buildSyntheticEvidencePacket({
      target,
      questions: [questions[0]!],
      supportKey: 'readingChunks',
      seededAt,
    });

    expect(packet.sessions).toHaveLength(10);
    expect(syntheticEvidenceSummary(packet)).toMatchObject({
      sessionCount: 10,
      scorableResponseCount: 10,
      evidenceSufficient: true,
    });
  });
});

describe('synthetic record collision safety', () => {
  it('treats only a complete exact manifest-backed record set as idempotent', () => {
    const packet = buildPacket();
    const recordsByPath = new Map(packet.records.map((record) => [record.path, record.data]));

    expect(
      assertSyntheticEvidenceWriteAvailable(packet, {
        manifest: packet.manifest,
        recordsByPath,
      }),
    ).toEqual({ alreadySeeded: true });

    const partial = new Map(recordsByPath);
    partial.delete(packet.records[0]!.path);
    expect(() =>
      assertSyntheticEvidenceWriteAvailable(packet, {
        manifest: packet.manifest,
        recordsByPath: partial,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SyntheticEvidenceError>>({ reason: 'collision' }),
    );
  });

  it('refuses to overwrite a deterministic path without its exact seed manifest', () => {
    const packet = buildPacket();
    const collision = packet.records[0]!;

    expect(() =>
      assertSyntheticEvidenceWriteAvailable(packet, {
        manifest: undefined,
        recordsByPath: new Map([[collision.path, { unrelated: 'real record' }]]),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SyntheticEvidenceError>>({ reason: 'collision' }),
    );
  });
});
