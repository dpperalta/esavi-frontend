import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AnswerOption } from '@/contracts/common';
import type { InvestigationCommunityDetail } from '@/contracts/declared/investigationCommunity';
import {
  investigationCommunityByCaseKey,
  investigationCommunityResource,
} from '@/features/investigation/api';
import {
  buildCommunitySavePayload,
  investigationCommunitySaveSchema,
  isSimilarEventBlockOpen,
  type InvestigationCommunityFormValues,
  type InvestigationSectionHandle,
} from '@/features/investigation/schemas';
import { usePatientResidenceCenter } from '@/features/investigation/usePatientResidenceCenter';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { MapPointPicker, type LatLng } from '@/shared/components/MapPointPicker';
import { NumberField } from '@/shared/components/NumberField';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';

function buildDefaultValues(
  community: InvestigationCommunityDetail | null,
): InvestigationCommunityFormValues {
  return {
    patientLatitude: community?.patientLatitude ?? null,
    patientLongitude: community?.patientLongitude ?? null,
    hadSimilarEvent: community?.hadSimilarEvent ?? null,
    similarEventDescription: community?.similarEventDescription ?? null,
    similarEventCount: community?.similarEventCount ?? null,
    affectedVaccinated: community?.affectedVaccinated ?? null,
    affectedUnvaccinated: community?.affectedUnvaccinated ?? null,
    affectedUnknown: community?.affectedUnknown ?? null,
    otherComments: community?.otherComments ?? null,
    notes: community?.notes ?? null,
  };
}

export interface CommunitySectionProps {
  caseId: string;
  investigationId: string;
  // For the marker's preload only, chained through `usePatientResidenceCenter` (SPEC FE13e §3.7) —
  // never written, never duplicated into a store or a `useState` (§3.4).
  patientId: string | undefined;
  community: InvestigationCommunityDetail | null;
  disabled?: boolean;
  showSaveButton: boolean;
  onSaved: () => void;
  draftValues?: InvestigationCommunityFormValues;
  onValuesChange?: (values: InvestigationCommunityFormValues) => void;
  onRegisterHandle?: (handle: InvestigationSectionHandle | null) => void;
}

