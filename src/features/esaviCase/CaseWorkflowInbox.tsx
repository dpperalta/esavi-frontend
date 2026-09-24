import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { CaseWorkflowListRow } from '@/contracts/declared/caseWorkflow';
import {
  useActivateCaseWorkflow,
  useCaseWorkflowList,
  useDeactivateCaseWorkflow,
} from '@/features/caseWorkflow/api';
import { caseWorkflowFiltersSchema } from '@/features/esaviCase/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { DateField } from '@/shared/components/DateField';
import { ResourceTable, type ResourceTableColumn } from '@/shared/components/ResourceTable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { Label } from '@/shared/components/ui/label';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';

const WORKFLOW_STATUS_TYPE_CODE = 'caseWorkflowStatus';
const STAGE_ALIASES = ['classification', 'notification', 'investigation', 'finalClassification'] as const;

function completedStageCount(row: CaseWorkflowListRow): number {
  return STAGE_ALIASES.filter((alias) => row.stages[alias].endedAt !== null).length;
}

type LifecycleAction = 'deactivate' | 'activate';

interface LifecycleTarget {
  caseWorkflowId: string;
  caseId: string;
  action: LifecycleAction;
}

interface CaseWorkflowRowActionsProps {
  row: CaseWorkflowListRow;
  onConfirm: (target: LifecycleTarget) => void;
}

// ESAVI-CASEFLOW-005A (ADMIN) deactivates, ESAVI-CASEFLOW-005B (SUPERADMIN) reactivates — each
// action shown at the real role of its route, even though it leaves an ADMIN unable to undo a
// deactivation (SPEC FE24 §3.1, §6).
function CaseWorkflowRowActions({ row, onConfirm }: CaseWorkflowRowActionsProps) {
  const { t } = useTranslation();
  const canDeactivate = useCan(ROLE_LEVELS.ADMIN);
  const canActivate = useCan(ROLE_LEVELS.SUPERADMIN);
  const target = { caseWorkflowId: row.caseWorkflowId, caseId: row.caseId };

  return (
    <>
      {canDeactivate && row.isActive && (
        <DropdownMenuItem
          variant="destructive"
          className="min-h-11"
          onClick={() => onConfirm({ ...target, action: 'deactivate' })}
        >
          {t('caseWorkflow.lifecycle.deactivate.action')}
        </DropdownMenuItem>
      )}
      {canActivate && !row.isActive && (
        <DropdownMenuItem className="min-h-11" onClick={() => onConfirm({ ...target, action: 'activate' })}>
          {t('caseWorkflow.lifecycle.activate.action')}
        </DropdownMenuItem>
      )}
    </>
  );
}

