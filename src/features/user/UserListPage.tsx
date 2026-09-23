import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import type { UserListRow } from '@/contracts/declared/user';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceTable, type ResourceTableColumn } from '@/shared/components/ResourceTable';
import { Badge } from '@/shared/components/ui/badge';
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { SEARCH_MIN_LENGTH, useUserSearch, userResource } from './api';
import { UserAuditSheet } from './UserAuditSheet';
import { UserSearchField } from './UserSearchField';

function formatCreatedAt(value: string): string {
  return format(new Date(value), 'dd/MM/yyyy');
}

interface RowActionsProps {
  row: UserListRow;
  onAudit: (id: string) => void;
}

// Its own component so each rendered row owns its `useCan()` call, the same precedent as every
// other entity's RowActions. Editing and the lifecycle are not here: they live in the ficha, which
// is what the linked name opens (SPEC FE20 §3.1).
function UserRowActions({ row, onAudit }: RowActionsProps) {
  const { t } = useTranslation();
  // CONVENTIONS.md §10.4: the audit trail is SUPERADMIN-only in all 45 entities.
  const canViewAudit = useCan(ROLE_LEVELS.SUPERADMIN);

  if (!canViewAudit) {
    return null;
  }

  return (
    <DropdownMenuItem onClick={() => onAudit(row.userId)}>
      {t('common.actions.audit')}
    </DropdownMenuItem>
  );
}

export function UserListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = usePreferencesStore((state) => state.pageSize);
  const canViewInactive = useCan(ROLE_LEVELS.ADMIN);

  // Derived from `q`, never stored: a `mode` param could contradict the term it depends on.
  const isSearching = q.trim().length >= SEARCH_MIN_LENGTH;

  // ESAVI-USER-002A/002B — the factory picks the route from the toggle and the role; the page never
  // names `users/admin`. Left mounted while searching: its key doesn't change, so it issues no
  // request of its own and the roster is already there when the term is cleared.
  const list = userResource.useList({ page, pageSize, includeInactive });
  // ESAVI-USER-008 — its own `enabled` keeps it silent below two characters.
  const search = useUserSearch(isSearching ? q : '', { page, pageSize });
  const activeList = isSearching ? search : list;

  const searchError = search.error instanceof EsaviApiError ? search.error : null;
  const activeError = activeList.error instanceof EsaviApiError ? activeList.error : null;
  // `q` reached the minimum but tokenized to nothing — two dots, a string of combining marks. It is
  // neither a failed listing nor an empty result, so the table is not rendered at all and the field
  // explains it (§3.5, §5: never as "no results").
  const queryRequired = searchError?.code === 'USER_008_QUERY_REQUIRED';

  const [auditId, setAuditId] = useState<string | null>(null);

  // §3.5: the search and the inactive toggle are mutually exclusive, because `canViewInactive` on
  // the backend is SUPERADMIN-only (permissions.helper.ts:24-26) and an ADMIN searching with the
  // toggle on would watch rows vanish with no explanation. Committing a term clears the toggle.
  function handleCommitSearch(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set('q', next);
      params.delete('includeInactive');
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

  const columns: ResourceTableColumn<UserListRow>[] = [
    {
      key: 'displayName',
      header: 'user.columns.displayName',
      // The way into the ficha: a real link, so it opens in another tab and is reachable by
      // keyboard — which is also what gets passed to another administrator (§6).
      render: (row) => (
        <Link
          to={`/users/${row.userId}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {row.displayName}
        </Link>
      ),
      card: 'primary',
    },
    {
      key: 'email',
      header: 'user.columns.email',
      render: (row) => row.email,
      card: 'secondary',
    },
    {
      key: 'roles',
      header: 'user.columns.roles',
      render: (row) =>
        row.roles.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {row.roles.map((role) => (
              <Badge key={role.roleId} variant="secondary">
                {role.name}
              </Badge>
            ))}
          </span>
        ) : (
          '—'
        ),
      card: 'meta',
    },
    {
      key: 'username',
      header: 'user.columns.username',
      render: (row) => row.username ?? '—',
    },
    {
      key: 'phone',
      header: 'user.columns.phone',
      render: (row) => row.phone ?? '—',
    },
    {
      key: 'status',
      header: 'user.columns.status',
      render: (row) => (
        <Badge variant={row.isActive ? 'default' : 'destructive'}>
          {t(row.isActive ? 'user.status.active' : 'user.status.inactive')}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'user.columns.createdAt',
      // The only order the backend can give (`LIST_ORDER` is `createdAt DESC`): the names are
      // encrypted, so sorting by them would sort by ciphertext. No sort control is offered.
      render: (row) => formatCreatedAt(row.createdAt),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-medium text-foreground">{t('user.list.title')}</h1>

      <UserSearchField
        value={q}
        onCommit={handleCommitSearch}
        resultCount={search.data?.count}
        queryRequired={queryRequired}
      />

      {!queryRequired && (
        <ResourceTable<UserListRow>
          columns={columns}
          data={activeList.data}
          idField="userId"
          isLoading={activeList.isLoading}
          isError={activeList.isError}
          error={activeError}
          onRetry={() => void activeList.refetch()}
          page={page}
          onPageChange={handlePageChange}
          inactiveMode="adminPath"
          // Never offered while searching: the `008` has no inactive parameter at all (§3.2).
          includeInactive={isSearching ? undefined : includeInactive}
          onIncludeInactiveChange={
            !isSearching && canViewInactive ? handleIncludeInactiveChange : undefined
          }
          emptyKey="user.list.empty"
          isFiltered={isSearching}
          emptyFilteredKey="user.list.emptySearch"
          onClearFilters={() => handleCommitSearch('')}
          clearFiltersLabel="user.search.clear"
          isRowInactive={(row) => !row.isActive}
          rowActions={(row) => <UserRowActions row={row} onAudit={setAuditId} />}
        />
      )}

      <UserAuditSheet
        open={auditId !== null}
        userId={auditId}
        onOpenChange={(open) => {
          if (!open) {
            setAuditId(null);
          }
        }}
      />
    </div>
  );
}
