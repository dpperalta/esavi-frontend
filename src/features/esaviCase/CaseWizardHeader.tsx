import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { esaviCaseResource } from './api';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';

interface CaseWizardHeaderProps {
  caseId: string;
}

// ESAVI-CASE-003 (case code, patient, health facility) + ESAVI-CASEFLOW-006 (workflow status,
// openedAt) — the two reads §3.2 names for the header.
export function CaseWizardHeader({ caseId }: CaseWizardHeaderProps) {
  const { t } = useTranslation();
  const caseDetail = esaviCaseResource.useOne(caseId);
  const workflow = useCaseWorkflow(caseId);

  if (!caseDetail.data || !workflow.data) {
    return (
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  const { caseCode, patient, healthFacility } = caseDetail.data;
  const { status, openedAt } = workflow.data;

  return (
    <div className="flex flex-col gap-1 border-b border-border pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-medium text-foreground">{caseCode}</h1>
        <span className="sr-only">{t('caseWizard.header.status')}</span>
        <Badge variant={status.code === 'CLOSED' ? 'outline' : 'default'}>{status.name}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {patient.names} {patient.lastNames} · {healthFacility.name}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('caseWizard.header.openedAt')}: {format(new Date(openedAt), 'dd/MM/yyyy')}
      </p>
    </div>
  );
}
