import type { AuditProvider } from './auditContracts.js';
import { fakeAuditProvider } from './fakeAuditProvider.js';
import { createConfiguredOpenAiAuditProvider } from './openAiAuditProvider.js';

export interface AuditProviderFactoryOptions {
  mode?: string;
  isEmulator?: boolean;
  createOpenAi?: () => AuditProvider;
}

export const createAuditProvider = ({
  mode = process.env.AI_PROVIDER,
  isEmulator = process.env.FUNCTIONS_EMULATOR === 'true',
  createOpenAi = createConfiguredOpenAiAuditProvider,
}: AuditProviderFactoryOptions = {}): AuditProvider => {
  if (mode !== 'openai' || isEmulator) return fakeAuditProvider;
  return createOpenAi();
};
