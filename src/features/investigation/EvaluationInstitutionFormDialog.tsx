import { useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateEvaluationInstitutionInput } from '@/contracts/evaluationInstitution';
import type { EvaluationInstitutionDetail } from '@/contracts/declared/evaluationInstitution';
import {
  evaluationInstitutionResource,
  useCreateInvestigationClinicalEvaluation,
} from '@/features/investigation/api';
import {
  ENCRYPTED_FIELD_SCREEN_LIMIT,
  evaluationInstitutionErrorFieldMap,
  evaluationInstitutionSaveSchema,
  type EvaluationInstitutionFormValues,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import type { EntitySearchOption } from '@/shared/components/EntitySearchSelect';
import { HealthFacilitySelect } from '@/shared/components/HealthFacilitySelect';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';

export interface EvaluationInstitutionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Names the clinical evaluation ficha (SPEC FE13c §1.B), not the investigation.
  investigationId: string;
  // The full row when editing, `null` when adding — no second read by id: `ESAVI-EVALINST-003` is
  // out of scope (SPEC FE13c §3.2), the list already brought this row down through `-002A`.
  institution: EvaluationInstitutionDetail | null;
}

function isClinicalEvaluationNotFound(error: EsaviApiError): boolean {
  return error.code.endsWith('_CLINICAL_EVALUATION_NOT_FOUND');
}

const REMAINING_WARNING_THRESHOLD = 20;

interface CharacterCounterProps {
  value: string | null | undefined;
  maxLength: number;
}

// Local to this dialog only — the two 120-character fields of §1.E, not a `shared/` primitive
// (CONVENTIONS.md §10.4): nothing else in the wizard needs a visible counter yet. The visible
// count updates on every keystroke; the `aria-live` region only gets text once the remainder is
// small, so a screen reader stays quiet until the limit is actually close (§3.7).
function CharacterCounter({ value, maxLength }: CharacterCounterProps) {
  const { t } = useTranslation();
  const length = (value ?? '').length;
  const remaining = maxLength - length;
  const nearLimit = remaining <= REMAINING_WARNING_THRESHOLD;
  return (
    <div className="flex justify-end">
      <span className="text-xs text-muted-foreground">
        {t('investigation.evaluationInstitution.characterCount', { count: length, max: maxLength })}
      </span>
      <span className="sr-only" aria-live="polite">
        {nearLimit
          ? t('investigation.evaluationInstitution.charactersRemaining', { count: remaining })
          : ''}
      </span>
    </div>
  );
}

interface EvaluationInstitutionFormFieldsProps {
  form: UseFormReturn<EvaluationInstitutionFormValues>;
  resolvedHealthFacilityLabel: string | null | undefined;
}

