import { useQuery } from '@tanstack/react-query';
import type { SystemConfigDetail } from '@/contracts/declared/systemConfig';
import { client } from '@/shared/api/client';
import { EsaviApiError } from '@/shared/api/types';

// ESAVI-SYSCONF-006 — one systemConfig row by its `code`. A 404 means the row has not been seeded
// in this deployment: a SUPERADMIN seeds systemConfig at deploy time, not during a session, so a
// missing row is business-as-usual, not an error (CASE-PROCESS.md §10.6). The hook resolves to
// `null` instead of propagating; any other status is a real problem with the endpoint and
// propagates as an EsaviApiError, same as any other read.
//
// Configuration, not case data — `staleTime` is 30 minutes for the same reason (CONVENTIONS.md
// §6.3). Two callers with the same `code` share the cache entry: this hook is the one place a
// screen reads systemConfig by code, so it is never copied (SPEC FE12d §3.4, §8) — the country
// ISO code of CASE-PROCESS.md §10.1 is its next consumer.
export function useSystemConfigByCode(code: string) {
  return useQuery({
    queryKey: ['systemConfig', 'byCode', code],
    queryFn: async () => {
      try {
        const response = await client.get<SystemConfigDetail>(`system-configs/code/${code}`);
        return response.data;
      } catch (error) {
        if (error instanceof EsaviApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    staleTime: 30 * 60 * 1000,
  });
}
