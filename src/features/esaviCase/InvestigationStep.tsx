import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InvestigationDetail } from '@/contracts/declared/investigation';
import type { InvestigationAutopsyDetail } from '@/contracts/declared/investigationAutopsy';
import type { InvestigationSourceDetail } from '@/contracts/declared/investigationSource';
import type { NotificationDetail } from '@/contracts/declared/notification';
import { useCaseWorkflow } from '@/features/caseWorkflow/api';
import { BasicInfoSection } from '@/features/investigation/BasicInfoSection';
import { SourceSection } from '@/features/investigation/SourceSection';
import { TeamMemberList } from '@/features/investigation/TeamMemberList';
import {
  investigationByCaseKey,
  investigationResource,
  useInvestigationAutopsyByCase,
  useInvestigationByCase,
  useInvestigationSourceByCase,
} from '@/features/investigation/api';
import type {
  InvestigationAutopsyFormValues,
  InvestigationFormValues,
  InvestigationSourceFormValues,
} from '@/features/investigation/schemas';
import { useNotificationByCase } from '@/features/notification/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useProgressiveSections } from '@/shared/hooks/useProgressiveSections';
import { resolveDraftConflict, useDraftsStore } from '@/shared/stores/draftsStore';

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

type InvestigationSectionId = 'source' | 'basicInfo' | 'team';
const SECTIONS: InvestigationSectionId[] = ['source', 'basicInfo', 'team'];

// El borrador combinado (§3.4): una sola clave `'investigation'`, aunque tres secciones
// autocontenidas escriban en él — cada campo es opcional porque el usuario puede haber tocado
// sólo una sección antes del cierre accidental de la pestaña.
interface InvestigationDraftValues {
  source?: InvestigationSourceFormValues;
  basicInfo?: InvestigationFormValues;
  autopsy?: InvestigationAutopsyFormValues;
}

interface InvestigationStepBodyProps {
  caseId: string;
  investigationId: string;
  investigation: InvestigationDetail;
  investigationSource: InvestigationSourceDetail | null;
  investigationAutopsy: InvestigationAutopsyDetail | null;
  notification: NotificationDetail | null;
  // `stages.investigation.exists` como lo leyó `InvestigationStep` antes de su propio `POST`
  // (SPEC FE12f §3.1, adaptado): un paso nuevo se recorre sección por sección; uno que ya
  // existía se muestra entero desde el primer render.
  existedOnMount: boolean;
  isClosed: boolean;
}

