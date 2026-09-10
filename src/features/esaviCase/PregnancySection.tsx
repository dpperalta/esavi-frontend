import { useRef } from 'react';
import { addDays, format } from 'date-fns';
import { Controller, useController, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  isPregnancyDescriptionRequirementMet,
  type NotificationFormValues,
  type PregnancyGateState,
} from '@/features/notification/schemas';
import { PregnancyComplicationList } from '@/features/notification/PregnancyComplicationList';
import { AnswerOptionField } from '@/shared/components/AnswerOptionField';
import { DateField } from '@/shared/components/DateField';
import { Button } from '@/shared/components/ui/button';
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
  // El `GET` del bloque falló (SPEC FE12d §4 paso 14, §3.8 `notification.pregnancy.error.load`):
  // `readyToRenderForm` ya esperaba este estado sin mostrarlo — el bloque se pintaba vacío, como
  // si de verdad no hubiera datos, en vez de avisar que la lectura falló.
  loadError: boolean;
  onRetryLoad: () => void;
  // `hasPregnancyComplications` y `pregnancyComplicationsDescription` son columnas de
  // `severeNotification`, no del bloque de embarazo (SPEC FE12e §3.1, §6): el formulario las pide
  // pegadas a las complicaciones porque son su resumen, así que este componente compartido recibe
  // dos campos que sólo existen en la rama grave y no los pinta en la otra.
  showsSevereComplications: boolean;
  hasPregnancyComplications:
    'YES' | 'NO' | 'UNKNOWN' | 'NOT_APPLICABLE' | 'NO_ANSWER' | null | undefined;
  pregnancyComplicationsDescription: string | null | undefined;
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
  loadError,
  onRetryLoad,
  showsSevereComplications,
  hasPregnancyComplications,
  pregnancyComplicationsDescription,
}: PregnancySectionProps) {
  const { t } = useTranslation();
  const effectiveHasPregnancyComplications = complicationsDerived
    ? 'YES'
    : hasPregnancyComplications;
  const showsPregnancyDescription = effectiveHasPregnancyComplications === 'YES';
  const pregnancyDescriptionCoherent = isPregnancyDescriptionRequirementMet(
    effectiveHasPregnancyComplications,
    pregnancyComplicationsDescription,
  );

  // `useController`, no `Controller`, para las dos fechas (SPEC FE12d §3.5, §4 paso 12): la
  // sugerencia de parto necesita leer y escribir `probableDeliveryDate` desde el propio
  // `onChange` de `lastMenstruationDate`, algo que un `render` prop aislado no permite sin
  // levantar el `useForm` entero a esta sección — que el spec (§3.4 "no tiene formulario propio")
  // descarta.
  const lastMenstruationField = useController({ control, name: 'lastMenstruationDate' });
  const probableDeliveryField = useController({ control, name: 'probableDeliveryDate' });

  // La última fecha de parto sugerida (§3.4 tabla, "excepción razonada"): no es un dato del
  // servidor ni del formulario, es la memoria de qué escribió este mismo componente — sin ella no
  // se puede distinguir «el usuario conserva mi sugerencia» de «el usuario tecleó justo esa
  // fecha», que es lo que decide la regla de tres casos de §3.5.
  const lastSuggestionRef = useRef<string | null>(null);

  function handleLastMenstruationChange(next: string | null) {
    lastMenstruationField.field.onChange(next);
    if (!next) return;
    // `+280 días`, no un cálculo en firme (§3.5): esconder la tolerancia de ±14 días que el
    // backend acepta sería mentirle al usuario sobre la precisión de la fecha.
    const suggested = format(addDays(new Date(`${next}T00:00:00`), 280), 'yyyy-MM-dd');
    const currentDelivery = probableDeliveryField.field.value ?? null;
    if (currentDelivery === null || currentDelivery === lastSuggestionRef.current) {
      probableDeliveryField.field.onChange(suggested);
      lastSuggestionRef.current = suggested;
    }
  }

  if (pregnancyGate === 'hidden') {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        {/* Texto, no un icono ni un color (§3.7) — un lector de pantalla tiene que anunciarla
            junto al título, porque cambia el significado de todo lo que hay debajo. */}
        {pregnancyGate === 'visibleIfApplicable' && (
          <span className="text-xs text-muted-foreground">
            {t('notification.pregnancy.ifApplicable')}
          </span>
        )}
        <h3 tabIndex={-1} className="text-sm font-medium text-foreground">
          {t('notification.pregnancy.sectionTitle')}
        </h3>
      </div>

      {loadError && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            {t('notification.pregnancy.error.load')}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetryLoad}>
            {t('common.table.retry')}
          </Button>
        </div>
      )}

      {!loadError && (
        <>
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
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('notification.pregnancy.field.lastMenstruationDate')}
              </span>
              <DateField
                value={lastMenstruationField.field.value ?? null}
                onChange={handleLastMenstruationChange}
                ariaLabel={t('notification.pregnancy.field.lastMenstruationDate')}
                allowFuture={false}
                disabled={configMissing}
              />
            </div>

            {/* Futura permitida (§3.5) — una gestación en curso tiene el parto por delante. El error
            del rango de Naegele se anuncia con una región viva al aparecer (§3.7): se produce al
            tocar una fecha, no al enviar — ya reactivo desde el paso 7, el `superRefine` de
            `notificationSaveSchema` corre en cada cambio con `reValidateMode: 'onChange'`. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('notification.pregnancy.field.probableDeliveryDate')}
              </span>
              <DateField
                value={probableDeliveryField.field.value ?? null}
                onChange={probableDeliveryField.field.onChange}
                ariaLabel={t('notification.pregnancy.field.probableDeliveryDate')}
                allowFuture
                disabled={configMissing}
              />
              <p className="text-xs text-muted-foreground">
                {t('notification.pregnancy.help.probableDeliveryDateSuggested')}
              </p>
              <div aria-live="polite">
                {probableDeliveryField.fieldState.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {t('notification.pregnancy.error.deliveryDateOutOfRange')}
                  </p>
                )}
              </div>
            </div>
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
              <p className="text-sm text-muted-foreground">
                {t('notification.pregnancy.derived.hasComplications')}
              </p>
            )}
          </div>
        </>
      )}

      <PregnancyComplicationList pregnancyId={pregnancyId} readOnly={isClosed} />

      {/* The complication list comes before its severe-branch summary, not after: SPEC FE12e §3.1
          orders section 4 as the five questions, the complication list, then
          `pregnancyComplicationsDescription` and `pregnancyNotes`. That splits the `!loadError`
          body in two around a list that renders regardless of the pregnancy GET. */}
      {!loadError && (
        <>
          {showsSevereComplications && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('notification.severe.hasPregnancyComplications')}
              </span>
              <Controller
                control={control}
                name="hasPregnancyComplications"
                render={({ field }) => (
                  <AnswerOptionField
                    value={complicationsDerived ? 'YES' : (field.value ?? null)}
                    onChange={field.onChange}
                    ariaLabel={t('notification.severe.hasPregnancyComplications')}
                    variant="unknown"
                    disabled={complicationsDerived}
                  />
                )}
              />
              {/* §6.5: mismo texto que el campo de arriba, compartido entre las dos mitades de la
              derivación (§3.8 "compartida por los dos campos"). */}
              {complicationsDerived && (
                <p className="text-sm text-muted-foreground">
                  {t('notification.pregnancy.derived.hasComplications')}
                </p>
              )}

              {/* Visible sólo con hasPregnancyComplications === 'YES' (SPEC FE12a §3.5, §7) —
              mismo motivo de aria-live que las otras secciones condicionales. */}
              <div aria-live="polite">
                {showsPregnancyDescription && (
                  <Controller
                    control={control}
                    name="pregnancyComplicationsDescription"
                    render={({ field }) => (
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="severeNotification-pregnancyComplicationsDescription"
                          className="text-sm font-medium text-foreground"
                        >
                          {t('notification.severe.pregnancyComplicationsDescription')}
                        </label>
                        <Textarea
                          id="severeNotification-pregnancyComplicationsDescription"
                          value={field.value ?? ''}
                          onChange={(event) => field.onChange(event.target.value || null)}
                        />
                        {!pregnancyDescriptionCoherent && (
                          <p role="alert" className="text-sm text-destructive">
                            {t('notification.validation.pregnancyDescriptionRequired')}
                          </p>
                        )}
                      </div>
                    )}
                  />
                )}
              </div>
            </div>
          )}

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
        </>
      )}
    </div>
  );
}
