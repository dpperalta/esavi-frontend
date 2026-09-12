import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { XIcon } from 'lucide-react';
import {
  areAutopsyFlagsMutuallyExclusive,
  isAutopsyDateNotBeforeDeath,
  isAutopsyDateRequirementMet,
  isScheduledAutopsyDateRequirementMet,
  type InvestigationAutopsyFormValues,
} from '@/features/investigation/schemas';
import { DateField } from '@/shared/components/DateField';
import { TimeField } from '@/shared/components/TimeField';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';

export interface AutopsyFieldsProps {
  form: UseFormReturn<InvestigationAutopsyFormValues>;
  disabled?: boolean;
  // The §6.6 warning (CASE-PROCESS.md) belongs to the block, not to a field — it's computed in
  // `BasicInfoSection` from the notification, which this piece doesn't know about.
  showsDeathWarning: boolean;
  onDismissDeathWarning: () => void;
  // Path to wizard step 4, for the warning's link — built by `BasicInfoSection` because it's the
  // one that knows the `caseId`.
  wizardStepFourPath: string;
}

// Block 6.1–6.7 of `ESAVI-FORM.md` A1, inside `BasicInfoSection` (SPEC FE13a §3.5 C). The gate
// (`status.value === 'DEATH'`) lives in the parent — here only the already-gated fields render.
// `isDeath` is never offered as a control: it travels fixed at `true` from the schema.
export function AutopsyFields({
  form,
  disabled,
  showsDeathWarning,
  onDismissDeathWarning,
  wizardStepFourPath,
}: AutopsyFieldsProps) {
  const { t } = useTranslation();

  const deathDate = form.watch('deathDate');
  const isAutopsyPerformed = form.watch('isAutopsyPerformed');
  const autopsyDate = form.watch('autopsyDate');
  const isAutopsyScheduled = form.watch('isAutopsyScheduled');
  const scheduledAutopsyDate = form.watch('scheduledAutopsyDate');

  const showsAutopsyDoneFields = isAutopsyPerformed === true;
  const showsAutopsyScheduledSwitch = isAutopsyPerformed !== true;
  const showsScheduledAutopsyDate = showsAutopsyScheduledSwitch && isAutopsyScheduled === true;

  // The four coherence rules (§3.5 C) all show at once if they all break at once — never one per
  // server round trip. Rules 1 to 3 almost never fire because the `<Switch>` controls below
  // clear their counterpart on toggle; rule 4 does, because it stems from `deathDate`.
  const flagsCoherent = areAutopsyFlagsMutuallyExclusive(isAutopsyPerformed, isAutopsyScheduled);
  const autopsyDateCoherent = isAutopsyDateRequirementMet(isAutopsyPerformed, autopsyDate);
  const scheduledDateCoherent = isScheduledAutopsyDateRequirementMet(
    isAutopsyScheduled,
    scheduledAutopsyDate,
  );
  const deathOrderCoherent = isAutopsyDateNotBeforeDeath(autopsyDate, deathDate);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <span className="text-sm font-medium text-foreground">
        {t('investigation.autopsy.sectionTitle')}
      </span>

      {/* No bloquea el guardado y se puede descartar (CASE-PROCESS.md §6.6) — `aria-live` porque
        aparece por un cambio en la notificación o en el estado, no por una acción directa aquí. */}
      <div aria-live="polite">
        {showsDeathWarning && (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
          >
            <p>
              {t('investigation.autopsy.deathWarning')}{' '}
              <Link to={wizardStepFourPath} className="underline">
                {t('investigation.autopsy.deathWarningLink')}
              </Link>
            </p>
            <button
              type="button"
              aria-label={t('investigation.autopsy.dismissWarning')}
              className="text-warning hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-full"
              onClick={onDismissDeathWarning}
            >
              <XIcon aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <Controller
        control={form.control}
        name="deathDate"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {t('investigation.autopsy.deathDate')}
            </span>
            <DateField
              value={field.value ?? null}
              onChange={field.onChange}
              ariaLabel={t('investigation.autopsy.deathDate')}
              allowFuture={false}
              disabled={disabled}
            />
            {!deathOrderCoherent && (
              <p role="alert" className="text-sm text-destructive">
                {t('investigation.autopsy.autopsyDateBeforeDeath')}
              </p>
            )}
          </div>
        )}
      />

      <Controller
        control={form.control}
        name="deathTime"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="investigationAutopsy-deathTime"
              className="text-sm font-medium text-foreground"
            >
              {t('investigation.autopsy.deathTime')}
            </label>
            <TimeField
              id="investigationAutopsy-deathTime"
              value={field.value ?? null}
              onChange={field.onChange}
              ariaLabel={t('investigation.autopsy.deathTime')}
              disabled={disabled}
            />
          </div>
        )}
      />

      <Controller
        control={form.control}
        name="isAutopsyPerformed"
        render={({ field }) => (
          <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
            <Switch
              checked={field.value === true}
              onCheckedChange={(checked) => {
                field.onChange(checked);
                // Clears its counterpart on toggle (§3.5 C): with the autopsy done, the
                // scheduled one stops making sense and stops being visible — rules 1 to 3 never
                // fire because no orphaned value is left behind.
                if (checked) {
                  form.setValue('isAutopsyScheduled', null, { shouldValidate: true });
                  form.setValue('scheduledAutopsyDate', null, { shouldValidate: true });
                } else {
                  form.setValue('autopsyDate', null, { shouldValidate: true });
                  form.setValue('autopsyComments', null, { shouldValidate: true });
                }
              }}
              disabled={disabled}
              aria-label={t('investigation.autopsy.isAutopsyPerformed')}
            />
            {t('investigation.autopsy.isAutopsyPerformed')}
          </label>
        )}
      />

      <div aria-live="polite">
        {showsAutopsyDoneFields && (
          <div className="flex flex-col gap-4">
            <Controller
              control={form.control}
              name="autopsyDate"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    {t('investigation.autopsy.autopsyDate')}
                  </span>
                  <DateField
                    value={field.value ?? null}
                    onChange={field.onChange}
                    ariaLabel={t('investigation.autopsy.autopsyDate')}
                    allowFuture={false}
                    disabled={disabled}
                  />
                  {!autopsyDateCoherent && (
                    <p role="alert" className="text-sm text-destructive">
                      {t('investigation.autopsy.autopsyDateNotAllowed')}
                    </p>
                  )}
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="autopsyComments"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="investigationAutopsy-autopsyComments"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('investigation.autopsy.autopsyComments')}
                  </label>
                  <Textarea
                    id="investigationAutopsy-autopsyComments"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    disabled={disabled}
                  />
                </div>
              )}
            />
          </div>
        )}
      </div>

      {/* `ESAVI-FORM.md` 6.6: visible sólo mientras la autopsia no está hecha. */}
      <div aria-live="polite">
        {showsAutopsyScheduledSwitch && (
          <Controller
            control={form.control}
            name="isAutopsyScheduled"
            render={({ field }) => (
              <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
                <Switch
                  checked={field.value === true}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    if (!checked) {
                      form.setValue('scheduledAutopsyDate', null, { shouldValidate: true });
                    }
                  }}
                  disabled={disabled}
                  aria-label={t('investigation.autopsy.isAutopsyScheduled')}
                />
                {t('investigation.autopsy.isAutopsyScheduled')}
              </label>
            )}
          />
        )}
      </div>

      <div aria-live="polite">
        {showsScheduledAutopsyDate && (
          <Controller
            control={form.control}
            name="scheduledAutopsyDate"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t('investigation.autopsy.scheduledAutopsyDate')}
                </span>
                {/* Sin la regla "no futura" (§3.5 C): el caso normal es programarla para dentro
                  de unos días. */}
                <DateField
                  value={field.value ?? null}
                  onChange={field.onChange}
                  ariaLabel={t('investigation.autopsy.scheduledAutopsyDate')}
                  allowFuture
                  disabled={disabled}
                />
                {!scheduledDateCoherent && (
                  <p role="alert" className="text-sm text-destructive">
                    {t('investigation.autopsy.scheduledAutopsyDateNotAllowed')}
                  </p>
                )}
              </div>
            )}
          />
        )}
      </div>

      {!flagsCoherent && (
        <p role="alert" className="text-sm text-destructive">
          {t('investigation.autopsy.flagsExclusive')}
        </p>
      )}

      <Controller
        control={form.control}
        name="notes"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="investigationAutopsy-notes"
              className="text-sm font-medium text-foreground"
            >
              {t('investigation.fields.notes')}
            </label>
            <Textarea
              id="investigationAutopsy-notes"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={disabled}
            />
          </div>
        )}
      />
    </div>
  );
}
