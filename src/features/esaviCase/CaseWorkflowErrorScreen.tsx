import { FileQuestion, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import type { EsaviApiError } from '@/shared/api/types';
import { esaviCaseResource } from './api';

// SPEC FE08 §3.6: the two 006 errors are distinguished by `code`, never by `message` — that's
// exactly why F44 kept them separate (§3.5 of that spec).
const CASE_NOT_FOUND_CODE = 'CASEFLOW_006_CASE_NOT_FOUND';
const WORKFLOW_MISSING_CODE = 'CASEFLOW_006_NOT_FOUND';

function CaseNotFoundScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
      <FileQuestion aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{t('caseWizard.error.caseNotFound')}</p>
      <Button variant="outline" onClick={() => navigate('/esavi-cases')}>
        {t('caseWizard.error.backToList')}
      </Button>
    </div>
  );
}

interface CaseWorkflowMissingScreenProps {
  caseId: string;
}

function CaseWorkflowMissingScreen({ caseId }: CaseWorkflowMissingScreenProps) {
  const { t } = useTranslation();
  // 003 runs independently of 006 (§3.2) and this is the one 006 error where the case itself
  // is known to exist — falls back to the raw id while that read is still in flight.
  const caseDetail = esaviCaseResource.useOne(caseId);
  const caseCode = caseDetail.data?.caseCode ?? caseId;

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
      <ShieldAlert aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{t('caseWizard.error.workflowMissing')}</p>
      <p className="text-sm text-muted-foreground">
        {t('caseWizard.error.workflowMissingDescription', { caseCode })}
      </p>
    </div>
  );
}

// Lets CaseWizardPage (plan step 9) decide, before rendering, whether it owes this error a
// dedicated screen or the generic one.
export function hasDedicatedCaseWorkflowErrorScreen(code: string): boolean {
  return code === CASE_NOT_FOUND_CODE || code === WORKFLOW_MISSING_CODE;
}

interface CaseWorkflowErrorScreenProps {
  error: EsaviApiError;
  caseId: string;
}

// Selects the dedicated screen for either 006 error and mounts it — null for anything else,
// so the caller (CaseWizardPage, plan step 9) falls through to the generic error state.
export function CaseWorkflowErrorScreen({ error, caseId }: CaseWorkflowErrorScreenProps) {
  if (error.code === CASE_NOT_FOUND_CODE) {
    return <CaseNotFoundScreen />;
  }
  if (error.code === WORKFLOW_MISSING_CODE) {
    return <CaseWorkflowMissingScreen caseId={caseId} />;
  }
  return null;
}
