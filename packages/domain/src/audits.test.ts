import { describe, expect, it } from 'vitest';

import { auditResultSchema, checkAuditSafety } from './audits.js';
import { syntheticDomainFixtures } from './fixtures.js';

const safeResult = syntheticDomainFixtures.auditResult;
const safeRecommendation = safeResult.recommendations[0]!;
const citedEventIds = new Set([
  syntheticDomainFixtures.attemptEvent.id,
  syntheticDomainFixtures.supportEvent.id,
]);

describe('checkAuditSafety', () => {
  it('accepts a conservative result that cites only supplied canonical events', () => {
    expect(checkAuditSafety(safeResult, citedEventIds)).toEqual({ ok: true, issues: [] });
  });

  it('rejects citations that are not present in the evidence packet', () => {
    const result = auditResultSchema.parse({
      ...safeResult,
      recommendations: [
        {
          ...safeRecommendation,
          evidence: [
            {
              ...safeRecommendation.evidence[0]!,
              sourceEventIds: ['event_invented_01'],
            },
          ],
        },
      ],
    });

    expect(checkAuditSafety(result, citedEventIds).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unknownEventCitation' })]),
    );
  });

  it('does not permit support changes when the threshold says evidence is insufficient', () => {
    const result = auditResultSchema.parse({ ...safeResult, evidenceSufficient: false });

    expect(checkAuditSafety(result, citedEventIds).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'insufficientEvidenceChange' })]),
    );
  });

  it('converts low confidence into observation rather than a plan change', () => {
    const result = auditResultSchema.parse({
      ...safeResult,
      recommendations: [{ ...safeRecommendation, action: 'adjust', confidence: 'low' }],
    });

    expect(checkAuditSafety(result, citedEventIds).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'lowConfidenceChange' })]),
    );
  });

  it('rejects diagnostic, causal, and peer-comparison claims', () => {
    const result = auditResultSchema.parse({
      ...safeResult,
      summary: 'This proves that a disorder caused the student response.',
    });

    expect(checkAuditSafety(result, citedEventIds).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'diagnosticOrCausalClaim' })]),
    );
  });
});
