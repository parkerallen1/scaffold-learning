import type { RecommendationInput, RecommendationResult } from '@quiz-master/domain';

export interface AiProvider {
  readonly name: 'fake' | 'openai';
  readonly model: string;
  readonly promptVersion: string;
  recommendSupports(input: RecommendationInput): Promise<RecommendationResult>;
}

export type RecommendationFallbackCode =
  'malformed_output' | 'unsafe_output' | 'refusal' | 'timeout' | 'provider_unavailable';

export class RecommendationManualFallbackError extends Error {
  readonly code: RecommendationFallbackCode;
  readonly useManualSetup = true;

  constructor(code: RecommendationFallbackCode) {
    super('Support recommendations are unavailable. Configure supports manually.');
    this.name = 'RecommendationManualFallbackError';
    this.code = code;
  }
}
