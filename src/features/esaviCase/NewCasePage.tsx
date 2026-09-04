import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';

// SPEC FE08 §3.1, §4 plan step 10. Placeholder for steps 1-2 — FE10 fills in the real
// patient/case-opening forms and the ESAVI-CASE-001 mutation. This spec only owns the
// navigation point: once the case is created, the wizard always resumes at `classification`
// (patient/case-opening aren't reachable through /esavi-cases/:id/wizard/:step, SPEC FE08 §3.1).
export function NewCasePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function handleCaseCreated(caseId: string) {
    navigate(`/esavi-cases/${caseId}/wizard/classification`);
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-medium text-foreground">{t('caseWizard.newCase.title')}</h1>

      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t('caseWizard.newCase.title')}
      </div>

      {/* Stand-in for the real ESAVI-CASE-001 mutation FE10 wires up — exists only to prove the
          navigation point works before there's a form to drive it. */}
      <Button
        variant="outline"
        className="self-start"
        onClick={() => handleCaseCreated('00000000-0000-0000-0000-000000000000')}
      >
        {t('caseWizard.newCase.testCreateButton')}
      </Button>
    </div>
  );
}
