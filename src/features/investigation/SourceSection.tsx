import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InvestigationSourceDetail } from '@/contracts/declared/investigationSource';
import { investigationSourceByCaseKey, investigationSourceResource } from '@/features/investigation/api';
import {
  investigationSourceSaveSchema,
  isOtherSourceDescriptionRequirementMet,
  type InvestigationSourceFormValues,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';

// Las ocho fuentes de `ESAVI-FORM.md` §1, en orden — el noveno renglón (`otherDescription`) es
// condicional y se pinta aparte, no en esta lista.
const SOURCE_SWITCHES = [
  { name: 'history', labelKey: 'investigation.source.history' },
  { name: 'interviewVaccinatedPerson', labelKey: 'investigation.source.interviewVaccinatedPerson' },
  { name: 'interviewHealthWorker', labelKey: 'investigation.source.interviewHealthWorker' },
  { name: 'vaccinationRecord', labelKey: 'investigation.source.vaccinationRecord' },
  { name: 'autopsyRecord', labelKey: 'investigation.source.autopsyRecord' },
  { name: 'verbalAutopsyRecord', labelKey: 'investigation.source.verbalAutopsyRecord' },
  { name: 'investigationReport', labelKey: 'investigation.source.investigationReport' },
  { name: 'other', labelKey: 'investigation.source.other' },
] as const satisfies ReadonlyArray<{
  name: keyof InvestigationSourceFormValues;
  labelKey: string;
}>;

function buildDefaultValues(source: InvestigationSourceDetail | null): InvestigationSourceFormValues {
  return {
    history: source?.history ?? null,
    interviewVaccinatedPerson: source?.interviewVaccinatedPerson ?? null,
    interviewHealthWorker: source?.interviewHealthWorker ?? null,
    vaccinationRecord: source?.vaccinationRecord ?? null,
    autopsyRecord: source?.autopsyRecord ?? null,
    verbalAutopsyRecord: source?.verbalAutopsyRecord ?? null,
    investigationReport: source?.investigationReport ?? null,
    other: source?.other ?? null,
    otherDescription: source?.otherDescription ?? null,
    notes: source?.notes ?? null,
  };
}

export interface SourceSectionProps {
  caseId: string;
  investigationId: string;
  investigationSource: InvestigationSourceDetail | null;
  disabled?: boolean;
  // Sólo la sección 1 lleva botón mientras el paso no se completó una vez (SPEC FE13a §3.6); al
  // reentrar en un paso que ya existía, `InvestigationStep` lo oculta y todo queda visible.
  showSaveButton: boolean;
  onSaved: () => void;
}

// Sección 1 del paso 5 (SPEC FE13a §3.5 B): las ocho banderas tri-estado de `investigationSource`
// y el texto detrás de `other`. Es la forma de `VerificationSourceSection.tsx` con ocho banderas
// en vez de seis (§1 "Por qué existe este spec") — mismo `<Switch>` que nace sin tocar (`null`, no
// desmarcado), mismo `aria-live` alrededor del bloque condicional.
export function SourceSection({
  caseId,
  investigationId,
  investigationSource,
  disabled,
  showSaveButton,
  onSaved,
}: SourceSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const create = investigationSourceResource.useCreate();
  const update = investigationSourceResource.useUpdate();

  const form = useForm<InvestigationSourceFormValues>({
    resolver: zodResolver(investigationSourceSaveSchema) as Resolver<InvestigationSourceFormValues>,
    defaultValues: buildDefaultValues(investigationSource),
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const other = form.watch('other');
  const otherDescription = form.watch('otherDescription');
  const showsOtherDescription = other === true;
  const otherDescriptionCoherent = isOtherSourceDescriptionRequirementMet(other, otherDescription);

  async function handleValidSubmit(values: InvestigationSourceFormValues) {
    // Al apagar «otra fuente» la pantalla limpia el campo y deja de enviarlo (§3.5 B, §7.3): lo
    // que nunca se envía es la fuente apagada y el texto a la vez, aunque el textarea oculto
    // todavía conserve algo escrito antes de esconderse.
    const payload: InvestigationSourceFormValues =
      values.other === true ? values : { ...values, otherDescription: null };

    try {
      if (investigationSource) {
        await update.mutateAsync({ id: investigationId, data: payload });
        toast.success(t('common.toast.updated'));
      } else {
        await create.mutateAsync({ ...payload, investigationId });
        toast.success(t('common.toast.created'));
      }
      form.reset(payload);
      onSaved();
    } catch (err) {
      if (!(err instanceof EsaviApiError)) {
        throw err;
      }
      // La fila 1:1 ya existe (§3.5 E): relee en vez de reintentar el `POST` — duplicarlo no es
      // una opción sobre una clave que ES el `investigationId`.
      if (err.code === 'INVSRC_001_ALREADY_EXISTS') {
        await queryClient.invalidateQueries({ queryKey: investigationSourceByCaseKey(caseId) });
        toast.error(getErrorMessage(err));
        return;
      }
      if (
        err.code === 'INVSRC_001_OTHER_DESCRIPTION_REQUIRED' ||
        err.code === 'INVSRC_004_OTHER_DESCRIPTION_REQUIRED' ||
        err.code === 'INVSRC_001_OTHER_DESCRIPTION_NOT_ALLOWED' ||
        err.code === 'INVSRC_004_OTHER_DESCRIPTION_NOT_ALLOWED'
      ) {
        form.setError('otherDescription', { type: 'server', message: err.message });
        return;
      }
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
        {t('investigation.source.title')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('investigation.source.intro')}</p>

      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="sr-only">{t('investigation.source.legend')}</legend>
        {SOURCE_SWITCHES.map(({ name, labelKey }) => (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
                <Switch
                  checked={field.value === true}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    // Apagar «otra fuente» limpia el campo ahí mismo (§3.5 B) — validar contra un
                    // texto todavía presente bloquearía un "Guardar y continuar" legítimo.
                    if (name === 'other' && !checked) {
                      form.setValue('otherDescription', null, { shouldValidate: true });
                    }
                  }}
                  disabled={disabled}
                  aria-label={t(labelKey)}
                />
                {t(labelKey)}
              </label>
            )}
          />
        ))}
      </fieldset>

      {/* Visible sólo con `other === true` (§3.5 B) — aparece por un cambio en otro control. */}
      <div aria-live="polite">
        {showsOtherDescription && (
          <Controller
            control={form.control}
            name="otherDescription"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="investigationSource-otherDescription"
                  className="text-sm font-medium text-foreground"
                >
                  {t('investigation.source.otherDescription')}
                </label>
                <Textarea
                  id="investigationSource-otherDescription"
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value || null)}
                  disabled={disabled}
                />
                {!otherDescriptionCoherent && (
                  <p role="alert" className="text-sm text-destructive">
                    {t('investigation.source.otherDescriptionRequired')}
                  </p>
                )}
              </div>
            )}
          />
        )}
      </div>

      <Controller
        control={form.control}
        name="notes"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="investigationSource-notes"
              className="text-sm font-medium text-foreground"
            >
              {t('investigation.fields.notes')}
            </label>
            <Textarea
              id="investigationSource-notes"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={disabled}
            />
          </div>
        )}
      />

      {showSaveButton && (
        <Button
          type="button"
          className="min-h-11 w-full md:w-auto md:self-end"
          disabled={disabled || create.isPending || update.isPending}
          onClick={() => void form.handleSubmit(handleValidSubmit)()}
        >
          {t('caseWizard.actions.saveAndContinue')}
        </Button>
      )}
    </div>
  );
}
