import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { DatabaseIcon, LockIcon, PlusIcon } from 'lucide-react';
import type { SystemConfigDetail } from '@/contracts/declared/systemConfig';
import type { SystemConfigValueType } from '@/contracts/systemConfig';
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
import { Button } from '@/shared/components/ui/button';
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { systemConfigResource, useSyncSystemConfigDefaults } from './api';
import { SystemConfigFormDialog } from './SystemConfigFormDialog';
import { SystemConfigHistorySheet } from './SystemConfigHistorySheet';

const SEARCH_DEBOUNCE_MS = 400;
const SYSTEM_CONFIG_VALUE_TYPES: readonly SystemConfigValueType[] = [
  'string',
  'number',
  'boolean',
  'json',
  'array',
];

type ConfirmAction = 'deactivate' | 'activate';

interface RowActionsProps {
  row: SystemConfigDetail;
  onEdit: (id: string) => void;
  // `<SystemConfigHistorySheet>` y `<SystemConfigAuditSheet>` llegan en los pasos 7 y 8 de este
  // mismo spec (SPEC FE19 §4) — los dos ítems del menú ya se cablean aquí, sin efecto visible
  // hasta que esos dos componentes existan.
  onHistory: (id: string) => void;
  onAudit: (id: string) => void;
  onConfirm: (id: string, action: ConfirmAction) => void;
}