// Section G of step 5 (SPEC FE13e §3.5 D, §3.7): the home map with its preload and approximate-
// marker warning, the normal-polarity `hadSimilarEvent` gate, the four counters with their sum
// warning, and the two free texts outside the block. The ficha is born empty when the section
// reveals, same pattern as `AdministrationErrorSection`.
export function CommunitySection({
  caseId,
  investigationId,
  patientId,
  community,
  disabled,
  showSaveButton,
  onSaved,
  draftValues,
  onValuesChange,
  onRegisterHandle,
}: CommunitySectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const create = investigationCommunityResource.useCreate();
  const update = investigationCommunityResource.useUpdate();

  const attemptedRef = useRef(false);

  function openCommunity() {
    attemptedRef.current = true;
    create.mutate(
      { investigationId },
      {
        onError: (err) => {
          if (err instanceof EsaviApiError && err.code === 'INVCOMM_001_ALREADY_EXISTS') {
            create.reset();
            void queryClient.invalidateQueries({
              queryKey: investigationCommunityByCaseKey(caseId),
            });
          }
        },
      },
    );
  }

  useEffect(() => {
    if (community !== null || attemptedRef.current) return;
    openCommunity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community]);

  function handleRetry() {
    attemptedRef.current = false;
    create.reset();
    openCommunity();
  }

  // Computed once, at mount, over the row that arrived (§3.4: "born on load").
  const [initialValues] = useState(() => ({
    ...buildDefaultValues(community),
    ...draftValues,
  }));

  const form = useForm<InvestigationCommunityFormValues>({
    resolver: zodResolver(
      investigationCommunitySaveSchema,
    ) as Resolver<InvestigationCommunityFormValues>,
    defaultValues: initialValues,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control }) as InvestigationCommunityFormValues;
  useEffect(() => {
    onValuesChange?.(watchedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues]);

  // The preload center (§3.7): never enters the form. It's only the map's `fallbackCenter` while
  // `patientLatitude` stays `null`.
  const preloadCenter = usePatientResidenceCenter(patientId);

  const patientLatitude = form.watch('patientLatitude') ?? null;
  const patientLongitude = form.watch('patientLongitude') ?? null;
  const hadSimilarEvent = form.watch('hadSimilarEvent');
  const similarEventBlockOpen = isSimilarEventBlockOpen(hadSimilarEvent);
  const similarEventCount = form.watch('similarEventCount') ?? null;
  const affectedVaccinated = form.watch('affectedVaccinated') ?? null;
  const affectedUnvaccinated = form.watch('affectedUnvaccinated') ?? null;
  const affectedUnknown = form.watch('affectedUnknown') ?? null;

  // "Marker not yet dragged" (§3.4): born `true` when the point came from the preload and dies on
  // the first drag or the first numeric edit — a session ratchet, not derived from whether the
  // point falls back to `null` afterward. There's no column to persist it in.
  const [markerTouched, setMarkerTouched] = useState(false);
  const showsApproximateMarker =
    !markerTouched && patientLatitude === null && patientLongitude === null && preloadCenter !== null;

  const mapValue: LatLng | null =
    patientLatitude !== null && patientLongitude !== null
      ? { lat: patientLatitude, lng: patientLongitude }
      : null;

  function handleMapChange(next: LatLng | null) {
    setMarkerTouched(true);
    form.setValue('patientLatitude', next?.lat ?? null, { shouldDirty: true });
    form.setValue('patientLongitude', next?.lng ?? null, { shouldDirty: true, shouldValidate: true });
  }

  // THE NORMAL-POLARITY GATE (§1.E): strict `'YES'` opens the block. Exiting it in a single write,
  // same criterion as F's inverted gate — the `onChange` clears the five fields right here, and
  // `buildCommunitySavePayload` is the `PUT`'s safety net.
  function handleHadSimilarEventChange(next: AnswerOption | null) {
    form.setValue('hadSimilarEvent', next, { shouldDirty: true, shouldValidate: true });
    if (!isSimilarEventBlockOpen(next)) {
      form.setValue('similarEventDescription', null, { shouldDirty: true, shouldValidate: true });
      form.setValue('similarEventCount', null, { shouldDirty: true, shouldValidate: true });
      form.setValue('affectedVaccinated', null, { shouldDirty: true, shouldValidate: true });
      form.setValue('affectedUnvaccinated', null, { shouldDirty: true, shouldValidate: true });
      form.setValue('affectedUnknown', null, { shouldDirty: true, shouldValidate: true });
    }
  }

  // The sum warning, non-blocking (§2, §3.5 D): only with all four counters filled in —
  // `similarEventCount` is never derived from the other three.
  const countMismatch =
    similarEventCount !== null &&
    affectedVaccinated !== null &&
    affectedUnvaccinated !== null &&
    affectedUnknown !== null &&
    affectedVaccinated + affectedUnvaccinated + affectedUnknown !== similarEventCount
      ? { declared: similarEventCount, breakdown: affectedVaccinated + affectedUnvaccinated + affectedUnknown }
      : null;

  async function handleSave(values: InvestigationCommunityFormValues) {
    try {
      const payload = buildCommunitySavePayload(values);
      await update.mutateAsync({ id: investigationId, data: payload });
      toast.success(t('common.toast.updated'));
      form.reset(payload);
      onSaved();
    } catch (err) {
      if (!(err instanceof EsaviApiError)) {
        throw err;
      }
      toast.error(getErrorMessage(err));
    }
  }

  const performSaveRef = useRef(() => form.handleSubmit(handleSave)());
  performSaveRef.current = () => form.handleSubmit(handleSave)();
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    if (community === null) {
      onRegisterHandle?.(null);
      return;
    }
    onRegisterHandle?.({ save: () => performSaveRef.current(), isDirty });
    return () => onRegisterHandle?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterHandle, isDirty, community === null]);

  if (community === null && create.isError) {
    const message =
      create.error instanceof EsaviApiError ? getErrorMessage(create.error) : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium text-foreground">{t('investigation.community.openFailed')}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={handleRetry}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  const isDisabled = disabled || community === null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
        {t('investigation.community.title')}
      </h3>
      {/* Literal informative text (ESAVI-FORM.md §G) — same treatment as FE13a's. */}
      <p className="text-sm text-muted-foreground">{t('investigation.community.intro')}</p>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('investigation.community.field.map')}
        </span>
        <MapPointPicker
          value={mapValue}
          onChange={handleMapChange}
          fallbackCenter={preloadCenter ?? undefined}
          disabled={isDisabled}
          ariaLabel={t('investigation.community.field.map')}
        />
        <div aria-live="polite">
          {showsApproximateMarker && (
            <p className="text-sm text-muted-foreground">
              {t('investigation.map.approximate.notice')}{' '}
              {t('investigation.map.approximate.instruction')}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('investigation.community.field.hadSimilarEvent')}
        </span>
        <Controller
          control={form.control}
          name="hadSimilarEvent"
          render={({ field }) => (
            <AnswerOptionField
              value={field.value ?? null}
              onChange={(next) => {
                handleHadSimilarEventChange(next);
                field.onChange(next);
              }}
              ariaLabel={t('investigation.community.field.hadSimilarEvent')}
              disabled={isDisabled}
            />
          )}
        />
      </div>

      {/* Only this block hangs off the normal-polarity gate (§1.E). */}
      <div aria-live="polite">
        {similarEventBlockOpen && (
          <fieldset className="flex flex-col gap-4" disabled={isDisabled}>
            <legend className="text-sm font-medium text-foreground">
              {t('investigation.community.similarEventLegend')}
            </legend>

            <Controller
              control={form.control}
              name="similarEventDescription"
              render={({ field, fieldState }) => (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="community-similarEventDescription"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('investigation.community.field.similarEventDescription')}
                  </label>
                  <Textarea
                    id="community-similarEventDescription"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    disabled={isDisabled}
                    aria-invalid={!!fieldState.error}
                  />
                  {fieldState.error && (
                    <p role="alert" className="text-sm text-destructive">
                      {t('investigation.community.errors.similarEventDescriptionRequired')}
                    </p>
                  )}
                </div>
              )}
            />

            {(
              [
                ['similarEventCount', 'field.similarEventCount'],
                ['affectedVaccinated', 'field.affectedVaccinated'],
                ['affectedUnvaccinated', 'field.affectedUnvaccinated'],
                ['affectedUnknown', 'field.affectedUnknown'],
              ] as const
            ).map(([name, labelKey]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t(`investigation.community.${labelKey}`)}
                </span>
                <Controller
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <NumberField
                      value={field.value ?? null}
                      onChange={field.onChange}
                      ariaLabel={t(`investigation.community.${labelKey}`)}
                      min={0}
                      max={32767}
                      disabled={isDisabled}
                    />
                  )}
                />
              </div>
            ))}

            <div aria-live="polite">
              {countMismatch && (
                <p className="text-sm text-muted-foreground">
                  {t('investigation.community.countMismatch', {
                    declared: countMismatch.declared,
                    breakdown: countMismatch.breakdown,
                  })}
                </p>
              )}
            </div>
          </fieldset>
        )}
      </div>

      <Controller
        control={form.control}
        name="otherComments"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="community-otherComments" className="text-sm font-medium text-foreground">
              {t('investigation.community.field.otherComments')}
            </label>
            <Textarea
              id="community-otherComments"
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
            <label htmlFor="community-notes" className="text-sm font-medium text-foreground">
              {t('investigation.community.field.notes')}
            </label>
            <Textarea
              id="community-notes"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={isDisabled}
            />
          </div>
        )}
      />

      {showSaveButton && (
        <Button
          type="button"
          className="min-h-11 w-full md:w-auto md:self-end"
          disabled={isDisabled || update.isPending}
          onClick={() => void form.handleSubmit(handleSave)()}
        >
          {t('caseWizard.actions.saveAndContinue')}
        </Button>
      )}
    </div>
  );
}
