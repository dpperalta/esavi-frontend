import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import type { WhodrugProductRow } from '@/contracts/declared/whodrugProduct';
import type {
  SyncWhodrugProductsInput,
  WhodrugProductListFilters,
  WhodrugProductSyncReport,
} from '@/contracts/whodrugProduct';
import { client } from '@/shared/api/client';

// Declared exception to CONVENTIONS.md §5 (no hand-written CRUD hooks), SPEC FE25d §3.4:
// `whodrugProduct` is a read-only mirror with no `001`, `002A`, `003`, `004` or `005`, so
// `createResource` would expose `useCreate`/`useUpdate`/`useRemove`/`useOne` over routes that do not
// exist. The `006` search is not here either: `useWhodrugProductSearch` in notification/api.ts
// consumes it for `<WhodrugProductSearchField>`.

// The validator's floor for both `name` and `ingredient` on the 002B — below it the backend answers
// 400, so the parameter is dropped instead of sent (SPEC FE25d §3.2).
export const WHODRUG_PRODUCT_FILTER_MIN_LENGTH = 3;

const THIRTY_MINUTES = 30 * 60 * 1000;

export interface WhodrugProductListParams {
  page?: number;
  pageSize: number;
  name?: string;
  ingredient?: string;
}

function toFilter(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length >= WHODRUG_PRODUCT_FILTER_MIN_LENGTH ? trimmed : undefined;
}

// ESAVI-WHODPROD-002B — the only listing, always including the rows the sync retired. The key keeps
// the undefined filters out of its hash, so `{ page: 1, pageSize: 1 }` is the same entry as
// `['whodrugProduct', 'list', { limit: 1, offset: 0 }]`, the sync page's empty-mirror check.
// 30 minutes of `staleTime`: only the `007` changes this table, and it invalidates the root key.
export function useWhodrugProductList({
  page,
  pageSize,
  name,
  ingredient,
}: WhodrugProductListParams) {
  const params: WhodrugProductListFilters = {
    limit: pageSize,
    offset: ((page ?? 1) - 1) * pageSize,
    name: toFilter(name),
    ingredient: toFilter(ingredient),
  };

  return useQuery({
    queryKey: ['whodrugProduct', 'list', params],
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<WhodrugProductRow>>(
        'whodrug-products/admin',
        { params },
      );
      return response.data;
    },
    staleTime: THIRTY_MINUTES,
  });
}

export interface SyncWhodrugProductsVariables extends Omit<SyncWhodrugProductsInput, 'dryRun'> {
  dryRun: boolean;
}

// ESAVI-WHODPROD-007. JSON body, not multipart like the two `.xlsx`/`.asc` imports: `dryRun` travels
// as a JSON boolean (SPEC FE25d §3.2).
export function useSyncWhodrugProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: SyncWhodrugProductsVariables) => {
      const response = await client.post<WhodrugProductSyncReport>(
        'whodrug-products/sync',
        variables,
      );
      return response.data;
    },
    onSuccess: (_report, { dryRun }) => {
      // SPEC FE25d §3.4: a dry run wrote nothing. A real one invalidates the whole root key — the
      // list, the empty-mirror check and `<WhodrugProductSearchField>`'s `['whodrugProduct',
      // 'search', …]` entries, so the notification search offers the synced rows without a reload.
      if (!dryRun) {
        void queryClient.invalidateQueries({ queryKey: ['whodrugProduct'] });
      }
    },
  });
}
