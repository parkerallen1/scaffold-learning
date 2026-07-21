import { SUPPORT_CATALOG, auditRecommendationSchema } from '@scaffold-learning/domain';

import type { AuditEvidencePacket, AuditProvider, AuditProviderDraft } from './auditContracts.js';

export const FAKE_AUDIT_PROMPT_VERSION = 'fake-audit-v1';
export const FAKE_AUDIT_MODEL = 'deterministic-audit-fixture';

export class FakeAuditProvider implements AuditProvider {
  readonly name = 'fake';
  readonly model = FAKE_AUDIT_MODEL;
  readonly promptVersion = FAKE_AUDIT_PROMPT_VERSION;

  async auditSupports(input: AuditEvidencePacket): Promise<AuditProviderDraft> {
    const supportFact = input.eventFacts.find((fact) => fact.metric === 'supportUse');
    const firstFact = supportFact ?? input.eventFacts[0];
    if (firstFact === undefined) return Object.freeze({ recommendations: [] });

    const activeSupport = supportFact
      ? input.activeSupports.find((support) =>
          supportFact.observation.endsWith(`for ${support.supportKey}.`),
        )
      : undefined;
    const supportKey = activeSupport?.supportKey ?? input.activeSupports[0]?.supportKey;
    if (supportKey === undefined) return Object.freeze({ recommendations: [] });

    return Object.freeze({
      recommendations: [
        auditRecommendationSchema.parse({
          action: 'observe',
          supportKey,
          evidence: [
            {
              metric: firstFact.metric,
              observation: firstFact.observation,
              sourceEventIds: [firstFact.eventId],
            },
          ],
          alternativeExplanations: [
            `Other task or setting factors may explain the pattern; ${SUPPORT_CATALOG[supportKey].label.toLowerCase()} should remain a teacher-reviewed option.`,
          ],
          confidence: 'low',
          reviewAfterSessions: 2,
        }),
      ],
    });
  }
}

export const fakeAuditProvider = new FakeAuditProvider();
