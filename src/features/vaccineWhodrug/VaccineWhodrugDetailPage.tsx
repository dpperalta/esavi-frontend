import { ArrowLeft, History, Pencil } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { cn } from '@/shared/lib/utils';
import { vaccineWhodrugResource } from './api';
import { VACCINE_WHODRUG_SECTIONS, type VaccineWhodrugField } from './sections';
import { VaccineWhodrugAuditSheet } from './VaccineWhodrugAuditSheet';

const LIST_PATH = '/whodrug-vaccines';

function EmptyValue() {
  const { t } = useTranslation();
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t('vaccineWhodrug.detail.empty')}</span>
    </>
  );
}

function FieldValue({
  vaccine,
  field,
}: {
  vaccine: VaccineWhodrugDetail;
  field: VaccineWhodrugField;
}) {
  const { t } = useTranslation();
  const value = vaccine[field];

  if (value === null || value === '') {
    return <EmptyValue />;
  }
  if (typeof value === 'boolean') {
    return <>{t(value ? 'vaccineWhodrug.filters.yes' : 'vaccineWhodrug.filters.no')}</>;
  }
  return <>{String(value)}</>;
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {VACCINE_WHODRUG_SECTIONS.map((section) => (
          <Skeleton key={section.key} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// SPEC FE25c §3.1: the read-only ficha of the 28 columns, reachable with USER. It has a URL of its
// own, and is the only place USER sees the columns the listing leaves out.
export function VaccineWhodrugDetailPage() {
  const { t } = useTranslation();
  const titleId = useId();
  const { id } = useParams<{ id: string }>();
  const vaccineWhodrugId = id ?? '';
  // ESAVI-WHODRUG-003 — the entry `useVaccineWhodrugTree` shares (SPEC FE25c §3.4).
  const vaccine = vaccineWhodrugResource.useOne(vaccineWhodrugId);
  const isAdmin = useCan(ROLE_LEVELS.ADMIN);
  const isSuperadmin = useCan(ROLE_LEVELS.SUPERADMIN);
  const [auditOpen, setAuditOpen] = useState(false);

  if (vaccine.isLoading) {
    return <DetailSkeleton />;
  }

  // WHODRUG_003_NOT_FOUND — also what ADMIN gets for an inactive row (SPEC FE25c §3.1, §3.6).
  if (vaccine.error instanceof EsaviApiError && vaccine.error.status === 404) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('vaccineWhodrug.detail.notFound')}</p>
        <Button asChild variant="outline" size="touch">
          <Link to={LIST_PATH}>{t('vaccineWhodrug.detail.back')}</Link>
        </Button>
      </div>
    );
  }

  if (vaccine.isError || !vaccine.data) {
    const message =
      vaccine.error instanceof EsaviApiError
        ? getErrorMessage(vaccine.error)
        : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
        <Button type="button" variant="outline" size="touch" onClick={() => void vaccine.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  const detail = vaccine.data;
  const canEdit = (isAdmin && detail.isActive) || isSuperadmin;

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-4">
        <Link
          to={LIST_PATH}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('vaccineWhodrug.detail.back')}
        </Link>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs text-muted-foreground">{t('vaccineWhodrug.detail.title')}</p>
            <h1
              id={titleId}
              className="text-xl font-medium text-balance break-words text-foreground"
            >
              {detail.drugName}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {detail.drugCode && (
                <span className="font-mono text-sm break-all text-muted-foreground">
                  {detail.drugCode}
                </span>
              )}
              <Badge variant={detail.isActive ? 'outline' : 'destructive'}>
                {t(
                  detail.isActive
                    ? 'vaccineWhodrug.status.active'
                    : 'vaccineWhodrug.status.inactive',
                )}
              </Badge>
              {detail.isPreferred && (
                <Badge variant="secondary">{t('vaccineWhodrug.status.preferred')}</Badge>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="touch">
                <Link to={`${LIST_PATH}/${detail.vaccineWhodrugId}/edit`}>
                  <Pencil aria-hidden="true" />
                  {t('vaccineWhodrug.detail.edit')}
                </Link>
              </Button>
              {isSuperadmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={() => setAuditOpen(true)}
                >
                  <History aria-hidden="true" />
                  {t('vaccineWhodrug.detail.audit')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* §3.7: one column below md, two above. */}
      <div className="grid gap-4 md:grid-cols-2">
        {VACCINE_WHODRUG_SECTIONS.map((section) => {
          const headingId = `${titleId}-${section.key}`;
          return (
            <Card key={section.key} className={cn(section.key === 'notes' && 'md:col-span-2')}>
              <CardContent>
                <section aria-labelledby={headingId} className="flex flex-col gap-3">
                  <h2 id={headingId} className="font-heading text-base font-medium">
                    {t(`vaccineWhodrug.sections.${section.key}`)}
                  </h2>
                  <dl className="flex flex-col gap-3">
                    {section.fields.map((field) => (
                      <div key={field} className="flex min-w-0 flex-col gap-0.5">
                        <dt className="text-xs text-muted-foreground">
                          {t(`vaccineWhodrug.fields.${field}`)}
                        </dt>
                        <dd className="text-sm break-words whitespace-pre-wrap text-foreground">
                          <FieldValue vaccine={detail} field={field} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isSuperadmin && (
        <VaccineWhodrugAuditSheet
          open={auditOpen}
          onOpenChange={setAuditOpen}
          vaccineWhodrugId={detail.vaccineWhodrugId}
        />
      )}
    </div>
  );
}