function InvestigationStepBody({
  caseId,
  investigationId,
  investigation,
  investigationSource,
  investigationAutopsy,
  notification,
  existedOnMount,
  isClosed,
}: InvestigationStepBodyProps) {
  const { t } = useTranslation();

  // El `updatedAt` de la cabecera al montar (SPEC FE12a §3.4, adaptado a un borrador que cubre
  // tres secciones a la vez): nunca recalculado, o la regla de conflicto compararía siempre
  // contra sí misma.
  const baseUpdatedAtRef = useRef(investigation.updatedAt);

  // Resuelto una sola vez, en el primer render de este cuerpo — que sólo monta cuando la
  // cabecera y los tres satélites ya cargaron, así que no hace falta el guardián de
  // `hasResolvedDraftRef` de `NotificationStep`: aquí no hay un segundo render intermedio con
  // datos a medio llegar.
  const [draft] = useState(() => {
    const stored = useDraftsStore.getState().get(caseId, 'investigation');
    const resolution = resolveDraftConflict(stored, baseUpdatedAtRef.current);
    return { resolution, values: (stored?.values as InvestigationDraftValues | undefined) ?? {} };
  });

  const hasNotifiedDraftRef = useRef(false);
  useEffect(() => {
    if (hasNotifiedDraftRef.current) return;
    hasNotifiedDraftRef.current = true;
    if (draft.resolution === 'discard') {
      useDraftsStore.getState().clear(caseId, 'investigation');
      toast.info(t('investigation.draft.discarded'));
    } else if (draft.resolution === 'restore') {
      toast.info(t('investigation.draft.restored'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoredValues = draft.resolution === 'restore' ? draft.values : {};

  const [pendingDraftValues, setPendingDraftValues] = useState<InvestigationDraftValues>({});
  const draftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingDraftValues = Object.keys(pendingDraftValues).length > 0;

  // Un solo rebote de 500 ms para las tres secciones (SPEC FE12a §3.4), aunque cada una tenga su
  // propio `useForm`: cualquier cambio en cualquiera reinicia el mismo temporizador.
  useEffect(() => {
    if (!hasPendingDraftValues) return;
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      useDraftsStore.getState().set(caseId, 'investigation', pendingDraftValues, baseUpdatedAtRef.current);
    }, 500);
    return () => {
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    };
  }, [caseId, pendingDraftValues, hasPendingDraftValues]);

  // "Se borra en cuanto responde el PUT" (§3.4): tras cualquiera de los dos guardados, lo ya
  // escrito quedó en la base y lo que falte por tocar no necesita sobrevivir a un cierre
  // accidental sobre datos que ya son historia.
  function clearDraft() {
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    setPendingDraftValues({});
    useDraftsStore.getState().clear(caseId, 'investigation');
  }

  const revealAllRef = useRef(existedOnMount || isClosed);
  const { isVisible, frontier, advance } = useProgressiveSections<InvestigationSectionId>({
    sections: SECTIONS,
    revealAll: revealAllRef.current,
    lastWithButton: 'basicInfo',
  });

  return (
    <div className="flex flex-col gap-6">
      {isVisible('source') && (
        <SourceSection
          caseId={caseId}
          investigationId={investigationId}
          investigationSource={investigationSource}
          disabled={isClosed}
          showSaveButton={frontier === 'source'}
          onSaved={() => {
            clearDraft();
            advance();
          }}
          draftValues={restoredValues.source}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({ ...current, source: values }))
          }
        />
      )}

      {isVisible('basicInfo') && (
        <BasicInfoSection
          caseId={caseId}
          investigationId={investigationId}
          investigation={investigation}
          investigationAutopsy={investigationAutopsy}
          notification={notification}
          disabled={isClosed}
          showSaveButton={frontier === 'basicInfo'}
          onSaved={() => {
            clearDraft();
            advance();
          }}
          draftValues={{ basicInfo: restoredValues.basicInfo ?? {}, autopsy: restoredValues.autopsy ?? {} } as {
            basicInfo: InvestigationFormValues;
            autopsy: InvestigationAutopsyFormValues;
          }}
          onValuesChange={(values) =>
            setPendingDraftValues((current) => ({
              ...current,
              basicInfo: values.basicInfo,
              autopsy: values.autopsy,
            }))
          }
        />
      )}

      {isVisible('team') && <TeamMemberList investigationId={investigationId} disabled={isClosed} />}
    </div>
  );
}

export interface InvestigationStepProps {
  caseId: string;
}

// Paso 5 del asistente (SPEC FE13a). Reemplaza el marcador de posición del slug `investigation`
// en `CaseWizardPage` (FE08, §4 paso 9). Crea la cabecera al entrar (§2) y monta las tres
// secciones del §4 pasos 7-10 bajo el revelado progresivo de FE12f (§4 paso 11): fuentes,
// información básica con el bloque de muerte y autopsia, y equipo — sin sub-paso de ruta propio.
export function InvestigationStep({ caseId }: InvestigationStepProps) {
  const queryClient = useQueryClient();
  const workflow = useCaseWorkflow(caseId);
  const stageExists = workflow.data?.stages.investigation.exists === true;
  const investigation = useInvestigationByCase(caseId, stageExists);
  const investigationSource = useInvestigationSourceByCase(caseId, stageExists);
  const investigationAutopsy = useInvestigationAutopsyByCase(caseId, stageExists);
  const notificationStageExists = workflow.data?.stages.notification.exists === true;
  const notification = useNotificationByCase(caseId, notificationStageExists);
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

  // Congelado la primera vez que el workflow responde (SPEC FE12f §3.1, adaptado): el efecto de
  // arriba puede cambiar `stageExists` a `true` un instante después con su propio `POST`, y el
  // revelado progresivo tiene que ignorar ese cambio — sólo importa si la cabecera **ya**
  // existía antes de que este paso hiciera nada.
  const existedOnMountRef = useRef<boolean | null>(null);
  if (workflow.data && existedOnMountRef.current === null) {
    existedOnMountRef.current = stageExists;
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

  if (
    investigation.isLoading ||
    !investigation.data ||
    investigationSource.isLoading ||
    investigationAutopsy.isLoading
  ) {
    return <InvestigationStepSkeleton />;
  }

  return (
    <InvestigationStepBody
      caseId={caseId}
      investigationId={investigation.data.investigationId}
      investigation={investigation.data}
      investigationSource={investigationSource.data ?? null}
      investigationAutopsy={investigationAutopsy.data ?? null}
      notification={notification.data ?? null}
      existedOnMount={existedOnMountRef.current ?? false}
      isClosed={workflow.data.status.code === 'CLOSED'}
    />
  );
}