// The «Bandeja por estado» tab — its own contract against ESAVI-CASEFLOW-002A/002B, deliberately
// not sharing columns or filters with EsaviCaseFilters (§1D, §2): `statusCode` doesn't exist on
// the case listing, and `geoLocationId` doesn't exist here.
export function CaseWorkflowInbox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Cleared the moment the offending `statusCode` is dropped from the URL, but kept on screen
  // until then — the query itself succeeds again on the very next render (§3.5).
  const [statusNotFoundMessage, setStatusNotFoundMessage] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<LifecycleTarget | null>(null);
  const canDeactivate = useCan(ROLE_LEVELS.ADMIN);
  const canActivate = useCan(ROLE_LEVELS.SUPERADMIN);
  const deactivate = useDeactivateCaseWorkflow();
  const activate = useActivateCaseWorkflow();
  const pendingLifecycle = deactivate.isPending || activate.isPending;

  const parsed = caseWorkflowFiltersSchema.safeParse(Object.fromEntries(searchParams));
  const page = parsed.success ? parsed.data.page : 1;
  const filters = parsed.success
    ? (Object.fromEntries(
        Object.entries(parsed.data.filters).filter(([, value]) => value !== undefined),
      ) as Record<string, string>)
    : {};
  const includeInactive = parsed.success ? parsed.data.includeInactive : false;

  const list = useCaseWorkflowList({ page, pageSize: 10, includeInactive, filters });

  useEffect(() => {
    if (list.error instanceof EsaviApiError && list.error.code === 'CASEFLOW_002_STATUS_NOT_FOUND') {
      setStatusNotFoundMessage(getErrorMessage(list.error));
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('statusCode');
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reacts to a new error; re-running on `setSearchParams` identity would loop.
  }, [list.error]);

  function handleStatusChange(nextCode: string | null) {
    setStatusNotFoundMessage(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextCode) next.set('statusCode', nextCode);
      else next.delete('statusCode');
      next.delete('page');
      return next;
    });
  }

  function handleOpenedFromChange(value: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('openedFrom', value);
      else next.delete('openedFrom');
      next.delete('page');
      return next;
    });
  }

  function handleOpenedToChange(value: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('openedTo', value);
      else next.delete('openedTo');
      next.delete('page');
      return next;
    });
  }

  function handleIncludeInactiveChange(value: boolean) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('includeInactive', 'true');
      else next.delete('includeInactive');
      next.delete('page');
      return next;
    });
  }

  function handlePageChange(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextPage <= 1) next.delete('page');
      else next.set('page', String(nextPage));
      return next;
    });
  }

  function handleConfirm() {
    if (!confirmTarget) return;
    const { action, ...target } = confirmTarget;
    const mutation = action === 'deactivate' ? deactivate : activate;
    mutation.mutate(target, {
      onSuccess: () => {
        toast.success(t(`caseWorkflow.lifecycle.${action}.success`));
        setConfirmTarget(null);
      },
      onError: (error) => {
        if (error instanceof EsaviApiError) toast.error(getErrorMessage(error));
        // Closes on error too (SPEC FE24 §3.5): a 409 already re-reads the row into its real state.
        setConfirmTarget(null);
      },
    });
  }

  const statusCode = searchParams.get('statusCode') ?? '';
  const lifecycleKey = confirmTarget?.action ?? 'deactivate';

  const columns: ResourceTableColumn<CaseWorkflowListRow>[] = [
    {
      key: 'caseCode',
      header: 'caseWorkflow.list.columns.caseCode',
      render: (row) =>
        row.caseCode ? (
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => navigate(`/esavi-cases/${row.caseId}`)}
          >
            {row.caseCode}
          </button>
        ) : (
          <button
            type="button"
            className="text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => navigate(`/esavi-cases/${row.caseId}`)}
          >
            {t('caseWorkflow.list.caseCodeMissing')}
          </button>
        ),
      card: 'primary',
    },
    {
      key: 'status',
      header: 'caseWorkflow.list.columns.status',
      render: (row) => row.status.name,
      card: 'secondary',
    },
    {
      key: 'openedAt',
      header: 'caseWorkflow.list.columns.openedAt',
      render: (row) => format(new Date(row.openedAt), 'dd/MM/yyyy HH:mm'),
      card: 'meta',
    },
    {
      key: 'progress',
      header: 'caseWorkflow.list.columns.progress',
      render: (row) => t('caseWorkflow.list.progressValue', { done: completedStageCount(row), total: STAGE_ALIASES.length }),
    },
  ];

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex flex-col gap-4 md:w-72 md:shrink-0">
        <div className="flex flex-col gap-1.5">
          <Label>{t('caseWorkflow.list.filters.status')}</Label>
          <CatalogSelect
            typeCode={WORKFLOW_STATUS_TYPE_CODE}
            value={statusCode || null}
            onChange={handleStatusChange}
            ariaLabel={t('caseWorkflow.list.filters.status')}
          />
          {statusNotFoundMessage && (
            <p role="alert" className="text-sm text-destructive">
              {statusNotFoundMessage}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="caseWorkflowInbox-openedFrom">{t('caseWorkflow.list.filters.openedFrom')}</Label>
          <DateField
            id="caseWorkflowInbox-openedFrom"
            value={searchParams.get('openedFrom')}
            onChange={handleOpenedFromChange}
            ariaLabel={t('caseWorkflow.list.filters.openedFrom')}
            allowFuture
          />
        </div>
        <div className="flex flex-col gap-1.5">
          {/* "Before" and not "until": openedTo compares against a timestamp, exclusive of the
              rest of that day (caseWorkflow.service.ts) — the label says what the backend does. */}
          <Label htmlFor="caseWorkflowInbox-openedTo">{t('caseWorkflow.list.filters.openedTo')}</Label>
          <DateField
            id="caseWorkflowInbox-openedTo"
            value={searchParams.get('openedTo')}
            onChange={handleOpenedToChange}
            ariaLabel={t('caseWorkflow.list.filters.openedTo')}
            allowFuture
          />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <ResourceTable<CaseWorkflowListRow>
          columns={columns}
          data={list.data}
          idField="caseWorkflowId"
          isLoading={list.isLoading}
          isError={
            list.isError &&
            !(list.error instanceof EsaviApiError && list.error.code === 'CASEFLOW_002_STATUS_NOT_FOUND')
          }
          error={list.error instanceof EsaviApiError ? list.error : null}
          onRetry={() => void list.refetch()}
          page={page}
          onPageChange={handlePageChange}
          inactiveMode="adminPath"
          includeInactive={includeInactive}
          onIncludeInactiveChange={handleIncludeInactiveChange}
          isRowInactive={(row) => !row.isActive}
          rowActions={
            canDeactivate
              ? (row) => <CaseWorkflowRowActions row={row} onConfirm={setConfirmTarget} />
              : undefined
          }
          rowActionsLabel="caseWorkflow.list.rowActions"
          hasRowActions={(row) => row.isActive || canActivate}
          emptyKey="caseWorkflow.list.empty"
          emptyFilteredKey="caseWorkflow.list.emptyFiltered"
          isFiltered={!!statusCode || !!searchParams.get('openedFrom') || !!searchParams.get('openedTo')}
        />
      </div>

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pendingLifecycle) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`caseWorkflow.lifecycle.${lifecycleKey}.confirmTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(`caseWorkflow.lifecycle.${lifecycleKey}.confirmBody`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch" disabled={pendingLifecycle}>
              {t('common.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              size="touch"
              variant={lifecycleKey === 'deactivate' ? 'destructive' : 'default'}
              disabled={pendingLifecycle}
              onClick={(event) => {
                // Radix closes the dialog on Action click; kept open so `isPending` is visible
                // and a double click can't fire a second request (SPEC FE24 §3.4).
                event.preventDefault();
                handleConfirm();
              }}
            >
              {t(`caseWorkflow.lifecycle.${lifecycleKey}.confirmAction`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
