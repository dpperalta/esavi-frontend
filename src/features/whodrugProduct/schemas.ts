import { z } from 'zod';
import type { SyncWhodrugProductsInput } from '@/contracts/whodrugProduct';

// Mirrors syncWhodrugProductsValidator (esavi-backend/src/validators/whodrugProduct.validator.ts):
// optional, trimmed, at most 100 characters. The validator rejects an empty string, so a blank
// field is omitted from the body (`toSyncWhodrugProductsPayload`) rather than sent as ''.
export const syncWhodrugProductsSchema = z.object({
  dictionaryVersion: z.string().trim().max(100),
});

export type SyncWhodrugProductsFormValues = z.infer<typeof syncWhodrugProductsSchema>;

export const SYNC_DEFAULT_VALUES: SyncWhodrugProductsFormValues = { dictionaryVersion: '' };

export function toSyncWhodrugProductsPayload(
  values: SyncWhodrugProductsFormValues,
  dryRun: boolean,
): SyncWhodrugProductsInput & { dryRun: boolean } {
  const dictionaryVersion = values.dictionaryVersion.trim();
  return dictionaryVersion ? { dictionaryVersion, dryRun } : { dryRun };
}