// Toda la pantalla exige SUPERADMIN (SPEC FE19 §2, §6: desviación declarada de la matriz de
// roles) — no hay `useCan()` que distinga entre acciones dentro de esta pantalla, a diferencia de
// `HealthFacilityRowActions`. Quien llega ya puede hacer las cinco.
function SystemConfigRowActions({ row, onEdit, onHistory, onAudit, onConfirm }: RowActionsProps) {
  const { t } = useTranslation();

  return (
    <>
      <DropdownMenuItem onClick={() => onEdit(row.systemConfigId)}>
        {t('common.actions.edit')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onHistory(row.systemConfigId)}>
        {t('systemConfig.history.action')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAudit(row.systemConfigId)}>
        {t('common.actions.audit')}
      </DropdownMenuItem>
      {row.isActive && (
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onConfirm(row.systemConfigId, 'deactivate')}
        >
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {!row.isActive && (
        <DropdownMenuItem onClick={() => onConfirm(row.systemConfigId, 'activate')}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
    </>
  );
}

interface ValuePreviewProps {
  row: SystemConfigDetail;
}

// SPEC FE19 §3.7 — el candado en vez del valor para toda fila cifrada, también en la tarjeta
// móvil; nunca se intenta mostrar el valor de una fila con `isEncrypted: true` (el listado ya lo
// trae `null`, así que tampoco habría nada real que mostrar).
function ValuePreview({ row }: ValuePreviewProps) {
  const { t } = useTranslation();

  if (row.isEncrypted) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <LockIcon aria-hidden="true" className="size-3.5" />
        {t('systemConfig.value.encrypted')}
      </span>
    );
  }

  const preview =
    row.valueType === 'json' || row.valueType === 'array'
      ? JSON.stringify(row.value)
      : String(row.value);

  return <span className="line-clamp-1 font-mono text-xs">{preview}</span>;
}

// SPEC FE19 §3.6 — sustituye a `<ResourceTable>` por completo cuando no hay ni una fila y ningún
// filtro está activo: el `onCreate` genérico de la primitiva ofrecería «Crear», y aquí lo que hace
// falta es sembrar el catálogo (`008`), no dar de alta filas una por una.
function EmptyDeploymentPanel({ onSync }: { onSync: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <DatabaseIcon aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{t('systemConfig.list.empty')}</p>
      <Button type="button" size="sm" onClick={onSync}>
        {t('systemConfig.sync.action')}
      </Button>
    </div>
  );
}

// SPEC FE19 — pantalla íntegra en SUPERADMIN (§2, §6): el guard de la ruta ya lo exige, así que
// el `NavItem` de `shared/config/navigation.ts` es el único punto de esa restricción.
export function SystemConfigListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const valueTypeFilter = searchParams.get('valueType') ?? '';

  const [filtersInput, setFiltersInput] = useState({
    name: searchParams.get('name') ?? '',
    code: searchParams.get('code') ?? '',
    scope: searchParams.get('scope') ?? '',
  });

  // Mismo criterio de *debounce* que `HealthFacilityListPage`: se escribe en `searchParams` tras
  // una pausa, nunca en cada tecla — los tres filtros de texto comparten un único efecto porque
  // cambian juntos con la misma cadencia (SPEC FE19 §3.4, §3.5).
  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = {
        name: searchParams.get('name') ?? '',
        code: searchParams.get('code') ?? '',
        scope: searchParams.get('scope') ?? '',
      };
      if (
        filtersInput.name === current.name &&
        filtersInput.code === current.code &&
        filtersInput.scope === current.scope
      ) {
        return;
      }
      const next = new URLSearchParams(searchParams);
      (['name', 'code', 'scope'] as const).forEach((key) => {
        if (filtersInput[key]) {
          next.set(key, filtersInput[key]);
        } else {
          next.delete(key);
        }
      });
      next.delete('page');
      setSearchParams(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersInput]);

  const filters: Record<string, string> = {};
  const nameParam = searchParams.get('name');
  const codeParam = searchParams.get('code');
  const scopeParam = searchParams.get('scope');
  if (nameParam) filters.name = nameParam;
  if (codeParam) filters.code = codeParam;
  if (scopeParam) filters.scope = scopeParam;
  if (valueTypeFilter) filters.valueType = valueTypeFilter;
  const isFiltered = Object.keys(filters).length > 0;

  const list = systemConfigResource.useList({ page, pageSize, includeInactive, filters });
  const deactivate = systemConfigResource.useDeactivate();
  const activate = systemConfigResource.useActivate!();
  const sync = useSyncSystemConfigDefaults();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; code: string; action: ConfirmAction } | null>(
    null,
  );
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);

  function handlePageChange(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(nextPage));
    }
    setSearchParams(next);
  }

  function handleIncludeInactiveChange(value: boolean) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('includeInactive', 'true');
    } else {
      next.delete('includeInactive');
    }
    next.delete('page');
    setSearchParams(next);
  }

  function handleValueTypeChange(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('valueType', value);
    } else {
      next.delete('valueType');
    }
    next.delete('page');
    setSearchParams(next);
  }

  function handleClearFilters() {
    setFiltersInput({ name: '', code: '', scope: '' });
    const next = new URLSearchParams(searchParams);
    next.delete('name');
    next.delete('code');
    next.delete('scope');
    next.delete('valueType');
    next.delete('page');
    setSearchParams(next);
  }

  function handleCreate() {
    setEditingId(null);
    setFormOpen(true);
  }

  function handleEdit(id: string) {
    setEditingId(id);
    setFormOpen(true);
  }

  function handleHistory(id: string) {
    setHistoryId(id);
  }
  // `<SystemConfigAuditSheet>` llega en el paso 8.
  function handleAudit(id: string) {
    void id;
  }

  function handleConfirm() {
    if (!confirmTarget) {
      return;
    }
    const mutation = confirmTarget.action === 'deactivate' ? deactivate : activate;
    mutation.mutate(confirmTarget.id, {
      onSuccess: () => {
        toast.success(
          t(confirmTarget.action === 'deactivate' ? 'common.toast.deactivated' : 'common.toast.activated'),
        );
        setConfirmTarget(null);
      },
      onError: (error) => {
        if (error instanceof EsaviApiError) {
          toast.error(getErrorMessage(error));
        }
        setConfirmTarget(null);
      },
    });
  }

  function handleSync() {
    sync.mutate(undefined, {
      onSuccess: (result) => {
        setSyncConfirmOpen(false);
        if (result.created.length === 0) {
          toast.success(t('systemConfig.sync.nothingToDo'));
          return;
        }
        toast.success(
          t('systemConfig.sync.success', {
            created: result.created.length,
            skipped: result.skipped.length,
          }),
        );
      },
      onError: (error) => {
        setSyncConfirmOpen(false);
        if (error instanceof EsaviApiError) {
          toast.error(getErrorMessage(error));
        }
      },
    });
  }

  const columns: ResourceTableColumn<SystemConfigDetail>[] = [
    {
      key: 'code',
      header: 'systemConfig.columns.code',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {row.code}
          {!row.isEditable && (
            <Badge variant="outline">{t('systemConfig.badge.protected')}</Badge>
          )}
          {!row.isActive && <Badge variant="destructive">{t('systemConfig.status.inactive')}</Badge>}
        </span>
      ),
      card: 'primary',
    },
    {
      key: 'name',
      header: 'systemConfig.columns.name',
      render: (row) => row.name,
    },
    {
      key: 'value',
      header: 'systemConfig.columns.value',
      render: (row) => <ValuePreview row={row} />,
      card: 'secondary',
    },
    {
      key: 'scope',
      header: 'systemConfig.columns.scope',
      render: (row) => row.scope,
      card: 'meta',
    },
    {
      key: 'valueType',
      header: 'systemConfig.columns.valueType',
      render: (row) => t(`systemConfig.valueType.${row.valueType}`),
      card: 'meta',
    },
  ];

  const showEmptyDeploymentPanel =
    !isFiltered && !list.isLoading && !list.isError && (list.data?.count ?? 0) === 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium text-foreground">{t('systemConfig.list.title')}</h1>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setSyncConfirmOpen(true)}>
            {t('systemConfig.sync.action')}
          </Button>
          <Button type="button" size="sm" onClick={handleCreate}>
            <PlusIcon aria-hidden="true" />
            {t('common.actions.create')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-48">
          <Label htmlFor="system-config-filter-name">{t('systemConfig.filters.name')}</Label>
          <Input
            id="system-config-filter-name"
            value={filtersInput.name}
            onChange={(event) => setFiltersInput((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-48">
          <Label htmlFor="system-config-filter-code">{t('systemConfig.filters.code')}</Label>
          <Input
            id="system-config-filter-code"
            value={filtersInput.code}
            onChange={(event) => setFiltersInput((prev) => ({ ...prev, code: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-40">
          <Label htmlFor="system-config-filter-scope">{t('systemConfig.filters.scope')}</Label>
          <Input
            id="system-config-filter-scope"
            value={filtersInput.scope}
            onChange={(event) => setFiltersInput((prev) => ({ ...prev, scope: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t('systemConfig.filters.valueType')}</Label>
          <Select value={valueTypeFilter} onValueChange={handleValueTypeChange}>
            <SelectTrigger
              aria-label={t('systemConfig.filters.valueType')}
              onClear={valueTypeFilter ? () => handleValueTypeChange('') : undefined}
            >
              <SelectValue placeholder={t('systemConfig.filters.valueTypePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {SYSTEM_CONFIG_VALUE_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`systemConfig.valueType.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {showEmptyDeploymentPanel ? (
        <EmptyDeploymentPanel onSync={() => setSyncConfirmOpen(true)} />
      ) : (
        <ResourceTable<SystemConfigDetail>
          columns={columns}
          data={list.data}
          idField="systemConfigId"
          isLoading={list.isLoading}
          isError={list.isError}
          error={list.error instanceof EsaviApiError ? list.error : null}
          onRetry={() => void list.refetch()}
          page={page}
          onPageChange={handlePageChange}
          inactiveMode="adminPath"
          includeInactive={includeInactive}
          onIncludeInactiveChange={handleIncludeInactiveChange}
          emptyFilteredKey="systemConfig.list.emptyFiltered"
          isFiltered={isFiltered}
          onClearFilters={handleClearFilters}
          isRowInactive={(row) => !row.isActive}
          rowActions={(row) => (
            <SystemConfigRowActions
              row={row}
              onEdit={handleEdit}
              onHistory={handleHistory}
              onAudit={handleAudit}
              onConfirm={(id, action) =>
                setConfirmTarget({ id, code: list.data?.rows.find((r) => r.systemConfigId === id)?.code ?? '', action })
              }
            />
          )}
        />
      )}

      <SystemConfigFormDialog open={formOpen} systemConfigId={editingId} onOpenChange={setFormOpen} />

      <SystemConfigHistorySheet
        open={historyId !== null}
        systemConfigId={historyId}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryId(null);
          }
        }}
      />

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.action === 'activate'
                ? t('common.confirm.activate')
                : t('systemConfig.delete.confirm', { code: confirmTarget?.code ?? '' })}
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

      <AlertDialog open={syncConfirmOpen} onOpenChange={setSyncConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('systemConfig.sync.confirmTitle')}</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">{t('systemConfig.sync.confirmBody')}</p>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSync} disabled={sync.isPending}>
              {t('systemConfig.sync.action')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
