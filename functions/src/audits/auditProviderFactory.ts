import type { AuditProvider } from './auditContracts.js';
import { AuditManualFallbackError } from './auditContracts.js';
import { fakeAuditProvider } from './fakeAuditProvider.js';
import {
  createConfiguredOpenAiAuditProvider,
  readOpenAiAuditConfig,
} from './openAiAuditProvider.js';

export interface AuditProviderFactoryOptions {
  mode?: string;
  isEmulator?: boolean;
  featuresEnabled?: string;
  createOpenAi?: () => AuditProvider;
}

export const createAuditProvider = ({
  mode = process.env.AI_PROVIDER,
  isEmulator = process.env.FUNCTIONS_EMULATOR === 'true',
  featuresEnabled = process.env.AI_FEATURES_ENABLED,
  createOpenAi = createConfiguredOpenAiAuditProvider,
}: AuditProviderFactoryOptions = {}): AuditProvider => {
  if (mode !== 'openai' || isEmulator) return fakeAuditProvider;
  if (featuresEnabled !== 'true') {
    const config = readOpenAiAuditConfig();
    return Object.freeze({
      name: 'openai',
      model: config.model,
      promptVersion: config.promptVersion,
      async auditSupports() {
        throw new AuditManualFallbackError('provider_unavailable');
      },
    });
  }
  return createOpenAi();
};
