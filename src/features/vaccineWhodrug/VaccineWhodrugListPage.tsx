import { FilterIcon, Upload } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
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
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/components/ui/sheet';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { vaccineWhodrugResource } from './api';
import { VaccineWhodrugAuditSheet } from './VaccineWhodrugAuditSheet';
import {
  VaccineWhodrugRowActions,
  type VaccineWhodrugConfirmAction,
} from './VaccineWhodrugRowActions';

const DEBOUNCE_MS = 400;
// Below this the backend answers 400 (vaccineWhodrug.validator.ts), so the term never travels.
const SEARCH_MIN_LENGTH = 2;
const LIST_PATH = '/whodrug-vaccines';
const IMPORT_PATH = '/whodrug-vaccines/import';
const CREATE_PATH = '/whodrug-vaccines/new';

type BooleanFilter = 'true' | 'false';

function parseBooleanFilter(value: string | null): BooleanFilter | null {
  return value === 'true' || value === 'false' ? value : null;
}

// A typing buffer for a text filter that lives in `searchParams` (SPEC FE25c §3.4): the input is
// local, and the URL is written once the user stops typing. Writing a value clears `page`.
function useDebouncedParam(key: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [buffer, setBuffer] = useState(searchParams.get(key) ?? '');

  useEffect(() => {
    const timeout = setTimeout(() => {
      // The functional form reads the URL at write time, so another filter changed while this
      // one was being typed is not overwritten.
      setSearchParams((current) => {
        if (buffer === (current.get(key) ?? '')) {
          return current;
        }
        const next = new URLSearchParams(current);
        if (buffer) {
          next.set(key, buffer);
        } else {
          next.delete(key);
        }
        next.delete('page');
        return next;
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // Re-runs only when the typed value changes — `searchParams` would refire it on every
    // navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer]);

  return [buffer, setBuffer] as const;
}

interface BooleanFilterSelectProps {
  label: string;
  value: BooleanFilter | null;
  onChange: (value: BooleanFilter | null) => void;
}

function BooleanFilterSelect({ label, value, onChange }: BooleanFilterSelectProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5 md:w-40">
      <Label>{label}</Label>
      <Select value={value ?? ''} onValueChange={(next) => onChange(parseBooleanFilter(next))}>
        <SelectTrigger
          className="min-h-11 w-full md:min-h-8"
          aria-label={label}
          onClear={value ? () => onChange(null) : undefined}
        >
          <SelectValue placeholder={t('vaccineWhodrug.filters.all')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{t('vaccineWhodrug.filters.yes')}</SelectItem>
          <SelectItem value="false">{t('vaccineWhodrug.filters.no')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

interface FilterFieldsProps {
  iso3CodeInput: string;
  onIso3CodeInputChange: (value: string) => void;
  isPreferred: BooleanFilter | null;
  onIsPreferredChange: (value: BooleanFilter | null) => void;
  isGeneric: BooleanFilter | null;
  onIsGenericChange: (value: BooleanFilter | null) => void;
}

// Rendered twice — inline from md up, inside the filters Sheet below it — so ids come from useId.
function FilterFields({
  iso3CodeInput,
  onIso3CodeInputChange,
  isPreferred,
  onIsPreferredChange,
  isGeneric,
  onIsGenericChange,
}: FilterFieldsProps) {
  const { t } = useTranslation();
  const iso3CodeId = useId();
  const iso3CodeHintId = useId();

  return (
    <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start">
      <div className="flex flex-col gap-1.5 md:w-44">
        <Label htmlFor={iso3CodeId}>{t('vaccineWhodrug.filters.iso3Code')}</Label>
        <Input
          id={iso3CodeId}
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 md:min-h-8"
          value={iso3CodeInput}
          onChange={(event) => onIso3CodeInputChange(event.target.value)}
          aria-describedby={iso3CodeHintId}
        />
        <p id={iso3CodeHintId} className="text-xs text-muted-foreground">
          {t('vaccineWhodrug.filters.iso3CodeHint')}
        </p>
      </div>
      <BooleanFilterSelect
        label={t('vaccineWhodrug.filters.isPreferred')}
        value={isPreferred}
        onChange={onIsPreferredChange}
      />
      <BooleanFilterSelect
        label={t('vaccineWhodrug.filters.isGeneric')}
        value={isGeneric}
        onChange={onIsGenericChange}
      />
    </div>
  );
}

export function VaccineWhodrugListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = useCan(ROLE_LEVELS.ADMIN);
  const isSuperAdmin = useCan(ROLE_LEVELS.SUPERADMIN);
  const pageSize = usePreferencesStore((state) => state.pageSize);

  const q = searchParams.get('q') ?? '';
  const iso3Code = (searchParams.get('iso3Code') ?? '').trim();
  const isPreferred = parseBooleanFilter(searchParams.get('isPreferred'));
  const isGeneric = parseBooleanFilter(searchParams.get('isGeneric'));
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const [searchInput, setSearchInput] = useDebouncedParam('q');
  const [iso3CodeInput, setIso3CodeInput] = useDebouncedParam('iso3Code');
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    action: VaccineWhodrugConfirmAction;
  } | null>(null);

  const term = q.trim();
  const isSearching = term.length >= SEARCH_MIN_LENGTH;
  // The backend ORs `name` (drugName) and `code` (drugCode), so one box travels in both. Never
  // `search`, the frozen alias of SPEC F52, and never `language` (SPEC FE25c §2).
  const filters = useMemo(() => {
    const next: Record<string, string> = {};
    if (isSearching) {
      next.name = term;
      next.code = term;
    }
    if (iso3Code) next.iso3Code = iso3Code;
    if (isPreferred) next.isPreferred = isPreferred;
    if (isGeneric) next.isGeneric = isGeneric;
    return Object.keys(next).length > 0 ? next : undefined;
  }, [isSearching, term, iso3Code, isPreferred, isGeneric]);

  // ESAVI-WHODRUG-002A / ESAVI-WHODRUG-002B — the factory picks the route from the role and the
  // toggle (CONVENTIONS.md §6.5).
  const list = vaccineWhodrugResource.useList({ page, pageSize, includeInactive, filters });
  // ESAVI-WHODRUG-005A / ESAVI-WHODRUG-005B
  const deactivate = vaccineWhodrugResource.useDeactivate();
  const activate = vaccineWhodrugResource.useActivate!();

  const activeFilterCount = [iso3Code, isPreferred, isGeneric].filter(Boolean).length;
  const isFiltered = isSearching || activeFilterCount > 0;

  function updateParams(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    next.delete('page');
    setSearchParams(next);
  }

  function setBooleanParam(key: 'isPreferred' | 'isGeneric', value: BooleanFilter | null) {
    updateParams((next) => (value ? next.set(key, value) : next.delete(key)));
  }

  function handleIncludeInactiveChange(value: boolean) {
    updateParams((next) =>
      value ? next.set('includeInactive', 'true') : next.delete('includeInactive'),
    );
  }

  // §3.6: clears every filter but keeps the toggle.
  function handleClearFilters() {
    setSearchInput('');
    setIso3CodeInput('');
    updateParams((next) => {
      next.delete('q');
      next.delete('iso3Code');
      next.delete('isPreferred');
      next.delete('isGeneric');
    });
  }

  function handlePageChange(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(nextPage));
    }
    setSearchParams(next);
  }

  function handleConfirm() {
    if (!confirmTarget) {
      return;
    }
    const isDeactivate = confirmTarget.action === 'deactivate';
    const mutation = isDeactivate ? deactivate : activate;
    mutation.mutate(confirmTarget.id, {
      onSuccess: () => {
        toast.success(t(isDeactivate ? 'common.toast.deactivated' : 'common.toast.activated'));
        setConfirmTarget(null);
      },
      onError: (error) => {
        toast.error(
          error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'),
        );
        setConfirmTarget(null);
      },
    });
  }

  const preferredBadge = <Badge variant="secondary">{t('vaccineWhodrug.status.preferred')}</Badge>;

  const columns: ResourceTableColumn<VaccineWhodrugDetail>[] = [
    {
      key: 'drugName',
      header: 'vaccineWhodrug.fields.drugName',
      // §3.1: the way into the detail is a real link — Tab + Enter, and it opens in another tab.
      // A row the `003` would answer 404 (inactive, seen by ADMIN) stays plain text, unfocusable.
      render: (row) =>
        row.isActive || isSuperAdmin ? (
          <Link
            to={`${LIST_PATH}/${row.vaccineWhodrugId}`}
            className="block max-w-full font-medium break-words text-primary underline-offset-4 hover:underline md:max-w-sm"
          >
            {row.drugName}
          </Link>
        ) : (
          <span className="block max-w-full break-words md:max-w-sm">{row.drugName}</span>
        ),
      card: 'primary',
    },
    {
      key: 'drugCode',
      header: 'vaccineWhodrug.fields.drugCode',
      render: (row) => <span className="font-mono text-xs">{row.drugCode ?? '—'}</span>,
      card: 'secondary',
    },
    {
      key: 'maHolders',
      header: 'vaccineWhodrug.fields.maHolders',
      render: (row) => (
        <span className="block max-w-full break-words md:max-w-xs">{row.maHolders ?? '—'}</span>
      ),
      card: 'meta',
    },
    {
      key: 'strength',
      header: 'vaccineWhodrug.fields.strength',
      render: (row) => row.strength ?? '—',
      card: 'meta',
    },
    {
      key: 'iso3Code',
      header: 'vaccineWhodrug.fields.iso3Code',
      render: (row) => row.iso3Code ?? '—',
    },
    {
      key: 'isPreferred',
      header: 'vaccineWhodrug.fields.isPreferred',
      render: (row) => (row.isPreferred ? preferredBadge : null),
      card: 'meta',
    },
    {
      key: 'isActive',
      header: 'vaccineWhodrug.fields.isActive',
      render: (row) => (
        <Badge variant={row.isActive ? 'default' : 'destructive'}>
          {t(row.isActive ? 'vaccineWhodrug.status.active' : 'vaccineWhodrug.status.inactive')}
        </Badge>
      ),
      // In the card too: the tint alone doesn't say "inactive" (CONVENTIONS.md §10.1).
      card: 'meta',
    },
  ];

  const filterFields = (
    <FilterFields
      iso3CodeInput={iso3CodeInput}
      onIso3CodeInputChange={setIso3CodeInput}
      isPreferred={isPreferred}
      onIsPreferredChange={(value) => setBooleanParam('isPreferred', value)}
      isGeneric={isGeneric}
      onIsGenericChange={(value) => setBooleanParam('isGeneric', value)}
    />
  );

  const importButton = (
    <Button asChild variant="outline" size="touch" className="md:h-8">
      <Link to={IMPORT_PATH}>
        <Upload aria-hidden="true" />
        {t('vaccineWhodrug.list.import')}
      </Link>
    </Button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium text-foreground">{t('vaccineWhodrug.list.title')}</h1>
        {isSuperAdmin && importButton}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 md:w-96">
          <Label htmlFor="vaccine-whodrug-search">{t('vaccineWhodrug.filters.search')}</Label>
          <Input
            id="vaccine-whodrug-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 md:min-h-8"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-describedby="vaccine-whodrug-search-hint"
          />
          <p id="vaccine-whodrug-search-hint" className="text-xs text-muted-foreground">
            {t('vaccineWhodrug.filters.searchHint')}
          </p>
        </div>

        <div className="hidden md:block">{filterFields}</div>

        <div className="md:hidden">
          <Sheet open={filtersSheetOpen} onOpenChange={setFiltersSheetOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="touch">
                <FilterIcon aria-hidden="true" />
                {t('vaccineWhodrug.filters.open')}
                {activeFilterCount > 0 && <Badge variant="default">{activeFilterCount}</Badge>}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{t('vaccineWhodrug.filters.open')}</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4">{filterFields}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <ResourceTable<VaccineWhodrugDetail>
        columns={columns}
        data={list.data}
        idField="vaccineWhodrugId"
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error instanceof EsaviApiError ? list.error : null}
        onRetry={() => void list.refetch()}
        page={page}
        onPageChange={handlePageChange}
        inactiveMode="adminPath"
        includeInactive={includeInactive}
        onIncludeInactiveChange={handleIncludeInactiveChange}
        canCreate={isAdmin}
        onCreate={() => navigate(CREATE_PATH)}
        createLabel="vaccineWhodrug.list.create"
        emptyKey="vaccineWhodrug.list.empty"
        emptyExtraAction={isSuperAdmin ? importButton : undefined}
        isFiltered={isFiltered}
        emptyFilteredKey="vaccineWhodrug.list.emptyFiltered"
        onClearFilters={handleClearFilters}
        clearFiltersLabel="vaccineWhodrug.list.clearFilters"
        isRowInactive={(row) => !row.isActive}
        rowActions={(row) => (
          <VaccineWhodrugRowActions
            row={row}
            onAudit={setAuditId}
            onConfirm={(id, action) => setConfirmTarget({ id, action })}
          />
        )}
        rowActionsLabel="vaccineWhodrug.actions.menu"
        // ADMIN on an inactive row has nothing: no «Ver», no «Editar», no reactivation — no empty
        // menu (§3.1).
        hasRowActions={(row) => row.isActive || isSuperAdmin}
      />

      {isSuperAdmin && (
        <VaccineWhodrugAuditSheet
          open={auditId !== null}
          vaccineWhodrugId={auditId}
          onOpenChange={(open) => {
            if (!open) {
              setAuditId(null);
            }
          }}
        />
      )}

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
