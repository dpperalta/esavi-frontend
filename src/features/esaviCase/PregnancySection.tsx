import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { NotificationFormValues, PregnancyGateState } from '@/features/notification/schemas';
import { PregnancyComplicationList } from '@/features/notification/PregnancyComplicationList';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { DateField } from '@/shared/components/DateField';
import { Textarea } from '@/shared/components/ui/textarea';

export interface PregnancySectionProps {
  control: Control<NotificationFormValues>;
  pregnancyGate: PregnancyGateState;
  // `true` cuando `useSystemConfigByCode('PREGNANCY_FEMALE_SEX_ITEM')` respondió `404` — «no
  // sembrada», no un error (SPEC FE12d §3.4, §3.6). El bloque se muestra igual: se deshabilita con
  // su explicación en vez de desaparecer, porque el resto del paso 4 sigue funcionando entero.
  configMissing: boolean;
  // `null` mientras el `001` no ha respondido — la lista de complicaciones se pinta deshabilitada
  // con su propia explicación (SPEC FE12d §3.6, §4 paso 9), sin esperar a que el bloque completo
  // desaparezca.
  pregnancyId: string | null;
  // Expediente cerrado (§3.6, mismo criterio que las listas de FE12b/FE12c): sin «Añadir» y sin
  // acciones de fila, aquí ni en la lista de complicaciones.
  isClosed: boolean;
  // La derivación de §6.5: hay ≥1 complicación activa. «Derivado en render, no es estado» — el
  // campo se muestra en `'YES'` bloqueado, pero nada escribe ese valor en el formulario; quien
  // guarda decide el envío efectivo (SPEC FE12d §4 paso 11, §3.4 tabla).
  complicationsDerived: boolean;
}

// El bloque de embarazo (SPEC FE12d §4 paso 7), encadenado al `useForm` de `NotificationStep`
// como la cabecera y las dos ramas (§3.4: "no tiene formulario propio"). `pregnancyGate ===
// 'hidden'` no pinta ni siquiera el contenedor — mismo criterio que `SevereNotificationFields`
// con la compuerta (SPEC FE12a §5). La lista de complicaciones (paso 9) cuelga del mismo bloque,
// deshabilitada hasta que exista `pregnancyId` — el guardado encadenado (paso 8) es lo único que
// la escribe.
export function PregnancySection({
  control,
  pregnancyGate,
  configMissing,
  pregnancyId,
  isClosed,
  complicationsDerived,
}: PregnancySectionProps) {
  const { t } = useTranslation();

  if (pregnancyGate === 'hidden') {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        {/* Texto, no un icono ni un color (§3.7) — un lector de pantalla tiene que anunciarla
            junto al título, porque cambia el significado de todo lo que hay debajo. */}
        {pregnancyGate === 'visibleIfApplicable' && (
          <span className="text-xs text-muted-foreground">{t('notification.pregnancy.ifApplicable')}</span>
        )}
        <span className="text-sm font-medium text-foreground">{t('notification.pregnancy.sectionTitle')}</span>
      </div>

      {/* La configuración ausente no es un error del usuario (§3.6): el resto del paso 4 sigue
          funcionando entero, así que se explica en el propio bloque, con `aria-describedby` en
          cada control (§3.7) en vez de sólo deshabilitarlo. */}
      {configMissing && (
        <p id="pregnancy-notConfigured" role="alert" className="text-sm text-muted-foreground">
          {t('notification.pregnancy.notConfigured')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('notification.pregnancy.field.wasPregnantAtVaccination')}
          </span>
          <Controller
            control={control}
            name="wasPregnantAtVaccination"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.pregnancy.field.wasPregnantAtVaccination')}
                variant="unknown"
                disabled={configMissing}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('notification.pregnancy.field.wasPregnantAtEsavi')}
          </span>
          <Controller
            control={control}
            name="wasPregnantAtEsavi"
            render={({ field }) => (
              <AnswerOptionField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.pregnancy.field.wasPregnantAtEsavi')}
                variant="unknown"
                disabled={configMissing}
              />
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Controller
          control={control}
          name="lastMenstruationDate"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('notification.pregnancy.field.lastMenstruationDate')}
              </span>
              <DateField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.pregnancy.field.lastMenstruationDate')}
                allowFuture={false}
                disabled={configMissing}
              />
            </div>
          )}
        />

        {/* Futura permitida (§3.5) — una gestación en curso tiene el parto por delante. El error
            del rango de Naegele se anuncia con una región viva al aparecer (§3.7): se produce al
            tocar una fecha, no al enviar. */}
        <Controller
          control={control}
          name="probableDeliveryDate"
          render={({ field, fieldState }) => (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('notification.pregnancy.field.probableDeliveryDate')}
              </span>
              <DateField
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('notification.pregnancy.field.probableDeliveryDate')}
                allowFuture
                disabled={configMissing}
              />
              <div aria-live="polite">
                {fieldState.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {t('notification.pregnancy.error.deliveryDateOutOfRange')}
                  </p>
                )}
              </div>
            </div>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('notification.pregnancy.field.hasComplications')}
        </span>
        <Controller
          control={control}
          name="hasComplications"
          render={({ field }) => (
            <AnswerOptionField
              value={complicationsDerived ? 'YES' : (field.value ?? null)}
              onChange={field.onChange}
              ariaLabel={t('notification.pregnancy.field.hasComplications')}
              variant="unknown"
              disabled={configMissing || complicationsDerived}
            />
          )}
        />
        {/* §6.5: no basta con deshabilitar el control — sin el texto, un campo gris es
            indistinguible de un fallo (§3.7). */}
        {complicationsDerived && (
          <p className="text-sm text-muted-foreground">{t('notification.pregnancy.derived.hasComplications')}</p>
        )}
      </div>

      <Controller
        control={control}
        name="pregnancyNotes"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pregnancy-notes" className="text-sm font-medium text-foreground">
              {t('notification.pregnancy.field.notes')}
            </label>
            <Textarea
              id="pregnancy-notes"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={configMissing}
            />
          </div>
        )}
      />

      <PregnancyComplicationList pregnancyId={pregnancyId} readOnly={isClosed} />
    </div>
  );
}
