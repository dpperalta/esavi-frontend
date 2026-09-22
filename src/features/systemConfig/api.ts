import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSystemConfigInput } from '@/contracts/systemConfig';
import type { SystemConfigDetail } from '@/contracts/declared/systemConfig';
import type { SystemConfigHistoryRow } from '@/contracts/declared/systemConfigHistory';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';
import { EsaviApiError } from '@/shared/api/types';

// POST   /api/system-configs                ESAVI-SYSCONF-001   SUPERADMIN  create
// GET    /api/system-configs                ESAVI-SYSCONF-002A  USER        list (active only)
// GET    /api/system-configs/admin          ESAVI-SYSCONF-002B  ADMIN       list, incl. inactive
// GET    /api/system-configs/:id            ESAVI-SYSCONF-003   USER        detail; decrypts SUPERADMIN-only
// PUT    /api/system-configs/:id            ESAVI-SYSCONF-004   SUPERADMIN  update
// DELETE /api/system-configs/:id            ESAVI-SYSCONF-005A  SUPERADMIN  deactivate
// PATCH  /api/system-configs/activate/:id   ESAVI-SYSCONF-005B  SUPERADMIN  activate
//
// No `staleTime` (SPEC FE19 §3.4): this is the data the screen edits, not a background catalog.
export const systemConfigResource = createResource<
  SystemConfigDetail,
  CreateSystemConfigInput,
  Partial<CreateSystemConfigInput>
>({
  key: 'systemConfig',
  path: 'system-configs',
  idField: 'systemConfigId',
  inactiveMode: 'adminPath',
  adminPath: 'system-configs/admin',
});

export interface SystemConfigHistoryParams {
  page?: number;
  pageSize: number;
}

// ESAVI-SYSCONF-007 — value history of one configuration, SUPERADMIN-only. `enabled` is driven by
// the caller (SystemConfigHistorySheet is open) so the request never fires while the panel is
// closed. Its page lives in the sheet's own `useState` (SPEC FE19 §3.4) — never in `searchParams`.
export function useSystemConfigHistory(
  id: string,
  { page, pageSize }: SystemConfigHistoryParams,
  enabled: boolean,
) {
  const limit = pageSize;
  const offset = ((page ?? 1) - 1) * pageSize;

  return useQuery({
    queryKey: ['systemConfig', 'history', id, { limit, offset }],
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<SystemConfigHistoryRow>>(
        `system-configs/${id}/history`,
        { params: { limit, offset } },
      );
      return response.data;
    },
    enabled: enabled && !!id,
  });
}

// Assembled ad hoc by syncSystemConfigDefaultsService, same reason as SystemConfigHistoryRow
// (SPEC F26 §3.7): no backend interface to mirror. Kept local to this hook's one consumer instead
// of in contracts/declared/ (CONVENTIONS.md §9 — a shape a single hook reads is not a contract).
export interface SyncSystemConfigResult {
  created: Array<{ code: string; scope: string }>;
  skipped: Array<{ code: string; scope: string }>;
}

// ESAVI-SYSCONF-008 — idempotent seed from `systemConfig.defaults.ts`, no body. Invalidates the
// same root key as every other systemConfig mutation, so a freshly seeded row shows up in the
// list without a reload.
export function useSyncSystemConfigDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await client.post<SyncSystemConfigResult>('system-configs/sync');
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
    },
  });
}

const COUNTRY_ISO_CODE_CONFIG_CODE = 'ESAVI_APP_COUNTRY_ISO_CODE';
const COUNTRY_ISO_CODE_FALLBACK = import.meta.env.VITE_ESAVI_APP_COUNTRY_ISO_CODE as string;

// ESAVI-SYSCONF-006 — resolves the country ISO code the case-opening step sends on every
// `ESAVI-CASE-001`, never asked to the user (SPEC FE10 §2). `systemConfig` wins over the
// environment (SPEC F43 §3.6): a 404 means the row hasn't been created yet — a dependency of the
// other repository this spec functions without (CASE-PROCESS.md §10.1) — and falls back to
// `VITE_ESAVI_APP_COUNTRY_ISO_CODE` without surfacing an error to the user. Any other status is a
// real problem with the endpoint itself and propagates: swallowing a 500 here would hide a broken
// systemConfig service behind what looks like a missing seed row.
export function useCountryIsoCode() {
  return useQuery({
    queryKey: ['systemConfig', 'byCode', COUNTRY_ISO_CODE_CONFIG_CODE],
    queryFn: async () => {
      try {
        const response = await client.get<SystemConfigDetail>(
          `system-configs/code/${COUNTRY_ISO_CODE_CONFIG_CODE}`,
        );
        return String(response.data.value);
      } catch (error) {
        if (error instanceof EsaviApiError && error.status === 404) {
          return COUNTRY_ISO_CODE_FALLBACK;
        }
        throw error;
      }
    },
    // Configuration, not case data — it changes when an administrator changes it, not during an
    // alta (SPEC FE10 §3.4: "dos altos, el resto ninguno").
    staleTime: 30 * 60 * 1000,
  });
}
