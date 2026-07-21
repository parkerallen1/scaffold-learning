import type {
  AuditRecommendation,
  EvidenceSummary,
  SupportSettings,
} from '@scaffold-learning/domain';

export type AuditEventFact = Readonly<{
  eventId: string;
  metric: 'attemptOutcome' | 'supportUse';
  observation: string;
}>;

export type AuditEvidencePacket = Readonly<{
  summary: EvidenceSummary;
  activeSupports: readonly SupportSettings[];
  eventFacts: readonly AuditEventFact[];
}>;

export type AuditProviderDraft = Readonly<{
  recommendations: readonly AuditRecommendation[];
}>;

export interface AuditProvider {
  readonly name: 'fake' | 'openai';
  readonly model: string;
  readonly promptVersion: string;
  auditSupports(input: AuditEvidencePacket): Promise<AuditProviderDraft>;
}

export type AuditFallbackCode =
  'malformed_output' | 'unsafe_output' | 'refusal' | 'timeout' | 'provider_unavailable';

export class AuditManualFallbackError extends Error {
  readonly useManualReview = true;

  constructor(readonly code: AuditFallbackCode) {
    super('Automated audit suggestions are unavailable. Review the evidence manually.');
    this.name = 'AuditManualFallbackError';
  }
}
