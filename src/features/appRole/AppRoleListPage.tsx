import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { SearchIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { AppRole } from '@/contracts/declared/appRole';
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
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { appRoleResource } from './api';
import { AppRoleAuditSheet } from './AppRoleAuditSheet';
import { AppRoleFormDialog } from './AppRoleFormDialog';
import { formatRoleLevel, SUPERADMIN_ROLE_CODE } from './roleLevels';

// The minimum of appRoleListValidator (`isLength({ min: 2 })` on both parameters): below it the
// backend answers 400, so the term never leaves the field (CONVENTIONS.md §6.7).
const SEARCH_MIN_LENGTH = 2;

// Same value as every other listing of this repository (SPEC FE20 §6).
const SEARCH_DEBOUNCE_MS = 400;

interface SearchFieldProps {
  value: string;
  onCommit: (next: string) => void;
}

function AppRoleSearchField({ value, onCommit }: SearchFieldProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  // What this field last handed to the page, so an external change of `q` — the clear button of
  // the empty state, the back button — reseeds the input without the debounce committing it
  // straight back.
  const committedRef = useRef(value);

  useEffect(() => {
    if (value !== committedRef.current) {
      committedRef.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const next = text.trim().length >= SEARCH_MIN_LENGTH ? text.trim() : '';
      if (next === committedRef.current) {
        return;
      }
      committedRef.current = next;
      onCommit(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // Only the typed text re-arms the timer; `onCommit` is recreated on every render of the page
    // and would restart the debounce on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function handleClear() {
    setText('');
    committedRef.current = '';
    onCommit('');
  }

  const label = t('appRole.search.placeholder');

  return (
    <div className="flex items-center gap-2 md:w-80">
      <div className="relative flex-1">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="text"
          name="q"
          className="h-11 pl-8 md:h-8"
          value={text}
          aria-label={label}
          placeholder={label}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {text.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          className="touch-manipulation md:size-8"
          aria-label={t('appRole.search.clear')}
          onClick={handleClear}
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

interface RowActionsProps {
  row: AppRole;
  onEdit: (id: string) => void;
  onRetire: (id: string) => void;
  onActivate: (id: string) => void;
  onAudit: (id: string) => void;
}

// Its own component so each rendered row owns its `useCan()` call, the same precedent as every
// other entity's RowActions.
function AppRoleRowActions({ row, onEdit, onRetire, onActivate, onAudit }: RowActionsProps) {
  const { t } = useTranslation();
  const isSuperAdmin = useCan(ROLE_LEVELS.SUPERADMIN);

  // The two guards the backend enforces and this menu mirrors, because both are stable states
  // and not a count that changes under the user's feet: a system role answers 403
  // APPROLE_004_SYSTEM_ROLE / _005A_SYSTEM_ROLE below SUPERADMIN, and the SUPERADMIN role itself
  // answers 403 APPROLE_005A_SUPERADMIN_ROLE to everyone.
  const canTouchRole = !row.isSystemRole || isSuperAdmin;
  const canRetire = row.isActive && canTouchRole && row.code !== SUPERADMIN_ROLE_CODE;
  // ESAVI-APPROLE-005B is the one operation of the group that demands SUPERADMIN.
  const canActivate = !row.isActive && isSuperAdmin;
  // CONVENTIONS.md §10.4: the audit trail is SUPERADMIN-only in all 45 entities.
  const canViewAudit = isSuperAdmin;

  return (
    <>
      {canTouchRole && (
        <DropdownMenuItem onClick={() => onEdit(row.roleId)}>
          {t('common.actions.edit')}
        </DropdownMenuItem>
      )}
      {canRetire && (
        <DropdownMenuItem onClick={() => onRetire(row.roleId)}>
          {t('common.actions.deactivate')}
        </DropdownMenuItem>
      )}
      {canActivate && (
        <DropdownMenuItem onClick={() => onActivate(row.roleId)}>
          {t('common.actions.activate')}
        </DropdownMenuItem>
      )}
      {canViewAudit && (
        <DropdownMenuItem onClick={() => onAudit(row.roleId)}>
          {t('common.actions.audit')}
        </DropdownMenuItem>
      )}
    </>
  );
}

export function AppRoleListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const canCreate = useCan(ROLE_LEVELS.ADMIN);
  const canViewInactive = useCan(ROLE_LEVELS.ADMIN);

  const isSearching = q.trim().length >= SEARCH_MIN_LENGTH;
  // One typed term, both canonical parameters: the backend joins `name` and `code` with `Op.or`
  // (appRole.service.ts:77-88), so a single request matches either column (SPEC F52).
  const filters = isSearching ? { name: q.trim(), code: q.trim() } : undefined;

  // ESAVI-APPROLE-002A / 002B — the factory picks the route from the toggle and the role; the
  // page never names `roles/admin`. Ordered `level DESC, name ASC` by the backend, which is why
  // no sort control is offered.
  const list = appRoleResource.useList({ page, pageSize, includeInactive, filters });
  // ESAVI-APPROLE-005B — `hasActivate` defaults true, so this hook always exists.
  const activate = appRoleResource.useActivate!();

  const [auditId, setAuditId] = useState<string | null>(null);
  const [activateId, setActivateId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, setRetiringId] = useState<string | null>(null);

  const listError = list.error instanceof EsaviApiError ? list.error : null;

  function handleCommitSearch(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set('q', next);
    } else {
      params.delete('q');
    }
    params.delete('page');
    setSearchParams(params);
  }

  function handleIncludeInactiveChange(value: boolean) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('includeInactive', 'true');
    } else {
      params.delete('includeInactive');
    }
    params.delete('page');
    setSearchParams(params);
  }

  function handlePageChange(nextPage: number) {
    const params = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(nextPage));
    }
    setSearchParams(params);
  }

  function handleCreate() {
    setEditingId(null);
    setFormOpen(true);
  }

  function handleEdit(id: string) {
    setEditingId(id);
    setFormOpen(true);
  }

  function handleActivate() {
    if (!activateId) {
      return;
    }
    activate.mutate(activateId, {
      onSuccess: () => {
        toast.success(t('common.toast.activated'));
        setActivateId(null);
      },
      onError: (error) => {
        if (error instanceof EsaviApiError) {
          toast.error(getErrorMessage(error));
        }
        setActivateId(null);
      },
    });
  }

  const columns: ResourceTableColumn<AppRole>[] = [
    {
      key: 'name',
      header: 'appRole.columns.name',
      render: (row) => <span className="font-medium">{row.name}</span>,
      card: 'primary',
    },
    {
      key: 'level',
      header: 'appRole.columns.level',
      render: (row) => formatRoleLevel(row.level),
      card: 'secondary',
    },
    {
      key: 'systemRole',
      header: 'appRole.columns.systemRole',
      render: (row) =>
        row.isSystemRole ? (
          <Badge variant="secondary">{t('appRole.badges.systemRole')}</Badge>
        ) : (
          '—'
        ),
      card: 'meta',
    },
    {
      key: 'code',
      header: 'appRole.columns.code',
      render: (row) => row.code,
    },
    {
      key: 'description',
      header: 'appRole.columns.description',
      render: (row) => row.description,
    },
    {
      key: 'status',
      header: 'appRole.columns.status',
      render: (row) => (
        <Badge variant={row.isActive ? 'default' : 'destructive'}>
          {t(row.isActive ? 'appRole.status.active' : 'appRole.status.inactive')}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-medium text-foreground">{t('appRole.list.title')}</h1>

      <AppRoleSearchField value={q} onCommit={handleCommitSearch} />

      <ResourceTable<AppRole>
        columns={columns}
        data={list.data}
        idField="roleId"
        isLoading={list.isLoading}
        isError={list.isError}
        error={listError}
        onRetry={() => void list.refetch()}
        page={page}
        onPageChange={handlePageChange}
        inactiveMode="adminPath"
        includeInactive={includeInactive}
        onIncludeInactiveChange={canViewInactive ? handleIncludeInactiveChange : undefined}
        canCreate={canCreate}
        onCreate={handleCreate}
        createLabel="appRole.list.createLabel"
        emptyKey="appRole.list.empty"
        isFiltered={isSearching}
        emptyFilteredKey="appRole.list.emptySearch"
        onClearFilters={() => handleCommitSearch('')}
        clearFiltersLabel="appRole.search.clear"
        isRowInactive={(row) => !row.isActive}
        rowActions={(row) => (
          <AppRoleRowActions
            row={row}
            onEdit={handleEdit}
            onRetire={setRetiringId}
            onActivate={setActivateId}
            onAudit={setAuditId}
          />
        )}
      />

      <AppRoleFormDialog open={formOpen} roleId={editingId} onOpenChange={setFormOpen} />

      <AlertDialog
        open={activateId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActivateId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm.activate')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate}>
              {t('common.actions.activate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AppRoleAuditSheet
        open={auditId !== null}
        roleId={auditId}
        onOpenChange={(open) => {
          if (!open) {
            setAuditId(null);
          }
        }}
      />
    </div>
  );
}
