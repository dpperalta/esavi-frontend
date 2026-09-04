import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FilterIcon } from 'lucide-react';
import { format } from 'date-fns';
import type { EsaviCaseListRow } from '@/contracts/declared/esaviCase';
import { esaviCaseResource } from '@/features/esaviCase/api';
import { esaviCaseFiltersSchema } from '@/features/esaviCase/schemas';
import { countActiveEsaviCaseFilters, ESAVI_CASE_FILTER_PARAM_KEYS, EsaviCaseFilters } from '@/features/esaviCase/EsaviCaseFilters';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceTable, type ResourceTableColumn } from '@/shared/components/ResourceTable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Badge } from '@/shared/components/ui/badge';
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/shared/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';

type ConfirmAction = 'deactivate' | 'activate';
type Tab = 'cases' | 'workflow';

interface RowActionsProps {
  row: EsaviCaseListRow;
  onConfirm: (id: string, action: ConfirmAction) => void;
}

// One entry point per action; no `useUpdate` anywhere in this file (SPEC FE09 §5) — editing a
// case is the wizard's second step (FE10), not a form this screen offers.
function EsaviCaseRowActions({ row, onConfirm }: RowActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canDeactivate = useCan(ROLE_LEVELS.ADMIN);
  const canActivate = useCan(ROLE_LEVELS.SUPERADMIN);

  return (
    <>
      <DropdownMenuItem onClick={() => navigate(`/esavi-cases/${row.caseId}`)}>
        {t('esaviCase.list.rowActions.viewDetail')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => navigate(`/esavi-cases/${row.caseId}/wizard`)}>
        {t('esaviCase.list.rowActions.openCase')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => navigate(`/esavi-cases?patientId=${row.patient.patientId}`)}>
        {t('esaviCase.list.rowActions.viewPatientCases')}
      </DropdownMenuItem>
      {canDeactivate && row.isActive && (
        <DropdownMenuItem variant="destructive" onClick={() => onConfirm(row.caseId, 'deactivate')}>
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {canActivate && !row.isActive && (
        <DropdownMenuItem onClick={() => onConfirm(row.caseId, 'activate')}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
    </>
  );
}

// The two tabs of «Ver/editar» (SPEC FE09 §2): «Por caso» (this file wires it fully) and
// «Bandeja por estado», whose real content is CaseWorkflowInbox (next step of this same spec —
// a placeholder holds its place here so the tab shell is already navigable).
export function EsaviCaseListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const canCreate = useCan(ROLE_LEVELS.USER);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; action: ConfirmAction } | null>(
    null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  // Unknown `?tab=` reads as `cases`, silently — no redirect (§3.1).
  const tab: Tab = searchParams.get('tab') === 'workflow' ? 'workflow' : 'cases';
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const activeFilterCount = countActiveEsaviCaseFilters(searchParams);
  const isFiltered = activeFilterCount > 0;

  // A range the backend would 400 on (From > To) fails `safeParse` — the query falls back to no
  // filters at all rather than sending the broken pair. `EsaviCaseFilters` shows the inline
  // error for that same URL independently; this page never duplicates it.
  const parsed = esaviCaseFiltersSchema.safeParse(Object.fromEntries(searchParams));
  const page = parsed.success ? parsed.data.page : 1;
  const filters = parsed.success
    ? (Object.fromEntries(
        Object.entries(parsed.data.filters).filter(([, value]) => value !== undefined),
      ) as Record<string, string>)
    : {};

  const list = esaviCaseResource.useList({ page, pageSize, includeInactive, filters });
  const deactivate = esaviCaseResource.useDeactivate();
  const activate = esaviCaseResource.useActivate!();

  const firstRow = list.data?.rows[0];
  const patientName = firstRow ? `${firstRow.patient.names} ${firstRow.patient.lastNames}` : undefined;

  function handleTabChange(nextTab: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextTab === 'cases') next.delete('tab');
        else next.set('tab', nextTab);
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  function handlePageChange(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextPage <= 1) next.delete('page');
      else next.set('page', String(nextPage));
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

  // Clears the fourteen filter params, resets `page` — `tab` and `pageSize` (Zustand) survive
  // untouched (§3.6).
  function handleClearFilters() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of ESAVI_CASE_FILTER_PARAM_KEYS) next.delete(key);
      next.delete('page');
      return next;
    });
  }

  function handleConfirm() {
    if (!confirmTarget) return;
    const mutation = confirmTarget.action === 'deactivate' ? deactivate : activate;
    mutation.mutate(confirmTarget.id, {
      onSuccess: () => {
        toast.success(
          t(confirmTarget.action === 'deactivate' ? 'common.toast.deactivated' : 'common.toast.activated'),
        );
        setConfirmTarget(null);
      },
      onError: (error) => {
        if (error instanceof EsaviApiError) toast.error(getErrorMessage(error));
        setConfirmTarget(null);
      },
    });
  }

  const columns: ResourceTableColumn<EsaviCaseListRow>[] = [
    {
      key: 'caseCode',
      header: 'esaviCase.list.columns.caseCode',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.caseCode}
          {!row.isActive && <Badge variant="destructive">{t('esaviCase.list.status.inactive')}</Badge>}
        </span>
      ),
      card: 'primary',
    },
    {
      key: 'patient',
      header: 'esaviCase.list.columns.patient',
      render: (row) => `${row.patient.names} ${row.patient.lastNames}`,
      card: 'secondary',
    },
    {
      key: 'reportDate',
      header: 'esaviCase.list.columns.reportDate',
      render: (row) => (row.reportDate ? format(new Date(`${row.reportDate}T00:00:00`), 'dd/MM/yyyy') : '—'),
      card: 'meta',
    },
    {
      key: 'healthFacility',
      header: 'esaviCase.list.columns.healthFacility',
      render: (row) => row.healthFacility.name,
    },
    {
      key: 'geoLocation',
      header: 'esaviCase.list.columns.geoLocation',
      render: (row) => row.healthFacility.geoLocation?.name ?? '—',
    },
  ];

  const filterPanel = <EsaviCaseFilters patientName={patientName} />;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-medium text-foreground">{t('esaviCase.list.title')}</h1>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="cases">{t('esaviCase.list.tabs.cases')}</TabsTrigger>
          <TabsTrigger value="workflow">{t('esaviCase.list.tabs.workflow')}</TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="hidden md:block md:w-72 md:shrink-0">{filterPanel}</div>

          <div className="md:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <FilterIcon aria-hidden="true" className="size-4" />
                  {t('esaviCase.list.filtersButton')}
                  {activeFilterCount > 0 && <Badge variant="default">{activeFilterCount}</Badge>}
                </button>
              </SheetTrigger>
              <SheetContent side="bottom">
                <SheetHeader>
                  <SheetTitle>{t('esaviCase.list.filtersButton')}</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto px-4 pb-4">{filterPanel}</div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="min-w-0 flex-1">
            <ResourceTable<EsaviCaseListRow>
              columns={columns}
              data={list.data}
              idField="caseId"
              isLoading={list.isLoading}
              isError={list.isError}
              error={list.error instanceof EsaviApiError ? list.error : null}
              onRetry={() => void list.refetch()}
              page={page}
              onPageChange={handlePageChange}
              inactiveMode="adminPath"
              includeInactive={includeInactive}
              onIncludeInactiveChange={handleIncludeInactiveChange}
              canCreate={canCreate}
              onCreate={() => navigate('/esavi-cases/new')}
              createLabel="esaviCase.list.registerCase"
              emptyKey="esaviCase.list.empty"
              emptyFilteredKey="esaviCase.list.emptyFiltered"
              isFiltered={isFiltered}
              onClearFilters={handleClearFilters}
              isRowInactive={(row) => !row.isActive}
              rowActions={(row) => (
                <EsaviCaseRowActions row={row} onConfirm={(id, action) => setConfirmTarget({ id, action })} />
              )}
            />
          </div>
        </TabsContent>

        <TabsContent value="workflow">
          <p className="text-sm text-muted-foreground">{t('common.comingSoon')}</p>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                confirmTarget?.action === 'activate'
                  ? 'common.confirm.activate'
                  : 'common.confirm.deactivate',
              )}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {t(
                confirmTarget?.action === 'activate'
                  ? 'common.actions.activate'
                  : 'common.actions.deactivate',
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
