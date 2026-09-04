import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CreateEsaviCaseInput } from '@/contracts/esaviCase';
import { useCurrentUser } from '@/features/auth/api';
import { NotifierFormDialog } from '@/features/notifier/NotifierFormDialog';
import { NotifierList } from '@/features/notifier/NotifierList';
import { useCountryIsoCode } from '@/features/systemConfig/api';
import { useUserGeoCoverage } from '@/features/userGeoLocation/api';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { DateField } from '@/shared/components/DateField';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Button } from '@/shared/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Textarea } from '@/shared/components/ui/textarea';
import { ROLE_LEVELS, getEffectiveLevel } from '@/shared/config/roles';
import { esaviCaseResource } from './api';
import { ScopedHealthFacilitySelect } from './ScopedHealthFacilitySelect';
import { caseOpeningErrorFieldMap, createEsaviCaseOpeningSchema, type CaseOpeningFormValues } from './schemas';

// Paso 2 del alta y a la vez su reentrada (SPEC FE10 §3.1): un solo componente. El route param
// `:id` distingue los dos modos igual que en `HealthFacilityFormDialog`/`NotifierFormDialog` —
// presente en `/esavi-cases/:id/wizard/case-opening` (reentrada), ausente en
// `/esavi-cases/new/case-opening?patientId=` (alta). Una vez que el caso existe — por reentrada o
// porque el `POST` de esta misma pantalla lo acaba de crear — las dos rutas se comportan igual:
// no hay una tercera pantalla para "el caso recién creado".
export function CaseOpeningStep() {
  const { t } = useTranslation();
  const { id: caseIdParam } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const patientIdFromQuery = searchParams.get('patientId');

  // `createdCaseId` es lo que convierte "Crear caso" en "Guardar · Siguiente" sin cambiar de URL
  // (decisión confirmada con el usuario, paso 12): evita la pantalla intermedia vacía de la lista
  // de notificadores abriendo el mismo `NotifierFormDialog` del paso 10 automáticamente, en vez de
  // duplicar sus campos aquí.
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const effectiveCaseId = caseIdParam ?? createdCaseId;
  const isEditing = !!effectiveCaseId;

  const existingCase = esaviCaseResource.useOne(effectiveCaseId ?? '');

  const { data: user } = useCurrentUser();
  // El mismo umbral que `resolveUserGeoScopeIds` en el backend (SPEC FE10 §1C, §6): sólo se
  // aplica con nivel exactamente USER.
  const appliesFilter = !!user && getEffectiveLevel(user.roles) === ROLE_LEVELS.USER;
  const coverage = useUserGeoCoverage(appliesFilter ? user.userId : '');
  const coverageIsEmpty = appliesFilter && !coverage.isLoading && (coverage.data?.assigned.length ?? 0) === 0;

  const countryIsoCode = useCountryIsoCode();

  const create = esaviCaseResource.useCreate();
  const update = esaviCaseResource.useUpdate();
  const mutation = isEditing ? update : create;

  const [notifierDialogOpen, setNotifierDialogOpen] = useState(false);
  const [hasNotifier, setHasNotifier] = useState(false);

  function handleSubmit(values: CaseOpeningFormValues) {
    if (isEditing && effectiveCaseId) {
      update.mutate(
        { id: effectiveCaseId, data: values },
        { onSuccess: () => toast.success(t('common.toast.updated')) },
      );
      return;
    }
    if (!patientIdFromQuery) {
      return;
    }
    // ESAVI-CASE-001: el `notifier` no viaja en este cuerpo — `notifier.caseId` es NOT NULL y el
    // notificador se encadena aparte (SPEC FE10 §3.2).
    create.mutate(
      {
        ...values,
        patientId: patientIdFromQuery,
        countryIsoCode: countryIsoCode.data ?? undefined,
      } satisfies CreateEsaviCaseInput,
      {
        onSuccess: (created) => {
          setCreatedCaseId(created.caseId);
          setNotifierDialogOpen(true);
        },
      },
    );
  }

  function handleUnmappedError(error: EsaviApiError) {
    // No es de campo: el paciente no se elige en este paso (SPEC FE10 §3.5).
    if (error.code === 'CASE_001_PATIENT_NOT_FOUND') {
      toast.error(getErrorMessage(error));
      navigate('/esavi-cases/new/patient');
      return;
    }
    toast.error(getErrorMessage(error));
  }

  function handleContinue() {
    if (!effectiveCaseId) {
      return;
    }
    // El único `navigate(..., { replace: true })` de este paso (SPEC FE10 §4, paso 12): sustituye
    // esta entrada del historial por la de `classification`, así que el botón atrás del navegador
    // nunca vuelve a ofrecer crear el caso (SPEC FE10 §5).
    navigate(`/esavi-cases/${effectiveCaseId}/wizard/classification`, { replace: true });
  }

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;

  if (!isEditing && !patientIdFromQuery) {
    return <p className="text-sm text-muted-foreground">{t('esaviCase.opening.noPatient')}</p>;
  }

  if (coverageIsEmpty) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('esaviCase.opening.noCoverage')}
      </p>
    );
  }

  const readyToRender = !isEditing || !!existingCase.data;
  if (!readyToRender) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isEditing && existingCase.data && (
        <p className="text-sm font-medium text-foreground">{existingCase.data.caseCode}</p>
      )}

      {!isEditing && (
        <p role="note" className="text-sm text-muted-foreground">
          {t('esaviCase.opening.irreversibilityNotice')}
        </p>
      )}

      <ResourceForm<CaseOpeningFormValues>
        key={effectiveCaseId ?? 'create'}
        schema={createEsaviCaseOpeningSchema}
        defaultValues={{
          healthFacilityId: existingCase.data?.healthFacility.healthFacilityId ?? '',
          reportDate: existingCase.data?.reportDate ?? null,
          eventDate: existingCase.data?.eventDate ?? null,
          reportFillingDate: existingCase.data?.reportFillingDate ?? null,
          notificationOrganization: existingCase.data?.notificationOrganization ?? '',
          details: existingCase.data?.details ?? '',
        }}
        onSubmit={handleSubmit}
        error={mutationError}
        errorFieldMap={caseOpeningErrorFieldMap}
        onUnmappedError={handleUnmappedError}
        isSubmitting={mutation.isPending}
        submitLabel={isEditing ? 'common.actions.save' : 'esaviCase.opening.createButton'}
      >
        {(form) => (
          <>
            <FormField
              control={form.control}
              name="healthFacilityId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('esaviCase.opening.healthFacility.label')}</FormLabel>
                  <FormControl>
                    <ScopedHealthFacilitySelect
                      value={field.value || null}
                      resolvedLabel={existingCase.data?.healthFacility.name ?? null}
                      onChange={(option) => field.onChange(option?.id ?? '')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reportDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('esaviCase.opening.fields.reportDate')}</FormLabel>
                  <FormControl>
                    <DateField
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('esaviCase.opening.fields.reportDate')}
                      allowFuture={false}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="eventDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('esaviCase.opening.fields.eventDate')}</FormLabel>
                  <FormControl>
                    <DateField
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('esaviCase.opening.fields.eventDate')}
                      allowFuture={false}
                    />
                  </FormControl>
                  {form.formState.errors.eventDate ? (
                    <p role="alert" className="text-sm text-destructive">
                      {t('esaviCase.opening.errors.eventDateAfterReportDate')}
                    </p>
                  ) : (
                    <FormMessage />
                  )}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reportFillingDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('esaviCase.opening.fields.reportFillingDate')}</FormLabel>
                  <FormControl>
                    <DateField
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t('esaviCase.opening.fields.reportFillingDate')}
                      allowFuture={false}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notificationOrganization"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('esaviCase.opening.fields.notificationOrganization')}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('esaviCase.opening.fields.details')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      </ResourceForm>

      {isEditing && effectiveCaseId && (
        <>
          <NotifierList caseId={effectiveCaseId} onCountChange={(count) => setHasNotifier(count > 0)} />
          <Button type="button" onClick={handleContinue} disabled={!hasNotifier} className="self-start">
            {t('esaviCase.opening.continueButton')}
          </Button>
          <NotifierFormDialog
            open={notifierDialogOpen}
            caseId={effectiveCaseId}
            notifierId={null}
            onOpenChange={setNotifierDialogOpen}
          />
        </>
      )}
    </div>
  );
}
