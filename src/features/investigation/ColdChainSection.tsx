import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AnswerOption } from '@/contracts/common';
import type { InvestigationColdChainDetail } from '@/contracts/declared/investigationColdChain';
import { investigationColdChainByCaseKey, investigationColdChainResource } from '@/features/investigation/api';
import {
  investigationColdChainSaveSchema,
  isStorageBlockOpen,
  type InvestigationColdChainFormValues,
  type InvestigationSectionHandle,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Textarea } from '@/shared/components/ui/textarea';

function buildDefaultValues(
  coldChain: InvestigationColdChainDetail | null,
): InvestigationColdChainFormValues {
  return {
    storageTemperatureMonitored: coldChain?.storageTemperatureMonitored ?? null,
    storageRangeDeviation: coldChain?.storageRangeDeviation ?? null,
    storageProcedureFollowed: coldChain?.storageProcedureFollowed ?? null,
    storageOtherObjectPresent: coldChain?.storageOtherObjectPresent ?? null,
    storagePartiallyReconstitutedVaccine: coldChain?.storagePartiallyReconstitutedVaccine ?? null,
    storageVaccineNotUsable: coldChain?.storageVaccineNotUsable ?? null,
    storageDiluentNotUsable: coldChain?.storageDiluentNotUsable ?? null,
    storageKeyFindings: coldChain?.storageKeyFindings ?? null,
    transportUsedThermos: coldChain?.transportUsedThermos ?? null,
    transportSetInThermos: coldChain?.transportSetInThermos ?? null,
    transportReturnedInThermos: coldChain?.transportReturnedInThermos ?? null,
    transportUsedColdPack: coldChain?.transportUsedColdPack ?? null,
    transportTypeThermo: coldChain?.transportTypeThermo ?? null,
    transportKeyFindings: coldChain?.transportKeyFindings ?? null,
    notes: coldChain?.notes ?? null,
  };
}

// El empate heredado (SPEC FE13d §3.5 regla 3, §6 decision 8): sólo puede llegar de una fila
// escrita por SQL directo o cargada antes de este spec — el formulario nunca lo produce él mismo.
// Gana el termo, que es el lado con precedencia en el servidor.
function resolveInheritedTie(values: InvestigationColdChainFormValues): {
  values: InvestigationColdChainFormValues;
  hadTie: boolean;
} {
  const hadTie = values.transportUsedThermos === 'YES' && values.transportUsedColdPack === 'YES';
  if (!hadTie) return { values, hadTie: false };
  return { values: { ...values, transportUsedColdPack: 'NO' }, hadTie: true };
}

export interface ColdChainSectionProps {
  caseId: string;
  investigationId: string;
  coldChain: InvestigationColdChainDetail | null;
  disabled?: boolean;
  // La compuerta de E2 (SPEC FE13d §6 decision 7): si el identificador `coldChainTransport` ya
  // se reveló. Avanzarla es un paso de interfaz puro — "Continuar", no "Guardar" — la fila ya
  // existe y no hay nada que escribir todavía.
  transportRevealed: boolean;
  onRevealTransport: () => void;
  showSaveButton: boolean;
  onSaved: () => void;
  draftValues?: InvestigationColdChainFormValues;
  onValuesChange?: (values: InvestigationColdChainFormValues) => void;
  onRegisterHandle?: (handle: InvestigationSectionHandle | null) => void;
}

