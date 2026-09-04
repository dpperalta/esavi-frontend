import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { esaviCaseResource } from '@/features/esaviCase/api';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { EsaviCaseNotFound } from '@/features/esaviCase/EsaviCaseNotFound';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';

function formatDate(value: string | null): string {
  return value ? format(new Date(`${value}T00:00:00`), 'dd/MM/yyyy') : '—';
}

// `details` has no length limit on the backend (esaviCase.validator.ts only checks it's a
// string) — the truncation is a client-only display choice, not a rule the server enforces.
const DETAILS_MAX_WORDS = 200;

function truncateWords(text: string | null, maxWords: number): string | null {
  if (!text) return null;
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(' ')}…`;
}

interface WorkflowStatusBlockProps {
  caseId: string;
}

// ESAVI-CASEFLOW-006 — its own read, its own skeleton (§3.6): a slow or failed workflow read
// never blocks the summary above it, which comes from a separate query (003).
function WorkflowStatusBlock({ caseId }: WorkflowStatusBlockProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workflow = useCaseWorkflow(caseId);

  if (workflow.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  // A failed 006 never blocks the 003's own detail (§3.6): the button re-enables without a
  // status label and lets the wizard resolve the reanudación itself on load (FE08 §3.2).
  if (workflow.isError) {
    return (
      <Button type="button" onClick={() => navigate(`/esavi-cases/${caseId}/wizard`)}>
        {t('esaviCase.detail.openCase')}
      </Button>
    );
  }

  const isClosed = workflow.data.status.code === 'CLOSED';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="sr-only">{t('esaviCase.detail.workflowStatus')}</span>
        <Badge variant={isClosed ? 'outline' : 'default'}>{workflow.data.status.name}</Badge>
      </div>
      <Button type="button" onClick={() => navigate(`/esavi-cases/${caseId}/wizard`)}>
        {t(isClosed ? 'esaviCase.detail.viewCaseReadOnly' : 'esaviCase.detail.openCase')}
      </Button>
    </div>
  );
}

// GET /api/esavi-cases/:id (ESAVI-CASE-003) — the read-only summary the «Ver/editar» menu opens
// into. No form, no `useUpdate`: editing a case is the wizard's second step (FE10, SPEC FE09
// §2), and this page only ever links to it.
export function EsaviCaseDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const caseDetail = esaviCaseResource.useOne(id ?? '');
  const canViewAudit = useCan(ROLE_LEVELS.SUPERADMIN);

  if (caseDetail.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (caseDetail.error instanceof EsaviApiError && caseDetail.error.status === 404) {
    return (
      <div className="p-4 md:p-6">
        <EsaviCaseNotFound />
      </div>
    );
  }

  if (caseDetail.isError || !caseDetail.data) {
    const message =
      caseDetail.error instanceof EsaviApiError
        ? getErrorMessage(caseDetail.error)
        : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-destructive">{message}</p>
        <Button type="button" variant="outline" onClick={() => void caseDetail.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  const {
    caseCode,
    patient,
    healthFacility,
    reportDate,
    eventDate,
    reportFillingDate,
    countryIsoCode,
    notificationOrganization,
    details,
    appDetails,
  } = caseDetail.data;
  const truncatedDetails = truncateWords(details, DETAILS_MAX_WORDS);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium text-foreground">{caseCode}</h1>
        <Button type="button" variant="outline" onClick={() => navigate('/esavi-cases')}>
          {t('esaviCase.detail.backToList')}
        </Button>
      </div>

      <WorkflowStatusBlock caseId={caseDetail.data.caseId} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-base font-medium text-foreground">{t('esaviCase.detail.patient')}</h2>
            <p className="text-sm text-foreground">
              {patient.names} {patient.lastNames}
            </p>
            <p className="text-sm text-muted-foreground">{patient.documentNumber}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-base font-medium text-foreground">{t('esaviCase.detail.healthFacility')}</h2>
            <p className="text-sm text-foreground">{healthFacility.name}</p>
            <p className="text-sm text-muted-foreground">{healthFacility.localCode}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-base font-medium text-foreground">{t('esaviCase.detail.dates')}</h2>
            <p className="text-sm text-foreground">
              {t('esaviCase.detail.reportDate')}: {formatDate(reportDate)}
            </p>
            <p className="text-sm text-foreground">
              {t('esaviCase.detail.eventDate')}: {formatDate(eventDate)}
            </p>
            <p className="text-sm text-foreground">
              {t('esaviCase.detail.reportFillingDate')}: {formatDate(reportFillingDate)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-base font-medium text-foreground">{t('esaviCase.detail.notification')}</h2>
            <p className="text-sm text-foreground">
              {t('esaviCase.detail.countryIsoCode')}: {countryIsoCode ?? '—'}
            </p>
            <p className="text-sm text-foreground">
              {t('esaviCase.detail.notificationOrganization')}: {notificationOrganization ?? '—'}
            </p>
            <p className="text-sm text-muted-foreground">{truncatedDetails ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      {canViewAudit && (
        <Card>
          <CardContent>
            <AuditTrail appDetails={appDetails} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
