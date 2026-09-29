import { useState } from 'react';
import { useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AppDetails } from '@/contracts/common';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import type { ListParams } from '@/shared/api/createResource';
import { getErrorMessage, isAlreadyActiveError } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { useShowInactive } from '@/shared/hooks/useShowInactive';

// The slice of a `createResource` declaration this hook needs (SPEC FE29 §3.1).
interface RestorableResource<T> {
  key: string;
  idField: keyof T;
  useActivate?: () => UseMutationResult<void, Error, string>;
  useListByParent?: (parentId: string, params: ListParams) => UseQueryResult<PaginatedResponse<T>>;
}

interface AuditedRow {
  isActive: boolean;
  appDetails: AppDetails[] | null;
}

interface UseSatelliteAuditOptions<T> {
  // The query every list reads today (`006` or `002A`). It still feeds the step's logic; this
  // hook only swaps what the table shows (SPEC FE29 §3.4).
  activeQuery: UseQueryResult<PaginatedResponse<T>>;
  // `null` or `undefined` while the parent does not exist: the `002B` is not fired (§3.2).
  parentId: string | null | undefined;
  readOnly: boolean;
  restoredToastKey?: string;
}

const DELETED_ROWS_PAGE_SIZE = 100;
const NOT_FOUND_ON_RESTORE = /_005B_NOT_FOUND$/;

function isRestoreNotFound(error: unknown): boolean {
  return (
    error instanceof EsaviApiError &&
    typeof error.code === 'string' &&
    NOT_FOUND_ON_RESTORE.test(error.code)
  );
}

// SPEC FE29: the deleted-rows view and the audit trail of the ten multi-row satellites, written
// once. With the case-file toggle on (ADMIN), the table reads the `002B` by parent instead of the
// active query; «Restaurar» is ADMIN and never on a read-only list; «Historial» is SUPERADMIN only
// (CONVENTIONS.md §10.4).
export function useSatelliteAudit<T extends AuditedRow>(
  resource: RestorableResource<T>,
  {
    activeQuery,
    parentId,
    readOnly,
    restoredToastKey = 'common.satelliteList.toast.restored',
  }: UseSatelliteAuditOptions<T>,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const showInactive = useShowInactive();
  const canRestore = useCan(ROLE_LEVELS.ADMIN);
  const canViewAudit = useCan(ROLE_LEVELS.SUPERADMIN);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // An empty parentId keeps the factory's own `enabled: !!parentId` off, so with the toggle off no
  // `…/admin/…` request is ever fired (SPEC FE29 §5).
  const deletedQuery = resource.useListByParent!(showInactive ? (parentId ?? '') : '', {
    pageSize: DELETED_ROWS_PAGE_SIZE,
    includeInactive: true,
  });
  const activate = resource.useActivate!();
  const tableQuery = showInactive ? deletedQuery : activeQuery;

  async function restore(row: T) {
    const id = String(row[resource.idField]);
    setRestoringId(id);
    try {
      await activate.mutateAsync(id);
      toast.success(t(restoredToastKey));
    } catch (error) {
      // ESAVI-*-005B. `CASE_CLOSED` also lands here with its own toast; the global MutationCache
      // of SPEC FE17 is what turns the screen read-only.
      if (isAlreadyActiveError(error)) {
        toast.error(t('common.satelliteList.errors.alreadyActive'));
        void queryClient.invalidateQueries({ queryKey: [resource.key] });
        return;
      }
      toast.error(
        error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'),
      );
      if (isRestoreNotFound(error)) {
        void queryClient.invalidateQueries({ queryKey: [resource.key] });
      }
    } finally {
      setRestoringId(null);
    }
  }

  return {
    tableQuery,
    listProps: {
      isRowInactive: (row: T) => !row.isActive,
      onRestore: canRestore && !readOnly ? restore : undefined,
      restoringId,
      getRowAppDetails: canViewAudit ? (row: T) => row.appDetails : undefined,
    },
  };
}
