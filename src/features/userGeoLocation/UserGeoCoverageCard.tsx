import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { enUS, es, nl } from 'date-fns/locale';
import type { GeoAssignment } from '@/contracts/declared/userGeoLocation';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { cn } from '@/shared/lib/utils';
import type { Language } from '@/shared/stores/preferences.types';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { AddGeoAssignmentsDialog } from './AddGeoAssignmentsDialog';
import { useGeoAssignmentsByUser } from './api';
import { CoverageSummary } from './CoverageSummary';

const DATE_FNS_LOCALES: Record<Language, typeof es> = { es, en: enUS, nl };

// The block's own page size. It is not the `pageSize` preference: that one governs the entity
// listings, and a card inside a ficha is not one of them.
const PAGE_SIZE = 10;

type AssignmentStatus = 'current' | 'expired' | 'closed';

// The three states of §3.6, and the reason this spec exists: an ACTIVE row whose `validTo` has
// passed covers nothing. Painted as current it would be indistinguishable from one that does, and
// nobody would understand why the user stopped seeing their cases.
function assignmentStatus(row: GeoAssignment, now: number): AssignmentStatus {
  if (!row.isActive) return 'closed';
  if (row.validTo && new Date(row.validTo).getTime() <= now) return 'expired';
  return 'current';
}

const STATUS_BADGE_VARIANT: Record<AssignmentStatus, 'default' | 'secondary' | 'destructive'> = {
  current: 'default',
  expired: 'secondary',
  closed: 'destructive',
};

// `validFrom` and `validTo` are timestamptz, but the hour is never exposed: whoever assigns a
// territory thinks in days (§3.5). Same date-fns + active locale as <AuditTrail> (§3.7).
function formatDay(value: string, language: Language): string {
  return format(new Date(value), 'd MMM yyyy', { locale: DATE_FNS_LOCALES[language] });
}

interface UserGeoCoverageCardProps {
  userId: string;
}

export function UserGeoCoverageCard({ userId }: UserGeoCoverageCardProps) {
  const { t } = useTranslation();
  const language = usePreferencesStore((state) => state.language);
  const [searchParams, setSearchParams] = useSearchParams();
  // Its own name, not the `includeInactive` of the user listing: the two toggles share the URL of
  // `/users/:id` and would otherwise read each other's value (§3.4).
  const coverageAll = searchParams.get('coverageAll') === 'true';
  // The only piece of this block's state that is not in the URL, declared as an exception in §3.4:
  // the ficha already has a link of its own, and the page of one of its cards is not shared.
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  // ESAVI-USERGEO-007 is ADMIN in the inventory, same as the ficha's own guard.
  const canEdit = useCan(ROLE_LEVELS.ADMIN);

  // ESAVI-USERGEO-002A with the toggle off, ESAVI-USERGEO-002B with it on — the hook carries both
  // dimensions, the route and `?current=`.
  const assignments = useGeoAssignmentsByUser(userId, { page, pageSize: PAGE_SIZE, coverageAll });

  function handleToggle(next: boolean) {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set('coverageAll', 'true');
    } else {
      params.delete('coverageAll');
    }
    setSearchParams(params, { replace: true });
    setPage(1);
  }

  const rows = assignments.data?.rows ?? [];
  const count = assignments.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  // Read once per render and not per row, so two rows of the same list can never fall on opposite
  // sides of the same instant.
  const now = Date.now();

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-pretty">{t('userGeoLocation.title')}</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          {/* The whole label is the hit target, and `min-h-11` gives it the 44px the switch alone
              does not reach (CONVENTIONS.md §10.2). */}
          <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={coverageAll}
              onCheckedChange={handleToggle}
              aria-label={t('userGeoLocation.showAll')}
            />
            <span>{t('userGeoLocation.showAll')}</span>
          </label>
          {/* Hidden, not disabled, for a role that will never be able to press it (§4.4). */}
          {canEdit && (
            <Button type="button" variant="outline" onClick={() => setAddOpen(true)}>
              {t('userGeoLocation.add.title')}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <CoverageSummary userId={userId} />

        {assignments.isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!assignments.isLoading && assignments.isError && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">
              {assignments.error instanceof EsaviApiError
                ? getErrorMessage(assignments.error)
                : t('userGeoLocation.error')}
            </p>
            <Button type="button" variant="outline" onClick={() => void assignments.refetch()}>
              {t('common.table.retry')}
            </Button>
          </div>
        )}

        {!assignments.isLoading && !assignments.isError && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t(coverageAll ? 'userGeoLocation.emptyAll' : 'userGeoLocation.empty')}
          </p>
        )}

        {rows.length > 0 && (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => {
              const status = assignmentStatus(row, now);
              return (
                <li
                  key={row.userGeoLocationId}
                  className={cn(
                    'flex flex-col gap-2 rounded-md border border-border p-3 md:flex-row md:items-center md:justify-between',
                    // Same tint a closed row gets in every listing of the app (CONVENTIONS.md
                    // §10.1): a badge at the end of a dense list is missed when scanning.
                    status === 'closed' && 'bg-destructive/5',
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words text-sm font-medium text-foreground">
                        {row.geoLocation.name}
                      </span>
                      <Badge variant={STATUS_BADGE_VARIANT[status]}>
                        {t(`userGeoLocation.badges.${status}`)}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t('userGeoLocation.columns.level')} {row.geoLocation.level}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 md:items-end">
                    <span className="text-xs text-muted-foreground">
                      {t('userGeoLocation.columns.validity')}
                    </span>
                    <span className="text-sm tabular-nums text-foreground">
                      {formatDay(row.validFrom, language)}
                      {' — '}
                      {row.validTo
                        ? formatDay(row.validTo, language)
                        : t('userGeoLocation.validity.open')}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {count > PAGE_SIZE && (
          <nav aria-label={t('common.table.pagination')}>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {t('common.table.previous')}
              </Button>
              <span aria-current="page" className="text-sm text-muted-foreground">
                {t('common.table.pageStatus', { page, pages: totalPages, count })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                {t('common.table.next')}
              </Button>
            </div>
          </nav>
        )}
      </CardContent>

      <AddGeoAssignmentsDialog open={addOpen} onOpenChange={setAddOpen} userId={userId} />
    </Card>
  );
}