// Secciones E1 (almacenamiento) y E2 (transporte) del paso 5 (SPEC FE13d §3.5, §4 paso 9): una
// sola fila, un solo `useForm`, un solo «Guardar y continuar» al final de E2 (§6 decision 7). La
// ficha nace vacía al revelarse E1, mismo patrón que `VaccinationContextSection`.
export function ColdChainSection({
  caseId,
  investigationId,
  coldChain,
  disabled,
  transportRevealed,
  onRevealTransport,
  showSaveButton,
  onSaved,
  draftValues,
  onValuesChange,
  onRegisterHandle,
}: ColdChainSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const create = investigationColdChainResource.useCreate();
  const update = investigationColdChainResource.useUpdate();

  const attemptedRef = useRef(false);

  function openColdChain() {
    attemptedRef.current = true;
    create.mutate(
      { investigationId },
      {
        onError: (err) => {
          if (err instanceof EsaviApiError && err.code === 'INVCOLD_001_ALREADY_EXISTS') {
            create.reset();
            void queryClient.invalidateQueries({
              queryKey: investigationColdChainByCaseKey(caseId),
            });
          }
        },
      },
    );
  }

  useEffect(() => {
    if (coldChain !== null || attemptedRef.current) return;
    openColdChain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coldChain]);

  function handleRetry() {
    attemptedRef.current = false;
    create.reset();
    openColdChain();
  }

  // Calculado una sola vez, al montar sobre la fila que llegó (§3.4: "nace al cargar"; nunca se
  // recalcula sobre un `coldChain` que cambia después — eso lo cubre `form.reset` al guardar).
  const [{ values: initialValues, hadTie }] = useState(() =>
    resolveInheritedTie({ ...buildDefaultValues(coldChain), ...draftValues }),
  );
  const [tieWarning, setTieWarning] = useState(hadTie);

  const form = useForm<InvestigationColdChainFormValues>({
    resolver: zodResolver(investigationColdChainSaveSchema) as Resolver<InvestigationColdChainFormValues>,
    defaultValues: initialValues,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as InvestigationColdChainFormValues;
  useEffect(() => {
    onValuesChange?.(watchedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues]);

  const storageTemperatureMonitored = form.watch('storageTemperatureMonitored');
  const storageBlockOpen = isStorageBlockOpen(storageTemperatureMonitored);

  // Regla 1 de la exclusión (§3.5): marcar uno en 'YES' fuerza el otro a 'NO'. Regla 2: los demás
  // valores no arrastran nada — sólo el 'YES' es excluyente, igual que en el servidor.
  function handleTransportUsedThermosChange(next: AnswerOption | null) {
    form.setValue('transportUsedThermos', next, { shouldDirty: true });
    if (next === 'YES') {
      form.setValue('transportUsedColdPack', 'NO', { shouldDirty: true });
    }
  }
  function handleTransportUsedColdPackChange(next: AnswerOption | null) {
    form.setValue('transportUsedColdPack', next, { shouldDirty: true });
    if (next === 'YES') {
      form.setValue('transportUsedThermos', 'NO', { shouldDirty: true });
    }
  }

  async function handleValidSubmit(values: InvestigationColdChainFormValues) {
    try {
      await update.mutateAsync({ id: investigationId, data: values });
      toast.success(t('common.toast.updated'));
      form.reset(values);
      setTieWarning(false);
      onSaved();
    } catch (err) {
      if (!(err instanceof EsaviApiError)) {
        throw err;
      }
      toast.error(getErrorMessage(err));
    }
  }

  const performSaveRef = useRef(() => form.handleSubmit(handleValidSubmit)());
  performSaveRef.current = () => form.handleSubmit(handleValidSubmit)();
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    if (coldChain === null) {
      onRegisterHandle?.(null);
      return;
    }
    onRegisterHandle?.({ save: () => performSaveRef.current(), isDirty });
    return () => onRegisterHandle?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterHandle, isDirty, coldChain === null]);

  if (coldChain === null && create.isError) {
    const message =
      create.error instanceof EsaviApiError ? getErrorMessage(create.error) : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium text-foreground">{t('investigation.coldChain.openFailed')}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={handleRetry}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  const isDisabled = disabled || coldChain === null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      {/* E1 — Cadena de frío (almacenamiento) */}
      <div className="flex flex-col gap-1">
        <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
          {t('investigation.coldChain.storage.title')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('investigation.coldChain.storage.hint')}</p>
      </div>

      <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
        <legend className="sr-only">{t('investigation.coldChain.storage.title')}</legend>

        <div className="flex flex-col gap-1.5">
          <span
            id="coldChain-temperatureMonitored-label"
            className="text-sm font-medium text-foreground"
          >
            {t('investigation.coldChain.storage.field.temperatureMonitored')}
          </span>
          <Controller
            control={form.control}
            name="storageTemperatureMonitored"
            render={({ field }) => (
              <RadioGroup
                aria-labelledby="coldChain-temperatureMonitored-label"
                value={field.value === true ? 'true' : field.value === false ? 'false' : ''}
                onValueChange={(next) => field.onChange(next === 'true')}
                className="flex w-auto gap-4"
                disabled={isDisabled}
              >
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <RadioGroupItem value="true" />
                  {t('classification.gate.yes')}
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <RadioGroupItem value="false" />
                  {t('classification.gate.no')}
                </label>
              </RadioGroup>
            )}
          />
        </div>

        {/* Sólo esta columna cuelga de la compuerta (§3.5) — las seis siguientes están fuera del
          bloque pese al prefijo compartido `storage`. */}
        <div aria-live="polite">
          {storageBlockOpen && (
            <div className="flex flex-col gap-1.5">
              <span
                id="coldChain-rangeDeviation-label"
                className="text-sm font-medium text-foreground"
              >
                {t('investigation.coldChain.storage.field.rangeDeviation')}
              </span>
              <Controller
                control={form.control}
                name="storageRangeDeviation"
                render={({ field }) => (
                  <RadioGroup
                    aria-labelledby="coldChain-rangeDeviation-label"
                    value={field.value === true ? 'true' : field.value === false ? 'false' : ''}
                    onValueChange={(next) => field.onChange(next === 'true')}
                    className="flex w-auto gap-4"
                    disabled={isDisabled}
                  >
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                      <RadioGroupItem value="true" />
                      {t('classification.gate.yes')}
                    </label>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                      <RadioGroupItem value="false" />
                      {t('classification.gate.no')}
                    </label>
                  </RadioGroup>
                )}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.coldChain.storage.field.procedureFollowed')}
          </span>
          <Controller
            control={form.control}
            name="storageProcedureFollowed"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.coldChain.storage.field.procedureFollowed')}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.coldChain.storage.field.otherObjectPresent')}
          </span>
          <Controller
            control={form.control}
            name="storageOtherObjectPresent"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.coldChain.storage.field.otherObjectPresent')}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.coldChain.storage.field.partiallyReconstitutedVaccine')}
          </span>
          <Controller
            control={form.control}
            name="storagePartiallyReconstitutedVaccine"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.coldChain.storage.field.partiallyReconstitutedVaccine')}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.coldChain.storage.field.vaccineNotUsable')}
          </span>
          <Controller
            control={form.control}
            name="storageVaccineNotUsable"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.coldChain.storage.field.vaccineNotUsable')}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('investigation.coldChain.storage.field.diluentNotUsable')}
          </span>
          <Controller
            control={form.control}
            name="storageDiluentNotUsable"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.coldChain.storage.field.diluentNotUsable')}
                disabled={isDisabled}
              />
            )}
          />
        </div>

        <Controller
          control={form.control}
          name="storageKeyFindings"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="coldChain-storageKeyFindings" className="text-sm font-medium text-foreground">
                {t('investigation.coldChain.storage.field.keyFindings')}
              </label>
              <Textarea
                id="coldChain-storageKeyFindings"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                disabled={isDisabled}
              />
            </div>
          )}
        />
      </fieldset>

      {!transportRevealed && !isDisabled && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full md:w-auto md:self-end"
          onClick={onRevealTransport}
        >
          {t('caseWizard.actions.continue')}
        </Button>
      )}

      {/* E2 — Transporte */}
      {transportRevealed && (
        <>
          <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
            {t('investigation.coldChain.transport.title')}
          </h3>

          <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
            <legend className="sr-only">{t('investigation.coldChain.transport.title')}</legend>

            <Controller
              control={form.control}
              name="transportTypeThermo"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="coldChain-transportTypeThermo" className="text-sm font-medium text-foreground">
                    {t('investigation.coldChain.transport.field.typeThermo')}
                  </label>
                  <Input
                    id="coldChain-transportTypeThermo"
                    maxLength={250}
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    disabled={isDisabled}
                  />
                </div>
              )}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('investigation.coldChain.transport.field.setInThermos')}
              </span>
              <Controller
                control={form.control}
                name="transportSetInThermos"
                render={({ field }) => (
                  <AnswerOptionField
                    value={field.value ?? null}
                    onChange={field.onChange}
                    ariaLabel={t('investigation.coldChain.transport.field.setInThermos')}
                    disabled={isDisabled}
                  />
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('investigation.coldChain.transport.field.returnedInThermos')}
              </span>
              <Controller
                control={form.control}
                name="transportReturnedInThermos"
                render={({ field }) => (
                  <AnswerOptionField
                    value={field.value ?? null}
                    onChange={field.onChange}
                    ariaLabel={t('investigation.coldChain.transport.field.returnedInThermos')}
                    disabled={isDisabled}
                  />
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('investigation.coldChain.transport.field.usedThermos')}
              </span>
              <Controller
                control={form.control}
                name="transportUsedThermos"
                render={({ field }) => (
                  <AnswerOptionField
                    value={field.value ?? null}
                    onChange={(next) => {
                      handleTransportUsedThermosChange(next);
                      field.onChange(next);
                    }}
                    ariaLabel={t('investigation.coldChain.transport.field.usedThermos')}
                    disabled={isDisabled}
                  />
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('investigation.coldChain.transport.field.usedColdPack')}
              </span>
              <Controller
                control={form.control}
                name="transportUsedColdPack"
                render={({ field }) => (
                  <AnswerOptionField
                    value={field.value ?? null}
                    onChange={(next) => {
                      handleTransportUsedColdPackChange(next);
                      field.onChange(next);
                    }}
                    ariaLabel={t('investigation.coldChain.transport.field.usedColdPack')}
                    disabled={isDisabled}
                  />
                )}
              />
            </div>

            {tieWarning && (
              <p role="status" className="text-sm text-muted-foreground">
                {t('investigation.coldChain.transport.inheritedTieWarning')}
              </p>
            )}

            <Controller
              control={form.control}
              name="transportKeyFindings"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="coldChain-transportKeyFindings" className="text-sm font-medium text-foreground">
                    {t('investigation.coldChain.transport.field.keyFindings')}
                  </label>
                  <Textarea
                    id="coldChain-transportKeyFindings"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    disabled={isDisabled}
                  />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="notes"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="coldChain-notes" className="text-sm font-medium text-foreground">
                    {t('investigation.coldChain.transport.field.notes')}
                  </label>
                  <Textarea
                    id="coldChain-notes"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    disabled={isDisabled}
                  />
                </div>
              )}
            />
          </fieldset>

          {showSaveButton && (
            <Button
              type="button"
              className="min-h-11 w-full md:w-auto md:self-end"
              disabled={isDisabled || update.isPending}
              onClick={() => void form.handleSubmit(handleValidSubmit)()}
            >
              {t('caseWizard.actions.saveAndContinue')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