// Separado del diálogo por el mismo motivo que `TeamMemberFormFields`: los `watch()` de los dos
// contadores tienen que montarse y desmontarse con este subárbol.
function EvaluationInstitutionFormFields({
  form,
  resolvedHealthFacilityLabel,
}: EvaluationInstitutionFormFieldsProps) {
  const { t } = useTranslation();
  const personName = form.watch('personName');
  const personContact = form.watch('personContact');

  function handleHealthFacilityChange(option: EntitySearchOption | null) {
    form.setValue('healthFacilityId', option?.id ?? null, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <>
      <FormField
        control={form.control}
        name="evaluationInstitutionTypeItemId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {t('investigation.evaluationInstitution.fields.evaluationInstitutionTypeItemId')}
            </FormLabel>
            <FormControl>
              <CatalogSelect
                typeCode="evaluationInstitutionType"
                emit="id"
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('investigation.evaluationInstitution.fields.evaluationInstitutionTypeItemId')}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="healthFacilityId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.evaluationInstitution.fields.healthFacilityId')}</FormLabel>
            <FormControl>
              <HealthFacilitySelect
                value={field.value ?? null}
                resolvedLabel={resolvedHealthFacilityLabel}
                onChange={handleHealthFacilityChange}
                scoped={false}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="institutionName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.evaluationInstitution.fields.institutionName')}</FormLabel>
            <FormControl>
              <Input
                name={field.name}
                ref={field.ref}
                maxLength={250}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                onBlur={field.onBlur}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="personName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.evaluationInstitution.fields.personName')}</FormLabel>
            <FormControl>
              <Input
                name={field.name}
                ref={field.ref}
                maxLength={ENCRYPTED_FIELD_SCREEN_LIMIT}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                onBlur={field.onBlur}
              />
            </FormControl>
            <CharacterCounter value={personName} maxLength={ENCRYPTED_FIELD_SCREEN_LIMIT} />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="personContact"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.evaluationInstitution.fields.personContact')}</FormLabel>
            <FormControl>
              <Input
                name={field.name}
                ref={field.ref}
                maxLength={ENCRYPTED_FIELD_SCREEN_LIMIT}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                onBlur={field.onBlur}
              />
            </FormControl>
            <CharacterCounter value={personContact} maxLength={ENCRYPTED_FIELD_SCREEN_LIMIT} />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.evaluationInstitution.fields.notes')}</FormLabel>
            <FormControl>
              <Textarea
                name={field.name}
                ref={field.ref}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                onBlur={field.onBlur}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}

// Create/edit dialog for C.7 (SPEC FE13c §3.5 B, §4 paso 6). The six fields are always visible,
// never conditioned on the selector's value (§6 decisión 2): the backend enforces nothing there,
// and hiding them would lose the institution's name in the most common case, "la misma". No
// delete action anywhere in this file — same debt as `TeamMemberFormDialog` (§2).
export function EvaluationInstitutionFormDialog({
  open,
  onOpenChange,
  investigationId,
  institution,
}: EvaluationInstitutionFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = institution !== null;
  const create = evaluationInstitutionResource.useCreate();
  const update = evaluationInstitutionResource.useUpdate();
  const openClinicalEvaluation = useCreateInvestigationClinicalEvaluation();
  const mutation = isEditing ? update : create;
  // One automatic retry per submit (§7 riesgo E): a first `_CLINICAL_EVALUATION_NOT_FOUND` creates
  // the ficha (or reads the `409` of a concurrent tab as success) and retries the alta once. A
  // second failure of the same kind is not retried again — it surfaces as the error it is.
  const retriedRef = useRef(false);
  // Suppresses `mutation.error` from reaching `<ResourceForm>` while the automatic retry above is
  // in flight: without this, the first (transient) 404 would flash into `onUnmappedError` before
  // the retry has a chance to resolve.
  const [recovering, setRecovering] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
      openClinicalEvaluation.reset();
      retriedRef.current = false;
      setRecovering(false);
    }
    onOpenChange(nextOpen);
  }

  function submitCreate(payload: CreateEvaluationInstitutionInput) {
    create.mutate(payload, {
      onSuccess: () => {
        setRecovering(false);
        toast.success(t('common.toast.created'));
        handleOpenChange(false);
      },
      onError: (error) => {
        if (error instanceof EsaviApiError && isClinicalEvaluationNotFound(error) && !retriedRef.current) {
          retriedRef.current = true;
          setRecovering(true);
          openClinicalEvaluation.mutate(
            { investigationId },
            {
              onSuccess: () => submitCreate(payload),
              onError: (ficheError) => {
                if (ficheError instanceof EsaviApiError && ficheError.code === 'INVCLIEV_001_ALREADY_EXISTS') {
                  submitCreate(payload);
                  return;
                }
                setRecovering(false);
              },
            },
          );
          return;
        }
        setRecovering(false);
      },
    });
  }

  function handleSubmit(values: EvaluationInstitutionFormValues) {
    const payload: Partial<CreateEvaluationInstitutionInput> = {
      evaluationInstitutionTypeItemId: values.evaluationInstitutionTypeItemId ?? null,
      healthFacilityId: values.healthFacilityId ?? null,
      institutionName: values.institutionName ?? null,
      personName: values.personName ?? null,
      personContact: values.personContact ?? null,
      notes: values.notes ?? null,
    };

    if (isEditing && institution) {
      update.mutate(
        { id: institution.evaluationInstitutionId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    retriedRef.current = false;
    submitCreate({ ...payload, investigationId } as CreateEvaluationInstitutionInput);
  }

  function handleUnmappedError(error: EsaviApiError) {
    if (isClinicalEvaluationNotFound(error)) {
      toast.error(t('investigation.evaluationInstitution.errors.missingClinicalEvaluation'));
      return;
    }
    toast.error(getErrorMessage(error));
  }

  const mutationError = !recovering && mutation.error instanceof EsaviApiError ? mutation.error : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(
              isEditing
                ? 'investigation.evaluationInstitution.form.editTitle'
                : 'investigation.evaluationInstitution.form.createTitle',
            )}
          </DialogTitle>
        </DialogHeader>

        <ResourceForm<EvaluationInstitutionFormValues>
          key={institution?.evaluationInstitutionId ?? 'create'}
          schema={evaluationInstitutionSaveSchema}
          defaultValues={{
            evaluationInstitutionTypeItemId: institution?.evaluationInstitutionTypeItemId ?? null,
            healthFacilityId: institution?.healthFacilityId ?? null,
            institutionName: institution?.institutionName ?? null,
            personName: institution?.personName ?? null,
            personContact: institution?.personContact ?? null,
            notes: institution?.notes ?? null,
          }}
          onSubmit={handleSubmit}
          error={mutationError}
          errorFieldMap={evaluationInstitutionErrorFieldMap}
          onUnmappedError={handleUnmappedError}
          isSubmitting={mutation.isPending || openClinicalEvaluation.isPending || recovering}
          onCancel={() => handleOpenChange(false)}
          submitLabel="common.satelliteList.save"
          cancelLabel="common.satelliteList.cancel"
        >
          {(form) => (
            <EvaluationInstitutionFormFields
              form={form}
              resolvedHealthFacilityLabel={institution?.healthFacility?.name}
            />
          )}
        </ResourceForm>
      </DialogContent>
    </Dialog>
  );
}
