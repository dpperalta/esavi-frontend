import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { investigationByCaseKey, investigationResource, useInvestigationByCase } from '@/features/investigation/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';

function InvestigationStepSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

interface InvestigationCreateErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

// Estado propio de §3.8: si el `POST` vacío que crea la cabecera falla, no hay dónde colgar
// ningún formulario todavía — se muestra el error con reintento, nunca las tres secciones a
// medio construir.
function InvestigationCreateErrorState({ error, onRetry }: InvestigationCreateErrorStateProps) {
  const { t } = useTranslation();
  const message =
    error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected');

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
      <p className="text-sm font-medium text-foreground">{t('investigation.error.createFailed')}</p>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

export interface InvestigationStepProps {
  caseId: string;
}

// Paso 5 del asistente (SPEC FE13a). Reemplaza el marcador de posición del slug `investigation`
// en `CaseWizardPage` (FE08, §4 paso 9). Este paso todavía está "vacío pero vivo" (§4 plan paso
// 6): crea la cabecera al entrar y deja los tres satélites listos para las secciones que añaden
// los pasos 7, 8, 9 y 10 — ninguna se pinta todavía.
export function InvestigationStep({ caseId }: InvestigationStepProps) {
  const queryClient = useQueryClient();
  const workflow = useCaseWorkflow(caseId);
  const stageExists = workflow.data?.stages.investigation.exists === true;
  const investigation = useInvestigationByCase(caseId, stageExists);
  const create = investigationResource.useCreate();

  // Guarda contra un segundo `POST` en el mismo montaje — el doble efecto de StrictMode en
  // desarrollo, o un nuevo render mientras la mutación todavía está en vuelo (§5 criterio: "un
  // solo POST"). Se limpia a mano en `handleRetry`, nunca por un efecto que dependa de `create`.
  const attemptedCaseIdRef = useRef<string | null>(null);

  function createHeader() {
    attemptedCaseIdRef.current = caseId;
    create.mutate(
      { caseId },
      {
        onSuccess: (created) => {
          queryClient.setQueryData(investigationByCaseKey(caseId), created);
          // `stages.investigation.exists` acaba de cambiar — sin esto el stepper y la
          // reanudación seguirían viendo el paso 5 como no iniciado (SPEC FE13a §3.4).
          void queryClient.invalidateQueries({ queryKey: ['caseWorkflow', 'byCase', caseId] });
        },
      },
    );
  }

  useEffect(() => {
    if (!workflow.data || stageExists) {
      return;
    }
    if (attemptedCaseIdRef.current === caseId) {
      return;
    }
    createHeader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.data, stageExists, caseId]);

  function handleRetry() {
    attemptedCaseIdRef.current = null;
    create.reset();
    createHeader();
  }

  if (!workflow.data) {
    return <InvestigationStepSkeleton />;
  }

  if (!stageExists) {
    if (create.isError) {
      return <InvestigationCreateErrorState error={create.error} onRetry={handleRetry} />;
    }
    return <InvestigationStepSkeleton />;
  }

  if (investigation.isLoading) {
    return <InvestigationStepSkeleton />;
  }

  // Las secciones de la pantalla —fuentes (paso 7), información básica y autopsia (pasos 8-9),
  // equipo (paso 10)— se montan aquí en los próximos pasos del plan. La cabecera ya existe y los
  // tres satélites están operativos (§2); todavía no hay nada que dibujar.
  return null;
}
